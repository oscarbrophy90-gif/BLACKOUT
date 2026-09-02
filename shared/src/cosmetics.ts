import type { Rarity } from './types.ts'

// Suits are the one cosmetic outside the 2,000-item catalogue: the base
// body/trim/visor colours of the Linewalker. Pure paint, never stats.

export interface SuitDef {
  id: string
  name: string
  rarity: Rarity
  /** suit, trim, visor-emissive hex colors. */
  colors: [string, string, string]
}

export const SUITS: readonly SuitDef[] = [
  { id: 'su_contract', name: 'Contract Standard', rarity: 'common', colors: ['#3a4148', '#22262b', '#ffc247'] },
  { id: 'su_ember', name: 'Ember Crew', rarity: 'uncommon', colors: ['#4a2d20', '#2b1a12', '#ff7a3d'] },
  { id: 'su_tidal', name: 'Tidal Crew', rarity: 'uncommon', colors: ['#24424d', '#142830', '#66d9e8'] },
  { id: 'su_moss', name: 'Mosswalker', rarity: 'rare', colors: ['#33472e', '#1d2b1a', '#7fe08a'] },
  { id: 'su_graphite', name: 'Graphite Ghost', rarity: 'rare', colors: ['#26282c', '#141518', '#9aa3ad'] },
  { id: 'su_sodium', name: 'Sodium Warden', rarity: 'epic', colors: ['#57431f', '#332714', '#ffc247'] },
  { id: 'su_indigo', name: 'Indigo Line', rarity: 'epic', colors: ['#2c2a54', '#181633', '#7d6bff'] },
  { id: 'su_shimmer', name: 'Shimmerborn', rarity: 'legendary', colors: ['#1f2f4d', '#101a2e', '#39f0e0'] },
  { id: 'su_surge', name: 'Ninth Surge Survivor', rarity: 'mythic', colors: ['#141018', '#0a070d', '#ff2d55'] },
  { id: 'su_lastlight', name: 'The Last Light', rarity: 'exotic', colors: ['#0a0a10', '#050508', '#ffffff'] },
] as const
