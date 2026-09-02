import { makeRng, deriveSeed, pickWeighted } from './rng.ts'
import type { Rng } from './rng.ts'
import type { Rarity } from './types.ts'
import { BY_CATEGORY } from './catalog/index.ts'
import type { CatalogItem, Category } from './catalog/types.ts'

// The live shop. Every ROTATION_MS a new seed picks SLOTS items per
// category from the 500-item pool, rarity-weighted, with a separate luck
// roll for a Mythic and an Exotic so those feel like events. Deterministic
// per rotation key: every client (and later the server) agrees on the
// exact same shop for the same 15-minute window.

export const ROTATION_MS = 15 * 60 * 1000
/** Items visible per category per rotation. */
export const SHOP_SLOTS = 20
export const SHOP_CATEGORIES: Category[] = ['celebration', 'emote', 'weaponSkin', 'accessory']

/** Base draw weights — Common → Legendary only; Mythic/Exotic are luck. */
export const DRAW_WEIGHTS: readonly (readonly [Rarity, number])[] = [
  ['common', 52], ['uncommon', 26], ['rare', 13], ['epic', 6.5], ['legendary', 2.5],
]

/** Per-rotation luck: chance that ONE Mythic / ONE Exotic appears somewhere. */
export const MYTHIC_CHANCE = 0.1
export const EXOTIC_CHANCE = 0.025

export function rotationKey(nowMs: number): number {
  return Math.floor(nowMs / ROTATION_MS)
}

export function msUntilRotation(nowMs: number): number {
  return ROTATION_MS - (nowMs % ROTATION_MS)
}

export interface ShopRotation {
  key: number
  perCategory: Record<Category, CatalogItem[]>
  /** Which categories got the lucky drops, for the UI fanfare. */
  mythicIn: Category | null
  exoticIn: Category | null
}

function drawFrom(rng: Rng, pool: readonly CatalogItem[], rarity: Rarity, taken: Set<string>): CatalogItem | null {
  const candidates = pool.filter((it) => it.rarity === rarity && !taken.has(it.id))
  if (candidates.length === 0) return null
  return candidates[Math.floor(rng() * candidates.length)]
}

export function shopRotation(key: number): ShopRotation {
  const rng = makeRng(deriveSeed(key, 'shop-rotation'))
  const mythicHit = rng() < MYTHIC_CHANCE
  const exoticHit = rng() < EXOTIC_CHANCE
  const mythicIn = mythicHit ? SHOP_CATEGORIES[Math.floor(rng() * SHOP_CATEGORIES.length)] : null
  const exoticIn = exoticHit ? SHOP_CATEGORIES[Math.floor(rng() * SHOP_CATEGORIES.length)] : null

  const perCategory = {} as Record<Category, CatalogItem[]>
  for (const cat of SHOP_CATEGORIES) {
    const pool = BY_CATEGORY[cat]
    const taken = new Set<string>()
    const picks: CatalogItem[] = []
    const lucky: Rarity[] = []
    if (mythicIn === cat) lucky.push('mythic')
    if (exoticIn === cat) lucky.push('exotic')
    for (const r of lucky) {
      const it = drawFrom(rng, pool, r, taken)
      if (it) {
        taken.add(it.id)
        picks.push(it)
      }
    }
    let guard = 0
    while (picks.length < SHOP_SLOTS && guard++ < 400) {
      const rarity = pickWeighted(rng, DRAW_WEIGHTS)
      const it = drawFrom(rng, pool, rarity, taken)
      if (!it) continue
      taken.add(it.id)
      picks.push(it)
    }
    // Best items first so the fanfare sits at the top of the grid.
    const order: Rarity[] = ['exotic', 'mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common']
    picks.sort((a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity))
    perCategory[cat] = picks
  }
  return { key, perCategory, mythicIn, exoticIn }
}

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
