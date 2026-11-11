import * as THREE from 'three';
import type { Assets } from '../core/Assets';
import { CFG, laneX } from '../core/config';
import type { CharacterDef } from '../data/characters';
import { Rig, type Clip } from './Rig';

export interface PlayerEvents { jump(): void; land(hard: boolean): void; slide(): void; step(): void; lane(): void }
export type Mode = 'run' | 'fly' | 'bike';

export const FLY_HEIGHT = 4.5;
const JUMP_PREP = 0.055; // crouch before the feet leave the ground
const SLIDE_PITCH = 0.5; // lean back into a feet-first slide
const FLY_PITCH = -1.2; // body horizontal, fist forward

/**
 * Player controller (lane/jump/slide physics, flight and motorcycle modes)
 * driving a Rig. Every gameplay state has a matching body pose: the jump
 * crouches, stretches and lands with a squash; the slide drops into a
 * leaned-back seated pose; flight pitches the body horizontal; the motorcycle
 * seats the rider. All transitions cross-fade.
 */
export class Player {
  readonly root = new THREE.Group();
  private holder = new THREE.Group();
  rig: Rig | null = null;
  private rigs = new Map<string, Rig>();
  def: CharacterDef | null = null;
  private wanted = 0;
  private bike: THREE.Object3D | null = null;
  private bikeWheels: THREE.Object3D[] = [];

  lane = 1;
  x = 0;
  y = 0;
  d = 0;
  orbit = 0; // menu preview rotation
  mode: Mode = 'run';
  /** While true the Game poses the character directly (cinematics, capture). */
  scripted = false;
  /** 1 = full speed; dips after a stumble and recovers. */
  speedFactor = 1;
  private vy = 0;
  private grounded = true;
  private slideT = 0;
  private prepT = 0;
  private jumpBuf = 0;
  private slideQueued = false;
  private stepT = 0;
  private airT = 0;
  private landT = 0;
  private strafeT = 0;
  private stumbleT = 0;
  private actT = 0;
  private running = false;
  private pitch = 0;
  private squash = 1;
  private squashV = 0;
  private wheelie = 0;
  private flyT = 0;

  constructor(private assets: Assets, private events: PlayerEvents) {
    this.root.add(this.holder);
  }

  get characterId() { return this.def?.id ?? ''; }
  get height() { return this.slideT > 0 ? CFG.slideH : CFG.standH; }
  get sliding() { return this.slideT > 0; }
  get airborne() { return !this.grounded || this.prepT > 0; }
  get stumbling() { return this.stumbleT > 0; }
  get animation() { return this.rig?.current ?? ''; }
  get runClip(): Clip { return this.def?.move.run ?? 'Running_A'; }

  /** Swap the character. Safe to call repeatedly; rigs are built once and cached. */
  setCharacter(def: CharacterDef) {
    if (this.def?.id === def.id) return;
    ++this.wanted;
    let rig = this.rigs.get(def.id);
    if (!rig) {
      rig = new Rig(this.assets.body(def.look.body), this.assets.clips, def.look, this.assets);
      this.rigs.set(def.id, rig);
    }
    if (this.rig) { this.rig.stop(); this.holder.remove(this.rig.root); }
    this.rig = rig;
    this.def = def;
    this.holder.add(rig.root);
    if (def.flightOnly) rig.show(def.flightOnly, this.mode === 'fly');
    rig.play(this.running ? this.runClip : def.move.idle, 0);
  }

  /** Play a clip directly (cinematics, ability activation). `hold` seconds before normal animation resumes. */
  act(name: Clip, hold = 0.6, fade = 0.1, scale = 1) {
    this.rig?.play(name, fade, scale, 0, true);
    this.actT = hold;
  }

  reset(d = 0) {
    this.lane = 1; this.x = 0; this.y = 0; this.d = d; this.vy = 0;
    this.grounded = true; this.slideT = 0; this.prepT = 0; this.jumpBuf = 0; this.slideQueued = false;
    this.airT = this.landT = this.strafeT = this.stumbleT = this.actT = 0;
    this.speedFactor = 1; this.pitch = 0; this.squash = 1; this.squashV = 0; this.wheelie = 0;
    this.running = false; this.scripted = false;
    this.setMode('run');
    this.holder.rotation.set(0, 0, 0);
    this.root.position.set(0, 0, -d);
    this.root.rotation.set(0, 0, 0);
    this.root.visible = true;
    if (this.rig) { this.rig.stop(); this.rig.pitch.rotation.set(0, 0, 0); this.rig.pitch.position.y = 0; this.rig.model.position.y = 0; this.rig.root.position.set(0, 0, 0); this.rig.root.rotation.set(0, 0, 0); this.rig.lean = this.rig.armsBack = 0; this.rig.squash = 1; this.rig.play(this.def!.move.idle, 0); }
  }

  start() { this.running = true; this.orbit = 0; this.rig?.play(this.runClip, 0.2); }
  idle() { this.running = false; this.rig?.play(this.def?.move.idle ?? 'Idle', 0.3); }
  celebrate() { this.rig?.play('Cheer', 0.25); }

