// Core enums and small value types shared by client, server and tests.

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'exotic'] as const
export type Rarity = (typeof RARITIES)[number]

export const RARITY_RANK: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
  exotic: 6,
}

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#9aa3ad',
  uncommon: '#4fc46f',
  rare: '#3d9bff',
  epic: '#b45cff',
  legendary: '#ffa733',
  mythic: '#ff4d6a',
  exotic: '#39f0e0',
}

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
  mythic: 'Mythic',
  exotic: 'Exotic',
}

/** In-fiction rarity stamps: grid-hardware certification grades. */
export const RARITY_CERT: Record<Rarity, string> = {
  common: 'Uncertified',
  uncommon: 'Bench-Tested',
  rare: 'Line-Certified',
  epic: 'Industrial',
  legendary: 'Mil-Spec',
  mythic: 'Prototype',
  exotic: 'Surge-Rated',
}

export const WEAPON_CLASSES = ['ar', 'smg', 'shotgun', 'sniper', 'dmr', 'pistol'] as const
export type WeaponClass = (typeof WEAPON_CLASSES)[number]

export const WEAPON_CLASS_LABEL: Record<WeaponClass, string> = {
  ar: 'Assault Rifle',
  smg: 'SMG',
  shotgun: 'Shotgun',
  sniper: 'Sniper Rifle',
  dmr: 'Marksman Rifle',
  pistol: 'Pistol',
}

export const AMMO_TYPES = ['light', 'medium', 'heavy', 'shell'] as const
export type AmmoType = (typeof AMMO_TYPES)[number]

export const AMMO_LABEL: Record<AmmoType, string> = {
  light: 'Light rounds',
  medium: 'Medium rounds',
  heavy: 'Heavy rounds',
  shell: 'Shells',
}

/** Things that can lie on the ground or come out of a crate. */
export type ItemKind =
  | { type: 'weapon'; weaponId: string; rarity: Rarity }
  | { type: 'ammo'; ammo: AmmoType; amount: number }
  | { type: 'heal'; healId: string; amount: number }
  | { type: 'armor'; armorId: string }

export interface HealDef {
  id: string
  name: string
  /** Health restored (shield items restore armor instead). */
  heals: number
  restoresArmor: boolean
  useTime: number // seconds, channelled
  stack: number // max carried per inventory slot
}

export interface ArmorDef {
  id: string
  name: string
  rarity: Rarity
  armor: number // armor points granted (replaces, never stacks)
}

export interface Vec2 {
  x: number
  z: number
}

export function dist2d(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.hypot(dx, dz)
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
