export type PowerKind = 'magnet' | 'shield' | 'double';
export const POWER_KINDS: PowerKind[] = ['magnet', 'shield', 'double'];
export const POWER_INFO: Record<PowerKind, { name: string; desc: string; base: number; perLevel: number }> = {
  magnet: { name: 'Coin Magnet', desc: 'Pulls in coins from every lane', base: 7, perLevel: 1.5 },
  shield: { name: 'Shield', desc: 'Absorbs one crash', base: 10, perLevel: 2 },
  double: { name: 'Double Coins', desc: 'Every coin counts twice', base: 8, perLevel: 1.5 },
};
export const MAX_LEVEL = 5;
export const UPGRADE_COST = [250, 600, 1200, 2400, 4800];
export const durationFor = (kind: PowerKind, level: number) => POWER_INFO[kind].base + POWER_INFO[kind].perLevel * level;

/** Timed power-up state. Effects are applied by the systems that query `active`. */
export class PowerUps {
  readonly left: Record<PowerKind, number> = { magnet: 0, shield: 0, double: 0 };
  readonly total: Record<PowerKind, number> = { magnet: 1, shield: 1, double: 1 };

  reset() { for (const k of POWER_KINDS) this.left[k] = 0; }
  active(k: PowerKind) { return this.left[k] > 0; }
  activate(k: PowerKind, level: number) { this.left[k] = this.total[k] = durationFor(k, level); }
  /** Uses up the shield; returns true if a crash was absorbed. */
  absorb() { if (this.left.shield <= 0) return false; this.left.shield = 0; return true; }
  update(dt: number) { for (const k of POWER_KINDS) if (this.left[k] > 0) this.left[k] = Math.max(0, this.left[k] - dt); }
}
