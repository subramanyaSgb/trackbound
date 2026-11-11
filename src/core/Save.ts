import type { MissionState } from '../systems/Missions';
import type { PowerKind } from '../systems/PowerUps';

export type Quality = 'auto' | 'low' | 'medium' | 'high';
export interface SaveData {
  best: number; bestDistance: number; coins: number; xp: number; runs: number;
  music: number; sfx: number; quality: Quality; sensitivity: number; haptics: boolean;
  char: string; owned: string[];
  upgrades: Record<PowerKind, number>;
  missions: MissionState[]; missionCursor: number; missionsDone: number;
}
const defaults = (): SaveData => ({
  best: 0, bestDistance: 0, coins: 0, xp: 0, runs: 0,
  music: 0.5, sfx: 0.8, quality: 'auto', sensitivity: 1, haptics: true,
  char: 'ash', owned: ['ash'],
  upgrades: { magnet: 0, shield: 0, double: 0 },
  missions: [], missionCursor: 0, missionsDone: 0,
});

/** XP curve: level n -> n+1 costs 800 * n. */
export function levelFor(xp: number) {
  let level = 1, left = xp;
  while (left >= level * 800) { left -= level * 800; level++; }
  return { level, into: left, need: level * 800 };
}

/**
 * IndexedDB-backed save (single record). New fields are merged over stored
 * data, so saves from earlier builds keep their coins and records.
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
      const d = defaults();
      this.data = { ...d, ...stored, upgrades: { ...d.upgrades, ...stored?.upgrades } };
      if (!this.data.owned.includes('ash')) this.data.owned.push('ash');
    } catch { this.db = null; }
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
