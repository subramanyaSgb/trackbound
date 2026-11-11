import { describe, expect, it } from 'vitest';
import { MIN_SPACING, TrackGenerator, isSolid, mulberry32, nextReach, stageFor, type Row } from '../src/world/generator';
import { CFG, speedAt } from '../src/core/config';

function run(seed: number, rows: number) {
  const gen = new TrackGenerator(mulberry32(seed));
  const out: Row[] = [];
  let d = 0;
  for (let i = 0; i < rows; i++) {
    const r = gen.next(speedAt(d));
    d = r.d;
    out.push(r);
  }
  return out;
}

describe('track generator fairness', () => {
  it('always keeps a survivable path (independent reachability check)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rows = run(seed, 1500);
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
  });

  it('gives enough reaction distance and never overlaps rows', () => {
    const rows = run(7, 3000);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].spacing).toBeGreaterThanOrEqual(MIN_SPACING);
      expect(rows[i].d - rows[i - 1].d).toBeCloseTo(rows[i].spacing, 5);
      // a row gap must outlast a full jump, or chained jumps drift late and become impossible
      expect(rows[i].spacing / speedAt(rows[i].d)).toBeGreaterThan((2 * CFG.jumpV) / CFG.gravity + 0.02);
    }
  });

  it('keeps the safe lane out of a moving train lane for its whole pass', () => {
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
    const density = (s: number) => {
      const rs = rows.filter((r) => r.stage === s);
      return rs.reduce((n, r) => n + r.cells.filter((c) => c !== 'empty').length, 0) / rs.length;
    };
    expect(stageFor(0)).toBe(0);
    expect(density(4)).toBeGreaterThan(density(2));
    expect(density(2)).toBeGreaterThan(density(0));
    expect(rows.filter((r) => r.stage === 0).some((r) => r.train)).toBe(false);
  });
});
