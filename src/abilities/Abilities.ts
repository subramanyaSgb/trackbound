import { ABILITIES, abilityCost, type AbilityDef, type AbilityId } from '../data/abilities';

/**
 * Charge-and-activate state for the selected character's ability.
 *
 * Rules (so coins are never counted or spent twice):
 *  - every coin collected goes to the wallet AND adds one point of charge;
 *  - charge is a separate meter capped at the ability's cost; it does not fill while the power is active;
 *  - activating empties the meter and never touches the wallet.
 */
export class Abilities {
  def: AbilityDef;
  cost: number;
  charge = 0;
  /** Seconds of the active power left (0 = inactive). */
  left = 0;
  cooldown = 0;
  uses = 0;

  constructor(id: AbilityId, chargeLevel = 0) {
    this.def = ABILITIES[id];
    this.cost = abilityCost(id, chargeLevel);
  }

  get active() { return this.left > 0; }
  get ready() { return !this.active && this.cooldown <= 0 && this.charge >= this.cost; }
  /** 0..1 for the HUD ring: remaining time while active, otherwise charge. */
  get fill() { return this.active ? this.left / this.def.duration : this.charge / this.cost; }
  is(id: AbilityId) { return this.active && this.def.id === id; }

  addCoins(n: number) { if (!this.active) this.charge = Math.min(this.cost, this.charge + n); }

  activate() {
    if (!this.ready) return false;
    this.charge = 0;
    this.left = this.def.duration;
    this.uses++;
    return true;
  }

  /** Ends the power early (for example when the motorcycle crashes). */
  cancel() { if (this.active) { this.left = 0; this.cooldown = this.def.cooldown; } }

  /** Returns true on the frame the power runs out. */
  update(dt: number) {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.left <= 0) return false;
    this.left -= dt;
    if (this.left > 0) return false;
    this.left = 0;
    this.cooldown = this.def.cooldown;
    return true;
  }
}
