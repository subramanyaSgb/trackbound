/**
 * Story missions. Each one is pure data: a criminal, a crime, a route made of
 * zones (environment + difficulty + pursuit rules), and a final capture. Add a
 * mission by appending to MISSIONS; the engine needs no changes.
 */
export type ThemeId = 'city' | 'rail' | 'tunnel' | 'alley' | 'industrial' | 'highway' | 'construction' | 'harbor';
export type CaptureType = 'taser' | 'net' | 'tackle';

export interface ZoneDef {
  /** Distance (m) where the zone starts. Zone starts are also checkpoints. */
  at: number;
  name: string;
  /** Radio line shown when the zone begins. */
  radio: string;
  /** Environments used in this zone; several alternate every `segment` metres. */
  themes: ThemeId[];
  segment?: number;
  /** Obstacle difficulty at the start and end of the zone (0 easy .. 4 hard). */
  stage: [number, number];
  /** Top running speed in this zone (m/s). */
  maxSpeed: number;
  /** Closest the suspect lets you get before the finale (m). */
  minGap: number;
  /** Metres the suspect gains with a trick when the zone begins. */
  gapBoost: number;
  /** How often the suspect hurls debris into your lane (throws per minute). */
  throws: number;
  /** The suspect rides this through the zone. */
  crimVehicle?: 'motorcycle';
  /** Road curvature strength 0..1 and hilliness 0..1. */
  curve: number;
  hills: number;
}

export interface MissionDef {
  id: string;
  title: string;
  /** One-line story shown in the mission list and the intro. */
  brief: string;
  crime: { place: string; sign: string; headline: string };
  criminal: string;
  /** Distance at which the final capture begins. */
  length: number;
  /** Hard limit: if the suspect is still free here, they escape. */
  limit: number;
  zones: ZoneDef[];
  pursuit: {
    startGap: number;
    /** Gap at which the suspect is lost. */
    loseGap: number;
    /** Metres per second the gap closes during clean running. */
    closeRate: number;
    /** Hits allowed per checkpoint segment. */
    hearts: number;
  };
  capture: {
    type: CaptureType;
    /** Successful shots / grabs needed. */
    hits: number;
    /** Attempts available. */
    tries: number;
    /** Width of the timing window (0..1 of the meter). */
    window: number;
    /** Sweeps of the meter per second. */
    speed: number;
    /** Gap at which the capture tool can be used. */
    range: number;
  };
  rewards: { coins: number; xp: number };
  /** Unlock gates. */
  requires?: { mission?: string; totalDistance?: number };
  boss?: boolean;
  /** Endless score-attack with no suspect: run until the hearts are gone. */
  patrol?: boolean;
}

const z = (at: number, name: string, radio: string, themes: ThemeId[], stage: [number, number], extra: Partial<ZoneDef> = {}): ZoneDef =>
  ({ at, name, radio, themes, stage, maxSpeed: 26, minGap: 22, gapBoost: 0, throws: 0, curve: 0.6, hills: 0.3, ...extra });

