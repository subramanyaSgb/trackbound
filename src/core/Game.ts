import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Abilities } from '../abilities/Abilities';
import { AudioManager } from '../audio/AudioManager';
import { FollowCamera, type CamMode } from '../camera/FollowCamera';
import { ABILITIES, abilityCost } from '../data/abilities';
import { CHARACTERS, CRIMINALS, characterById } from '../data/characters';
import { MISSIONS, PATROL, missionById, missionUnlocked, stageAt, themeAt, zoneIndexAt, type MissionDef } from '../data/missions';
import { SEASONS, currentSeason, seasonStatus } from '../data/seasons';
import { FLY_HEIGHT, Player } from '../player/Player';
import { CAPTURE_TEXT, Capture } from '../pursuit/Capture';
import { Criminal } from '../pursuit/Criminal';
import { FAIL_TEXT, Pursuit, TRIP_GAP, type FailReason } from '../pursuit/Pursuit';
import { hitTest } from '../systems/Collision';
import { Coins } from '../systems/Coins';
import { Missions } from '../systems/Missions';
import { Particles } from '../systems/Particles';
import { MAX_LEVEL, POWER_INFO, POWER_KINDS, PowerUps, UPGRADE_COST, durationFor, type PowerKind } from '../systems/PowerUps';
import { Ui, type MenuModel, type SheetName } from '../ui/Ui';
import { POWER_COLORS } from '../world/ObstacleFactory';
import { HORIZON, Sky } from '../world/Sky';
import { Spawner, type Obstacle } from '../world/Spawner';
import { chevronTexture, signTexture } from '../world/textures';
import { THEMES, type ThemeLook } from '../world/themes';
import { World } from '../world/World';
import { Assets } from './Assets';
import { BEND, BendDriver, installBend } from './Bend';
import { CFG, laneX, paceAt } from './config';
import { Input, type Action } from './Input';
import { Save, levelFor, type Quality, type UpgradeKind } from './Save';

type State = 'loading' | 'menu' | 'intro' | 'running' | 'paused' | 'takedown' | 'failing' | 'over';
interface InstallEvent extends Event { prompt(): Promise<void> }
const INTRO_LEN = 4.6;
const CHEVRONS = 10;

/** Owns the scene, the state machine and the per-frame update order. */
export class Game {
  state: State = 'loading';
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new FollowCamera();
  readonly audio = new AudioManager();
  readonly save = new Save();
  readonly assets = new Assets();
  readonly powers = new PowerUps();
  readonly ui: Ui;
  readonly input: Input;
  player!: Player;
  criminal!: Criminal;
  world!: World;
  sky!: Sky;
  coins!: Coins;
  spawner!: Spawner;
  particles!: Particles;
  missions!: Missions;
  // ---- the pursuit in progress
  mission: MissionDef = MISSIONS[0];
  pursuit = new Pursuit(MISSIONS[0]);
  abilities = new Abilities('bike');
  capture: Capture | null = null;
  zone = 0;
  startD = 0;
  runCoins = 0;
  banked = 0;
  bankedD = 0;
  avoided = 0;
  failReason: FailReason | null = null;
  autopilot = false;

  private sun = new THREE.DirectionalLight(0xfff0d2, 2.9);
  private hemi = new THREE.HemisphereLight(0xcfe6ff, 0x9a8f80, 1.15);
  private fog = new THREE.Fog(HORIZON, 70, 240);
  private look = {} as ThemeLook;
  private bend = new BendDriver();
  private shield!: THREE.Mesh;
  private aura!: THREE.Mesh;
  private beam!: THREE.Mesh;
  private chevrons: THREE.Mesh[] = [];
  private marker!: THREE.Mesh;
  private bikeModel: THREE.Object3D | null = null;
  private crimBike: THREE.Object3D | null = null;
  private crimeSign = new THREE.Group();
  private clock = new THREE.Clock();
  private time = 0;
  private stateT = 0;
  private invuln = 0;
  private ghostUntilD = 0;
  private hudT = 0;
  private throwT = 4;
  private beamT = 0;
  private readyPinged = false;
  private pace = CFG.startSpeed;
  private slowFrames = 0;
  private autoTier: Exclude<Quality, 'auto'> = 'high';
  private sheet: SheetName | null = null;
  private preview = 'officer';
  private installEvt: InstallEvent | null = null;
  private introStep = 0;
  private takedownStep = 0;
  private result: 'won' | 'failed' | null = null;

  constructor(canvas: HTMLCanvasElement) {
    installBend();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // image-based ambient light + reflections for glass and metal
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(HORIZON);
    this.scene.add(this.hemi);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -12; sc.right = 12; sc.top = 30; sc.bottom = -10; sc.near = 1; sc.far = 80;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);

    this.ui = new Ui({
      play: () => this.startPursuit(), pause: () => this.pause(), resume: () => this.resume(),
      home: () => this.toMenu(), retry: () => this.startPursuit(), next: () => this.startPursuit(),
      click: () => { this.audio.unlock(); this.audio.click(); },
      sheet: (s) => this.openSheet(s),
      previewChar: (id) => this.previewChar(id),
      chooseChar: (id) => this.chooseChar(id),
      buyUpgrade: (k) => this.buyUpgrade(k),
      claim: (id) => this.claim(id),
      claimSeason: (id) => this.claimSeason(id),
      selectMission: (id) => this.selectMission(id),
      setting: (k, v) => this.setting(k, v),
      resetProgress: () => this.resetProgress(),
      install: () => { void this.installEvt?.prompt(); this.installEvt = null; this.refreshMenu(); },
      power: () => this.onAction('power'),
      skip: () => this.skipIntro(),
    });
    this.input = new Input(canvas, (a) => this.onAction(a));
    this.input.onDrag = (dx) => { if (this.state === 'menu') this.player.orbit += dx * 0.012; };
    addEventListener('resize', () => this.resize());
    addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.installEvt = e as InstallEvent; if (this.state === 'menu') this.refreshMenu(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
  }

