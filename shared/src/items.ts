import type { ArmorDef, HealDef } from './types.ts'

// Consumables and armor. Fictionally these are all pieces of Vantera's grid
// hardware wired into a Linewalker contract suit.

export const HEALS: readonly HealDef[] = [
  {
    id: 'trickle', name: 'Trickle Cell', heals: 30, restoresArmor: false,
    useTime: 2.6, stack: 6,
  },
  {
    id: 'medloop', name: 'Medloop Kit', heals: 100, restoresArmor: false,
    useTime: 5.5, stack: 2,
  },
  {
    id: 'surge', name: 'Surge Cell', heals: 25, restoresArmor: true,
    useTime: 2.2, stack: 6,
  },
  {
    id: 'capbank', name: 'Capacitor Bank', heals: 100, restoresArmor: true,
    useTime: 5.0, stack: 1,
  },
] as const

export const HEAL_BY_ID: ReadonlyMap<string, HealDef> = new Map(HEALS.map((h) => [h.id, h]))

export const ARMORS: readonly ArmorDef[] = [
  { id: 'vest_line', name: 'Linesman Vest', rarity: 'uncommon', armor: 50 },
  { id: 'vest_insul', name: 'Insulated Rig', rarity: 'rare', armor: 75 },
  { id: 'vest_faraday', name: 'Faraday Harness', rarity: 'epic', armor: 100 },
] as const

export const ARMOR_BY_ID: ReadonlyMap<string, ArmorDef> = new Map(ARMORS.map((a) => [a.id, a]))

/** How much ammo one pickup grants, by type. */
export const AMMO_PICKUP: Record<string, number> = {
  light: 30,
  medium: 30,
  heavy: 10,
  shell: 8,
}

/** Hard cap carried per ammo type. */
export const AMMO_CAP: Record<string, number> = {
  light: 240,
  medium: 240,
  heavy: 60,
  shell: 48,
}
