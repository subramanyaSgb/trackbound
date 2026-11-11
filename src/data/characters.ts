import type { AbilityId } from './abilities';

/** Body models produced by tools/build-assets.mjs (public/models/char-<body>.glb). All share one rig. */
export type BodyId = 'knight' | 'rogue' | 'hooded' | 'mage' | 'barbarian';

/**
 * Repaints part of a model's colour atlas. Pixels whose hue (degrees),
 * saturation and lightness (0..1) fall inside the given ranges are moved to a
 * new hue/saturation, with lightness scaled so shading gradients survive.
 */
export interface RecolorRule {
  hue?: [number, number];
  sat?: [number, number];
  light?: [number, number];
  to: { h?: number; s?: number; lMul?: number; lAdd?: number };
}

export type Accessory = 'cap' | 'mask' | 'sack' | 'visor' | 'headband' | 'beanie';

export interface LookDef {
  body: BodyId;
  /** Regex of mesh names to hide (capes hide the whole body from the chase camera). */
  hide: string;
  recolor: RecolorRule[];
  accessories: Accessory[];
  /** Colour used for accessories and UI avatar. */
  color: string;
  /** Standing height in metres. */
  height: number;
}

export interface MoveStyle {
  run: 'Running_A' | 'Running_B';
  /** Stride-rate multiplier. */
  cadence: number;
  /** Forward lean of the torso while running (radians). */
  lean: number;
  /** 0..1 arms swept back behind the body while running. */
  armsBack: number;
  /** Clip played when the ability fires. */
  power: 'Spellcast_Raise' | 'Cheer' | 'Block' | 'Use_Item' | 'Unarmed_Melee_Attack_Punch_A' | 'Interact';
  idle: 'Idle' | 'Unarmed_Idle';
}

export interface CharacterDef {
  id: string;
  name: string;
  title: string;
  blurb: string;
  season: string;
  cost: number;
  ability: AbilityId;
  look: LookDef;
  move: MoveStyle;
  /** Mesh regex shown only while flying (the flyer's cape). */
  flightOnly?: string;
}

const GREYS: Pick<RecolorRule, 'sat' | 'light'> = { sat: [0, 0.2], light: [0.2, 0.93] };

/**
 * Original characters (no licensed likenesses). The officer is the story lead;
 * the rest are Season 1's "Hero Squad" — deputised heroes, one per ability archetype.
 */
export const CHARACTERS: CharacterDef[] = [
  {
    id: 'officer', name: 'Officer Hart', title: 'Patrol Officer', season: 'core', cost: 0, ability: 'bike',
    blurb: 'First on the scene, last to give up. Calls in the motorcycle when the suspect pulls away.',
    look: {
      body: 'knight', hide: 'Cape|Helmet', height: 1.72, color: '#2447b8', accessories: ['cap'],
      recolor: [
        { ...GREYS, to: { h: 222, s: 0.62, lMul: 0.62 } }, // armour plates -> navy uniform
        { hue: [330, 20], sat: [0.45, 1], light: [0.3, 0.8], to: { h: 46, s: 0.95, lMul: 1.1 } }, // red crest -> gold badge
      ],
    },
    move: { run: 'Running_A', cadence: 1, lean: 0.06, armsBack: 0, power: 'Use_Item', idle: 'Idle' },
  },
  {
    id: 'skylark', name: 'Skylark', title: 'The Flyer', season: 's1', cost: 800, ability: 'flight',
    blurb: 'Leaps first and lets gravity catch up later. Patrols the city from the clouds.',
    flightOnly: 'Cape',
    look: {
      body: 'mage', hide: 'Cape|Hat', height: 1.7, color: '#16b7a8', accessories: ['headband'],
      recolor: [
        { hue: [225, 300], sat: [0.12, 1], to: { h: 174, s: 0.72, lMul: 1.05 } }, // purple robe -> teal suit
        { hue: [300, 350], sat: [0.3, 1], to: { h: 48, s: 0.95, lMul: 1.25 } }, // magenta cape lining -> gold
        { hue: [15, 45], sat: [0.6, 1], light: [0.4, 0.75], to: { h: 48, s: 0.95 } }, // orange trim -> gold
      ],
    },
    move: { run: 'Running_B', cadence: 1.05, lean: 0.1, armsBack: 0, power: 'Spellcast_Raise', idle: 'Idle' },
  },
  {
    id: 'blur', name: 'Blur', title: 'The Speedster', season: 's1', cost: 1500, ability: 'dash',
    blurb: 'Has never once waited for a green light. Runs so fast that barriers forget to stop her.',
    look: {
      body: 'rogue', hide: 'Cape', height: 1.66, color: '#ffc21a', accessories: ['visor'],
      recolor: [
        { hue: [120, 185], sat: [0.2, 1], to: { h: 44, s: 0.95, lMul: 1.12 } }, // green tunic -> yellow suit
        { hue: [5, 30], sat: [0.3, 0.75], light: [0.25, 0.62], to: { h: 4, s: 0.8, lMul: 0.95 } }, // hair/leather -> red
      ],
    },
    move: { run: 'Running_A', cadence: 1.35, lean: 0.34, armsBack: 1, power: 'Cheer', idle: 'Unarmed_Idle' },
  },
  {
    id: 'bastion', name: 'Bastion', title: 'The Armoured', season: 's1', cost: 2500, ability: 'shield',
    blurb: 'A walking roadblock in power armour. Nothing gets through, and nothing knocks him down.',
    look: {
      body: 'knight', hide: 'Cape', height: 1.8, color: '#6c8cff', accessories: [],
      recolor: [
        { ...GREYS, to: { h: 228, s: 0.5, lMul: 0.88 } }, // steel -> cobalt armour
        { hue: [330, 20], sat: [0.45, 1], light: [0.3, 0.8], to: { h: 190, s: 1, lMul: 1.2 } }, // crest -> cyan core
      ],
    },
    move: { run: 'Running_B', cadence: 0.92, lean: 0.03, armsBack: 0, power: 'Block', idle: 'Idle' },
  },
  {
    id: 'cipher', name: 'Cipher', title: 'The Tactician', season: 's1', cost: 4000, ability: 'reveal',
    blurb: 'Sees the whole chase three moves ahead. Her scanner paints the safe line on the road.',
    look: {
      body: 'hooded', hide: 'Cape', height: 1.66, color: '#9a5bff', accessories: ['visor'],
      recolor: [
        { hue: [120, 185], sat: [0.2, 1], to: { h: 268, s: 0.6, lMul: 0.8 } }, // green hood -> violet
        { hue: [5, 30], sat: [0.3, 0.75], light: [0.25, 0.62], to: { h: 230, s: 0.35, lMul: 0.7 } }, // leather -> slate
      ],
    },
    move: { run: 'Running_A', cadence: 1.08, lean: 0.14, armsBack: 0.35, power: 'Interact', idle: 'Unarmed_Idle' },
  },
  {
    id: 'ram', name: 'Ram', title: 'The Powerhouse', season: 's1', cost: 6000, ability: 'smash',
    blurb: 'Used to move freight by hand. Now he moves whatever is parked between him and the suspect.',
    look: {
      body: 'barbarian', hide: 'Cape|Hat', height: 1.86, color: '#ff7a3c', accessories: ['headband'],
      recolor: [
        { hue: [190, 235], sat: [0.15, 1], to: { h: 18, s: 0.85, lMul: 1.0 } }, // blue tunic -> orange
      ],
    },
    move: { run: 'Running_B', cadence: 0.88, lean: 0.2, armsBack: 0, power: 'Unarmed_Melee_Attack_Punch_A', idle: 'Idle' },
  },
];

