import * as THREE from 'three';
import type { Assets } from '../core/Assets';
import { CFG, laneX } from '../core/config';
import { Coins } from '../systems/Coins';
import { POWER_KINDS, type PowerKind } from '../systems/PowerUps';
import { TrackGenerator, mulberry32, type Row } from './generator';
import { BOUNDS, CAR_LEN, ObstacleFactory, type ObstacleKind } from './ObstacleFactory';

export interface Obstacle {
  kind: ObstacleKind;
  lane: number;
  d: number; // near face (toward the player)
  obj: THREE.Object3D;
  speed: number; // closing speed for moving trains
  triggerD: number;
  passed: boolean;
}
export interface Pickup { kind: PowerKind; lane: number; d: number; obj: THREE.Object3D }
export const TRAIN_SPEED = 10;

/** Turns generator rows into pooled obstacle models, coin trails and power-up pickups. */
export class Spawner {
  readonly factory: ObstacleFactory;
  readonly active: Obstacle[] = [];
  readonly pickups: Pickup[] = [];
  readonly rows: Row[] = [];
  private gen!: TrackGenerator;
  private lastD = 0;
  /** Fired once per train car/moving train the player gets past. */
  onTrainPassed: () => void = () => {};

  constructor(private scene: THREE.Scene, private coins: Coins, assets: Assets) {
    this.factory = new ObstacleFactory(assets);
    this.reset();
  }

  reset(seed = (Math.random() * 1e9) | 0) {
    for (const o of this.active) this.factory.release(o.obj);
    for (const p of this.pickups) this.factory.release(p.obj);
    this.active.length = 0;
    this.pickups.length = 0;
    this.rows.length = 0;
    this.gen = new TrackGenerator(mulberry32(seed));
    this.lastD = 0;
  }

  private put(kind: ObstacleKind, lane: number, d: number, speed = 0, triggerD = 0) {
    const obj = this.factory.get(kind);
    if (!obj.parent) this.scene.add(obj);
    obj.position.set(laneX(lane), 0, -(d + (kind === 'jump' || kind === 'slide' ? BOUNDS[kind].depth / 2 : 0)));
    this.active.push({ kind, lane, d, obj, speed, triggerD, passed: false });
  }

  private spawnRow(row: Row, prev: Row | undefined) {
    row.cells.forEach((c, lane) => {
      if (c === 'jump' || c === 'slide') this.put(c, lane, row.d - BOUNDS[c].depth / 2);
      else if (c === 'block') {
        this.put('block', lane, row.d - CAR_LEN / 2);
        // join consecutive cars into one parked train when rows are close
        if (prev && prev.cells[lane] === 'block' && row.spacing < CAR_LEN * 2 + 1) this.put('block', lane, row.d - CAR_LEN / 2 - CAR_LEN);
      }
    });
    if (row.train) this.put('train', row.train.lane, row.train.frontD, TRAIN_SPEED, row.d - 5);
    if (row.power) {
      const kind = POWER_KINDS[Math.floor(Math.random() * POWER_KINDS.length)];
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

  /** Removes an obstacle (used when a shield absorbs the hit). */
  remove(o: Obstacle) {
    const i = this.active.indexOf(o);
    if (i < 0) return;
    this.factory.release(o.obj);
    this.active[i] = this.active[this.active.length - 1];
    this.active.pop();
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
      const row = this.gen.next(speed);
      this.spawnRow(row, this.rows[this.rows.length - 1]);
      this.rows.push(row);
      this.lastD = row.d;
    }
    while (this.rows.length > 2 && this.rows[1].d < playerD - 20) this.rows.shift();
    for (let i = this.active.length - 1; i >= 0; i--) {
      const o = this.active[i];
      if (o.speed && playerD >= o.triggerD) {
        o.d -= o.speed * dt;
        o.obj.position.z = -o.d;
      }
      const end = o.d + BOUNDS[o.kind].depth;
      if (!o.passed && end < playerD) {
        o.passed = true;
        if (o.kind === 'block' || o.kind === 'train') this.onTrainPassed();
      }
      if (end < playerD - 12) {
        this.factory.release(o.obj);
        this.active[i] = this.active[this.active.length - 1];
        this.active.pop();
      }
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (p.d < playerD - 8) { this.factory.release(p.obj); this.pickups.splice(i, 1); continue; }
      (p.obj.userData.spin as THREE.Object3D).rotation.y = time * 2.6;
      p.obj.position.y = 1.15 + Math.sin(time * 3 + p.d) * 0.1;
    }
  }
}
