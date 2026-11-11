import * as THREE from 'three';
import type { Assets } from '../core/Assets';
import { CFG, laneX } from '../core/config';
import type { CriminalDef } from '../data/characters';
import { Rig, type Clip } from '../player/Rig';
import type { Row } from '../world/generator';
import type { Obstacle } from '../world/Spawner';

export interface CriminalEvents {
  /** The suspect clipped an obstacle and lost ground. */
  trip(): void;
  /** The suspect's vehicle ploughed through a barrier. */
  smash(o: Obstacle): void;
}

/**
 * The suspect. Runs the same track as the player a gap ahead and reacts to it
 * for real: follows the open lane, jumps barriers, slides under gates, swerves
 * round traffic, glances back, occasionally trips, throws debris, weaves when
 * cornered, and can ride a motorcycle through a zone.
 */
export class Criminal {
  readonly root = new THREE.Group();
  private holder = new THREE.Group();
  rig: Rig | null = null;
  private rigs = new Map<string, Rig>();
  def: CriminalDef | null = null;
  private bike: THREE.Object3D | null = null;
  private bikeWheels: THREE.Object3D[] = [];
  lane = 1;
  x = 0;
  y = 0;
  d = 0;
  /** Game-driven: pose directly (intro, takedown). */
  scripted = false;
  /** Cornered: dart between lanes at random. */
  weave = false;
  private vy = 0;
  private grounded = true;
  private slideT = 0;
  private actT = 0;
  private lookT = 6;
  private lookPhase = 0;
  private laneT = 0;
  private weaveT = 1;
  private pitch = 0;
  private seed = 99;

  constructor(private assets: Assets, private events: CriminalEvents) {
    this.root.add(this.holder);
  }

  private rand() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  get riding() { return !!this.bike; }
  get runClip(): Clip { return this.def?.run ?? 'Running_A'; }

  setCriminal(def: CriminalDef) {
    if (this.def?.id === def.id) return;
    let rig = this.rigs.get(def.id);
    if (!rig) { rig = new Rig(this.assets.body(def.look.body), this.assets.clips, def.look, this.assets); this.rigs.set(def.id, rig); }
    if (this.rig) { this.rig.stop(); this.holder.remove(this.rig.root); }
    this.rig = rig;
    this.def = def;
    this.holder.add(rig.root);
  }

  reset(d: number) {
    this.lane = 1; this.x = 0; this.y = 0; this.d = d; this.vy = 0; this.grounded = true;
    this.slideT = this.actT = this.pitch = 0; this.lookT = 5; this.lookPhase = 0; this.laneT = 0;
    this.scripted = false; this.weave = false;
    this.ride(null);
    this.root.visible = true;
    this.root.rotation.set(0, 0, 0);
    this.holder.rotation.set(0, 0, 0);
    if (this.rig) { this.rig.stop(); this.rig.headYaw = 0; this.rig.lean = 0.12; this.rig.pitch.rotation.set(0, 0, 0); this.rig.root.rotation.set(0, 0, 0); this.rig.play(this.runClip, 0); }
    this.root.position.set(0, 0, -d);
  }

  /** Mount (or leave) a getaway motorcycle. */
  ride(bike: THREE.Object3D | null) {
    if (this.bike) this.holder.remove(this.bike);
    this.bike = bike;
    this.bikeWheels = [];
    if (bike) {
      bike.traverse((o) => { if (/wheel/i.test(o.name)) this.bikeWheels.push(o); });
      this.holder.add(bike);
      this.y = 0; this.vy = 0; this.grounded = true; this.slideT = 0;
      this.rig?.root.position.set(0, 0.46, 0.1);
      this.rig?.play('Sit_Chair_Idle', 0.15);
    } else {
      this.rig?.root.position.set(0, 0, 0);
      if (!this.scripted) this.rig?.play(this.runClip, 0.2);
    }
  }

  act(name: Clip, hold = 0.6, fade = 0.1, scale = 1) {
    this.rig?.play(name, fade, scale, 0, true);
    this.actT = hold;
  }

  /** Staggered by a taser/net hit. */
  stagger() { this.act(this.rand() < 0.5 ? 'Hit_A' : 'Hit_B', 0.7, 0.05, 1.1); }

  private blocked(lane: number, obstacles: Obstacle[]) {
    for (const o of obstacles) {
      if (o.lane !== lane || o.v.y0 > 0 || o.v.breakable) continue;
      if (o.d < this.d + 7 && o.d + o.v.depth > this.d - 1.5) return true;
    }
    return false;
  }