export const characterById = (id: string) => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];

// ---------------------------------------------------------------- criminals
export interface CriminalDef {
  id: string;
  name: string;
  alias: string;
  look: LookDef;
  run: 'Running_A' | 'Running_B';
  cadence: number;
}

const DARK_CLOTHES: RecolorRule = { hue: [120, 185], sat: [0.2, 1], to: { h: 230, s: 0.18, lMul: 0.45 } };
export const CRIMINALS: Record<string, CriminalDef> = {
  sticky: {
    id: 'sticky', name: 'Vince "Sticky" Malloy', alias: 'Sticky', run: 'Running_A', cadence: 1.1,
    look: { body: 'hooded', hide: 'Cape', height: 1.66, color: '#30343f', accessories: ['mask', 'sack'], recolor: [DARK_CLOTHES] },
  },
  duchess: {
    id: 'duchess', name: 'Dolores "The Duchess" Vane', alias: 'The Duchess', run: 'Running_B', cadence: 1.12,
    look: {
      body: 'mage', hide: 'Cape', height: 1.7, color: '#7a1f3d', accessories: ['mask', 'sack'],
      recolor: [{ hue: [225, 300], sat: [0.12, 1], to: { h: 345, s: 0.6, lMul: 0.6 } }],
    },
  },
  magpie: {
    id: 'magpie', name: 'Mags "Magpie" Okoro', alias: 'Magpie', run: 'Running_A', cadence: 1.2,
    look: {
      body: 'rogue', hide: 'Cape', height: 1.64, color: '#1f2a44', accessories: ['mask', 'sack'],
      recolor: [{ hue: [120, 185], sat: [0.2, 1], to: { h: 215, s: 0.5, lMul: 0.5 } }, { hue: [5, 30], sat: [0.3, 0.75], light: [0.25, 0.62], to: { h: 0, s: 0.05, lMul: 0.5 } }],
    },
  },
  crusher: {
    id: 'crusher', name: 'Boris "Crusher" Kade', alias: 'Crusher', run: 'Running_B', cadence: 0.95,
    look: {
      body: 'barbarian', hide: 'Cape|Hat', height: 1.9, color: '#3d2a1f', accessories: ['mask', 'beanie', 'sack'],
      recolor: [{ hue: [190, 235], sat: [0.15, 1], to: { h: 20, s: 0.25, lMul: 0.45 } }],
    },
  },
  ghost: {
    id: 'ghost', name: '"Ghost" (identity unknown)', alias: 'Ghost', run: 'Running_A', cadence: 1.25,
    look: {
      body: 'hooded', hide: 'Cape', height: 1.68, color: '#d9dde6', accessories: ['mask', 'sack'],
      recolor: [{ hue: [120, 185], sat: [0.2, 1], to: { h: 220, s: 0.06, lMul: 1.25 } }],
    },
  },
  kingpin: {
    id: 'kingpin', name: 'Maximilian "Kingpin" Cross', alias: 'The Kingpin', run: 'Running_B', cadence: 1.15,
    look: {
      body: 'knight', hide: 'Cape|Helmet', height: 1.92, color: '#b8902c', accessories: ['mask', 'sack'],
      recolor: [{ ...GREYS, to: { h: 0, s: 0.02, lMul: 0.28 } }, { hue: [330, 20], sat: [0.45, 1], light: [0.3, 0.8], to: { h: 46, s: 1, lMul: 1.1 } }],
    },
  },
};
