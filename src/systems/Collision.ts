import { CFG, laneX } from '../core/config';
import { BOUNDS } from '../world/ObstacleFactory';
import type { Obstacle } from '../world/Spawner';

export interface Body { x: number; y: number; d: number; height: number }

/** AABB test in track space. Returns the obstacle hit, or null. */
export function hitTest(p: Body, obstacles: Obstacle[]): Obstacle | null {
  for (const o of obstacles) {
    const b = BOUNDS[o.kind];
    if (p.d + CFG.halfW < o.d || p.d - CFG.halfW > o.d + b.depth) continue;
    if (Math.abs(p.x - laneX(o.lane)) > b.halfW + CFG.halfW - 0.12) continue;
    if (p.y + p.height < b.y0 + 0.05 || p.y > b.y1 - 0.05) continue;
    return o;
  }
  return null;
}