  update(dt: number, d: number, speed: number, rows: Row[], obstacles: Obstacle[]) {
    const rig = this.rig;
    if (this.scripted) { rig?.update(dt); return; }
    this.d = d;
    this.actT = Math.max(0, this.actT - dt);
    this.laneT -= dt;

    // ---- read the track ahead like a player would
    let next: Row | undefined;
    for (const r of rows) if (r.d > d + 0.5) { next = r; break; }
    if (this.weave) {
      this.weaveT -= dt;
      if (this.weaveT <= 0) {
        this.weaveT = 0.9 + this.rand() * 1.3;
        const opts = [this.lane - 1, this.lane + 1].filter((l) => l >= 0 && l <= 2);
        this.lane = opts[Math.floor(this.rand() * opts.length)];
      }
    } else if (next && this.laneT <= 0) {
      const gap = next.d - d;
      if (next.safe !== this.lane && gap < Math.max(9, speed * 0.6)) { this.lane += Math.sign(next.safe - this.lane); this.laneT = 0.22; }
    }
    if (this.blocked(this.lane, obstacles) && this.laneT <= 0) {
      const opts = [this.lane - 1, this.lane + 1].filter((l) => l >= 0 && l <= 2 && !this.blocked(l, obstacles));
      if (opts.length) { this.lane = opts[0]; this.laneT = 0.3; }
    }
    const tx = laneX(this.lane);
    const dx = tx - this.x;
    this.x += dx * (1 - Math.exp(-dt * 13));

    if (this.bike) {
      for (const w of this.bikeWheels) w.rotation.x += (speed / 0.36) * dt;
      for (const o of obstacles) if (o.v.breakable && o.lane === this.lane && o.d < d + 0.6 && o.d + o.v.depth > d - 0.6) { this.events.smash(o); break; }
      if (rig && this.actT <= 0) rig.play('Sit_Chair_Idle', 0.15);
    } else {
      const cell = next && next.cells[this.lane];
      const gap = next ? next.d - d : 99;
      if (!this.grounded) {
        this.vy -= CFG.gravity * dt;
        this.y += this.vy * dt;
        if (this.y <= 0) { this.y = 0; this.vy = 0; this.grounded = true; rig?.play('Jump_Land', 0.05, 2.2, 0.1, true); this.actT = 0.18; }
      } else if (this.slideT > 0) {
        this.slideT -= dt;
        if (this.slideT <= 0) rig?.play(this.runClip, 0.16);
      } else if (cell === 'jump' && gap <= speed * 0.34 && gap > 1) {
        if (this.rand() < 0.07) { this.stagger(); this.events.trip(); } // clips the barrier
        else { this.vy = CFG.jumpV; this.grounded = false; rig?.play('Jump_Start', 0.05, 1.5, 0.2, true); }
      } else if (cell === 'slide' && gap <= Math.max(1.8, speed * 0.2)) {
        this.slideT = CFG.slideTime;
        rig?.play('Sit_Floor_Idle', 0.09, 1, 0, true);
      } else if (this.actT <= 0 && rig && rig.current !== this.runClip) rig.play(this.runClip, 0.16);
      if (rig?.current === 'Jump_Start' && this.vy < 4) rig.play('Jump_Idle', 0.14);
    }

    // ---- glance back over the shoulder now and then
    this.lookT -= dt;
    if (this.lookT <= 0 && this.grounded && this.slideT <= 0) { this.lookPhase = 1.1; this.lookT = 6 + this.rand() * 7; }
    if (this.lookPhase > 0) this.lookPhase = Math.max(0, this.lookPhase - dt);
    if (rig) {
      rig.headYaw = Math.sin((1 - this.lookPhase / 1.1) * Math.PI) * (this.lookPhase > 0 ? 2.3 : 0);
      if (rig.current === this.runClip) rig.rate((0.9 + speed / 22) * (this.def?.cadence ?? 1));
      this.pitch += ((this.slideT > 0 ? 0.5 : 0) - this.pitch) * Math.min(1, dt * 16);
      rig.pitch.rotation.x = this.pitch;
      rig.update(dt);
    }
    const k = Math.min(1, dt * 14);
    this.holder.rotation.z += (THREE.MathUtils.clamp(-dx * 0.2, -0.35, 0.35) - this.holder.rotation.z) * k;
    this.root.rotation.y += (THREE.MathUtils.clamp(-dx * 0.35, -0.55, 0.55) - this.root.rotation.y) * k;
    this.root.position.set(this.x, this.y, -this.d);
  }
}
