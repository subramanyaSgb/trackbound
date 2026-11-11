import { describe, expect, it } from 'vitest';
import { MAX_STAGE, MIN_SPACING, TrackGenerator, isSolid, mulberry32, nextReach, stageCfg, type GenMods, type Row } from '../src/world/generator';
import { CFG } from '../src/core/config';

/** Stage rises 0 -> 4 over the run, at a speed typical for that stage. */
function run(seed: number, rows: number, mods: GenMods = { train: 1, block: 1 }, speed = (i: number) => 14 + (i / rows) * 19) {
  const gen = new TrackGenerator(mulberry32(seed));
  const out: Row[] = [];
  for (let i = 0; i < rows; i++) out.push(gen.next(speed(i), (i / rows) * MAX_STAGE, mods));
  return out;
}

describe('track generator fairness', () => {
  it('always keeps a survivable path (independent reachability check), in every environment tuning', () => {
    for (const mods of [{ train: 1, block: 1 }, { train: 0, block: 1.3 }, { train: 0.5, block: 1.25 }]) {
      for (let seed = 1; seed <= 40; seed++) {
        const rows = run(seed, 1500, mods);
        let reach = [true, true, true];
        let prev: Row | null = null;
        for (const r of rows) {
          reach = nextReach(prev ? prev.cells : null, reach, r.cells);
          expect(reach.some(Boolean), `seed ${seed} row ${r.index}`).toBe(true);
          expect(reach[r.safe], `seed ${seed} row ${r.index} safe lane`).toBe(true);
          expect(isSolid(r.cells[r.safe])).toBe(false);
          prev = r;
        }
      }
    }
  });

  it('gives enough reaction distance at every speed, including ability speeds', () => {
    for (const top of [22, 33, 33 * 1.5]) {
      const rows = run(7, 2000, { train: 1, block: 1 }, (i) => 12 + (i / 2000) * (top - 12));
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].spacing).toBeGreaterThanOrEqual(MIN_SPACING);
        expect(rows[i].d - rows[i - 1].d).toBeCloseTo(rows[i].spacing, 5);
        // a row gap must outlast a full jump, or chained jumps drift late and become impossible
        const speed = 12 + (i / 2000) * (top - 12);
        expect(rows[i].spacing / speed).toBeGreaterThan((2 * CFG.jumpV) / CFG.gravity + 0.02);
      }
    }
  });

  it('keeps the safe lane out of an oncoming mover\'s lane for its whole pass', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rows = run(seed, 1500);
      rows.forEach((r, i) => {
        if (!r.train) return;
        const end = r.train.frontD + r.train.length;
        for (let j = i; j < rows.length && rows[j].d <= end; j++) {
          expect(rows[j].cells[r.train.lane]).toBe('train');
          expect(rows[j].safe).not.toBe(r.train.lane);
        }
      });
    }
  });

  it('ramps difficulty by content, not only speed', () => {
    const rows = run(3, 4000);
    const density = (from: number, to: number) => {
      const rs = rows.slice(from, to);
      return rs.reduce((n, r) => n + r.cells.filter((c) => c !== 'empty').length, 0) / rs.length;
    };
    expect(density(3200, 4000)).toBeGreaterThan(density(1600, 2400));
    expect(density(1600, 2400)).toBeGreaterThan(density(0, 800));
    expect(stageCfg(0).train).toBe(0);
    expect(stageCfg(2.5).react).toBeLessThan(stageCfg(1).react);
  });

  it('honours environment tuning: no oncoming movers where disabled, nothing at all in the finale', () => {
    expect(run(5, 1500, { train: 0, block: 1 }).some((r) => r.train)).toBe(false);
    const clear = run(5, 300, { train: 1, block: 1, clear: true });
    expect(clear.every((r) => r.train || r.cells.every((c) => c === 'empty' || c === 'train'))).toBe(true);
  });
});
