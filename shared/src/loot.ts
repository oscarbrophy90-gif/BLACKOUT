import type { Rng } from './rng.ts'
import { pick, pickWeighted, rangeInt } from './rng.ts'
import type { ItemKind, Rarity } from './types.ts'
import { AMMO_TYPES, RARITY_RANK } from './types.ts'
import { ARMORS, HEALS, AMMO_PICKUP } from './items.ts'
import { WEAPONS } from './weapons.ts'
import type { WeaponDef } from './weapons.ts'

// All loot odds live here. Crates, floor loot and supply drops roll against
// these tables; the tests assert the tiers actually get better.

export const CRATE_TIERS = ['normal', 'rare', 'epic', 'legendary', 'mythic', 'exotic'] as const
export type CrateTier = (typeof CRATE_TIERS)[number]

/** Rarity odds per source. Weights, not probabilities. */
export const RARITY_WEIGHTS: Record<'ground' | CrateTier, readonly (readonly [Rarity, number])[]> = {
  ground: [
    ['common', 42], ['uncommon', 30], ['rare', 16], ['epic', 8],
    ['legendary', 3], ['mythic', 0.8], ['exotic', 0.2],
  ],
  normal: [
    ['common', 30], ['uncommon', 34], ['rare', 22], ['epic', 10],
    ['legendary', 3.2], ['mythic', 0.6], ['exotic', 0.2],
  ],
  rare: [
    ['uncommon', 30], ['rare', 36], ['epic', 22], ['legendary', 9],
    ['mythic', 2.4], ['exotic', 0.6],
  ],
  epic: [
    ['rare', 30], ['epic', 38], ['legendary', 22], ['mythic', 8], ['exotic', 2],
  ],
  legendary: [
    ['epic', 30], ['legendary', 42], ['mythic', 20], ['exotic', 8],
  ],
  mythic: [
    ['legendary', 35], ['mythic', 45], ['exotic', 20],
  ],
  exotic: [
    ['mythic', 40], ['exotic', 60],
  ],
}

/** What kind of item ground loot is. */
const GROUND_KIND: readonly (readonly ['weapon' | 'ammo' | 'heal' | 'armor', number])[] = [
  ['weapon', 34], ['ammo', 30], ['heal', 22], ['armor', 14],
]

function rollWeaponAt(rng: Rng, rarity: Rarity): ItemKind {
  // A weapon whose floor is above the rolled rarity spawns at its floor —
  // snipers never spawn common, they just get rarer sources.
  const candidates = WEAPONS.filter((w) => RARITY_RANK[w.floorRarity] <= RARITY_RANK[rarity])
  const def: WeaponDef = candidates.length > 0 ? pick(rng, candidates) : pick(rng, WEAPONS)
  const finalRarity = RARITY_RANK[def.floorRarity] > RARITY_RANK[rarity] ? def.floorRarity : rarity
  return { type: 'weapon', weaponId: def.id, rarity: finalRarity }
}

function rollHeal(rng: Rng): ItemKind {
  const heal = pickWeighted(rng, [
    [HEALS[0], 40], // trickle
    [HEALS[1], 12], // medloop
    [HEALS[2], 36], // surge
    [HEALS[3], 12], // capbank
  ] as const)
  return { type: 'heal', healId: heal.id, amount: heal.id === 'trickle' || heal.id === 'surge' ? rangeInt(rng, 2, 3) : 1 }
}

function rollArmor(rng: Rng, source: 'ground' | CrateTier): ItemKind {
  const bias = source === 'ground' || source === 'normal' ? [55, 33, 12] : source === 'rare' ? [30, 45, 25] : [12, 38, 50]
  const armor = pickWeighted(rng, [
    [ARMORS[0], bias[0]],
    [ARMORS[1], bias[1]],
    [ARMORS[2], bias[2]],
  ] as const)
  return { type: 'armor', armorId: armor.id }
}

function rollAmmo(rng: Rng): ItemKind {
  const ammo = pick(rng, AMMO_TYPES)
  return { type: 'ammo', ammo, amount: AMMO_PICKUP[ammo] }
}

/** One piece of floor loot. */
export function rollGroundItem(rng: Rng): ItemKind {
  const kind = pickWeighted(rng, GROUND_KIND)
  switch (kind) {
    case 'weapon':
      return rollWeaponAt(rng, pickWeighted(rng, RARITY_WEIGHTS.ground))
    case 'ammo':
      return rollAmmo(rng)
    case 'heal':
      return rollHeal(rng)
    case 'armor':
      return rollArmor(rng, 'ground')
  }
}

/** Full contents of a crate: always a weapon, always ammo, plus extras. */
export function rollCrate(rng: Rng, tier: CrateTier): ItemKind[] {
  const items: ItemKind[] = []
  const weaponRarity = pickWeighted(rng, RARITY_WEIGHTS[tier])
  items.push(rollWeaponAt(rng, weaponRarity))
  items.push(rollAmmo(rng))
  const extras = tier === 'normal' ? rangeInt(rng, 1, 2) : rangeInt(rng, 2, 3)
  for (let i = 0; i < extras; i++) {
    const kind = pickWeighted(rng, [['heal', 45], ['armor', 30], ['ammo', 25]] as const)
    if (kind === 'heal') items.push(rollHeal(rng))
    else if (kind === 'armor') items.push(rollArmor(rng, tier))
    else items.push(rollAmmo(rng))
  }
  return items
}

/** Crate tier mix for a district loot grade (1 = outskirts, 3 = Substation Zero). */
export function crateTierForGrade(rng: Rng, grade: 1 | 2 | 3): CrateTier {
  if (grade === 1) {
    return pickWeighted(rng, [['normal', 74], ['rare', 20], ['epic', 5], ['legendary', 1]] as const)
  }
  if (grade === 2) {
    return pickWeighted(rng, [['normal', 50], ['rare', 30], ['epic', 14], ['legendary', 5], ['mythic', 1]] as const)
  }
  return pickWeighted(rng, [
    ['normal', 22], ['rare', 30], ['epic', 26], ['legendary', 14], ['mythic', 6], ['exotic', 2],
  ] as const)
}

/** The supply drop that falls mid-match is always worth fighting over. */
export function supplyDropTier(rng: Rng): CrateTier {
  return pickWeighted(rng, [['legendary', 55], ['mythic', 33], ['exotic', 12]] as const)
}
