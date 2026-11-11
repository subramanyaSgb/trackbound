import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { AudioManager } from '../audio/AudioManager';
import { FollowCamera, type CamMode } from '../camera/FollowCamera';
import { Player } from '../player/Player';
import { hitTest } from '../systems/Collision';
import { Coins } from '../systems/Coins';
import { Missions } from '../systems/Missions';
import { Particles } from '../systems/Particles';
import { MAX_LEVEL, POWER_INFO, POWER_KINDS, PowerUps, UPGRADE_COST, durationFor, type PowerKind } from '../systems/PowerUps';
import { Ui, type MenuModel, type SheetName } from '../ui/Ui';
import { Environment } from '../world/Environment';
import { POWER_COLORS } from '../world/ObstacleFactory';
import { HORIZON, Sky } from '../world/Sky';
import { Spawner } from '../world/Spawner';
import { Assets, CHARACTERS } from './Assets';
import { CFG, speedAt } from './config';
import { Input, type Action } from './Input';
import { Save, levelFor, type Quality } from './Save';

type State = 'loading' | 'menu' | 'running' | 'paused' | 'dying' | 'over';
interface InstallEvent extends Event { prompt(): Promise<void> }

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
  env!: Environment;
  sky!: Sky;
  coins!: Coins;
  spawner!: Spawner;
  particles!: Particles;
  missions!: Missions;
  private sun = new THREE.DirectionalLight(0xfff0d2, 2.9);
  private shield!: THREE.Mesh;
  private aura!: THREE.Mesh;
  private clock = new THREE.Clock();
  private time = 0;
  private dyingT = 0;
  private invuln = 0;
  private hudT = 0;
  private slowFrames = 0;
  private autoTier: Exclude<Quality, 'auto'> = 'high';
  private sheet: SheetName | null = null;
  private preview = 'ash';
  private installEvt: InstallEvent | null = null;
  runCoins = 0;
  autopilot = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // image-based ambient light + reflections for glass and metal
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();
    this.scene.fog = new THREE.Fog(HORIZON, 70, 240);
    this.scene.background = new THREE.Color(HORIZON);
    this.scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x9a8f80, 1.15));
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -12; sc.right = 12; sc.top = 30; sc.bottom = -10; sc.near = 1; sc.far = 80;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);

    this.ui = new Ui({
      play: () => this.startRun(), pause: () => this.pause(), resume: () => this.resume(),
      home: () => this.toMenu(), retry: () => this.startRun(),
      click: () => { this.audio.unlock(); this.audio.click(); },
      sheet: (s) => this.openSheet(s),
      previewChar: (id) => this.previewChar(id),
      chooseChar: (id) => this.chooseChar(id),
      buyUpgrade: (k) => this.buyUpgrade(k),
      claim: (id) => this.claim(id),
      setting: (k, v) => this.setting(k, v),
      resetProgress: () => this.resetProgress(),
      install: () => { void this.installEvt?.prompt(); this.installEvt = null; this.refreshMenu(); },
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
    this.missions.onComplete = (m) => { this.audio.mission(); this.ui.toast(`Mission complete — ${m.text}`); };
    this.env = new Environment(this.scene, this.assets);
    this.sky = new Sky(this.scene, this.assets);
    this.coins = new Coins(this.scene, this.assets);
    this.particles = new Particles(this.scene);
    this.coins.onCollect = (x, y, z) => this.particles.burst(x, y, z, 0xffd84a, 5, 2.2, 0.16, 0.35, 3);
    this.spawner = new Spawner(this.scene, this.coins, this.assets);
    this.spawner.onTrainPassed = () => this.missions.report('trains', 1);
    this.player = new Player(this.assets, {
      jump: () => this.audio.jump(),
      land: () => { this.audio.land(); this.particles.burst(this.player.x, 0.1, -this.player.d, 0xcfc4b4, 7, 1.6, 0.3, 0.4, 1, 0.5); },
      slide: () => { this.audio.slide(); this.missions.report('slides', 1); this.particles.burst(this.player.x, 0.1, -this.player.d, 0xcfc4b4, 6, 1.4, 0.3, 0.4, 1, 0.4); },
      step: () => this.audio.step(), lane: () => this.audio.lane(),
    });
    this.scene.add(this.player.root);
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 16), new THREE.MeshStandardMaterial({ color: 0x7fd4ff, emissive: 0x2fb4ff, emissiveIntensity: 0.8, transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.2, depthWrite: false }));
    this.aura = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 8, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    this.shield.visible = this.aura.visible = false;
    this.scene.add(this.shield, this.aura);

    this.preview = s.char;
    await this.player.setCharacter(s.char);
    this.ui.loading(1);
    this.audio.setVolumes(s.music, s.sfx);
    this.autoTier = (navigator.hardwareConcurrency ?? 4) >= 8 && !matchMedia('(pointer: coarse)').matches ? 'high' : 'medium';
    this.applyQuality();
    this.resize();
    this.renderer.compile(this.scene, this.camera.cam);
    this.toMenu(true);
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

  // ---------------------------------------------------------------- menu model + actions
  private model(): MenuModel {
    const s = this.save.data;
    const lv = levelFor(s.xp);
    return {
      coins: s.coins, best: s.best, level: lv.level, xpFrac: lv.into / lv.need, claimable: this.missions.claimable,
      preview: this.preview,
      chars: CHARACTERS.map((c) => ({ ...c, owned: s.owned.includes(c.id), selected: s.char === c.id })),
      upgrades: POWER_KINDS.map((k) => ({ kind: k, name: POWER_INFO[k].name, desc: POWER_INFO[k].desc, level: s.upgrades[k], max: MAX_LEVEL, duration: durationFor(k, s.upgrades[k]), cost: s.upgrades[k] < MAX_LEVEL ? UPGRADE_COST[s.upgrades[k]] : 0 })),
      missions: this.missions.list().map((m) => ({ id: m.def.id, text: m.def.text, progress: m.state.progress, target: m.def.target, reward: m.def.reward, done: m.done })),
      settings: { music: s.music, sfx: s.sfx, quality: s.quality, sensitivity: s.sensitivity, haptics: s.haptics },
      canInstall: !!this.installEvt,
    };
  }

  private refreshMenu() { this.ui.menu(this.model(), this.sheet); }

  openSheet(s: SheetName | null) {
    if (this.state !== 'menu') return;
    this.sheet = s;
    this.camera.lift = s === 'runners' ? 1 : s ? 0.5 : 0;
    if (s !== 'runners' && this.preview !== this.save.data.char) this.previewChar(this.save.data.char);
    this.refreshMenu();
  }

  previewChar(id: string) {
    this.preview = id;
    void this.player.setCharacter(id);
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
    this.particles.burst(0, 1.2, 0, 0xffd84a, 30, 3.5, 0.22, 0.9, 4);
  }

  buyUpgrade(k: PowerKind) {
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
    this.missions.onComplete = (m) => { this.audio.mission(); this.ui.toast(`Mission complete — ${m.text}`); };
    this.previewChar('ash');
    this.ui.toast('Progress reset');
  }

  // ---------------------------------------------------------------- run lifecycle
  private resetWorld() {
    this.player.reset();
    this.env.reset();
    this.coins.reset();
    this.spawner.reset();
    this.powers.reset();
    this.runCoins = 0;
    this.invuln = 0;
  }

  toMenu(snap = false) {
    this.resetWorld();
    this.state = 'menu';
    this.sheet = null;
    this.camera.lift = 0;
    this.input.dragMode = true;
    this.input.threshold = 26 / this.save.data.sensitivity;
    this.audio.stopMusic();
    if (this.player.characterId !== this.save.data.char) void this.player.setCharacter(this.save.data.char);
    this.preview = this.save.data.char;
    this.refreshMenu();
    this.ui.show('menu');
    if (snap) this.camera.snap(this.player, 'menu');
  }

  startRun(seed?: number) {
    this.audio.unlock();
    if (this.state !== 'menu') this.resetWorld();
    if (this.player.characterId !== this.save.data.char) void this.player.setCharacter(this.save.data.char);
    if (seed !== undefined) this.spawner.reset(seed);
    this.missions.startRun();
    this.input.dragMode = false;
    this.player.start();
    this.state = 'running';
    this.audio.startMusic();
    this.ui.show('hud');
  }

  pause() {
    if (this.state !== 'running') return;
    this.state = 'paused';
    this.audio.stopMusic();
    this.ui.show('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.audio.startMusic();
    this.ui.show('hud');
  }

  private onAction(a: Action) {
    if (a === 'pause') { if (this.state === 'running') this.pause(); else this.resume(); return; }
    if (this.state !== 'running') return;
    if (a === 'left') this.player.moveLane(-1);
    else if (a === 'right') this.player.moveLane(1);
    else if (a === 'jump') { if (!this.player.airborne) this.missions.report('jumps', 1); this.player.jump(); }
    else this.player.slide();
  }

  get distance() { return Math.floor(this.player.d); }
  get score() { return this.distance + this.runCoins * CFG.coinValue; }
  private buzz(ms: number) { if (this.save.data.haptics) navigator.vibrate?.(ms); }

  private crash() {
    this.state = 'dying';
    this.dyingT = 1.3;
    this.player.die();
    this.camera.kick(0.75);
    this.audio.stopMusic();
    this.audio.crash();
    this.particles.burst(this.player.x, 1.1, -this.player.d - 0.4, 0xffffff, 26, 5, 0.3, 0.6, 8);
    this.particles.burst(this.player.x, 1.1, -this.player.d - 0.4, 0xffb347, 16, 4, 0.22, 0.5, 8);
    this.buzz(140);
  }

  private finish() {
    const s = this.save.data;
    const before = levelFor(s.xp);
    const record = this.score > s.best && this.score > 0;
    s.best = Math.max(s.best, this.score);
    s.bestDistance = Math.max(s.bestDistance, this.distance);
    s.coins += this.runCoins;
    s.xp += this.score;
    s.runs++;
    this.save.commit();
    const after = levelFor(s.xp);
    if (record) { this.audio.record(); this.player.celebrate(); } else this.audio.gameOver();
    this.ui.over({
      score: this.score, distance: this.distance, coins: this.runCoins, best: s.best, record,
      level: after.level, levelUp: after.level > before.level, xpFrac: after.into / after.need,
      missions: this.model().missions,
    });
    this.ui.show('over');
    this.state = 'over';
  }

  private grant(kind: PowerKind) {
    this.powers.activate(kind, this.save.data.upgrades[kind]);
    this.missions.report('powerups', 1);
    this.audio.powerup();
    this.camera.kick(0.12);
    this.particles.burst(this.player.x, 1.2, -this.player.d, new THREE.Color(POWER_COLORS[kind]).getHex(), 24, 4, 0.26, 0.7, 2);
    this.buzz(30);
  }

  /** Test/attract bot: follows the generator's guaranteed path using real inputs. */
  private bot(speed: number) {
    const p = this.player;
    const rows = this.spawner.rows;
    const i = rows.findIndex((r) => r.d > p.d - 0.3);
    if (i < 0) return;
    const row = rows[i];
    const prev = rows[i - 1];
    if (p.lane !== row.safe && (!prev || p.d > prev.d + 0.9)) p.moveLane(Math.sign(row.safe - p.lane));
    const gap = row.d - p.d;
    const cell = row.cells[row.safe];
    if (p.lane !== row.safe) return;
    if (cell === 'jump' && gap <= speed * 0.36 && !p.airborne) this.onAction('jump');
    else if (cell === 'slide' && gap <= Math.max(1.6, speed * 0.22) && !p.sliding) this.onAction('slide');
  }

  /** Advance the simulation by dt seconds (no rendering). */
  update(dt: number) {
    this.time += dt;
    const p = this.player;
    const speed = speedAt(p.d);
    const running = this.state === 'running';
    const before = p.d;
    if (running) {
      if (this.autopilot) this.bot(speed);
      this.spawner.update(p.d, speed, dt, this.time);
      this.powers.update(dt);
    }
    if (this.state !== 'paused') p.update(dt, speed, running);
    if (running) {
      this.env.update(p.d);
      const got = this.coins.update(this.time, dt, p.x, p.y, p.d, p.height, this.powers.active('magnet'));
      if (got) {
        const worth = got * (this.powers.active('double') ? 2 : 1);
        this.runCoins += worth;
        this.missions.report('coins', worth);
        this.audio.coin();
      }
      const pick = this.spawner.collect(p.x, p.y, p.d);
      if (pick) this.grant(pick);
      this.invuln = Math.max(0, this.invuln - dt);
      const hit = hitTest({ x: p.x, y: p.y, d: p.d, height: p.height }, this.spawner.active);
      if (hit) {
        if (this.invuln > 0 || this.powers.absorb()) {
          // shield: smash through whatever is touched for a moment
          if (this.invuln <= 0) { this.invuln = 1; this.audio.shieldBreak(); this.camera.kick(0.4); this.buzz(60); }
          this.particles.burst(p.x, 1.2, -p.d - 0.5, 0x8fdcff, 28, 6, 0.3, 0.6, 6);
          this.spawner.remove(hit);
        } else this.crash();
      }
      this.missions.report('distance', this.distance, true);
      this.missions.report('score', this.score, true);
      this.ui.hud(this.score, this.runCoins, this.distance);
      this.hudT -= dt;
      if (this.hudT <= 0) { this.hudT = 0.1; this.ui.powers(this.powers.left, this.powers.total); }
    } else if (this.state === 'dying') {
      this.dyingT -= dt;
      if (this.dyingT <= 0) this.finish();
    }

    // attached effects
    const shieldOn = running && (this.powers.active('shield') || this.invuln > 0);
    this.shield.visible = shieldOn;
    if (shieldOn) { this.shield.position.set(p.x, p.y + 0.95, -p.d); this.shield.scale.setScalar(1 + Math.sin(this.time * 6) * 0.04); }
    const auraKind = running && this.powers.active('magnet') ? 'magnet' : running && this.powers.active('double') ? 'double' : null;
    this.aura.visible = !!auraKind;
    if (auraKind) {
      (this.aura.material as THREE.MeshBasicMaterial).color.set(POWER_COLORS[auraKind]);
      this.aura.position.set(p.x, p.y + 0.12 + Math.abs(Math.sin(this.time * 4)) * 0.5, -p.d);
      this.aura.rotation.y = this.time * 3;
    }
    if (this.state !== 'paused') this.particles.update(dt, running ? -(p.d - before) * 0.6 : 0);

    const mode: CamMode = this.state === 'menu' || this.state === 'loading' ? 'menu' : this.state === 'over' ? 'over' : 'run';
    if (this.state !== 'paused') this.camera.update(dt, p, mode, (speed - CFG.startSpeed) / (CFG.maxSpeed - CFG.startSpeed));
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
