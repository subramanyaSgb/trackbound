import * as THREE from 'three';
import type { Assets } from '../core/Assets';
import { CFG, laneX } from '../core/config';

type Clip = 'Idle' | 'Running_A' | 'Running_Strafe_Left' | 'Running_Strafe_Right' | 'Jump_Start' | 'Jump_Idle' | 'Jump_Land' | 'Dodge_Forward' | 'Hit_A' | 'Death_A' | 'Cheer' | 'Use_Item';
const ONCE: Clip[] = ['Jump_Start', 'Jump_Land', 'Dodge_Forward', 'Hit_A', 'Death_A', 'Use_Item'];
interface Rig { id: string; model: THREE.Object3D; mixer: THREE.AnimationMixer; actions: Record<Clip, THREE.AnimationAction> }

export interface PlayerEvents { jump(): void; land(): void; slide(): void; step(): void; lane(): void }

/**
 * Player controller (lane/jump/slide physics) plus the skeletal animation
 * state machine: run, strafe on lane change, take-off -> airborne -> landing,
 * roll, hit/death, cheer. All transitions are cross-faded.
 */
export class Player {
  readonly root = new THREE.Group();
  private tilt = new THREE.Group();
  private rig: Rig | null = null;
  private rigs = new Map<string, Rig>();
  private current: Clip | '' = '';
  private wanted = 0;

  lane = 1;
  x = 0;
  y = 0;
  d = 0;
  dead = false;
  orbit = 0; // menu preview rotation
  private vy = 0;
  private grounded = true;
  private slideT = 0;
  private jumpBuf = 0;
  private slideQueued = false;
  private stepT = 0;
  private airT = 0;
  private landT = 0;
  private strafeT = 0;
  private knock = 0;
  private running = false;

  constructor(private assets: Assets, private events: PlayerEvents) {
    this.root.add(this.tilt);
  }

  get characterId() { return this.rig?.id ?? ''; }

