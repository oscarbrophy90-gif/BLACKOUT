import { CELEBRATIONS } from './celebrations.ts'
import { EMOTES } from './emotes.ts'
import { WEAPON_SKINS_CATALOG } from './weaponskins.ts'
import { ACCESSORIES } from './accessories.ts'
import type { AccessoryItem, CatalogItem, Category, CelebrationItem, EmoteItem, WeaponSkinItem } from './types.ts'

export * from './types.ts'
export * from './vocab.ts'
export { validateCategory } from './validate.ts'
export { CELEBRATIONS, EMOTES, WEAPON_SKINS_CATALOG, ACCESSORIES }

/** The master database: 2,000 items, one Map, O(1) lookup. */
export const CATALOG: ReadonlyMap<string, CatalogItem> = new Map<string, CatalogItem>(
  [...CELEBRATIONS, ...EMOTES, ...WEAPON_SKINS_CATALOG, ...ACCESSORIES].map((it) => [it.id, it]),
)

export const BY_CATEGORY: Record<Category, readonly CatalogItem[]> = {
  celebration: CELEBRATIONS,
  emote: EMOTES,
  weaponSkin: WEAPON_SKINS_CATALOG,
  accessory: ACCESSORIES,
}

export const CELEBRATIONS_BY_ID: ReadonlyMap<string, CelebrationItem> = new Map(CELEBRATIONS.map((c) => [c.id, c]))
export const EMOTES_BY_ID: ReadonlyMap<string, EmoteItem> = new Map(EMOTES.map((c) => [c.id, c]))
export const WEAPON_SKINS_BY_ID: ReadonlyMap<string, WeaponSkinItem> = new Map(WEAPON_SKINS_CATALOG.map((c) => [c.id, c]))
export const ACCESSORIES_BY_ID: ReadonlyMap<string, AccessoryItem> = new Map(ACCESSORIES.map((c) => [c.id, c]))

/** The emote wheel: six slots, hold B to open. */
export const EMOTE_SLOTS = 6
/** Emotes every account owns; they fill the first wheel slots. */
export const STARTER_EMOTES: readonly string[] = ['EM_001', 'EM_002', 'EM_003']

/** Starter cosmetics every account owns and equips by default. */
export const STARTER_ITEMS = {
  celebration: 'WC_001',
  emote: 'EM_001',
  weaponSkin: 'WS_001',
  accessory: null as string | null,
}