export const MISSIONS: MissionDef[] = [
  {
    id: 'm1', title: 'Corner Shop Stick-up', criminal: 'sticky',
    brief: 'A masked thief has cleaned out the till at Moon Bun Bakery and bolted down Hollow Street.',
    crime: { place: 'Moon Bun Bakery', sign: 'MOON BUN', headline: 'ROBBERY IN PROGRESS' },
    length: 50000, limit: 52000,
    zones: [
      z(0, 'Hollow Street', 'Suspect on foot, heading east through traffic!', ['city'], [0, 1.4], { maxSpeed: 22, minGap: 26, curve: 0.5, hills: 0.15 }),
      z(1500, 'Ember Rail Yard', 'He has jumped the fence onto the tracks. Watch the trains!', ['rail'], [1, 2.2], { maxSpeed: 24, minGap: 24, gapBoost: 14, curve: 0.35, hills: 0.1 }),
      z(5000, 'Undercity Tunnels', 'Suspect has gone underground. Stay close in the alleys.', ['tunnel', 'alley'], [1.6, 2.8], { segment: 600, maxSpeed: 25, minGap: 22, gapBoost: 12, curve: 0.8, hills: 0.5 }),
      z(10000, 'Old Foundry Works', 'He is cutting through the container yard.', ['industrial'], [2, 3.2], { maxSpeed: 26, minGap: 22, gapBoost: 14, throws: 1.5, curve: 0.6, hills: 0.2 }),
      z(20000, 'Skyline Expressway', 'Suspect is on the expressway, weaving through traffic!', ['highway'], [2.4, 3.6], { maxSpeed: 30, minGap: 20, gapBoost: 16, curve: 0.7, hills: 0.6 }),
      z(30000, 'Dead Man\'s Detour', 'He has smashed into the roadworks. This route is dangerous!', ['construction', 'alley'], [3, 4], { segment: 900, maxSpeed: 28, minGap: 18, gapBoost: 16, throws: 3, curve: 1, hills: 0.7 }),
      z(40000, 'North Quay Docks', 'Taser authorised. Close the distance and bring him in!', ['harbor'], [3.2, 4], { maxSpeed: 28, minGap: 14, gapBoost: 10, throws: 2.5, curve: 0.5, hills: 0.2 }),
    ],
    pursuit: { startGap: 55, loseGap: 130, closeRate: 1.4, hearts: 3 },
    capture: { type: 'taser', hits: 2, tries: 5, window: 0.24, speed: 0.75, range: 12 },
    rewards: { coins: 1500, xp: 6000 },
  },
  {
    id: 'm2', title: 'First City Bank Job', criminal: 'duchess',
    brief: 'The Duchess walked out of First City Bank with the vault. Her getaway bike is waiting on the expressway.',
    crime: { place: 'First City Bank', sign: 'FIRST CITY BANK', headline: 'BANK ALARM' },
    length: 25000, limit: 26500, requires: { mission: 'm1' },
    zones: [
      z(0, 'Bank Plaza', 'Suspect leaving the plaza on foot. Do not lose her!', ['city'], [1, 2], { maxSpeed: 24, minGap: 24 }),
      z(3000, 'Skyline Expressway', 'She is on a motorcycle! Keep up any way you can.', ['highway'], [2, 3.2], { maxSpeed: 31, minGap: 24, gapBoost: 22, crimVehicle: 'motorcycle', curve: 0.8, hills: 0.6 }),
      z(12000, 'Harbour Bridge', 'Her bike is out of fuel. She is running for the docks.', ['highway', 'construction'], [2.6, 3.6], { segment: 1200, maxSpeed: 29, minGap: 20, gapBoost: 10, throws: 2, curve: 0.9, hills: 0.8 }),
      z(19000, 'North Quay Docks', 'Net launcher authorised. Corner her at the water.', ['harbor'], [3, 4], { maxSpeed: 28, minGap: 14, gapBoost: 10, throws: 2.5, curve: 0.5, hills: 0.2 }),
    ],
    pursuit: { startGap: 60, loseGap: 135, closeRate: 1.3, hearts: 3 },
    capture: { type: 'net', hits: 2, tries: 4, window: 0.2, speed: 0.9, range: 14 },
    rewards: { coins: 2000, xp: 5000 },
  },
  {
    id: 'm3', title: 'Lantern Row Jewel Heist', criminal: 'magpie',
    brief: 'Magpie emptied the display cases on Lantern Row and vanished down the metro line.',
    crime: { place: 'Lantern Row Jewellers', sign: 'LANTERN JEWELS', headline: 'JEWEL HEIST' },
    length: 25000, limit: 26500, requires: { mission: 'm2' },
    zones: [
      z(0, 'Lantern Row', 'Suspect is fast and light on her feet.', ['city', 'alley'], [1.4, 2.4], { segment: 700, maxSpeed: 25, minGap: 24, curve: 0.8 }),
      z(4000, 'Kite Market Line', 'She is on the tracks, running against the trains!', ['rail'], [2.2, 3.4], { maxSpeed: 27, minGap: 22, gapBoost: 16, curve: 0.5 }),
      z(13000, 'Service Tunnels', 'Lights are out down here. Follow the sound of the alarm tag.', ['tunnel'], [2.6, 3.8], { maxSpeed: 27, minGap: 20, gapBoost: 14, throws: 2, curve: 1, hills: 0.6 }),
      z(20000, 'Ember Rail Yard', 'She is boxed in by the freight cars. Take her down!', ['rail'], [3, 4], { maxSpeed: 28, minGap: 10, gapBoost: 8, curve: 0.4 }),
    ],
    pursuit: { startGap: 60, loseGap: 135, closeRate: 1.3, hearts: 3 },
    capture: { type: 'tackle', hits: 1, tries: 3, window: 0.18, speed: 1.1, range: 9 },
    rewards: { coins: 2500, xp: 5500 },
  },
  {
    id: 'm4', title: 'Foundry Warehouse Raid', criminal: 'crusher',
    brief: 'Crusher and a stolen forklift have torn open the Old Foundry bonded warehouse.',
    crime: { place: 'Old Foundry Warehouse 9', sign: 'WAREHOUSE 9', headline: 'WAREHOUSE BREAK-IN' },
    length: 30000, limit: 31500, requires: { mission: 'm3' },
    zones: [
      z(0, 'Old Foundry Works', 'Big lad, bad temper. He is throwing whatever he can grab.', ['industrial'], [2, 3], { maxSpeed: 26, minGap: 24, throws: 3 }),
      z(8000, 'Dead Man\'s Detour', 'Suspect is ploughing through the roadworks.', ['construction'], [2.6, 3.6], { maxSpeed: 28, minGap: 22, gapBoost: 16, throws: 3.5, curve: 1, hills: 0.7 }),
      z(16000, 'Freight Line', 'He is following the freight line to the docks.', ['rail', 'industrial'], [3, 4], { segment: 1000, maxSpeed: 28, minGap: 20, gapBoost: 14, throws: 2.5 }),
      z(24000, 'North Quay Docks', 'Taser authorised. It will take more than one shot.', ['harbor'], [3.4, 4], { maxSpeed: 29, minGap: 14, gapBoost: 10, throws: 3.5 }),
    ],
    pursuit: { startGap: 60, loseGap: 135, closeRate: 1.25, hearts: 3 },
    capture: { type: 'taser', hits: 3, tries: 6, window: 0.2, speed: 0.95, range: 12 },
    rewards: { coins: 3000, xp: 6500 },
  },
  {
    id: 'm5', title: 'The Vanishing Supercar', criminal: 'ghost',
    brief: 'Ghost lifted a prototype supercar key from the motor show and slipped into the underground car parks.',
    crime: { place: 'Grand Motor Show', sign: 'MOTOR SHOW', headline: 'VEHICLE THEFT' },
    length: 30000, limit: 31500, requires: { mission: 'm4' },
    zones: [
      z(0, 'Undercity Tunnels', 'Nobody has ever caught Ghost. Stay on him.', ['tunnel'], [2.4, 3.2], { maxSpeed: 27, minGap: 24, curve: 1, hills: 0.6 }),
      z(7000, 'Back Alleys', 'He knows every alley in the district.', ['alley', 'tunnel'], [2.8, 3.6], { segment: 500, maxSpeed: 27, minGap: 22, gapBoost: 16, throws: 2, curve: 1 }),
      z(15000, 'Skyline Expressway', 'He has a bike stashed on the on-ramp!', ['highway'], [3, 4], { maxSpeed: 32, minGap: 22, gapBoost: 22, crimVehicle: 'motorcycle', curve: 0.8, hills: 0.7 }),
      z(24000, 'Dead Man\'s Detour', 'Road closed ahead. This is where it ends.', ['construction'], [3.6, 4], { maxSpeed: 29, minGap: 14, gapBoost: 10, throws: 3.5, curve: 1, hills: 0.6 }),
    ],
    pursuit: { startGap: 65, loseGap: 135, closeRate: 1.2, hearts: 3 },
    capture: { type: 'net', hits: 2, tries: 4, window: 0.16, speed: 1.15, range: 13 },
    rewards: { coins: 3500, xp: 7000 },
  },
  {
    id: 'boss', title: 'Operation Kingpin', criminal: 'kingpin', boss: true,
    brief: 'Every thief you have caught answers to one man. Run 100,000 m on the force to earn the warrant for the Kingpin.',
    crime: { place: 'Crown Tower Penthouse', sign: 'CROWN TOWER', headline: 'WARRANT SERVED' },
    length: 60000, limit: 62500, requires: { totalDistance: 100000 },
    zones: [
      z(0, 'Crown Tower District', 'The Kingpin is running. Every unit, move!', ['city'], [2.4, 3.2], { maxSpeed: 26, minGap: 26, throws: 1.5 }),
      z(6000, 'Undercity Tunnels', 'His crew has blacked out the tunnels.', ['tunnel', 'alley'], [2.8, 3.6], { segment: 700, maxSpeed: 27, minGap: 24, gapBoost: 16, throws: 2.5, curve: 1, hills: 0.6 }),
      z(15000, 'Freight Line', 'He is using the freight trains for cover.', ['rail'], [3, 4], { maxSpeed: 28, minGap: 22, gapBoost: 16, throws: 2 }),
      z(25000, 'Old Foundry Works', 'His warehouse men are blocking the yard.', ['industrial'], [3.2, 4], { maxSpeed: 28, minGap: 22, gapBoost: 16, throws: 3.5 }),
      z(35000, 'Skyline Expressway', 'Escape bike on the expressway. Do not let him reach the bridge!', ['highway'], [3.4, 4], { maxSpeed: 33, minGap: 22, gapBoost: 24, crimVehicle: 'motorcycle', curve: 0.9, hills: 0.8 }),
      z(46000, 'Dead Man\'s Detour', 'He has crashed the bike. He is on foot in the roadworks.', ['construction'], [3.8, 4], { maxSpeed: 29, minGap: 18, gapBoost: 12, throws: 4, curve: 1, hills: 0.7 }),
      z(54000, 'North Quay Docks', 'His boat is waiting. Stop him before the pier!', ['harbor'], [4, 4], { maxSpeed: 30, minGap: 14, gapBoost: 10, throws: 4 }),
    ],
    pursuit: { startGap: 70, loseGap: 140, closeRate: 1.15, hearts: 3 },
    capture: { type: 'taser', hits: 4, tries: 7, window: 0.15, speed: 1.25, range: 12 },
    rewards: { coins: 10000, xp: 20000 },
  },
];