  /** Swap the skinned model. Safe to call repeatedly; the last request wins. */
  async setCharacter(id: string) {
    const ticket = ++this.wanted;
    let rig = this.rigs.get(id);
    if (!rig) {
      const gltf = await this.assets.character(id);
      const model = gltf.scene;
      // size by the body only, so tall hats and helmets do not shrink the character
      const box = new THREE.Box3();
      model.updateMatrixWorld(true);
      model.traverse((o) => { if ((o as THREE.Mesh).isMesh && /Body|Leg|Head/.test(o.name) && !/Hat|Helmet/.test(o.name)) box.expandByObject(o); });
      if (box.isEmpty()) box.setFromObject(model);
      model.scale.setScalar(THREE.MathUtils.clamp(1.75 / (box.max.y - box.min.y), 0.5, 0.95));
      model.rotation.y = Math.PI; // face down the track (-Z)
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.frustumCulled = false;
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.roughness = 0.75; mat.metalness = 0; mat.envMapIntensity = 0.6;
      });
      const mixer = new THREE.AnimationMixer(model);
      const actions = {} as Record<Clip, THREE.AnimationAction>;
      for (const clip of gltf.animations) {
        const a = mixer.clipAction(clip);
        if (ONCE.includes(clip.name as Clip)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
        actions[clip.name as Clip] = a;
      }
      rig = { id, model, mixer, actions };
      this.rigs.set(id, rig);
    }
    if (ticket !== this.wanted) return;
    if (this.rig) { this.rig.mixer.stopAllAction(); this.tilt.remove(this.rig.model); }
    this.rig = rig;
    this.tilt.add(rig.model);
    const resume = this.current || 'Idle';
    this.current = '';
    this.play(this.running ? 'Running_A' : resume === 'Cheer' ? 'Cheer' : 'Idle', 0);
  }

  private play(name: Clip, fade = 0.12, timeScale = 1, from = 0) {
    if (!this.rig || this.current === name) return;
    const next = this.rig.actions[name];
    const prev = this.current ? this.rig.actions[this.current] : null;
    next.reset();
    next.time = from;
    next.setEffectiveTimeScale(timeScale).setEffectiveWeight(1).fadeIn(fade).play();
    if (prev) prev.fadeOut(fade);
    this.current = name;
  }

  get height() { return this.slideT > 0 ? CFG.slideH : CFG.standH; }
  get sliding() { return this.slideT > 0; }
  get airborne() { return !this.grounded; }
  get animation() { return this.current; }

  reset() {
    this.lane = 1; this.x = 0; this.y = 0; this.d = 0; this.vy = 0; this.knock = 0;
    this.grounded = true; this.slideT = 0; this.jumpBuf = 0; this.slideQueued = false; this.dead = false;
    this.airT = this.landT = this.strafeT = 0;
    this.running = false;
    this.tilt.rotation.set(0, 0, 0);
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.rig?.mixer.stopAllAction();
    this.current = '';
    this.play('Idle', 0);
  }

  start() { this.running = true; this.orbit = 0; this.play('Running_A', 0.2); }
  idle() { this.play('Idle', 0.3); }
  celebrate() { this.play('Cheer', 0.25); }

  moveLane(dir: number) {
    const l = this.lane + dir;
    if (this.dead || l < 0 || l > 2) return;
    this.lane = l;
    if (this.grounded && this.slideT <= 0) {
      this.current = this.current === 'Running_A' ? this.current : '';
      this.play(dir < 0 ? 'Running_Strafe_Left' : 'Running_Strafe_Right', 0.07, 1.6);
      this.strafeT = 0.2;
      this.landT = 0;
    }
    this.events.lane();
  }

  jump() {
    if (this.dead) return;
    if (!this.grounded) { this.jumpBuf = 0.15; return; }
    this.slideT = 0; this.strafeT = 0; this.landT = 0;
    this.vy = CFG.jumpV;
    this.grounded = false;
    this.slideQueued = false;
    this.airT = 0;
    this.current = '';
    this.play('Jump_Start', 0.06, 1.7, 0.3); // skip the wind-up so the jump is instant
    this.events.jump();
  }

  slide() {
    if (this.dead) return;
    if (!this.grounded) { this.slideQueued = true; return; }
    this.slideT = CFG.slideTime;
    this.strafeT = 0; this.landT = 0;
    this.current = '';
    this.play('Dodge_Forward', 0.06, 0.4 / CFG.slideTime);
    this.events.slide();
  }

  die() {
    this.dead = true;
    this.running = false;
    this.slideT = 0;
    this.knock = 5;
    this.current = '';
    this.play('Death_A', 0.08, 1.2);
  }

  update(dt: number, speed: number, running: boolean) {
    this.rig?.mixer.update(dt);
    if (!running || this.dead) {
      if (this.dead) {
        if (this.y > 0) { this.vy -= CFG.gravity * dt; this.y = Math.max(0, this.y + this.vy * dt); }
        this.d -= this.knock * dt; // bounce back off the obstacle
        this.knock *= Math.exp(-dt * 6);
      }
      this.tilt.rotation.z *= Math.exp(-dt * 10);
      this.root.rotation.y += ((this.dead ? 0 : this.orbit) - this.root.rotation.y) * Math.min(1, dt * 12);
      this.root.position.set(this.x, this.y, -this.d);
      return;
    }
    this.d += speed * dt;
    const tx = laneX(this.lane);
    const dx = tx - this.x;
    this.x += dx * (1 - Math.exp(-dt * 16));
    if (Math.abs(tx - this.x) < 0.002) this.x = tx;

    this.jumpBuf -= dt;
    if (!this.grounded) {
      this.airT += dt;
      if (this.airT > 0.16 && this.current === 'Jump_Start') this.play('Jump_Idle', 0.12);
      this.vy -= (this.slideQueued ? CFG.gravity + CFG.fastFall * 3 : CFG.gravity) * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0; this.vy = 0; this.grounded = true;
        this.events.land();
        if (this.slideQueued) { this.slideQueued = false; this.slide(); }
        else if (this.jumpBuf > 0) { this.jumpBuf = 0; this.jump(); }
        else { this.play('Jump_Land', 0.06, 2.4, 0.12); this.landT = 0.2; }
      }
    } else if (this.slideT > 0) {
      this.slideT -= dt;
      if (this.slideT <= 0) this.play('Running_A', 0.14);
    } else if (this.landT > 0) {
      this.landT -= dt;
      if (this.landT <= 0) this.play('Running_A', 0.14);
    } else if (this.strafeT > 0) {
      this.strafeT -= dt;
      if (this.strafeT <= 0) this.play('Running_A', 0.12);
    }
    if (this.rig && this.current === 'Running_A') this.rig.actions.Running_A.setEffectiveTimeScale(0.95 + speed / 20);
    if (this.grounded && this.slideT <= 0) {
      this.stepT -= dt;
      if (this.stepT <= 0) { this.stepT = 3.6 / speed; this.events.step(); }
    }

    // body language: lean and turn into lane changes
    const k = Math.min(1, dt * 14);
    this.tilt.rotation.z += (THREE.MathUtils.clamp(-dx * 0.16, -0.28, 0.28) - this.tilt.rotation.z) * k;
    this.root.rotation.y += (THREE.MathUtils.clamp(-dx * 0.35, -0.55, 0.55) - this.root.rotation.y) * k;
    this.root.position.set(this.x, this.y, -this.d);
  }
}
