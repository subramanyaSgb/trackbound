import { describe, expect, it } from 'vitest';
import { Missions, MISSION_POOL } from '../src/systems/Missions';
import { PowerUps, durationFor } from '../src/systems/PowerUps';

const fresh = () => ({ missions: [], missionCursor: 0, missionsDone: 0, coins: 0 });

describe('missions', () => {
  it('deals three, tracks progress, pays out once and deals a replacement', () => {
    const save = fresh();
    const m = new Missions(save);
    let completed = '';
    m.onComplete = (d) => { completed = d.id; };
    expect(m.list().map((x) => x.def.id)).toEqual(['coins-100', 'run-500', 'jump-20']);
    expect(m.claim('coins-100')).toBe(0);
    m.report('coins', 60); m.report('coins', 60);
    expect(completed).toBe('coins-100');
    expect(m.claimable).toBe(1);
    expect(m.claim('coins-100')).toBe(150);
    expect(save.coins).toBe(150);
    expect(m.claim('coins-100')).toBe(0);
    expect(m.list().map((x) => x.def.id)).toEqual(['slide-15', 'run-500', 'jump-20']);
  });

  it('per-run missions reset between runs until completed; high-water metrics do not add up', () => {
    const m = new Missions(fresh());
    m.report('distance', 300, true); m.report('distance', 320, true);
    expect(m.list()[1].state.progress).toBe(320);
    m.startRun();
    expect(m.list()[1].state.progress).toBe(0);
    m.report('distance', 600, true);
    m.startRun();
    expect(m.list()[1].done).toBe(true);
  });

  it('survives a save that references a removed mission and never deals duplicates', () => {
    const save = { ...fresh(), missions: [{ id: 'gone', progress: 3, claimed: false }] };
    const m = new Missions(save);
    for (let i = 0; i < MISSION_POOL.length * 2; i++) { const x = m.list()[0]; x.state.progress = x.def.target; m.claim(x.def.id); }
    expect(new Set(m.list().map((x) => x.def.id)).size).toBe(3);
  });
});

describe('power-ups', () => {
  it('times out, upgrades lengthen duration, shield absorbs exactly one hit', () => {
    const p = new PowerUps();
    p.activate('magnet', 0); p.activate('shield', 2);
    expect(durationFor('magnet', 3)).toBeGreaterThan(durationFor('magnet', 0));
    p.update(durationFor('magnet', 0) - 0.1);
    expect(p.active('magnet')).toBe(true);
    p.update(0.2);
    expect(p.active('magnet')).toBe(false);
    expect(p.absorb()).toBe(true);
    expect(p.absorb()).toBe(false);
  });
});
