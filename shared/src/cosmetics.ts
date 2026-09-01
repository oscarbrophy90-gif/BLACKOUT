import { makeRng, deriveSeed, shuffle } from './rng.ts'
import type { Rarity } from './types.ts'

// Cosmetics are pure paint: colors and small procedural meshes, never stats.
// Everything here is buyable with coins earned by playing.

export const PRICE_BY_RARITY: Record<Rarity, number> = {
  common: 100,
  uncommon: 200,
  rare: 400,
  epic: 700,
  legendary: 1200,
  mythic: 2000,
  exotic: 3500,
}

export interface WeaponSkinDef {
  id: string
  name: string
  rarity: Rarity
  /** body, accent, emissive-trim hex colors applied to the viewmodel. */
  colors: [string, string, string]
  /** exotic/mythic skins animate their emissive trim. */
  animated: boolean
}

export const WEAPON_SKINS: readonly WeaponSkinDef[] = [
  { id: 'ws_issue', name: 'Standard Issue', rarity: 'common', colors: ['#3c4450', '#2a2f38', '#8899aa'], animated: false },
  { id: 'ws_safety', name: 'Safety Orange', rarity: 'common', colors: ['#b8541f', '#3a3a3a', '#ffb066'], animated: false },
  { id: 'ws_moss', name: 'Glasspine Moss', rarity: 'uncommon', colors: ['#3d5c3a', '#26301f', '#7fe08a'], animated: false },
  { id: 'ws_tide', name: 'Breakwater Tide', rarity: 'uncommon', colors: ['#2e4e5e', '#1d2f3a', '#66d9e8'], animated: false },
  { id: 'ws_sodium', name: 'Sodium Lamp', rarity: 'rare', colors: ['#5a4a2e', '#33291a', '#ffc247'], animated: false },
  { id: 'ws_graph', name: 'Graphite Cut', rarity: 'rare', colors: ['#23262b', '#15171a', '#c8d2dc'], animated: false },
  { id: 'ws_cinder', name: 'Cinderline', rarity: 'epic', colors: ['#4a2020', '#2b0f0f', '#ff5c33'], animated: false },
  { id: 'ws_grid', name: 'Live Grid', rarity: 'epic', colors: ['#1d2b3a', '#101a24', '#39f0e0'], animated: true },
  { id: 'ws_aurora', name: 'Shimmerwake', rarity: 'legendary', colors: ['#26214d', '#141029', '#7d6bff'], animated: true },
  { id: 'ws_meltdown', name: 'Meltdown', rarity: 'legendary', colors: ['#3d2413', '#1f0f05', '#ff8c1a'], animated: true },
  { id: 'ws_ninth', name: 'Ninth Surge', rarity: 'mythic', colors: ['#101018', '#05050a', '#ff2d55'], animated: true },
  { id: 'ws_flatline', name: 'Flatline', rarity: 'exotic', colors: ['#050508', '#000000', '#39f0e0'], animated: true },
] as const

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

export interface CharmDef {
  id: string
  name: string
  rarity: Rarity
  shape: 'cube' | 'bolt' | 'star' | 'skull' | 'moth' | 'fuse' | 'planet' | 'dice'
  color: string
}

export const CHARMS: readonly CharmDef[] = [
  { id: 'ch_fuse', name: 'Blown Fuse', rarity: 'common', shape: 'fuse', color: '#c8d2dc' },
  { id: 'ch_dice', name: 'Salvage Dice', rarity: 'uncommon', shape: 'dice', color: '#ffc247' },
  { id: 'ch_bolt', name: 'Live Bolt', rarity: 'rare', shape: 'bolt', color: '#39f0e0' },
  { id: 'ch_star', name: 'Pylon Star', rarity: 'rare', shape: 'star', color: '#7d6bff' },
  { id: 'ch_moth', name: 'Glass Moth', rarity: 'epic', shape: 'moth', color: '#7fe08a' },
  { id: 'ch_planet', name: 'Dead Satellite', rarity: 'legendary', shape: 'planet', color: '#66d9e8' },
  { id: 'ch_skull', name: 'Ninth Surge Skull', rarity: 'mythic', shape: 'skull', color: '#ff2d55' },
  { id: 'ch_cube', name: 'The Black Box', rarity: 'exotic', shape: 'cube', color: '#0a0a10' },
] as const

export interface EmoteDef {
  id: string
  name: string
  rarity: Rarity
  /** Animation the lobby/victory character plays. */
  anim: 'wave' | 'flex' | 'spin' | 'sit' | 'point' | 'salute'
}

export const EMOTES: readonly EmoteDef[] = [
  { id: 'em_wave', name: 'Shift Change', rarity: 'common', anim: 'wave' },
  { id: 'em_salute', name: 'Contract Complete', rarity: 'uncommon', anim: 'salute' },
  { id: 'em_point', name: 'Third Rail', rarity: 'uncommon', anim: 'point' },
  { id: 'em_sit', name: 'Union Break', rarity: 'rare', anim: 'sit' },
  { id: 'em_flex', name: 'High Voltage', rarity: 'epic', anim: 'flex' },
  { id: 'em_spin', name: 'Turbine', rarity: 'legendary', anim: 'spin' },
] as const

export type CosmeticKind = 'weaponSkin' | 'suit' | 'charm' | 'emote'

export interface ShopEntry {
  kind: CosmeticKind
  id: string
  name: string
  rarity: Rarity
  price: number
}

const ALL_ENTRIES: readonly ShopEntry[] = [
  ...WEAPON_SKINS.map((s) => ({ kind: 'weaponSkin' as const, id: s.id, name: s.name, rarity: s.rarity, price: PRICE_BY_RARITY[s.rarity] })),
  ...SUITS.map((s) => ({ kind: 'suit' as const, id: s.id, name: s.name, rarity: s.rarity, price: PRICE_BY_RARITY[s.rarity] })),
  ...CHARMS.map((c) => ({ kind: 'charm' as const, id: c.id, name: c.name, rarity: c.rarity, price: PRICE_BY_RARITY[c.rarity] })),
  ...EMOTES.map((e) => ({ kind: 'emote' as const, id: e.id, name: e.name, rarity: e.rarity, price: PRICE_BY_RARITY[e.rarity] })),
]

/** Free starter cosmetics every account owns. */
export const DEFAULT_OWNED: readonly string[] = ['ws_issue', 'su_contract', 'em_wave']

/**
 * The rotating shop: 6 slots per day, seeded by dayKey, always at least one
 * legendary-or-better feature. Never sells the starter items.
 */
export function shopForDay(dayKey: number): ShopEntry[] {
  const rng = makeRng(deriveSeed(dayKey, 'shop'))
  const pool = ALL_ENTRIES.filter((e) => !DEFAULT_OWNED.includes(e.id))
  const shuffled = shuffle(rng, pool)
  const featured = shuffled.filter((e) => e.rarity === 'legendary' || e.rarity === 'mythic' || e.rarity === 'exotic')
  const daily = shuffled.filter((e) => !featured.slice(0, 2).includes(e))
  return [...featured.slice(0, 2), ...daily.slice(0, 4)]
}

export function findCosmetic(id: string): ShopEntry | undefined {
  return ALL_ENTRIES.find((e) => e.id === id)
}
