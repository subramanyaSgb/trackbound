/**
 * Ability definitions. Everything the engine needs is data: add an entry here
 * (and an effect id the Game knows) to ship a new power.
 */
export type AbilityId = 'bike' | 'flight' | 'dash' | 'shield' | 'reveal' | 'smash';

export interface AbilityDef {
  id: AbilityId;
  name: string;
  desc: string;
  /** Coins of charge needed before it can be activated. */
  cost: number;
  /** Seconds the power lasts once activated. */
  duration: number;
  /** Seconds after it ends before it can be activated again. */
  cooldown: number;
  /** Run-speed multiplier while active. */
  speedMul: number;
  /** Extra metres per second the pursuit gap closes while active. */
  gapClose: number;
  color: string;
  icon: string;
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  bike: {
    id: 'bike', name: 'Police Motorcycle', desc: 'Mount up and tear down the road. Smashes barriers; only vehicles and walls stop you.',
    cost: 150, duration: 12, cooldown: 6, speedMul: 1.5, gapClose: 4, color: '#3b82ff', icon: 'bike',
  },
  flight: {
    id: 'flight', name: 'Sky Patrol', desc: 'Take off and fly above every obstacle, collecting the coin trail in the air.',
    cost: 100, duration: 10, cooldown: 6, speedMul: 1.25, gapClose: 3, color: '#27d3c3', icon: 'wing',
  },
  dash: {
    id: 'dash', name: 'Blur Dash', desc: 'A burst of impossible speed that phases straight through barriers and gates.',
    cost: 120, duration: 6, cooldown: 6, speedMul: 1.45, gapClose: 3.5, color: '#ffd23b', icon: 'bolt',
  },
  shield: {
    id: 'shield', name: 'Aegis Shield', desc: 'A force shield that shrugs off every hit while it lasts.',
    cost: 80, duration: 10, cooldown: 8, speedMul: 1, gapClose: 1, color: '#7fd4ff', icon: 'shield',
  },
  reveal: {
    id: 'reveal', name: 'Tactical Scan', desc: 'Marks the safe route on the road ahead and pulls in coins from every lane.',
    cost: 90, duration: 12, cooldown: 6, speedMul: 1, gapClose: 1.5, color: '#b56bff', icon: 'scan',
  },
  smash: {
    id: 'smash', name: 'Wrecking Charge', desc: 'Lower your shoulder and batter barriers, crates and parked cars out of the way.',
    cost: 110, duration: 8, cooldown: 7, speedMul: 1.15, gapClose: 2.5, color: '#ff7a3c', icon: 'fist',
  },
};

/** Shop upgrade "Quick Charge": each level cuts every ability's coin cost. */
export const CHARGE_DISCOUNT = 0.06;
export const abilityCost = (id: AbilityId, chargeLevel: number) => Math.round(ABILITIES[id].cost * (1 - CHARGE_DISCOUNT * chargeLevel));