  async init() {
    await Promise.all([this.save.load(), this.assets.load((f) => this.ui.loading(f * 0.7))]);
    const s = this.save.data;
    this.missions = new Missions(s);
    this.missions.onComplete = (m) => { this.audio.mission(); this.ui.toast(`Bounty complete — ${m.text}`); };
    this.world = new World(this.scene, this.assets);
    this.sky = new Sky(this.scene, this.assets);
    this.coins = new Coins(this.scene, this.assets);
    this.particles = new Particles(this.scene);
    this.coins.onCollect = (x, y, z) => this.particles.burst(x, y, z, 0xffd84a, 5, 2.2, 0.16, 0.35, 3);
    this.spawner = new Spawner(this.scene, this.coins, this.assets);
    this.spawner.onPassed = (o) => { this.avoided++; if (o.v.kind === 'block' || o.v.kind === 'train') this.missions.report('trains', 1); };
    this.player = new Player(this.assets, {
      jump: () => this.audio.jump(),
      land: (hard) => { this.audio.land(hard); this.camera.kick(hard ? 0.22 : 0.09); this.particles.burst(this.player.x, 0.1, -this.player.d, 0xcfc4b4, hard ? 14 : 8, hard ? 2.4 : 1.6, 0.3, 0.4, 1, 0.5); },
      slide: () => { this.audio.slide(); this.missions.report('slides', 1); this.particles.burst(this.player.x, 0.1, -this.player.d, 0xcfc4b4, 8, 1.6, 0.3, 0.45, 1, 0.4); },
      step: () => this.audio.step(), lane: () => this.audio.lane(),
    });
    this.criminal = new Criminal(this.assets, {
      trip: () => { this.pursuit.gain(TRIP_GAP); this.ui.toast('The suspect stumbled — close in!'); },
      smash: (o) => { this.spawner.knock(o); this.audio.smash(); },
    });
    this.scene.add(this.player.root, this.criminal.root, this.crimeSign);
    this.criminal.root.visible = false;
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 16), new THREE.MeshStandardMaterial({ color: 0x7fd4ff, emissive: 0x2fb4ff, emissiveIntensity: 0.8, transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.2, depthWrite: false }));
    this.aura = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 8, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    this.beam = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1).translate(0, 0, -0.5), new THREE.MeshBasicMaterial({ color: 0x9fe8ff }));
    // target marker so the suspect can always be picked out, even far ahead in traffic
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.6, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xff3b4e, fog: false, depthTest: false, transparent: true, opacity: 0.95 }));
    this.marker.renderOrder = 20;
    this.marker.frustumCulled = false;
    this.shield.visible = this.aura.visible = this.beam.visible = this.marker.visible = false;
    this.scene.add(this.shield, this.aura, this.beam, this.marker);
    const chev = new THREE.MeshBasicMaterial({ map: chevronTexture(), transparent: true, opacity: 0.95, depthWrite: false, color: 0xe2b8ff, fog: false, polygonOffset: true, polygonOffsetFactor: -4 });
    for (let i = 0; i < CHEVRONS; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 4.6).rotateX(-Math.PI / 2), chev);
      m.visible = false; m.frustumCulled = false;
      this.chevrons.push(m);
      this.scene.add(m);
    }

    this.mission = missionById(s.mission);
    this.preview = s.char;
    this.player.setCharacter(characterById(s.char));
    this.ui.loading(1);
    this.audio.setVolumes(s.music, s.sfx);
    this.autoTier = (navigator.hardwareConcurrency ?? 4) >= 8 && !matchMedia('(pointer: coarse)').matches ? 'high' : 'medium';
    this.applyQuality();
    this.resize();
    this.toMenu(true);
    this.renderer.compile(this.scene, this.camera.cam);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------- rendering quality
  get quality(): Exclude<Quality, 'auto'> { return this.save.data.quality === 'auto' ? this.autoTier : this.save.data.quality; }

  private applyQuality() {
    const q = this.quality;
    const dpr = devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'low' ? Math.min(dpr, 1) : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2));
    const shadows = q !== 'low';
    if (this.renderer.shadowMap.enabled !== shadows) { this.renderer.shadowMap.enabled = shadows; this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && !Array.isArray(m)) m.needsUpdate = true; }); }
    this.sun.castShadow = shadows;
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) { this.sun.shadow.mapSize.set(size, size); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    this.sky.cloudsVisible = q !== 'low';
    this.particles.budget = q === 'low' ? 0.4 : q === 'medium' ? 0.7 : 1;
    this.resize();
  }

  private resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.resize(w, h);
    this.particles?.resize(h * this.renderer.getPixelRatio());
  }

  /** Lighting, fog and sky follow the environment the player is in. */
  private applyLook(d: number) {
    const L = this.world.look(d, this.look);
    this.fog.color.setHex(L.fog); this.fog.near = L.fogNear; this.fog.far = L.fogFar;
    (this.scene.background as THREE.Color).setHex(L.fog);
    this.sky.setLook(L.skyTop, L.skyMid, L.skyHor, L.clouds);
    this.sun.color.setHex(L.sun); this.sun.intensity = L.sunI;
    this.hemi.color.setHex(L.hemiSky); this.hemi.groundColor.setHex(L.hemiGround); this.hemi.intensity = L.hemiI;
    this.scene.environmentIntensity = L.env;
    this.camera.ceiling = THEMES[this.world.themeAt(d)].enclosed ? 4.6 : Infinity;
  }

  // ---------------------------------------------------------------- menu model + actions
  private model(): MenuModel {
    const s = this.save.data;
    const lv = levelFor(s.xp);
    const season = currentSeason();
    const m = missionById(s.mission);
    const prog = s.story[m.id];
    const cz = m.patrol ? 0 : prog && !prog.done ? prog.zone : 0;
    return {
      coins: s.coins, level: lv.level, xpFrac: lv.into / lv.need, claimable: this.missions.claimable,
      preview: this.preview, totalDistance: s.totalDistance, arrests: s.arrests, patrolBest: s.best,
      chars: CHARACTERS.map((c) => {
        const a = ABILITIES[c.ability];
        return { id: c.id, name: c.name, title: c.title, blurb: c.blurb, color: c.look.color, cost: c.cost, owned: s.owned.includes(c.id), selected: s.char === c.id,
          ability: { name: a.name, desc: a.desc, icon: a.icon, color: a.color, cost: abilityCost(a.id, s.upgrades.charge), duration: a.duration, cooldown: a.cooldown } };
      }),
      upgrades: [
        ...POWER_KINDS.map((k) => ({ kind: k as UpgradeKind, name: POWER_INFO[k].name, desc: `${POWER_INFO[k].desc} · lasts ${durationFor(k, s.upgrades[k]).toFixed(1).replace('.0', '')} s`, color: POWER_COLORS[k], icon: k as string, level: s.upgrades[k], max: MAX_LEVEL, cost: s.upgrades[k] < MAX_LEVEL ? UPGRADE_COST[s.upgrades[k]] : 0 })),
        { kind: 'charge' as UpgradeKind, name: 'Quick Charge', desc: `Abilities need ${Math.round(s.upgrades.charge * 6)}% fewer coins to charge`, color: '#b56bff', icon: 'bolt', level: s.upgrades.charge, max: MAX_LEVEL, cost: s.upgrades.charge < MAX_LEVEL ? UPGRADE_COST[s.upgrades.charge] : 0 },
      ],
      bounties: this.missions.list().map((b) => ({ id: b.def.id, text: b.def.text, progress: b.state.progress, target: b.def.target, reward: b.def.reward, done: b.done })),
      mission: { id: m.id, title: m.title, brief: m.brief, criminal: m.patrol ? '' : CRIMINALS[m.criminal].alias, length: m.length, checkpoint: cz > 0 ? m.zones[cz].name : '', at: m.zones[cz].at, patrol: !!m.patrol },
      missions: [...MISSIONS, PATROL].map((x) => {
        const p = s.story[x.id];
        const open = missionUnlocked(x, s.story, s.totalDistance);
        return {
          id: x.id, title: x.title, brief: x.brief, criminal: x.patrol ? '' : CRIMINALS[x.criminal].name, length: x.length, boss: !!x.boss, patrol: !!x.patrol,
          state: !open ? 'locked' as const : p?.done ? 'done' as const : 'open' as const, selected: s.mission === x.id,
          lock: x.requires?.totalDistance ? `Run ${x.requires.totalDistance.toLocaleString('en-US')} m in total (${Math.min(100, Math.floor((s.totalDistance / x.requires.totalDistance) * 100))}%)` : x.requires?.mission ? `Arrest the suspect in "${missionById(x.requires.mission).title}"` : '',
          checkpoint: p && !p.done && p.zone > 0 ? `Checkpoint: ${x.zones[p.zone].name}` : '', reward: x.rewards.coins,
        };
      }),
      seasons: SEASONS.map((x) => {
        const xp = s.seasonXp[x.id] ?? 0, claimed = s.seasonClaimed[x.id] ?? 0;
        return {
          id: x.id, number: x.number, name: x.name, tagline: x.tagline, colors: x.colors, status: x.id === season.id ? 'live' as const : seasonStatus(x), preview: x.preview, xp,
          heroes: x.characters.map((id) => characterById(id).name),
          rewards: x.rewards.map((r, i) => ({ ...r, state: i < claimed ? 'claimed' as const : xp >= r.xp && i === claimed ? 'ready' as const : 'locked' as const })),
        };
      }),
      settings: { music: s.music, sfx: s.sfx, quality: s.quality, sensitivity: s.sensitivity, haptics: s.haptics },
      canInstall: !!this.installEvt,
    };
  }

  private refreshMenu() { this.ui.menu(this.model(), this.sheet); }

  openSheet(s: SheetName | null) {
    if (this.state !== 'menu') return;
    this.sheet = s;
    this.camera.lift = s === 'heroes' ? 1 : s ? 0.5 : 0;
    if (s !== 'heroes' && this.preview !== this.save.data.char) this.previewChar(this.save.data.char);
    this.refreshMenu();
  }

  previewChar(id: string) {
    this.preview = id;
    this.player.setCharacter(characterById(id));
    this.refreshMenu();
  }

  /** Select an owned character, or buy it if affordable. */
  chooseChar(id: string) {
    const s = this.save.data;
    const c = CHARACTERS.find((x) => x.id === id);
    if (!c) return;
    if (!s.owned.includes(id)) {
      if (s.coins < c.cost) { this.audio.deny(); this.ui.toast(`Need ${c.cost - s.coins} more coins`); return; }
      s.coins -= c.cost;
      s.owned.push(id);
      this.audio.buy();
    }
    s.char = id;
    this.save.commit();
    this.previewChar(id);
    this.player.celebrate();
    this.particles.burst(0, 1.2, -this.player.d, 0xffd84a, 30, 3.5, 0.22, 0.9, 4);
  }

  buyUpgrade(k: UpgradeKind) {
    const s = this.save.data;
    const lvl = s.upgrades[k];
    if (lvl >= MAX_LEVEL) return;
    if (s.coins < UPGRADE_COST[lvl]) { this.audio.deny(); this.ui.toast(`Need ${UPGRADE_COST[lvl] - s.coins} more coins`); return; }
    s.coins -= UPGRADE_COST[lvl];
    s.upgrades[k] = lvl + 1;
    this.save.commit();
    this.audio.buy();
    this.refreshMenu();
  }

  claim(id: string) {
    const got = this.missions.claim(id);
    if (!got) return;
    this.save.commit();
    this.audio.mission();
    this.ui.toast(`+${got} coins`);
    this.refreshMenu();
  }

  claimSeason(id: string) {
    const s = this.save.data;
    const season = SEASONS.find((x) => x.id === id);
    const i = s.seasonClaimed[id] ?? 0;
    const r = season?.rewards[i];
    if (!r || (s.seasonXp[id] ?? 0) < r.xp) return;
    s.seasonClaimed[id] = i + 1;
    s.coins += r.coins;
    this.save.commit();
    this.audio.mission();
    this.ui.toast(`${r.label}: +${r.coins} coins`);
    this.refreshMenu();
  }

  selectMission(id: string) {
    const s = this.save.data;
    const m = missionById(id);
    if (!missionUnlocked(m, s.story, s.totalDistance)) { this.audio.deny(); return; }
    s.mission = id;
    this.save.commit();
    this.mission = m;
    this.showMenuScene();
    this.refreshMenu();
  }

  setting(key: string, value: number | string | boolean) {
    const s = this.save.data as unknown as Record<string, unknown>;
    s[key] = value;
    this.audio.setVolumes(this.save.data.music, this.save.data.sfx);
    this.input.threshold = 26 / this.save.data.sensitivity;
    if (key === 'quality') this.applyQuality();
    this.save.commit();
  }

  resetProgress() {
    this.save.reset();
    this.missions = new Missions(this.save.data);
    this.missions.onComplete = (m) => { this.audio.mission(); this.ui.toast(`Bounty complete — ${m.text}`); };
    this.mission = missionById(this.save.data.mission);
    this.previewChar('officer');
    this.showMenuScene();
    this.ui.toast('Progress reset');
  }

  // ---------------------------------------------------------------- run lifecycle
  private route = (d: number) => ({ theme: themeAt(this.mission, d), stage: stageAt(this.mission, d), clear: !this.mission.patrol && d > this.mission.length - 40 });

  /** Where the selected mission resumes: its saved checkpoint, or the start. */
  private checkpoint() {
    const p = this.save.data.story[this.mission.id];
    const zone = this.mission.patrol || !p || p.done ? 0 : Math.min(p.zone, this.mission.zones.length - 1);
    return { zone, gap: zone > 0 && p ? p.gap : this.mission.pursuit.startGap };
  }

  private resetWorld(d: number, seed?: number) {
    this.player.reset(d);
    this.world.reset((x) => themeAt(this.mission, x), d);
    this.coins.reset();
    this.spawner.reset(seed, d, this.route);
    this.powers.reset();
    this.bend.reset(d);
    this.bend.flat(-d);
    this.runCoins = this.banked = this.avoided = 0;
    this.bankedD = d;
    this.invuln = 0; this.ghostUntilD = 0; this.beamT = 0;
    this.capture = null;
    this.failReason = null;
    this.result = null;
    this.readyPinged = false;
    this.shield.visible = this.aura.visible = this.beam.visible = false;
    for (const c of this.chevrons) c.visible = false;
    this.camera.fovBoost = 0;
    this.audio.stopLoops();
  }

  /** Menu backdrop: the selected mission's checkpoint location. */
  private showMenuScene() {
    const cp = this.checkpoint();
    this.resetWorld(this.mission.zones[cp.zone].at);
    this.criminal.root.visible = false;
    this.crimeSign.visible = false;
    this.applyLook(this.player.d);
    this.camera.snap(this.player, 'menu');
  }

  toMenu(snap = false) {
    if (this.state === 'running' || this.state === 'paused' || this.state === 'intro') this.bank();
    this.mission = missionById(this.save.data.mission);
    this.state = 'menu';
    this.sheet = null;
    this.camera.lift = 0;
    this.input.dragMode = true;
    this.input.threshold = 26 / this.save.data.sensitivity;
    this.audio.stopMusic();
    this.player.setCharacter(characterById(this.save.data.char));
    this.preview = this.save.data.char;
    this.showMenuScene();
    this.refreshMenu();
    this.ui.show('menu');
    if (snap) this.camera.snap(this.player, 'menu');
  }

  /** Start (or resume from its checkpoint) the selected mission. */
  startPursuit(seed?: number, skipIntro = false) {
    this.audio.unlock();
    const s = this.save.data;
    this.mission = missionById(s.mission);
    const m = this.mission;
    const cp = this.checkpoint();
    this.zone = cp.zone;
    this.startD = m.zones[cp.zone].at;
    this.player.setCharacter(characterById(s.char));
    this.resetWorld(this.startD, seed);
    this.pursuit = new Pursuit(m, cp.gap, m.zones[cp.zone].minGap);
    this.abilities = new Abilities(characterById(s.char).ability, s.upgrades.charge);
    this.missions.startRun();
    this.input.dragMode = false;
    this.pace = paceAt(0, m.zones[cp.zone].maxSpeed);
    this.throwT = 5;
    this.buildCrimeSign();
    if (m.patrol) this.criminal.root.visible = false;
    else {
      this.criminal.setCriminal(CRIMINALS[m.criminal]);
      this.criminal.reset(this.startD + this.pursuit.gap);
      this.setCrimVehicle();
    }
    this.audio.setMood(this.mission.boss ? 'tense' : 'chase');
    this.ui.hudSetup({ title: m.title, length: m.length, zones: m.zones.map((z) => z.at / m.length), patrol: !!m.patrol, hearts: m.pursuit.hearts, suspect: m.patrol ? '' : CRIMINALS[m.criminal].alias, ability: this.abilities.def, touch: matchMedia('(pointer: coarse)').matches });
    if (cp.zone === 0 && !m.patrol && !skipIntro) this.beginIntro();
    else {
      this.beginRun();
      this.ui.banner(m.patrol ? 'FREE PATROL' : cp.zone > 0 ? 'CHECKPOINT' : m.title.toUpperCase(), m.zones[cp.zone].name, 2200);
    }
  }

  private beginRun() {
    this.state = 'running';
    this.stateT = 0;
    this.player.scripted = false;
    this.criminal.scripted = false;
    this.player.start();
    this.criminal.rig?.play(this.criminal.runClip, 0.2);
    this.audio.startMusic();
    this.audio.setAmbience(THEMES[this.world.themeAt(this.player.d)].ambience);
    if (!this.mission.patrol) this.audio.siren(true);
    this.ui.caption(null);
    this.ui.show('hud');
  }

  private setCrimVehicle() {
    const want = this.mission.zones[this.zone].crimVehicle === 'motorcycle';
    if (want === this.criminal.riding) return;
    this.criminal.ride(want ? (this.crimBike ??= this.makeBike(0x8a8f9c, false)) : null);
  }

  /** A motorcycle model facing down the track; police livery adds flashing lights. */
  private makeBike(tint: number, police: boolean) {
    const g = new THREE.Group();
    const src = this.assets.prop('motorcycle').clone();
    src.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true; m.frustumCulled = false;
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      mat.color.setHex(tint);
      m.material = mat;
    });
    src.rotation.y = Math.PI;
    src.scale.setScalar(0.86);
    g.add(src);
    if (police) {
      const f = this.spawner.factory;
      const red = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.14), f.flashRed), blue = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.14), f.flashBlue);
      red.position.set(-0.16, 0.98, 0.98); blue.position.set(0.16, 0.98, 0.98);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3c4, emissiveIntensity: 4 }));
      head.position.set(0, 0.86, -1.0);
      g.add(red, blue, head);
    }
    return g;
  }

  /** The scene of the crime: a shop sign with a flashing alarm beside the road at the mission start. */
  private buildCrimeSign() {
    const g = this.crimeSign;
    for (const c of [...g.children]) { g.remove(c); const m = c as THREE.Mesh; if (m.material && (m.material as THREE.MeshStandardMaterial).map) { (m.material as THREE.MeshStandardMaterial).map!.dispose(); (m.material as THREE.Material).dispose(); } }
    g.visible = this.zone === 0 && !this.mission.patrol;
    if (!g.visible) return;
    const frame = new THREE.MeshStandardMaterial({ color: 0x22262f, roughness: 0.5, metalness: 0.5 });
    const tex = signTexture(this.mission.crime.sign, '#b3202a', '#ffffff', 'ALARM ACTIVATED');
    const board = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 }));
    board.position.set(0, 3.1, 0.07);
    const back = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.35, 0.12), frame);
    back.position.y = 3.1;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), this.spawner.factory.flashRed);
    lamp.position.y = 3.95;
    g.add(board, back, lamp);
    for (const x of [-2, 2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6, 0.14), frame); p.position.set(x, 1.3, 0); g.add(p); }
    g.traverse((o) => { o.frustumCulled = false; });
    const y = THEMES[this.world.themeAt(this.startD)].sideY;
    g.position.set(6.6, y, -(this.startD + 15));
    g.rotation.y = -Math.PI / 2 + 0.35;
  }

  // ---------------------------------------------------------------- intro cinematic
  private beginIntro() {
    this.state = 'intro';
    this.stateT = 0;
    this.introStep = 0;
    this.player.scripted = true;
    this.criminal.scripted = true;
    this.criminal.root.visible = true;
    const z0 = -this.startD;
    this.criminal.root.position.set(6.2, THEMES[this.world.themeAt(this.startD)].sideY, z0 - 15);
    this.criminal.rig?.play(this.criminal.runClip, 0, 1.2);
    this.camera.cineEase = 0;
    this.camera.cinePos.set(-1.2, 1.9, z0 - 7.5);
    this.camera.cineLook.set(5.4, 1.5, z0 - 15);
    this.ui.show('cine');
    this.ui.caption(this.mission.crime.headline, this.mission.brief);
    this.audio.alarm();
    this.audio.setAmbience(THEMES[this.world.themeAt(this.startD)].ambience);
  }

  private skipIntro() { if (this.state === 'intro' && this.stateT < INTRO_LEN - 0.1) this.stateT = INTRO_LEN - 0.05; }

  private updateIntro(dt: number) {
    const t = (this.stateT += dt);
    const z0 = -this.startD;
    const c = this.criminal;
    const sideY = THEMES[this.world.themeAt(this.startD)].sideY;
    const gap = this.pursuit.gap;
    if (t < 1.5) {
      // the suspect bursts out of the scene of the crime and cuts into the road
      const f = THREE.MathUtils.smoothstep(t, 0.15, 1.5);
      c.root.position.set(6.2 - 6.2 * f, sideY * (1 - f), z0 - 15 - 7 * f);
      c.root.rotation.y = 0.75 * (1 - f);
    } else {
      // ...and bolts down the street
      const f = Math.min(1, (t - 1.5) / (INTRO_LEN - 1.5));
      c.root.position.set(0, 0, z0 - 22 - (gap - 22) * f);
      c.root.rotation.y = 0;
    }
    if (this.introStep === 0 && t >= 1.5) {
      this.introStep = 1;
      this.camera.cineEase = 2.6;
      this.camera.cinePos.set(1.5, 1.75, z0 + 3.0);
      this.camera.cineLook.set(0, 1.25, z0 - 16);
      this.player.act('Use_Item', 1.4, 0.15);
      this.audio.radio();
      this.ui.caption('DISPATCH', this.mission.zones[0].radio);
    }
    if (this.introStep === 1 && t >= 2.7) { this.introStep = 2; this.audio.siren(true); }
    if (this.introStep === 2 && t >= 3.5) {
      this.introStep = 3;
      this.camera.cineEase = 3.4;
      this.camera.cinePos.set(0, 4.1, z0 + 7);
      this.camera.cineLook.set(0, 1.6, z0 - 9);
      this.ui.caption(null);
      this.ui.banner('GO!', `Catch ${CRIMINALS[this.mission.criminal].alias}`, 1400);
    }
    if (t >= INTRO_LEN) {
      this.save.data.introSeen = true;
      c.reset(this.startD + gap);
      this.setCrimVehicle();
      this.beginRun();
    }
  }

  pause() {
    if (this.state !== 'running') return;
    this.state = 'paused';
    this.audio.stopMusic();
    this.audio.stopLoops();
    this.ui.show('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.audio.startMusic();
    this.audio.setAmbience(THEMES[this.world.themeAt(this.player.d)].ambience);
    if (!this.mission.patrol) this.audio.siren(true);
    this.ui.show('hud');
  }

  private onAction(a: Action) {
    if (a === 'pause') { if (this.state === 'running') this.pause(); else this.resume(); return; }
    if (this.state === 'intro') { this.skipIntro(); return; }
    if (this.state !== 'running') return;
    if (a === 'left') this.player.moveLane(-1);
    else if (a === 'right') this.player.moveLane(1);
    else if (a === 'jump') { if (!this.player.airborne && this.player.mode === 'run') this.missions.report('jumps', 1); this.player.jump(); }
    else if (a === 'slide') this.player.slide();
    else this.power();
  }

  get distance() { return Math.floor(this.player.d); }
  /** Metres covered in this session (since the checkpoint it started from). */
  get ran() { return Math.max(0, Math.floor(this.player.d - this.startD)); }
  get score() { return this.ran + this.runCoins * CFG.coinValue; }
  private buzz(ms: number) { if (this.save.data.haptics) navigator.vibrate?.(ms); }

  // ---------------------------------------------------------------- abilities
  /** The action button: fires the capture tool during the finale, otherwise the character's ability. */
  power() {
    const p = this.player;
    if (this.capture) {
      if (this.capture.phase !== 'lock') return;
      this.capture.attempt(p.lane === this.criminal.lane);
      return;
    }
    const ab = this.abilities;
    if (!ab.activate()) { if (!ab.active) { this.audio.deny(); this.ui.toast(ab.cooldown > 0 ? 'Ability cooling down' : `Collect ${ab.cost - ab.charge} more coins to charge`); } return; }
    const def = ab.def;
    this.readyPinged = false;
    this.audio.abilityOn();
    this.camera.kick(0.2);
    this.buzz(40);
    this.particles.burst(p.x, 1.2, -p.d, new THREE.Color(def.color).getHex(), 34, 5, 0.3, 0.8, 2);
    this.ui.banner(def.name.toUpperCase(), '', 1100);
    this.missions.report('powerups', 1);
    if (def.id === 'flight') {
      p.setMode('fly');
      this.audio.wind(true);
      this.audio.whoosh();
      // a trail of coins in the sky along the flight path
      const reach = this.pace * def.speedMul * def.duration - 16;
      const lanes = [1, 2, 1, 0];
      for (let i = 0, dd = 20; dd < reach; dd += 2.4, i++) this.coins.add(p.d + dd, laneX(lanes[Math.floor(i / 9) % 4]), FLY_HEIGHT + 0.85);
    } else if (def.id === 'bike') {
      p.setMode('bike', (this.bikeModel ??= this.makeBike(0x8fb0ff, true)));
    } else {
      if (def.id === 'dash') this.audio.whoosh();
      p.act(p.def!.move.power, 0.45, 0.08, 1.4);
    }
  }

  private endAbility() {
    const id = this.abilities.def.id;
    this.audio.abilityOff();
    this.audio.wind(false);
    this.audio.engine(false);
    if (id === 'flight' || id === 'bike') { this.player.setMode('run'); this.invuln = Math.max(this.invuln, 1.3); }
    else this.invuln = Math.max(this.invuln, 0.6);
    for (const c of this.chevrons) c.visible = false;
  }

  private abilityFx(dt: number) {
    const p = this.player, ab = this.abilities;
    const c = this.criminal;
    this.marker.visible = this.state === 'running' && !this.mission.patrol && c.root.visible;
    if (this.marker.visible) {
      const s = THREE.MathUtils.clamp(this.pursuit.gap / 24, 1, 3.4);
      this.marker.scale.setScalar(s);
      this.marker.position.set(c.x, c.y + 2.5 + s * 0.45 + Math.sin(this.time * 5) * 0.12, -c.d);
      this.marker.rotation.y = this.time * 3;
    }
    const on = ab.active && this.state === 'running';
    this.camera.fovBoost += ((on ? (ab.def.speedMul - 1) * 26 : 0) - this.camera.fovBoost) * Math.min(1, dt * 4);
    const shieldOn = (this.state === 'running') && (ab.is('shield') || this.powers.active('shield'));
    this.shield.visible = shieldOn;
    if (shieldOn) { this.shield.position.set(p.x, p.y + 0.95, -p.d); this.shield.scale.setScalar(1 + Math.sin(this.time * 6) * 0.04); }
    const auraKind = this.state !== 'running' ? null : ab.is('smash') ? ab.def.color : this.powers.active('magnet') ? POWER_COLORS.magnet : this.powers.active('double') ? POWER_COLORS.double : null;
    this.aura.visible = !!auraKind;
    if (auraKind) {
      (this.aura.material as THREE.MeshBasicMaterial).color.set(auraKind);
      this.aura.position.set(p.x, p.y + 0.12 + Math.abs(Math.sin(this.time * 4)) * 0.5, -p.d);
      this.aura.rotation.y = this.time * 3;
    }
    if (!on) return;
    if (ab.is('bike')) this.audio.engine(true, 0.5 + Math.sin(this.time * 3) * 0.08 + this.pace / 60);
    if (ab.is('dash') || ab.is('flight')) this.particles.burst(p.x + (Math.random() - 0.5) * 0.7, p.y + 0.4 + Math.random() * 1.1, -p.d + 0.6, new THREE.Color(ab.def.color).getHex(), 1, 0.4, 0.22, 0.35, 0, 0.2);
    if (ab.is('bike') && Math.random() < 0.5) this.particles.burst(p.x, 0.25, -p.d + 1.1, 0xb8bcc4, 1, 0.8, 0.26, 0.4, -1, 0.3);
    if (ab.is('reveal')) {
      // paint the guaranteed route on the road ahead
      let n = 0;
      for (const r of this.spawner.rows) {
        if (r.d < p.d + 4 || n >= CHEVRONS) continue;
        const c = this.chevrons[n++];
        c.visible = true;
        c.position.set(laneX(r.safe), 0.05, -(r.d - 4.5));
      }
      for (; n < CHEVRONS; n++) this.chevrons[n].visible = false;
      (this.chevrons[0].material as THREE.MeshBasicMaterial).opacity = 0.8 + Math.sin(this.time * 8) * 0.2;
    }
  }

  // ---------------------------------------------------------------- collisions and failure
  private smashThrough(o: Obstacle) {
    const p = this.player;
    this.spawner.knock(o, Math.sign(laneX(o.lane) - p.x) || 0);
    this.audio.smash();
    this.camera.kick(0.3);
    this.buzz(40);
    this.particles.burst(p.x, 1.0, -p.d - 0.8, 0xffffff, 18, 6, 0.28, 0.5, 8);
    this.particles.burst(p.x, 1.0, -p.d - 0.8, 0xffb347, 10, 5, 0.22, 0.5, 8);
  }

  private onHit(o: Obstacle) {
    const p = this.player, ab = this.abilities;
    if (ab.is('dash') && (o.v.breakable || o.v.key === 'ped')) return; // phases straight through
    if (ab.is('shield') || this.powers.active('shield')) {
      if (!ab.is('shield')) { this.powers.absorb(); this.invuln = 1; this.audio.shieldBreak(); }
      if (o.v.kind === 'train') { this.ghostUntilD = o.d + o.v.depth + 4; this.invuln = Math.max(this.invuln, 0.4); } else this.smashThrough(o);
      this.particles.burst(p.x, 1.2, -p.d - 0.5, 0x8fdcff, 20, 6, 0.3, 0.6, 6);
      return;
    }
    if (ab.is('smash') && o.v.kind !== 'train') { this.smashThrough(o); return; }
    if (ab.is('bike') && o.v.breakable) { this.smashThrough(o); return; }
    if (ab.is('bike')) {
      // only solid traffic stops the motorcycle: it is lost, but no heart is
      ab.cancel();
      this.endAbility();
      this.ui.toast('Motorcycle wrecked!');
      p.stumble();
      this.audio.crash();
      this.camera.kick(0.6);
      if (o.v.kind === 'train') this.ghostUntilD = o.d + o.v.depth + 4; else this.spawner.knock(o);
      this.invuln = 1.6;
      return;
    }
    // an honest collision
    this.audio.stumble();
    this.camera.kick(0.55);
    this.buzz(120);
    this.particles.burst(p.x, 1.1, -p.d - 0.4, 0xffffff, 22, 5, 0.3, 0.6, 8);
    this.particles.burst(p.x, 1.1, -p.d - 0.4, 0xffb347, 12, 4, 0.22, 0.5, 8);
    if (o.v.kind === 'train' || o.v.key === 'traincar') this.ghostUntilD = o.d + o.v.depth + 4; // glance off the side of the train
    else this.spawner.knock(o);
    this.invuln = 1.7;
    if (!this.pursuit.hit()) { this.fail(this.pursuit.failed!); return; }
    p.stumble();
    this.ui.toast(this.mission.patrol ? 'Ouch!' : 'You hit something — the suspect is pulling away!');
  }

  /** Bank coins and distance (at checkpoints and whenever a run ends). */
  private bank() {
    const s = this.save.data;
    s.coins += this.runCoins - this.banked;
    this.banked = this.runCoins;
    const run = Math.max(0, this.player.d - this.bankedD);
    s.totalDistance += run;
    this.bankedD = this.player.d;
    s.bestDistance = Math.max(s.bestDistance, this.ran);
    this.save.commit();
  }

  private enterZone(i: number) {
    const m = this.mission, z = m.zones[i];
    this.zone = i;
    this.pursuit.checkpoint(z.minGap);
    if (!m.patrol) {
      if (z.gapBoost) { this.pursuit.surge(z.gapBoost); this.audio.surge(); }
      this.save.data.story[m.id] = { zone: i, gap: Math.min(this.pursuit.gap, m.pursuit.startGap + 15), done: false, best: Math.max(this.save.data.story[m.id]?.best ?? 0, this.distance) };
      this.setCrimVehicle();
    }
    this.bank();
    this.audio.checkpoint();
    this.audio.radio();
    this.audio.setMood(i >= m.zones.length - 2 && !m.patrol ? 'tense' : m.boss ? 'tense' : 'chase');
    this.ui.banner(z.name.toUpperCase(), m.patrol ? 'Hearts restored' : 'Checkpoint saved · hearts restored', 2600);
    if (!m.patrol) this.ui.radio(z.radio);
  }

  private fail(reason: FailReason) {
    if (this.state !== 'running') return;
    this.failReason = reason;
    this.state = 'failing';
    this.stateT = 0;
    this.audio.stopMusic();
    this.audio.stopLoops();
    if (this.abilities.active) { this.abilities.cancel(); this.player.setMode('run'); }
    this.player.scripted = true;
    if (reason === 'injured') { this.player.act('Death_A', 9, 0.08, 1.2); this.audio.crash(); this.camera.kick(0.75); this.buzz(160); }
    else this.player.act('Hit_B', 9, 0.15, 0.6);
  }

  private finishFail() {
    const s = this.save.data, m = this.mission;
    this.bank();
    const before = levelFor(s.xp);
    const record = !!m.patrol && this.score > s.best && this.score > 0;
    if (m.patrol) s.best = Math.max(s.best, this.score);
    this.grantXp(this.score);
    s.runs++;
    this.save.commit();
    const after = levelFor(s.xp);
    if (record) this.audio.record(); else this.audio.gameOver();
    const txt = FAIL_TEXT[this.failReason ?? 'lost'];
    this.result = 'failed';
    this.ui.results({
      won: false, title: m.patrol ? (record ? 'NEW PATROL RECORD' : 'PATROL OVER') : txt.title, detail: m.patrol ? `Score ${this.score.toLocaleString('en-US')} · best ${s.best.toLocaleString('en-US')}` : txt.detail,
      mission: m.title, distance: this.distance, length: m.length, coins: this.runCoins, avoided: this.avoided, abilityUses: this.abilities.uses, hits: this.pursuit.hits,
      pursuit: m.patrol ? -1 : Math.round(this.pursuit.closeness * 100), reward: 0, xp: this.score, level: after.level, levelUp: after.level > before.level, xpFrac: after.into / after.need,
      checkpoint: m.patrol ? '' : m.zones[this.checkpoint().zone].name, next: '', patrol: !!m.patrol,
    });
    this.ui.show('over');
    this.state = 'over';
  }

  private grantXp(xp: number) {
    const s = this.save.data;
    s.xp += xp;
    const season = currentSeason();
    s.seasonXp[season.id] = (s.seasonXp[season.id] ?? 0) + xp;
  }

  // ---------------------------------------------------------------- the capture
  private startCapture() {
    const m = this.mission;
    this.capture = new Capture(m, {
      phase: (ph) => {
        if (ph === 'lock') { this.criminal.weave = true; this.ui.banner(CAPTURE_TEXT[m.capture.type].tool + ' READY', CAPTURE_TEXT[m.capture.type].ready, 2600); this.audio.abilityReady(); }
        else if (ph === 'approach') { this.criminal.weave = false; this.ui.banner('OUT OF RANGE', 'Close the distance again!', 1600); }
        else if (ph === 'takedown') this.beginTakedown();
        else if (ph === 'failed') this.fail('capture');
      },
      shot: (r) => this.onShot(r),
    });
    this.pursuit.floor = Math.max(4, m.capture.range - 5);
    this.audio.setMood('finale');
    this.audio.checkpoint();
    this.ui.banner('FINAL PURSUIT', `Get within ${m.capture.range} m of ${CRIMINALS[m.criminal].alias}`, 2600);
    if (this.abilities.active) { this.abilities.cancel(); this.endAbility(); }
    this.throwT = 2.5;
  }

  private onShot(r: 'hit' | 'miss-timing' | 'miss-lane') {
    const p = this.player, c = this.criminal, t = CAPTURE_TEXT[this.mission.capture.type];
    const tackle = this.mission.capture.type === 'tackle';
    if (tackle) p.act('Dodge_Forward', 0.5, 0.06, 1.3); else p.act('1H_Ranged_Shoot', 0.45, 0.06, 1.4);
    // the wire / net line
    this.beamT = 0.2;
    this.beam.position.set(p.x, 1.15, -p.d - 0.4);
    const tx = r === 'miss-lane' ? p.x : c.x, len = Math.max(2, this.pursuit.gap - 0.4);
    this.beam.lookAt(tx + (r === 'miss-timing' ? 1.6 : 0), r === 'hit' ? 1.0 : 2.4, -p.d - len);
    this.beam.scale.set(1, 1, len);
    (this.beam.material as THREE.MeshBasicMaterial).color.set(this.mission.capture.type === 'net' ? 0xd8ffb0 : 0x9fe8ff);
    if (r === 'hit') {
      this.audio.taser();
      c.stagger();
      this.pursuit.gain(3);
      this.camera.kick(0.35);
      this.buzz(80);
      this.particles.burst(c.x, 1.1, -c.d, 0x9fe8ff, 30, 5, 0.26, 0.6, 2);
      this.ui.toast(t.hit);
    } else {
      this.audio.miss();
      this.pursuit.surge(5);
      this.ui.toast(r === 'miss-lane' ? 'Wrong lane — line up behind the suspect!' : t.miss);
    }
  }

  private beginTakedown() {
    this.state = 'takedown';
    this.stateT = 0;
    this.takedownStep = 0;
    const p = this.player, c = this.criminal;
    p.scripted = true; c.scripted = true; c.weave = false;
    this.audio.stopMusic();
    this.audio.captured();
    this.audio.wind(false); this.audio.engine(false);
    this.buzz(200);
    c.rig?.play('Death_A', 0.08, 1.1, 0, true);
    c.ride(null);
    c.root.position.y = 0;
    this.particles.burst(c.x, 1.0, -c.d, 0x9fe8ff, 40, 6, 0.3, 0.9, 3);
    this.ui.show('cine');
    this.ui.banner('GOT THEM!', '', 1500);
    this.camera.cineEase = 2.2;
    this.bend.flat(-p.d);
  }

  private updateTakedown(dt: number) {
    const t = (this.stateT += dt);
    const p = this.player, c = this.criminal;
    const cx = c.root.position.x, cz = c.root.position.z;
    // the officer runs up, cuffs the suspect and signals the arrest
    const tz = cz + 1.25;
    if (t < 1.1) {
      const k = Math.min(1, dt * 5);
      p.x += (cx - p.x) * k; p.root.position.x = p.x;
      p.root.position.z += (tz - p.root.position.z) * k;
      p.root.position.y = Math.max(0, p.root.position.y - dt * 12);
      p.rig?.play(p.runClip, 0.1);
    }
    if (this.takedownStep === 0 && t >= 1.1) { this.takedownStep = 1; p.root.position.set(cx, 0, tz); p.root.rotation.y = 0; p.act('Interact', 2, 0.15); this.ui.caption('ARREST', `${CRIMINALS[this.mission.criminal].name} — you are under arrest.`); this.audio.radio(); }
    if (this.takedownStep === 1 && t >= 2.6) { this.takedownStep = 2; p.celebrate(); this.particles.burst(cx, 1.6, tz, 0xffd84a, 40, 4, 0.24, 1, 4); }
    const a = 0.9 + t * 0.35;
    this.camera.cinePos.set(cx + Math.sin(a) * 5.2, 2.0 + t * 0.12, cz + 0.6 + Math.cos(a) * 5.2);
    this.camera.cineLook.set(cx, 0.8, cz + 0.6);
    this.capture?.update(dt, 0);
    if (this.capture?.phase === 'done') this.complete();
  }

  private complete() {
    const s = this.save.data, m = this.mission;
    this.bank();
    const before = levelFor(s.xp);
    const first = !s.story[m.id]?.done;
    const reward = first ? m.rewards.coins : Math.round(m.rewards.coins * 0.25);
    s.coins += reward;
    this.grantXp(m.rewards.xp + this.score);
    s.story[m.id] = { zone: 0, gap: m.pursuit.startGap, done: true, best: m.length };
    s.arrests++;
    s.runs++;
    // the next case on the board
    const next = MISSIONS.find((x) => !s.story[x.id]?.done && missionUnlocked(x, s.story, s.totalDistance));
    if (next) s.mission = next.id;
    this.save.commit();
    const after = levelFor(s.xp);
    const locked = MISSIONS.find((x) => !s.story[x.id]?.done && !missionUnlocked(x, s.story, s.totalDistance));
    this.result = 'won';
    // frame the arrest above the results panel
    const cp = this.criminal.root.position;
    this.camera.cineEase = 1.6;
    this.camera.cinePos.set(cp.x + 4.2, 3.4, cp.z + 7.4);
    this.camera.cineLook.set(cp.x, -1.9, cp.z + 0.6);
    this.ui.caption(null);
    this.ui.results({
      won: true, title: 'SUSPECT IN CUSTODY', detail: `${CRIMINALS[m.criminal].name} has been arrested.`,
      mission: m.title, distance: m.length, length: m.length, coins: this.runCoins, avoided: this.avoided, abilityUses: this.abilities.uses, hits: this.pursuit.hits,
      pursuit: 100, reward, xp: m.rewards.xp + this.score, level: after.level, levelUp: after.level > before.level, xpFrac: after.into / after.need,
      checkpoint: '', next: next ? next.title : locked ? `${locked.title} — ${locked.requires?.totalDistance ? `run ${locked.requires.totalDistance.toLocaleString('en-US')} m in total to unlock` : 'locked'}` : 'Every case is closed. Outstanding work, officer.', patrol: false, hasNext: !!next,
    });
    this.ui.show('over');
    this.state = 'over';
  }

  // ---------------------------------------------------------------- test / attract bot
  /** Plays using real inputs: follows the guaranteed path, reacts to obstacles in its lane, uses abilities and makes the arrest. */
  private bot(speed: number) {
    const p = this.player;
    if (this.capture?.phase === 'lock') {
      if (p.lane !== this.criminal.lane) p.moveLane(Math.sign(this.criminal.lane - p.lane));
      else if (this.capture.inWindow) this.power();
    } else {
      const rows = this.spawner.rows;
      const i = rows.findIndex((r) => r.d > p.d - 0.3);
      if (i >= 0) {
        const row = rows[i], prev = rows[i - 1];
        if (p.lane !== row.safe && (!prev || p.d > prev.d + 0.9)) p.moveLane(Math.sign(row.safe - p.lane));
      }
    }
    if (p.mode !== 'run') return;
    for (const o of this.spawner.active) {
      if (o.lane !== p.lane || o.d < p.d - 0.2) continue;
      const gap = o.d - p.d;
      if (o.v.kind === 'jump' && gap <= speed * 0.34 + 1.2 && !p.airborne) { this.onAction('jump'); break; }
      if (o.v.kind === 'slide' && gap <= Math.max(1.8, speed * 0.2) && !p.sliding && !p.airborne) { this.onAction('slide'); break; }
    }
    if (!this.capture && this.abilities.ready && this.botPowers) this.power();
  }
  botPowers = true;

  // ---------------------------------------------------------------- frame
  private updateRun(dt: number) {
    const p = this.player, m = this.mission, ab = this.abilities;
    const zi = zoneIndexAt(m, p.d);
    if (zi > this.zone) this.enterZone(zi);
    const zone = m.zones[this.zone];
    this.pace = paceAt(p.d - this.startD, zone.maxSpeed);
    const speed = this.pace * p.speedFactor * (ab.active ? ab.def.speedMul : 1);
    if (this.autopilot) this.bot(speed);
    this.spawner.update(p.d, speed, dt, this.time);
    this.powers.update(dt);
    if (ab.update(dt)) this.endAbility();
    if (ab.ready && !this.readyPinged && !this.capture) { this.readyPinged = true; this.audio.abilityReady(); this.ui.toast(`${ab.def.name} ready!`); }
    p.update(dt, speed, true);
    this.world.update(p.d, this.time);
    this.bend.update(dt, p.d, -p.d, zone.curve, zone.hills);

    const got = this.coins.update(this.time, dt, p.x, p.y, p.d, p.mode === 'fly' ? 2.4 : p.height, this.powers.active('magnet') || ab.is('reveal'));
    if (got) {
      const worth = got * (this.powers.active('double') ? 2 : 1);
      this.runCoins += worth;
      ab.addCoins(got);
      this.missions.report('coins', worth);
      this.audio.coin();
    }
    const pick = this.spawner.collect(p.x, p.y, p.d);
    if (pick) this.grant(pick);

    this.invuln = Math.max(0, this.invuln - dt);
    if (this.invuln <= 0 && p.d > this.ghostUntilD) {
      const hit = hitTest({ x: p.x, y: p.y, d: p.d, height: p.height }, this.spawner.active);
      if (hit) this.onHit(hit);
      if (this.state !== 'running') return;
    }
    p.root.visible = !(this.invuln > 0 || p.d <= this.ghostUntilD) || ab.active || Math.floor(this.time * 16) % 2 === 0;

    if (!m.patrol) {
      this.pursuit.update(dt, p.speedFactor, (ab.active ? ab.def.gapClose : 0) + (this.capture?.phase === 'approach' ? 3 : 0), this.pace);
      if (this.pursuit.failed) { this.fail(this.pursuit.failed); return; }
      const c = this.criminal;
      c.root.visible = this.pursuit.gap < 115;
      c.update(dt, p.d + this.pursuit.gap, speed, this.spawner.rows, this.spawner.active);
      // debris thrown into the officer's path
      const rate = this.capture ? (this.capture.phase === 'approach' ? 7 : 0) : zone.throws;
      this.throwT -= dt;
      if (rate > 0 && this.throwT <= 0 && this.pursuit.gap < 75 && !c.riding) {
        this.throwT = (60 / rate) * (0.6 + Math.random() * 0.8);
        if (this.spawner.throwAt(c.d - 4, c.lane, ['crates', 'barrels', 'tyres'][Math.floor(Math.random() * 3)])) { c.act('Throw', 0.5, 0.06, 1.5); this.audio.throwObj(); }
        else this.throwT = 0.6;
      }
      if (!this.capture && p.d >= m.length) this.startCapture();
      if (this.capture) {
        this.capture.update(dt, this.pursuit.gap);
        if (this.state !== 'running') return;
      }
      if (p.d >= m.limit) { this.fail('escaped'); return; }
    }

    if (this.beamT > 0) { this.beamT -= dt; this.beam.visible = this.beamT > 0; }
    this.missions.report('distance', this.ran, true);
    this.missions.report('score', this.score, true);
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.08;
      this.ui.powers(this.powers.left, this.powers.total);
      this.ui.hud({
        distance: this.distance, score: this.score, coins: this.runCoins, gap: this.pursuit.gap, closeness: this.pursuit.closeness, danger: this.pursuit.danger,
        hearts: this.pursuit.hearts, zone: zone.name,
        ability: { fill: ab.fill, ready: ab.ready, active: ab.active, cooling: ab.cooldown > 0 && !ab.active, charge: Math.floor(ab.charge), cost: ab.cost, left: ab.left },
      });
      const cap = this.capture;
      this.ui.capture(cap && (cap.phase === 'lock' || cap.phase === 'approach') ? {
        phase: cap.phase, type: m.capture.type, meter: cap.meter, windowAt: cap.windowAt, window: m.capture.window, hits: cap.hits, need: m.capture.hits, tries: cap.tries,
        aligned: p.lane === this.criminal.lane, range: m.capture.range, gap: this.pursuit.gap,
      } : null);
    } else if (this.capture?.phase === 'lock') this.ui.captureMeter(this.capture.meter, p.lane === this.criminal.lane);
  }

  private grant(kind: PowerKind) {
    this.powers.activate(kind, this.save.data.upgrades[kind]);
    this.missions.report('powerups', 1);
    this.audio.powerup();
    this.camera.kick(0.12);
    this.particles.burst(this.player.x, 1.2, -this.player.d, new THREE.Color(POWER_COLORS[kind]).getHex(), 24, 4, 0.26, 0.7, 2);
    this.buzz(30);
  }

  /** Advance the simulation by dt seconds (no rendering). */
  update(dt: number) {
    this.time += dt;
    const p = this.player;
    const before = p.d;
    const st = this.state;
    if (st === 'running') this.updateRun(dt);
    else if (st !== 'paused') {
      if (st === 'intro') this.updateIntro(dt);
      else if (st === 'takedown') this.updateTakedown(dt);
      else if (st === 'failing') {
        this.stateT += dt;
        // the suspect disappears into the distance
        if (!this.mission.patrol) { this.pursuit.gap += dt * 26; this.criminal.update(dt, p.d + this.pursuit.gap, this.pace, this.spawner.rows, this.spawner.active); }
        if (this.stateT >= 1.5) this.finishFail();
      }
      p.update(dt, 0, false);
      if (st === 'intro' || st === 'takedown') this.criminal.update(dt, 0, 0, [], []);
      this.world.update(p.d, this.time);
      this.spawner.factory.update(this.time);
      if (st !== 'intro') BEND.value.z = -p.d;
    }
    if (st !== 'paused') {
      this.abilityFx(dt);
      this.particles.update(dt, st === 'running' ? -(p.d - before) * 0.6 : 0);
      this.applyLook(p.d);
      const mode: CamMode = st === 'menu' || st === 'loading' ? 'menu' : st === 'over' ? (this.result === 'won' ? 'cine' : 'over') : st === 'intro' || st === 'takedown' ? 'cine' : 'run';
      const zmax = this.mission.zones[this.zone]?.maxSpeed ?? CFG.maxSpeed;
      this.camera.update(dt, p, mode, st === 'running' ? THREE.MathUtils.clamp((this.pace - CFG.startSpeed) / (zmax - CFG.startSpeed + 0.01), 0, 1) : 0);
    }
    this.sky.update(this.time, this.camera.cam.position, p.d);
    this.sun.position.set(p.x - 9, 22, -p.d - 4);
    this.sun.target.position.set(p.x, 0, -p.d - 10);
  }

  private frame() {
    const raw = this.clock.getDelta();
    this.update(Math.min(raw, 1 / 30));
    this.renderer.render(this.scene, this.camera.cam);
    // adaptive quality (auto mode only): sustained slow frames step the tier down
    if (this.state === 'running' && this.save.data.quality === 'auto' && this.autoTier !== 'low') {
      this.slowFrames = raw > 1 / 40 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
      if (this.slowFrames > 90) {
        this.slowFrames = 0;
        this.autoTier = this.autoTier === 'high' ? 'medium' : 'low';
        this.applyQuality();
      }
    }
  }
}
