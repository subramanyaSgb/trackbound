import * as THREE from 'three';
import type { Assets } from '../core/Assets';
import { CFG, laneX } from '../core/config';
import type { ThemeId } from '../data/missions';
import type { Rig } from '../player/Rig';
import { Coins } from '../systems/Coins';
import { POWER_KINDS, type PowerKind } from '../systems/PowerUps';
import { DEFAULT_MODS, TrackGenerator, mulberry32, type GenMods, type Row } from './generator';
import { CAR_LEN, ObstacleFactory, type Variant } from './ObstacleFactory';
import { THEMES } from './themes';

export interface Obstacle {
  v: Variant;
  lane: number;
  d: number; // near face (toward the player)
  obj: THREE.Object3D;
  /** Forward movers: where the player will catch it. Oncoming movers: distance at which it starts moving. */
  meetD: number;
  passed: boolean;
  /** Seconds since it was thrown (falling in) — 0 when not thrown. */
  dropT: number;
}
interface Flying { obj: THREE.Object3D; vx: number; vy: number; vz: number; spin: number; t: number }
export interface Pickup { kind: PowerKind; lane: number; d: number; obj: THREE.Object3D }

/** What the route needs at a given distance. */
export interface RouteInfo { theme: ThemeId; stage: number; clear: boolean }

/** Turns generator rows into pooled obstacle models, traffic, coin trails and power-up pickups. */
export class Spawner {
  readonly factory: ObstacleFactory;
  readonly active: Obstacle[] = [];
  readonly pickups: Pickup[] = [];
  readonly rows: Row[] = [];
  private flying: Flying[] = [];
  private gen!: TrackGenerator;
  private rng: () => number = Math.random;
  private lastD = 0;
  private route: (d: number) => RouteInfo = () => ({ theme: 'city', stage: 0, clear: false });
  /** Fired once per obstacle the player gets past. */
  onPassed: (o: Obstacle) => void = () => {};

  constructor(private scene: THREE.Scene, private coins: Coins, assets: Assets) {
    this.factory = new ObstacleFactory(assets);
    this.reset();
  }

  reset(seed = (Math.random() * 1e9) | 0, startD = 0, route?: (d: number) => RouteInfo) {
    for (const o of this.active) this.factory.release(o.obj);
    for (const p of this.pickups) this.factory.release(p.obj);
    for (const f of this.flying) this.factory.release(f.obj);
    this.active.length = 0;
    this.pickups.length = 0;
    this.flying.length = 0;
    this.rows.length = 0;
    if (route) this.route = route;
    this.rng = mulberry32(seed ^ 0x9e3779b9);
    this.gen = new TrackGenerator(mulberry32(seed), startD + 45);
    this.lastD = startD;
  }

  private pick<T>(arr: T[]): T { return arr[Math.floor(this.rng() * arr.length)]; }

  private put(key: string, lane: number, d: number, meetD = 0) {
    const v = this.factory.variant(key);
    const obj = this.factory.get(key);
    if (!obj.parent) this.scene.add(obj);
    obj.position.set(laneX(lane), 0, -d);
    const o: Obstacle = { v, lane, d, obj, meetD, passed: false, dropT: 0 };
    this.active.push(o);
    return o;
  }

  /** Earlier rows this close behind a meeting point must be empty in the lane for a moving vehicle to drive there. */
  private laneClear(lane: number, fromD: number, toD: number) {
    for (const r of this.rows) if (r.d > fromD && r.d < toD && r.cells[lane] !== 'empty') return false;
    return true;
  }

  private spawnRow(row: Row, prev: Row | undefined, playerD: number) {
    const set = THEMES[this.route(row.d).theme].obstacles;
    row.cells.forEach((c, lane) => {
      if (c === 'jump' || c === 'slide') this.put(this.pick(set[c]), lane, row.d - 0.25);
      else if (c === 'block') {
        let key = this.pick(set.block);
        let v = this.factory.variant(key);
        if (v.move > 0 && !this.laneClear(lane, row.d - v.move * (row.d - playerD) - 6, row.d)) {
          // no room to drive: use a stationary model from this environment instead
          key = set.block.find((k) => this.factory.variant(k).move === 0) ?? 'car';
          v = this.factory.variant(key);
        }
        const o = this.put(key, lane, row.d - v.depth / 2, row.d - v.depth / 2);
        if (v.move > 0) this.drive(o, playerD);
        // join consecutive train cars into one parked train when rows are close
        if (key === 'traincar' && prev && prev.cells[lane] === 'block' && row.spacing < CAR_LEN * 2 + 1) this.put('traincar', lane, row.d - CAR_LEN / 2 - CAR_LEN);
      }
    });
    if (row.train && set.train.length) this.put(this.pick(set.train), row.train.lane, row.train.frontD, row.d - 5);
    if (row.power) {
      const kind = POWER_KINDS[Math.floor(this.rng() * POWER_KINDS.length)];
      const obj = this.factory.get(kind);
      if (!obj.parent) this.scene.add(obj);
      obj.position.set(laneX(row.safe), 1.15, -row.d);
      this.pickups.push({ kind, lane: row.safe, d: row.d, obj });
    }
    if (row.coins) {
      const cell = row.cells[row.safe];
      const x = laneX(row.safe);
      for (let i = -2; i <= 2; i++) {
        const t = i / 2; // -1..1
        const y = cell === 'jump' ? 1.0 + (1 - t * t) * 1.1 : cell === 'slide' ? 0.55 : 1.0;
        this.coins.add(row.d + i * 1.5, x, y);
      }
    }
  }

