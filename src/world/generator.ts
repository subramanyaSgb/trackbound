// Pure, render-free procedural track generator. Every row is validated
// against a reachability model before it is handed to the spawner, so the
// player always has at least one survivable path.

export type Cell = 'empty' | 'jump' | 'slide' | 'block' | 'train';

export interface Row {
  index: number;
  d: number; // distance along the track (m)
  spacing: number; // distance from previous row
  cells: Cell[]; // one per lane
  safe: number; // lane of the guaranteed path
  coins: boolean;
  /** A power-up pickup sits on the safe lane of this row. */
  power: boolean;
  stage: number;
  /** A moving train enters this lane: front starts at frontD, heading toward the player. */
  train?: { lane: number; frontD: number; length: number };
}

export const TRAIN_LEN = 14;
export const isSolid = (c: Cell) => c === 'block' || c === 'train';

const STAGE_START = [0, 300, 800, 1600, 3000];
export const stageFor = (d: number) => {
  let s = 0;
  for (let i = 0; i < STAGE_START.length; i++) if (d >= STAGE_START[i]) s = i;
  return s;
};

interface StageCfg {
  react: number; // seconds between rows
  other: [number, number, number, number]; // weights empty/jump/slide/block for non-safe lanes
  safeEmpty: number; // chance the guaranteed lane needs no action
  change: number; // chance the guaranteed lane shifts
  train: number; // chance a moving train starts
  chain: boolean; // may two action rows follow each other on the safe lane
}
export const STAGES: StageCfg[] = [
  { react: 1.0, other: [0.55, 0.15, 0.1, 0.2], safeEmpty: 0.8, change: 0.3, train: 0, chain: false },
  { react: 0.9, other: [0.4, 0.18, 0.17, 0.25], safeEmpty: 0.55, change: 0.4, train: 0.1, chain: false },
  { react: 0.8, other: [0.28, 0.2, 0.2, 0.32], safeEmpty: 0.4, change: 0.5, train: 0.14, chain: true },
  { react: 0.74, other: [0.2, 0.2, 0.2, 0.4], safeEmpty: 0.3, change: 0.6, train: 0.17, chain: true },
  { react: 0.72, other: [0.15, 0.2, 0.2, 0.45], safeEmpty: 0.25, change: 0.65, train: 0.2, chain: true },
];
export const MIN_SPACING = 9;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Lanes the player can occupy at the next row. A lane is reachable if it is
 * not solid and the player was already in it, or was in a neighbouring lane
 * and the target lane was laterally open at the previous row. Only one lane
 * change per row gap is assumed (conservative).
 */
export function nextReach(prevCells: Cell[] | null, reach: boolean[], cells: Cell[]): boolean[] {
  return cells.map((c, b) => {
    if (isSolid(c)) return false;
    if (reach[b]) return true;
    const open = !prevCells || !isSolid(prevCells[b]);
    return open && ((b > 0 && reach[b - 1]) || (b < 2 && reach[b + 1]));
  });
}

export class TrackGenerator {
  private d: number;
  private index = 0;
  private safe = 1;
  private prev: Row | null = null;
  private reach = [true, true, true];
  private trainLane = -1;
  private trainEndD = -1;
  private trainCooldown = 3;
  private powerCooldown = 8;

  constructor(private rng: () => number, startD = 45) {
    this.d = startD;
  }

  get reachable() {
    return this.reach;
  }

  next(speed: number): Row {
    const stage = stageFor(this.d);
    const cfg = STAGES[stage];
    const spacing = this.index === 0 ? 0 : Math.max(MIN_SPACING, speed * cfg.react);
    const d = this.d + spacing;
    if (this.trainLane >= 0 && d > this.trainEndD) {
      this.trainLane = -1;
      this.trainCooldown = 4;
    }

    let row: Row | null = null;
    for (let attempt = 0; attempt < 8 && !row; attempt++) {
      const cand = this.build(d, spacing, stage, cfg);
      const r = nextReach(this.prev ? this.prev.cells : null, this.reach, cand.cells);
      if (r[cand.safe]) row = cand;
    }
    if (!row) {
      // Fallback: keep the lane, clear everything except an active train lane.
      const cells: Cell[] = [0, 1, 2].map((l) => (l === this.trainLane ? 'train' : 'empty'));
      row = { index: this.index, d, spacing, cells, safe: this.safe, coins: true, power: false, stage };
    }
    if (row.train) {
      this.trainLane = row.train.lane;
      this.trainEndD = row.train.frontD + row.train.length + 2;
    } else if (this.trainLane < 0) this.trainCooldown--;

    this.powerCooldown = row.power ? 14 : this.powerCooldown - 1;
    this.reach = nextReach(this.prev ? this.prev.cells : null, this.reach, row.cells);
    this.safe = row.safe;
    this.prev = row;
    this.d = d;
    this.index++;
    return row;
  }

  private pick(w: [number, number, number, number]): Cell {
    const r = this.rng() * (w[0] + w[1] + w[2] + w[3]);
    if (r < w[0]) return 'empty';
    if (r < w[0] + w[1]) return 'jump';
    if (r < w[0] + w[1] + w[2]) return 'slide';
    return 'block';
  }

  private build(d: number, spacing: number, stage: number, cfg: StageCfg): Row {
    const prev = this.prev;
    let safe = this.safe;
    if (this.rng() < cfg.change) {
      const cand = safe + (this.rng() < 0.5 ? -1 : 1);
      if (cand >= 0 && cand <= 2 && cand !== this.trainLane && (!prev || !isSolid(prev.cells[cand]))) safe = cand;
    }

    let train: Row['train'];
    let trainLane = this.trainLane;
    if (trainLane < 0 && this.trainCooldown <= 0 && prev && this.rng() < cfg.train) {
      const lanes = [0, 1, 2].filter((l) => l !== safe && l !== this.safe && prev.cells[l] !== 'block');
      if (!lanes.length) lanes.push(...[0, 1, 2].filter((l) => l !== safe && l !== this.safe));
      const lane = lanes[Math.floor(this.rng() * lanes.length)];
      train = { lane, frontD: d + 3 * Math.max(spacing, MIN_SPACING), length: TRAIN_LEN };
      trainLane = lane;
    }

    const prevAction = prev ? prev.cells[prev.safe] !== 'empty' : false;
    const cells: Cell[] = [0, 1, 2].map((l) => {
      if (l === trainLane) return 'train';
      if (l === safe) {
        if (this.index < 2 || (prevAction && !cfg.chain) || this.rng() < cfg.safeEmpty) return 'empty';
        return this.rng() < 0.5 ? 'jump' : 'slide';
      }
      return this.index < 1 ? 'empty' : this.pick(cfg.other);
    });
    // Never present three identical action gates in a row of lanes: dull and unreadable.
    if (cells[0] === cells[1] && cells[1] === cells[2] && cells[0] !== 'empty') cells[(safe + 1) % 3] = 'block';
    if (isSolid(cells[safe])) cells[safe] = 'empty';
    const power = this.powerCooldown <= 0 && cells[safe] === 'empty' && this.rng() < 0.2;
    return { index: this.index, d, spacing, cells, safe, coins: !power && this.rng() < 0.7, power, stage, train };
  }
}