/**
 * Free Patrol: the original endless run, kept as a score-attack mode. It tours
 * every environment, getting harder, and ends when the hearts run out.
 */
const TOUR: ThemeId[] = ['city', 'rail', 'alley', 'industrial', 'highway', 'tunnel', 'construction', 'harbor'];
export const PATROL: MissionDef = {
  id: 'patrol', title: 'Free Patrol', criminal: 'sticky', patrol: true,
  brief: 'No suspect, no finish line. Tour the whole city and set a high score before your hearts run out.',
  crime: { place: '', sign: '', headline: '' },
  length: 1e9, limit: 1e9,
  zones: Array.from({ length: 60 }, (_, i) => z(i * 1500, ['Hollow Street', 'Ember Rail Yard', 'Back Alleys', 'Old Foundry Works', 'Skyline Expressway', 'Undercity Tunnels', 'Roadworks Detour', 'North Quay Docks'][i % 8], '', [TOUR[i % 8]], [Math.min(4, i * 0.45), Math.min(4, i * 0.45 + 0.6)], { maxSpeed: Math.min(31, 22 + i * 0.9) })),
  pursuit: { startGap: 0, loseGap: 1e9, closeRate: 0, hearts: 3 },
  capture: { type: 'taser', hits: 1, tries: 1, window: 0.2, speed: 1, range: 10 },
  rewards: { coins: 0, xp: 0 },
};

