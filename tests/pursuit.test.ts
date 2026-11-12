import { describe, expect, it } from 'vitest';
import { Abilities } from '../src/abilities/Abilities';
import { Save } from '../src/core/Save';
import { ABILITIES, abilityCost } from '../src/data/abilities';
import { CHARACTERS, CRIMINALS } from '../src/data/characters';
import { MISSIONS, PATROL, missionUnlocked, stageAt, themeAt, zoneIndexAt } from '../src/data/missions';
import { SEASONS, currentSeason, seasonStatus } from '../src/data/seasons';
import { Capture } from '../src/pursuit/Capture';
import { Pursuit } from '../src/pursuit/Pursuit';

const M1 = MISSIONS[0];
const tick = (p: Pursuit, secs: number, speedFrac = 1, boost = 0) => { for (let i = 0; i < secs * 60; i++) p.update(1 / 60, speedFrac, boost, 25); };

describe('pursuit gap', () => {
  it('closes with clean running but never past the zone floor', () => {
    const p = new Pursuit(M1);
    const start = p.gap;
    tick(p, 5);
    expect(p.gap).toBeLessThan(start);
    tick(p, 120);
    expect(p.gap).toBeCloseTo(p.floor, 0);
    expect(p.failed).toBeNull();
  });

  it('opens on collisions, costs a heart, and ends the pursuit when hearts run out', () => {
    const p = new Pursuit(M1);
    const g0 = p.gap;
    expect(p.hit()).toBe(true);
    expect(p.gap).toBeGreaterThan(g0);
    expect(p.hearts).toBe(M1.pursuit.hearts - 1);
    p.hit();
    expect(p.hit()).toBe(false);
    expect(p.failed).toBe('injured');
  });

  it('lets the suspect pull away while the officer is slowed, and loses them past the limit', () => {
    const p = new Pursuit(M1);
    const g0 = p.gap;
    tick(p, 1, 0.5);
    expect(p.gap).toBeGreaterThan(g0 + 8);
    tick(p, 30, 0.5);
    expect(p.failed).toBe('lost');
  });

  it('closes faster with an ability, and checkpoints refill hearts', () => {
    const a = new Pursuit(M1), b = new Pursuit(M1);
    a.surge(40); b.surge(40);
    tick(a, 4); tick(b, 4, 1, 4);
    expect(b.gap).toBeLessThan(a.gap - 10);
    a.hit();
    a.checkpoint(18);
    expect(a.hearts).toBe(M1.pursuit.hearts);
    expect(a.floor).toBe(18);
  });
});

describe('early capture (suspect stamina)', () => {
  const hold = M1.pursuit.early!.hold;
  const wear = (p: Pursuit, secs: number, speedFrac = 1, onFoot = true) => { for (let i = 0; i < secs * 60; i++) p.tire(1 / 60, speedFrac, onFoot); };

  it('drains only while the officer is at full pace on the heels of a suspect on foot', () => {
    const p = new Pursuit(M1);
    wear(p, 10); // still far behind
    expect(p.stamina).toBe(1);
    p.gap = p.floor + 2;
    wear(p, 10, 0.5); // stumbling
    expect(p.stamina).toBe(1);
    wear(p, 10, 1, false); // a suspect on a motorcycle tires at half the rate
    expect(p.stamina).toBeCloseTo(1 - 5 / hold, 3);
    p.stamina = 1;
    wear(p, hold / 2);
    expect(p.stamina).toBeCloseTo(0.5, 2);
    expect(p.exhausted).toBe(false);
    wear(p, hold / 2 + 1);
    expect(p.exhausted).toBe(true);
  });

  it('gives the suspect breath back when the officer crashes', () => {
    const p = new Pursuit(M1);
    p.gap = p.floor;
    wear(p, hold / 2);
    const before = p.stamina;
    p.hit();
    expect(p.stamina).toBeGreaterThan(before);
  });

  it('is configured to start after the opening stretch and well before the end of every case', () => {
    for (const m of MISSIONS) {
      expect(m.pursuit.early, m.id).toBeTruthy();
      expect(m.pursuit.early!.from).toBeGreaterThanOrEqual(1000); // the opening stretch is always a plain chase
      expect(m.pursuit.early!.from).toBeLessThan(m.length / 2);
    }
    expect(PATROL.pursuit.early).toBeUndefined();
  });
});

describe('ability charge', () => {
  it('charges from coins, activates once full, and never double counts', () => {
    const ab = new Abilities('flight');
    expect(ab.ready).toBe(false);
    expect(ab.activate()).toBe(false);
    ab.addCoins(60); ab.addCoins(60);
    expect(ab.charge).toBe(ab.cost); // capped: surplus coins are not banked as charge
    expect(ab.activate()).toBe(true);
    expect(ab.charge).toBe(0);
    ab.addCoins(50);
    expect(ab.charge).toBe(0); // no charging while the power is running
    expect(ab.activate()).toBe(false);
    let ended = false;
    for (let i = 0; i < ab.def.duration * 60 + 2; i++) ended = ab.update(1 / 60) || ended;
    expect(ended).toBe(true);
    expect(ab.active).toBe(false);
    ab.addCoins(ab.cost);
    expect(ab.ready).toBe(false); // cooling down
    for (let i = 0; i < ab.def.cooldown * 60 + 2; i++) ab.update(1 / 60);
    expect(ab.ready).toBe(true);
    expect(ab.uses).toBe(1);
  });

  it('applies the Quick Charge upgrade to the cost', () => {
    expect(abilityCost('bike', 0)).toBe(150);
    expect(abilityCost('bike', 5)).toBeLessThan(150);
    expect(new Abilities('bike', 5).cost).toBe(abilityCost('bike', 5));
  });
});

