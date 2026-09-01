import { makeRng, deriveSeed, shuffle } from './rng.ts'

// Daily and weekly contracts. Progress accumulates across matches within the
// day/week window; the client stores progress, the future server audits it.

export interface MatchMetrics {
  kills: number
  headshotKills: number
  blackoutKills: number
  cratesOpened: number
  survivalSeconds: number
  distance: number // metres travelled
  top10: number // 0 or 1 per match
  top25: number
  wins: number
  rareWeaponsFound: number // rarity >= rare picked up
  damageDealt: number
  healsUsed: number
}

export type Metric = keyof MatchMetrics

export interface ChallengeDef {
  id: string
  label: string
  metric: Metric
  target: number
  xp: number
  coins: number
}

const DAILY_POOL: readonly ChallengeDef[] = [
  { id: 'd_survive10', label: 'Stay on the line 10 minutes (total)', metric: 'survivalSeconds', target: 600, xp: 150, coins: 30 },
  { id: 'd_crates5', label: 'Open 5 crates', metric: 'cratesOpened', target: 5, xp: 120, coins: 25 },
  { id: 'd_rare3', label: 'Find 3 Line-Certified or better weapons', metric: 'rareWeaponsFound', target: 3, xp: 130, coins: 25 },
  { id: 'd_travel2k', label: 'Travel 2 km on foot', metric: 'distance', target: 2000, xp: 100, coins: 20 },
  { id: 'd_elim3', label: 'Eliminate 3 Linewalkers', metric: 'kills', target: 3, xp: 160, coins: 35 },
  { id: 'd_top10', label: 'Finish in the top 10', metric: 'top10', target: 1, xp: 180, coins: 40 },
  { id: 'd_dark1', label: 'Eliminate someone during a Blackout', metric: 'blackoutKills', target: 1, xp: 200, coins: 45 },
  { id: 'd_dmg800', label: 'Deal 800 damage', metric: 'damageDealt', target: 800, xp: 140, coins: 30 },
  { id: 'd_heal5', label: 'Use 5 healing items', metric: 'healsUsed', target: 5, xp: 90, coins: 20 },
  { id: 'd_head2', label: 'Score 2 headshot eliminations', metric: 'headshotKills', target: 2, xp: 170, coins: 35 },
] as const

const WEEKLY_POOL: readonly ChallengeDef[] = [
  { id: 'w_win3', label: 'Win 3 contracts', metric: 'wins', target: 3, xp: 900, coins: 250 },
  { id: 'w_top25x5', label: 'Finish top 25 five times', metric: 'top25', target: 5, xp: 500, coins: 120 },
  { id: 'w_crates25', label: 'Open 25 crates', metric: 'cratesOpened', target: 25, xp: 450, coins: 100 },
  { id: 'w_elim20', label: 'Eliminate 20 Linewalkers', metric: 'kills', target: 20, xp: 600, coins: 150 },
  { id: 'w_dark5', label: 'Eliminate 5 Linewalkers during Blackouts', metric: 'blackoutKills', target: 5, xp: 700, coins: 180 },
  { id: 'w_travel15k', label: 'Travel 15 km on foot', metric: 'distance', target: 15000, xp: 400, coins: 90 },
] as const

/** dayKey = whole days since epoch, computed by the caller. */
export function dailyChallenges(dayKey: number): ChallengeDef[] {
  const rng = makeRng(deriveSeed(dayKey, 'daily'))
  return shuffle(rng, DAILY_POOL).slice(0, 3)
}

/** weekKey = whole weeks since epoch, computed by the caller. */
export function weeklyChallenges(weekKey: number): ChallengeDef[] {
  const rng = makeRng(deriveSeed(weekKey, 'weekly'))
  return shuffle(rng, WEEKLY_POOL).slice(0, 3)
}

export function emptyMetrics(): MatchMetrics {
  return {
    kills: 0, headshotKills: 0, blackoutKills: 0, cratesOpened: 0,
    survivalSeconds: 0, distance: 0, top10: 0, top25: 0, wins: 0,
    rareWeaponsFound: 0, damageDealt: 0, healsUsed: 0,
  }
}

export function addMetrics(into: MatchMetrics, from: MatchMetrics): MatchMetrics {
  const out = { ...into }
  for (const k of Object.keys(from) as Metric[]) out[k] += from[k]
  return out
}