  // ---------------------------------------------------------------- modes
  setMode(mode: Mode, bike?: THREE.Object3D) {
    if (this.mode === mode && mode !== 'bike') return;
    const was = this.mode;
    this.mode = mode;
    if (this.def?.flightOnly) this.rig?.show(this.def.flightOnly, mode === 'fly');
    if (was === 'bike' && this.bike) { this.holder.remove(this.bike); this.bike = null; if (this.rig) { this.rig.root.position.set(0, 0, 0); this.rig.root.rotation.x = 0; } }
    if (mode === 'bike' && bike) {
      this.bike = bike;
      this.bikeWheels = [];
      bike.traverse((o) => { if (/wheel/i.test(o.name)) this.bikeWheels.push(o); });
      this.holder.add(bike);
      this.slideT = 0; this.y = 0; this.vy = 0; this.grounded = true; this.prepT = 0;
      if (this.rig) { this.rig.root.position.set(0, 0.46, 0.1); this.rig.play('Sit_Chair_Idle', 0.12); }
    } else if (mode === 'fly') {
      this.slideT = 0; this.prepT = 0; this.grounded = false; this.flyT = 0;
      this.vy = 7;
      this.rig?.play('Jump_Start', 0.08, 1.4, 0.2, true);
    } else if (mode === 'run') {
      if (was === 'fly') { this.vy = Math.min(this.vy, 0); this.rig?.play('Jump_Idle', 0.2); }
      else if (this.running) this.rig?.play(this.runClip, 0.15);
    }
  }

  moveLane(dir: number) {
    const l = this.lane + dir;
    if (this.scripted || l < 0 || l > 2) return;
    this.lane = l;
    if (this.mode === 'run' && this.grounded && this.slideT <= 0 && this.stumbleT <= 0 && this.actT <= 0) {
      this.rig?.play(dir < 0 ? 'Running_Strafe_Left' : 'Running_Strafe_Right', 0.07, 1.6, 0, true);
      this.strafeT = 0.2;
      this.landT = 0;
    }
    this.events.lane();
  }

  jump() {
    if (this.scripted || this.mode === 'fly') return;
    if (this.mode === 'bike') { if (this.wheelie <= 0) { this.wheelie = 0.55; this.events.jump(); } return; }
    if (!this.grounded || this.prepT > 0) { this.jumpBuf = 0.15; return; }
    this.slideT = 0; this.strafeT = 0; this.landT = 0; this.actT = 0;
    this.slideQueued = false;
    this.prepT = JUMP_PREP;
    this.squashV = -7; // crouch
    this.rig?.play('Jump_Start', 0.05, 1.5, 0.18, true);
    this.events.jump();
  }

  slide() {
    if (this.scripted || this.mode !== 'run') return;
    if (!this.grounded || this.prepT > 0) { this.slideQueued = true; return; }
    this.slideT = CFG.slideTime;
    this.strafeT = 0; this.landT = 0; this.actT = 0;
    this.rig?.play('Sit_Floor_Idle', 0.09, 1, 0, true);
    this.events.slide();
  }

  /** Hit reaction: stagger, lose speed, recover. */
  stumble() {
    this.stumbleT = 0.75;
    this.speedFactor = 0.42;
    this.slideT = 0; this.strafeT = 0; this.landT = 0;
    this.squashV = -5;
    if (this.mode === 'run') this.rig?.play(Math.random() < 0.5 ? 'Hit_A' : 'Hit_B', 0.05, 1.3, 0, true);
  }

