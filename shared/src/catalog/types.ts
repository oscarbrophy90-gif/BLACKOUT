import type { Rarity } from '../types.ts'
import type {
  CameraId, EffectId, EmissiveId, FinishId, MotionId, MoveId, ParticleId,
  PatternId, PropId, ShapeId, SlotId,
} from './vocab.ts'

// The master item schema. Every one of the 2,000 shop items is one of
// these four records; the shop, the previews, the podium, the viewmodel
// and the character rig all read them.

export type Category = 'celebration' | 'emote' | 'weaponSkin' | 'accessory'

export const CATEGORY_LABEL: Record<Category, string> = {
  celebration: 'Win Celebrations',
  emote: 'Emotes',
  weaponSkin: 'Weapon Skins',
  accessory: 'Accessories',
}

export const CATEGORY_PREFIX: Record<Category, string> = {
  celebration: 'WC',
  emote: 'EM',
  weaponSkin: 'WS',
  accessory: 'AC',
}

/** Shop price per rarity — tune here, never in items. */
export const SHOP_PRICE: Record<Rarity, number> = {
  common: 250,
  uncommon: 500,
  rare: 1000,
  epic: 1600,
  legendary: 2500,
  mythic: 5000,
  exotic: 10000,
}

/** A performed animation: the character rig plays these in order. */
export interface AnimSpec {
  /** 1–6 moves from MOVES, played in sequence. */
  moves: MoveId[]
  /** Playback speed multiplier, 0.6 (stately) … 1.6 (frantic). */
  tempo: number
  /** Held/summoned props from PROPS ('none' allowed). */
  props: PropId[]
  /** Layered effects from EFFECTS ('none' allowed). */
  effects: EffectId[]
  /** Two hex colours the effects and props are tinted with. */
  palette: [string, string]
  camera: CameraId
  /** Emotes may loop; celebrations play once. */
  loop: boolean
}

export interface SkinSpec {
  pattern: PatternId
  /** body, accent, trim hex colours. */
  palette: [string, string, string]
  finish: FinishId
  emissive: EmissiveId
  particles: ParticleId
  /** Free-text theme tag (military, cyber, lava, …) for filtering. */
  theme: string
}

export interface AccSpec {
  slot: SlotId
  shape: ShapeId
  palette: [string, string, string]
  emissive: boolean
  motion: MotionId
  particles: ParticleId
  /** Size multiplier around 1. */
  scale: number
}

interface Base {
  id: string
  name: string
  rarity: Rarity
  description: string
}

export interface CelebrationItem extends Base {
  category: 'celebration'
  anim: AnimSpec
}
export interface EmoteItem extends Base {
  category: 'emote'
  anim: AnimSpec
}
export interface WeaponSkinItem extends Base {
  category: 'weaponSkin'
  skin: SkinSpec
}
export interface AccessoryItem extends Base {
  category: 'accessory'
  acc: AccSpec
}

export type CatalogItem = CelebrationItem | EmoteItem | WeaponSkinItem | AccessoryItem

export function priceOf(item: CatalogItem): number {
  return SHOP_PRICE[item.rarity]
}

/** Required count per rarity in every 500-item category. */
export const RARITY_QUOTA: Record<Rarity, number> = {
  common: 200,
  uncommon: 120,
  rare: 80,
  epic: 50,
  legendary: 35,
  mythic: 10,
  exotic: 5,
}
export const CATEGORY_SIZE = 500

// Compact authoring helpers used by the four catalogue files.
export function celebration(id: string, name: string, rarity: Rarity, description: string, anim: AnimSpec): CelebrationItem {
  return { id, name, rarity, description, category: 'celebration', anim }
}
export function emote(id: string, name: string, rarity: Rarity, description: string, anim: AnimSpec): EmoteItem {
  return { id, name, rarity, description, category: 'emote', anim }
}
export function weaponSkin(id: string, name: string, rarity: Rarity, description: string, skin: SkinSpec): WeaponSkinItem {
  return { id, name, rarity, description, category: 'weaponSkin', skin }
}
export function accessory(id: string, name: string, rarity: Rarity, description: string, acc: AccSpec): AccessoryItem {
  return { id, name, rarity, description, category: 'accessory', acc }
}

/** The design signature — two items with the same signature are the same
 *  design with a different name, which the catalogue forbids. */
export function designSignature(item: CatalogItem): string {
  switch (item.category) {
    case 'celebration':
    case 'emote':
      return `${item.category}|${item.anim.moves.join(',')}|${item.anim.props.join(',')}|${item.anim.effects.join(',')}`
    case 'weaponSkin':
      return `skin|${item.skin.pattern}|${item.skin.finish}|${item.skin.emissive}|${item.skin.particles}|${item.skin.palette.join(',')}`
    case 'accessory':
      return `acc|${item.acc.slot}|${item.acc.shape}|${item.acc.motion}|${item.acc.particles}|${item.acc.emissive}|${item.acc.palette.join(',')}`
  }
}
