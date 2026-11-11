/**
 * Seasonal content. A season bundles a theme, its characters, the missions it
 * features and a reward track. Shipping a new season is a matter of appending
 * an entry here plus its character/mission data; the engine reads everything
 * through this file and hardcodes nothing about any particular season.
 */
export interface SeasonReward { xp: number; coins: number; label: string }
export interface SeasonDef {
  id: string;
  number: number;
  name: string;
  tagline: string;
  /** Two colours used for the season card artwork. */
  colors: [string, string];
  /** ISO dates (inclusive start, exclusive end). A season outside its window is shown as upcoming/ended. */
  starts: string;
  ends: string;
  /** Character ids (data/characters.ts) introduced by this season. */
  characters: string[];
  /** Mission ids (data/missions.ts) featured by this season. */
  missions: string[];
  /** Season XP milestones; earned from every run while the season is live. */
  rewards: SeasonReward[];
  /** Short bullets for upcoming-season cards. */
  preview: string[];
}

export const SEASONS: SeasonDef[] = [
  {
    id: 's1', number: 1, name: 'Hero Squad', tagline: 'The city deputises its heroes.',
    colors: ['#2337c6', '#27d3c3'], starts: '2026-01-01', ends: '2027-01-01',
    characters: ['skylark', 'blur', 'bastion', 'cipher', 'ram'],
    missions: ['m1', 'm2', 'm3', 'm4', 'm5', 'boss'],
    rewards: [
      { xp: 5000, coins: 300, label: 'Rookie bonus' },
      { xp: 15000, coins: 600, label: 'Beat cop bonus' },
      { xp: 35000, coins: 1200, label: 'Detective bonus' },
      { xp: 70000, coins: 2500, label: 'Captain bonus' },
      { xp: 120000, coins: 5000, label: 'Commissioner bonus' },
    ],
    preview: [],
  },
  {
    id: 's2', number: 2, name: 'Neon Force', tagline: 'Future cops. Hover bikes. A city that never dims.',
    colors: ['#ff2fb3', '#3b2bff'], starts: '2027-01-01', ends: '2027-01-08',
    characters: [], missions: [], rewards: [],
    preview: ['Futuristic police characters', 'Advanced pursuit vehicles', 'Neon city environments'],
  },
  {
    id: 's3', number: 3, name: 'Undercover', tagline: 'Plain clothes. Deep cover. No backup.',
    colors: ['#1f2a44', '#8a94a8'], starts: '2027-01-08', ends: '2027-01-15',
    characters: [], missions: [], rewards: [],
    preview: ['Tactical plain-clothes officers', 'Stealth-themed environments', 'Special sting operations'],
  },
];

export type SeasonStatus = 'live' | 'upcoming' | 'ended';
export function seasonStatus(s: SeasonDef, now = new Date()): SeasonStatus {
  const t = now.toISOString().slice(0, 10);
  return t < s.starts ? 'upcoming' : t >= s.ends ? 'ended' : 'live';
}
/** The live season with content, falling back to the latest one that has any. */
export function currentSeason(now = new Date()): SeasonDef {
  return SEASONS.find((s) => seasonStatus(s, now) === 'live' && s.characters.length) ?? [...SEASONS].reverse().find((s) => s.characters.length)!;
}