  update(dt: number, speed: number, running: boolean) {
    const rig = this.rig;
    this.speedFactor = Math.min(1, this.speedFactor + dt * 0.62);
    // squash-and-stretch spring
    this.squashV += (1 - this.squash) * 260 * dt;
    this.squashV *= Math.exp(-dt * 16);
    this.squash = THREE.MathUtils.clamp(this.squash + this.squashV * dt, 0.72, 1.2);
    if (rig) rig.squash = this.squash;

    if (!running || this.scripted) {
      this.actT = Math.max(0, this.actT - dt);
      if (rig) {
        rig.lean += (0 - rig.lean) * Math.min(1, dt * 8);
        rig.armsBack += (0 - rig.armsBack) * Math.min(1, dt * 8);
        this.pitch += (0 - this.pitch) * Math.min(1, dt * 8);
        rig.pitch.rotation.x = this.pitch;
        rig.update(dt);
      }
      this.holder.rotation.z *= Math.exp(-dt * 10);
      if (!this.scripted) {
        this.root.rotation.y += (this.orbit - this.root.rotation.y) * Math.min(1, dt * 12);
        this.root.position.set(this.x, this.y, -this.d);
      }
      return;
    }

    this.d += speed * dt;
    const tx = laneX(this.lane);
    const dx = tx - this.x;
    this.x += dx * (1 - Math.exp(-dt * (this.mode === 'bike' ? 12 : 16)));
    if (Math.abs(tx - this.x) < 0.002) this.x = tx;
    this.jumpBuf -= dt;
    this.actT = Math.max(0, this.actT - dt);
    let pitchTarget = 0;

    if (this.mode === 'fly') {
      this.flyT += dt;
      const target = FLY_HEIGHT + Math.sin(this.flyT * 2.2) * 0.18;
      this.vy += ((target - this.y) * 22 - this.vy * 7) * dt;
      this.y += this.vy * dt;
      if (this.flyT > 0.28) { rig?.play('1H_Ranged_Aiming', 0.25); pitchTarget = FLY_PITCH; } else pitchTarget = -0.3;
    } else if (this.mode === 'bike') {
      this.wheelie = Math.max(0, this.wheelie - dt);
      pitchTarget = 0;
      const lift = Math.sin(Math.min(1, this.wheelie / 0.55) * Math.PI) * 0.42;
      if (this.bike) { this.bike.rotation.x = lift; for (const w of this.bikeWheels) w.rotation.x += (speed / 0.36) * dt; }
      if (rig) rig.root.rotation.x = lift;
      if (rig && this.actT <= 0) rig.play('Sit_Chair_Idle', 0.15);
    } else {
      if (this.prepT > 0) {
        this.prepT -= dt;
        if (this.prepT <= 0) { this.vy = CFG.jumpV; this.grounded = false; this.airT = 0; this.squashV = 5.5; } // launch with a stretch
      } else if (!this.grounded) {
        this.airT += dt;
        if (this.airT > 0.18 && (rig?.current === 'Jump_Start')) rig.play('Jump_Idle', 0.14);
        this.vy -= (this.slideQueued ? CFG.gravity + CFG.fastFall * 3 : CFG.gravity) * dt;
        this.y += this.vy * dt;
        pitchTarget = THREE.MathUtils.clamp(-this.vy * 0.012, -0.12, 0.16); // tuck forward on the way up, open out falling
        if (this.y <= 0) {
          const hard = this.vy < -13;
          this.y = 0; this.vy = 0; this.grounded = true;
          this.squashV = hard ? -9 : -6.5;
          this.events.land(hard);
          if (this.slideQueued) { this.slideQueued = false; this.slide(); }
          else if (this.jumpBuf > 0) { this.jumpBuf = 0; this.jump(); }
          else { rig?.play('Jump_Land', 0.05, 2.2, 0.1, true); this.landT = 0.22; }
        }
      } else if (this.stumbleT > 0) {
        this.stumbleT -= dt;
        pitchTarget = -0.12;
        if (this.stumbleT <= 0) rig?.play(this.runClip, 0.18);
      } else if (this.slideT > 0) {
        this.slideT -= dt;
        pitchTarget = SLIDE_PITCH;
        if (this.slideT <= 0) rig?.play(this.runClip, 0.16);
      } else if (this.landT > 0) {
        this.landT -= dt;
        if (this.landT <= 0) rig?.play(this.runClip, 0.14);
      } else if (this.strafeT > 0) {
        this.strafeT -= dt;
        if (this.strafeT <= 0) rig?.play(this.runClip, 0.12);
      } else if (this.actT <= 0 && rig && rig.current !== this.runClip) rig.play(this.runClip, 0.18);
    }

    if (rig && this.def) {
      const onFoot = this.mode === 'run' && this.grounded && this.slideT <= 0 && this.stumbleT <= 0;
      if (rig.current === this.runClip) rig.rate((0.9 + speed / 22) * this.def.move.cadence);
      const k = Math.min(1, dt * 10);
      rig.lean += ((onFoot ? this.def.move.lean : 0) - rig.lean) * k;
      rig.armsBack += ((onFoot && rig.current === this.runClip ? this.def.move.armsBack : 0) - rig.armsBack) * k;
      this.pitch += (pitchTarget - this.pitch) * Math.min(1, dt * (this.mode === 'fly' ? 5 : 16));
      rig.pitch.rotation.x = this.pitch;
      // slide sits the hips on the ground; flight lifts the pivot to the chest so the body rotates around it
      rig.pitch.position.y += ((this.mode === 'fly' ? 0.9 : 0) - rig.pitch.position.y) * k;
      rig.model.position.y = -rig.pitch.position.y;
      rig.root.position.y = this.mode === 'bike' ? 0.46 : 0;
      rig.update(dt);
      if (onFoot) {
        this.stepT -= dt;
        if (this.stepT <= 0) { this.stepT = 3.6 / Math.max(6, speed) / this.def.move.cadence; this.events.step(); }
      }
    }

    // body language: bank and turn into lane changes
    const k = Math.min(1, dt * 14);
    const bank = this.mode === 'bike' ? 0.42 : this.mode === 'fly' ? 0.5 : 0.28;
    this.holder.rotation.z += (THREE.MathUtils.clamp(-dx * (this.mode === 'run' ? 0.16 : 0.3), -bank, bank) - this.holder.rotation.z) * k;
    this.root.rotation.y += (THREE.MathUtils.clamp(-dx * 0.35, -0.55, 0.55) - this.root.rotation.y) * k;
    this.root.position.set(this.x, this.y, -this.d);
  }
}