describe('capture sequence', () => {
  const make = () => { const log: string[] = []; return { log, c: new Capture(M1, { phase: (p) => log.push(p), shot: (r) => log.push(r) }) }; };

  it('needs range, timing and lane alignment; enough hits make the arrest', () => {
    const { log, c } = make();
    c.update(0.1, 40);
    expect(c.phase).toBe('approach');
    expect(c.attempt(true)).toBeNull(); // tool not usable out of range
    c.update(0.1, M1.capture.range - 1);
    expect(c.phase).toBe('lock');
    const fire = (lane: boolean, want: boolean) => {
      for (let i = 0; i < 2000 && (c.inWindow !== want || c.cooldown > 0); i++) c.update(1 / 120, 8);
      return c.attempt(lane);
    };
    expect(fire(true, false)).toBe('miss-timing');
    expect(fire(false, true)).toBe('miss-lane');
    expect(fire(true, true)).toBe('hit');
    expect(c.phase).toBe('lock');
    expect(fire(true, true)).toBe('hit');
    expect(c.phase).toBe('takedown');
    for (let i = 0; i < 600; i++) c.update(1 / 60, 0);
    expect(c.phase).toBe('done');
    expect(log).toContain('takedown');
  });

  it('is never automatic: running out of tries fails it, and falling behind reopens the approach', () => {
    const { c } = make();
    c.update(0.1, 5);
    c.update(0.1, M1.capture.range + 20);
    expect(c.phase).toBe('approach');
    c.update(0.1, 5);
    for (let n = 0; n < M1.capture.tries; n++) { for (let i = 0; i < 200; i++) c.update(1 / 120, 5); c.attempt(false); }
    expect(c.phase).toBe('failed');
  });
});

describe('content data', () => {
  it('every mission is well formed', () => {
    for (const m of [...MISSIONS, PATROL]) {
      expect(CRIMINALS[m.criminal], m.id).toBeTruthy();
      expect(m.zones[0].at).toBe(0);
      for (let i = 1; i < m.zones.length; i++) expect(m.zones[i].at).toBeGreaterThan(m.zones[i - 1].at);
      if (!m.patrol) {
        expect(m.zones[m.zones.length - 1].at).toBeLessThan(m.length);
        expect(m.limit).toBeGreaterThan(m.length);
        expect(m.capture.range).toBeGreaterThan(m.zones[m.zones.length - 1].minGap - 6);
      }
      for (const z of m.zones) { expect(z.themes.length).toBeGreaterThan(0); expect(z.minGap).toBeLessThan(m.pursuit.loseGap); }
    }
    expect(M1.length).toBe(50000);
  });

  it('routes distance to zones, environments and difficulty', () => {
    expect(zoneIndexAt(M1, 0)).toBe(0);
    expect(zoneIndexAt(M1, 1500)).toBe(1);
    expect(themeAt(M1, 100)).toBe('city');
    expect(themeAt(M1, 2000)).toBe('rail');
    expect(themeAt(M1, 5100)).toBe('tunnel');
    expect(themeAt(M1, 5700)).toBe('alley'); // zones with two environments alternate
    expect(stageAt(M1, 49000)).toBeGreaterThan(stageAt(M1, 100));
  });

  it('unlocks missions in order and the boss at 100,000 m', () => {
    expect(missionUnlocked(MISSIONS[1], {}, 0)).toBe(false);
    expect(missionUnlocked(MISSIONS[1], { m1: { zone: 0, gap: 0, done: true, best: 0 } }, 0)).toBe(true);
    const boss = MISSIONS.find((m) => m.boss)!;
    expect(missionUnlocked(boss, {}, 99999)).toBe(false);
    expect(missionUnlocked(boss, {}, 100000)).toBe(true);
  });

  it('every character has a distinct ability and look; seasons reference real content', () => {
    expect(new Set(CHARACTERS.map((c) => c.ability)).size).toBe(CHARACTERS.length);
    expect(new Set(CHARACTERS.map((c) => c.id)).size).toBe(CHARACTERS.length);
    for (const c of CHARACTERS) expect(ABILITIES[c.ability]).toBeTruthy();
    for (const s of SEASONS) {
      for (const id of s.characters) expect(CHARACTERS.some((c) => c.id === id), id).toBe(true);
      for (const id of s.missions) expect(MISSIONS.some((m) => m.id === id), id).toBe(true);
    }
    expect(seasonStatus(SEASONS[0], new Date('2026-06-01'))).toBe('live');
    expect(currentSeason(new Date('2026-06-01')).id).toBe('s1');
    expect(currentSeason(new Date('2030-01-01')).characters.length).toBeGreaterThan(0);
  });

  it('migrates an endless-runner save without losing coins or upgrades', () => {
    const old = { coins: 420, xp: 900, char: 'vex', owned: ['ash', 'vex'], upgrades: { magnet: 2, shield: 1, double: 0 } } as never;
    const s = Save.migrate(old);
    expect(s.coins).toBe(420);
    expect(s.upgrades.magnet).toBe(2);
    expect(s.upgrades.charge).toBe(0);
    expect(s.char).toBe('officer');
    expect(s.owned).toEqual(['officer']);
    expect(s.mission).toBe('m1');
  });
});
