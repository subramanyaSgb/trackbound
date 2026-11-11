import type { MissionDef } from '../data/missions';

export type CapturePhase = 'approach' | 'lock' | 'takedown' | 'done' | 'failed';
export interface CaptureEvents {
  phase(p: CapturePhase): void;
  shot(result: 'hit' | 'miss-timing' | 'miss-lane'): void;
}

export const CAPTURE_TEXT = {
  taser: { tool: 'TASER', verb: 'FIRE', ready: 'Line up behind the suspect and fire in the green!', hit: 'DIRECT HIT!', miss: 'MISSED!' },
  net: { tool: 'NET LAUNCHER', verb: 'LAUNCH', ready: 'Line up behind the suspect and launch in the green!', hit: 'TANGLED!', miss: 'WIDE!' },
  tackle: { tool: 'TACKLE', verb: 'TACKLE', ready: 'Get right behind the suspect and dive in the green!', hit: 'GOT THEM!', miss: 'TOO EARLY!' },
} as const;

/**
 * The playable final encounter. Approach: sprint into range while dodging what
 * the suspect throws. Lock: a timing meter sweeps; the shot only counts when it
 * is inside the window AND the officer is in the suspect's lane. Enough hits
 * starts the takedown; running out of tries fails the mission. Pure logic.
 */
export class Capture {
  phase: CapturePhase = 'approach';
  /** Meter position 0..1 (ping-pong). */
  meter = 0;
  private dir = 1;
  hits = 0;
  tries: number;
  /** Centre of the timing window; moves after every attempt. */
  windowAt = 0.5;
  /** Seconds left in the takedown cinematic. */
  takedownT = 0;
  /** Brief lockout after an attempt so mashing does not work. */
  cooldown = 0;
  private seed = 1;

  constructor(readonly mission: MissionDef, private events: CaptureEvents) {
    this.tries = mission.capture.tries;
  }

  get cfg() { return this.mission.capture; }
  get inWindow() { return Math.abs(this.meter - this.windowAt) <= this.cfg.window / 2; }

  private rand() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }

  private set(p: CapturePhase) { if (this.phase !== p) { this.phase = p; this.events.phase(p); } }

  update(dt: number, gap: number) {
    if (this.phase === 'approach') {
      if (gap <= this.cfg.range) this.set('lock');
    } else if (this.phase === 'lock') {
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.meter += this.dir * this.cfg.speed * 2 * dt;
      if (this.meter >= 1) { this.meter = 1; this.dir = -1; }
      if (this.meter <= 0) { this.meter = 0; this.dir = 1; }
      if (gap > this.cfg.range + 10) this.set('approach'); // fell out of range: close in again
    } else if (this.phase === 'takedown') {
      this.takedownT -= dt;
      if (this.takedownT <= 0) this.set('done');
    }
  }

  /** The player pressed the action button. `sameLane`: officer is lined up with the suspect. */
  attempt(sameLane: boolean): 'hit' | 'miss-timing' | 'miss-lane' | null {
    if (this.phase !== 'lock' || this.cooldown > 0) return null;
    this.cooldown = 0.45;
    this.tries--;
    const result = !this.inWindow ? 'miss-timing' : !sameLane ? 'miss-lane' : 'hit';
    if (result === 'hit') this.hits++;
    this.windowAt = 0.2 + this.rand() * 0.6;
    this.events.shot(result);
    if (this.hits >= this.cfg.hits) { this.takedownT = 4.2; this.set('takedown'); }
    else if (this.tries <= 0) this.set('failed');
    return result;
  }
}
