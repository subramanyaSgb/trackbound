import type { MissionDef } from '../data/missions';

export type FailReason = 'lost' | 'injured' | 'escaped' | 'capture';
export const FAIL_TEXT: Record<FailReason, { title: string; detail: string }> = {
  lost: { title: 'SUSPECT LOST', detail: 'The suspect got too far ahead and slipped away.' },
  injured: { title: 'PURSUIT ABANDONED', detail: 'Too many collisions. You had to call off the chase.' },
  escaped: { title: 'SUSPECT ESCAPED', detail: 'You ran out of road before you could make the arrest.' },
  capture: { title: 'ARREST FAILED', detail: 'You ran out of attempts and the suspect broke free.' },
};

/** Gap added when the officer hits something. */
export const HIT_GAP = 5;
/** Gap the officer wins back when the suspect trips. */
export const TRIP_GAP = 7;

/**
 * Pursuit state: the distance between officer and suspect, driven entirely by
 * play. Clean running closes the gap (down to the zone's floor), collisions and
 * the suspect's tricks open it, abilities close it faster. Pure logic, no rendering.
 */
export class Pursuit {
  gap: number;
  hearts: number;
  hits = 0;
  /** Closest the suspect can currently be approached. */
  floor: number;
  failed: FailReason | null = null;
  /** Seconds of clean running since the last collision (drives the "closing in" bonus). */
  clean = 0;

  constructor(readonly mission: MissionDef, startGap = mission.pursuit.startGap, floor = mission.zones[0].minGap) {
    this.gap = startGap;
    this.hearts = mission.pursuit.hearts;
    this.floor = floor;
  }

  /** 0 = suspect about to vanish, 1 = right on their heels. */
  get closeness() {
    return 1 - Math.min(1, Math.max(0, (this.gap - this.floor) / (this.mission.pursuit.loseGap - this.floor)));
  }
  get danger() { return this.gap > this.mission.pursuit.loseGap * 0.75; }

  /**
   * @param speedFrac officer's current speed relative to normal pace (below 1 while stumbling)
   * @param boost extra closing speed from an active ability (m/s)
   * @param pace suspect's pace relative to normal (above 1 on a vehicle)
   */
  update(dt: number, speedFrac: number, boost: number, baseSpeed: number, pace = 1) {
    if (this.failed) return;
    this.clean += dt;
    // a long clean streak closes the gap a little faster
    const streak = 1 + Math.min(1, this.clean / 20) * 0.5;
    const closing = this.mission.pursuit.closeRate * streak + boost;
    // losing speed lets the suspect pull away at the real speed difference
    const drift = Math.max(0, pace - speedFrac) * baseSpeed;
    this.gap += (drift - (speedFrac >= 0.95 ? closing : 0)) * dt;
    if (this.gap < this.floor) this.gap += Math.min(this.floor - this.gap, 14 * dt); // suspect sprints back out of reach
    if (this.gap >= this.mission.pursuit.loseGap) this.failed = 'lost';
  }

  /** Officer collided with something. Returns false when that ends the pursuit. */
  hit(penalty = HIT_GAP) {
    this.hits++;
    this.clean = 0;
    this.hearts--;
    this.gap += penalty;
    if (this.hearts <= 0) this.failed = 'injured';
    else if (this.gap >= this.mission.pursuit.loseGap) this.failed = 'lost';
    return !this.failed;
  }

  /** Suspect pulled a trick (zone entry, vehicle) and gained ground. */
  surge(metres: number) { this.gap = Math.min(this.mission.pursuit.loseGap - 12, this.gap + metres); }
  /** Suspect tripped or was stunned. */
  gain(metres: number) { this.gap = Math.max(Math.min(this.floor, this.gap), this.gap - metres); }

  /** New checkpoint segment: refill hearts, apply the zone's floor. */
  checkpoint(floor: number) { this.hearts = this.mission.pursuit.hearts; this.floor = floor; }
}
