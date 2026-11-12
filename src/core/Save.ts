import type { MissionProgress } from '../data/missions';
import type { MissionState } from '../systems/Missions';
import type { PowerKind } from '../systems/PowerUps';

export type Quality = 'auto' | 'low' | 'medium' | 'high';
export type UpgradeKind = PowerKind | 'charge';
export interface SaveData {
  version: number;
  best: number; bestDistance: number; coins: number; xp: number; runs: number;
  music: number; sfx: number; quality: Quality; sensitivity: number; haptics: boolean;
  char: string; owned: string[];
  upgrades: Record<UpgradeKind, number>;
  /** Bounties (rotating side goals). */
  missions: MissionState[]; missionCursor: number; missionsDone: number;
  /** Story: selected mission, per-mission checkpoint/completion, lifetime distance. */
  mission: string;
  story: Record<string, MissionProgress>;
  totalDistance: number;
  arrests: number;
  /** Season XP and how many season rewards have been collected, per season id. */
  seasonXp: Record<string, number>;
  seasonClaimed: Record<string, number>;
  introSeen: boolean;
  /** Coaching tips already shown (id -> times). */
  tips: Record<string, number>;
}
const defaults = (): SaveData => ({
  version: 2,
  best: 0, bestDistance: 0, coins: 0, xp: 0, runs: 0,
  music: 0.5, sfx: 0.8, quality: 'auto', sensitivity: 1, haptics: true,
  char: 'officer', owned: ['officer'],
  upgrades: { magnet: 0, shield: 0, double: 0, charge: 0 },
  missions: [], missionCursor: 0, missionsDone: 0,
  mission: 'm1', story: {}, totalDistance: 0, arrests: 0,
  seasonXp: {}, seasonClaimed: {}, introSeen: false, tips: {},
});

/** XP curve: level n -> n+1 costs 800 * n. */
export function levelFor(xp: number) {
  let level = 1, left = xp;
  while (left >= level * 800) { left -= level * 800; level++; }
  return { level, into: left, need: level * 800 };
}

/**
 * IndexedDB-backed save (single record). New fields are merged over stored
 * data, so saves from earlier builds keep their coins, upgrades and records.
 */
export class Save {
  data: SaveData = defaults();
  private db: IDBDatabase | null = null;

  async load() {
    try {
      this.db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('trackbound', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const stored = await new Promise<Partial<SaveData> | undefined>((res, rej) => {
        const r = this.db!.transaction('kv').objectStore('kv').get('save');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      this.data = Save.migrate(stored);
    } catch { this.db = null; }
  }

  /** Bring any older save up to the current shape. */
  static migrate(stored: Partial<SaveData> | undefined): SaveData {
    const d = defaults();
    const data: SaveData = { ...d, ...stored, upgrades: { ...d.upgrades, ...stored?.upgrades }, story: { ...stored?.story }, seasonXp: { ...stored?.seasonXp }, seasonClaimed: { ...stored?.seasonClaimed }, tips: { ...stored?.tips } };
    if ((stored?.version ?? 1) < 2) {
      // v1 was the endless runner: its five runners no longer exist; coins, XP and upgrades carry over
      data.owned = ['officer'];
      data.char = 'officer';
      data.version = 2;
    }
    if (!data.owned.includes('officer')) data.owned.push('officer');
    return data;
  }

  commit() {
    try { this.db?.transaction('kv', 'readwrite').objectStore('kv').put(this.data, 'save'); } catch { /* keep playing */ }
  }

  reset() {
    const keep = { music: this.data.music, sfx: this.data.sfx, quality: this.data.quality, sensitivity: this.data.sensitivity, haptics: this.data.haptics };
    this.data = { ...defaults(), ...keep };
    this.commit();
  }
}