export const missionById = (id: string) => MISSIONS.find((m) => m.id === id) ?? (id === PATROL.id ? PATROL : MISSIONS[0]);

/** Index of the zone containing distance d. */
export function zoneIndexAt(m: MissionDef, d: number) {
  let i = 0;
  for (let k = 0; k < m.zones.length; k++) if (d >= m.zones[k].at) i = k;
  return i;
}

/** Environment at distance d (zones with several themes alternate by segment). */
export function themeAt(m: MissionDef, d: number): ThemeId {
  const zn = m.zones[zoneIndexAt(m, Math.max(0, d))];
  if (zn.themes.length === 1) return zn.themes[0];
  const seg = Math.floor((Math.max(0, d) - zn.at) / (zn.segment ?? 600));
  return zn.themes[seg % zn.themes.length];
}

/** Obstacle difficulty (fractional stage index) at distance d. */
export function stageAt(m: MissionDef, d: number) {
  const i = zoneIndexAt(m, d);
  const zn = m.zones[i];
  const end = i + 1 < m.zones.length ? m.zones[i + 1].at : m.length;
  const f = Math.min(1, Math.max(0, (d - zn.at) / Math.max(1, end - zn.at)));
  return zn.stage[0] + (zn.stage[1] - zn.stage[0]) * f;
}

export interface MissionProgress { zone: number; gap: number; done: boolean; best: number }

export function missionUnlocked(m: MissionDef, progress: Record<string, MissionProgress | undefined>, totalDistance: number) {
  if (m.requires?.mission && !progress[m.requires.mission]?.done) return false;
  if (m.requires?.totalDistance && totalDistance < m.requires.totalDistance) return false;
  return true;
}