  /** Same-direction traffic: positioned so the player reaches it exactly at its meeting point. */
  private drive(o: Obstacle, playerD: number) {
    o.d = o.meetD - o.v.move * (o.meetD - playerD);
    o.obj.position.z = -o.d;
  }

  /** Removes an obstacle, flinging its model aside (shield, smash, motorcycle). */
  knock(o: Obstacle, dir = 0) {
    const i = this.active.indexOf(o);
    if (i < 0) return;
    this.active[i] = this.active[this.active.length - 1];
    this.active.pop();
    const side = dir || (o.lane === 0 ? -1 : o.lane === 2 ? 1 : this.rng() < 0.5 ? -1 : 1);
    this.flying.push({ obj: o.obj, vx: side * (7 + this.rng() * 4), vy: 6 + this.rng() * 3, vz: -14, spin: (this.rng() - 0.5) * 9, t: 0.9 });
  }

  /** The suspect throws debris: a jumpable obstacle dropped at d in `lane`, only where it stays fair. */
  throwAt(d: number, lane: number, key: string): boolean {
    let before: Row | undefined, after: Row | undefined;
    for (const r of this.rows) { if (r.d <= d) before = r; else if (!after) after = r; }
    if (!before || !after) return false;
    if (d - before.d < 11 || after.d - d < 11) return false;
    if (before.cells[lane] !== 'empty' || after.cells[lane] !== 'empty') return false;
    for (const o of this.active) if (o.lane === lane && Math.abs(o.d - d) < 12) return false;
    const o = this.put(key, lane, d - 0.25);
    o.dropT = 0.001;
    return true;
  }

  /** Returns the pickup the player touched this frame, if any. */
  collect(px: number, py: number, pd: number): PowerKind | null {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (Math.abs(p.d - pd) < 1 && Math.abs(laneX(p.lane) - px) < 0.95 && py < 2.2) {
        this.factory.release(p.obj);
        this.pickups.splice(i, 1);
        return p.kind;
      }
    }
    return null;
  }

  update(playerD: number, speed: number, dt: number, time: number) {
    while (this.lastD < playerD + CFG.viewAhead) {
      const info = this.route(this.lastD + 10);
      const mods: GenMods = info.clear ? { ...DEFAULT_MODS, clear: true } : THEMES[info.theme].mods;
      const row = this.gen.next(speed, info.stage, mods);
      this.spawnRow(row, this.rows[this.rows.length - 1], playerD);
      this.rows.push(row);
      this.lastD = row.d;
    }
    while (this.rows.length > 2 && this.rows[1].d < playerD - 20) this.rows.shift();
    this.factory.update(time);
    for (let i = this.active.length - 1; i >= 0; i--) {
      const o = this.active[i];
      if (o.v.move < 0) {
        if (playerD >= o.meetD) { o.d += o.v.move * dt; o.obj.position.z = -o.d; this.spin(o, -o.v.move, dt); }
      } else if (o.v.move > 0) {
        this.drive(o, playerD);
        this.spin(o, speed * o.v.move, dt);
        (o.obj.userData.rig as Rig | undefined)?.update(dt);
      }
      if (o.dropT > 0) {
        o.dropT += dt;
        const t = Math.min(1, o.dropT / 0.45);
        o.obj.position.y = (1 - t) * (1 - t) * 3.2;
        o.obj.rotation.x = (1 - t) * 2.5;
        if (t >= 1) o.dropT = 0;
      }
      const end = o.d + o.v.depth;
      if (!o.passed && end < playerD) { o.passed = true; this.onPassed(o); }
      if (end < playerD - 12) {
        this.factory.release(o.obj);
        this.active[i] = this.active[this.active.length - 1];
        this.active.pop();
      }
    }
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t -= dt;
      f.vy -= 22 * dt;
      f.obj.position.x += f.vx * dt; f.obj.position.y = Math.max(0, f.obj.position.y + f.vy * dt); f.obj.position.z += f.vz * dt;
      f.obj.rotation.z += f.spin * dt; f.obj.rotation.x += f.spin * 0.6 * dt;
      if (f.t <= 0) { this.factory.release(f.obj); this.flying.splice(i, 1); }
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (p.d < playerD - 8) { this.factory.release(p.obj); this.pickups.splice(i, 1); continue; }
      (p.obj.userData.spin as THREE.Object3D).rotation.y = time * 2.6;
      p.obj.position.y = 1.15 + Math.sin(time * 3 + p.d) * 0.1;
    }
  }

  private spin(o: Obstacle, v: number, dt: number) {
    const wheels = o.obj.userData.wheels as THREE.Object3D[] | undefined;
    if (wheels) for (const w of wheels) w.rotation.x += (v / o.obj.userData.wheelR) * dt;
  }
}
