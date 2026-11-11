export type Metric = 'coins' | 'distance' | 'jumps' | 'slides' | 'trains' | 'powerups' | 'score';
export interface MissionDef { id: string; metric: Metric; target: number; reward: number; perRun: boolean; text: string }
export interface MissionState { id: string; progress: number; claimed: boolean }

/** Configurable mission pool. Three are active at a time; claiming one deals the next. */
export const MISSION_POOL: MissionDef[] = [
  { id: 'coins-100', metric: 'coins', target: 100, reward: 150, perRun: false, text: 'Collect 100 coins' },
  { id: 'run-500', metric: 'distance', target: 500, reward: 150, perRun: true, text: 'Run 500 m in one run' },
  { id: 'jump-20', metric: 'jumps', target: 20, reward: 120, perRun: false, text: 'Jump 20 times' },
  { id: 'slide-15', metric: 'slides', target: 15, reward: 120, perRun: false, text: 'Slide 15 times' },
  { id: 'trains-30', metric: 'trains', target: 30, reward: 200, perRun: false, text: 'Dodge 30 trains' },
  { id: 'power-5', metric: 'powerups', target: 5, reward: 200, perRun: false, text: 'Grab 5 power-ups' },
  { id: 'score-3000', metric: 'score', target: 3000, reward: 250, perRun: true, text: 'Score 3,000 in one run' },
  { id: 'coins-run-80', metric: 'coins', target: 80, reward: 250, perRun: true, text: 'Collect 80 coins in one run' },
  { id: 'run-1500', metric: 'distance', target: 1500, reward: 400, perRun: true, text: 'Run 1,500 m in one run' },
  { id: 'coins-500', metric: 'coins', target: 500, reward: 400, perRun: false, text: 'Collect 500 coins' },
  { id: 'trains-100', metric: 'trains', target: 100, reward: 500, perRun: false, text: 'Dodge 100 trains' },
  { id: 'power-run-3', metric: 'powerups', target: 3, reward: 350, perRun: true, text: 'Grab 3 power-ups in one run' },
  { id: 'score-8000', metric: 'score', target: 8000, reward: 600, perRun: true, text: 'Score 8,000 in one run' },
  { id: 'run-3000', metric: 'distance', target: 3000, reward: 900, perRun: true, text: 'Run 3,000 m in one run' },
];
const def = (id: string) => MISSION_POOL.find((m) => m.id === id)!;

export interface MissionSave { missions: MissionState[]; missionCursor: number; missionsDone: number; coins: number }

export class Missions {
  /** Fired the moment a mission's target is reached. */
  onComplete: (m: MissionDef) => void = () => {};
  constructor(private save: MissionSave) {
    this.save.missions = this.save.missions.filter((m) => def(m.id));
    while (this.save.missions.length < 3) this.deal();
  }

  private deal(at = this.save.missions.length) {
    for (let tries = 0; tries < MISSION_POOL.length; tries++) {
      const d = MISSION_POOL[this.save.missionCursor++ % MISSION_POOL.length];
      if (this.save.missions.some((m) => m.id === d.id)) continue;
      this.save.missions[at] = { id: d.id, progress: 0, claimed: false };
      return;
    }
  }

  list() { return this.save.missions.map((s) => ({ def: def(s.id), state: s, done: s.progress >= def(s.id).target })); }
  get claimable() { return this.list().filter((m) => m.done).length; }

  startRun() { for (const m of this.list()) if (m.def.perRun && !m.done) m.state.progress = 0; }

  /** Add to a counter metric, or raise a high-water metric (distance, score). */
  report(metric: Metric, value: number, absolute = false) {
    for (const m of this.list()) {
      if (m.def.metric !== metric || m.done) continue;
      const next = absolute ? Math.max(m.state.progress, value) : m.state.progress + value;
      m.state.progress = Math.min(m.def.target, next);
      if (m.state.progress >= m.def.target) this.onComplete(m.def);
    }
  }

  /** Pays the reward and replaces the mission. Returns coins granted (0 if not claimable). */
  claim(id: string): number {
    const i = this.save.missions.findIndex((m) => m.id === id);
    if (i < 0) return 0;
    const d = def(id);
    if (this.save.missions[i].progress < d.target) return 0;
    this.save.coins += d.reward;
    this.save.missionsDone++;
    this.deal(i);
    return d.reward;
  }
}
