import test from 'node:test'
import assert from 'node:assert/strict'
import { RARITY_WEIGHTS, rollGroundItem, rollCrate, crateTierForGrade, supplyDropTier, CRATE_TIERS } from '../src/loot.ts'
import { makeRng } from '../src/rng.ts'
import { RARITY_RANK } from '../src/types.ts'
import { WEAPON_BY_ID } from '../src/weapons.ts'
import { HEAL_BY_ID, ARMOR_BY_ID } from '../src/items.ts'

function meanRarity(weights: readonly (readonly [string, number])[]): number {
  let total = 0
  let sum = 0
  for (const [r, w] of weights) {
    total += w
    sum += RARITY_RANK[r as keyof typeof RARITY_RANK] * w
  }
  return sum / total
}

test('each crate tier is strictly better than the one below', () => {
  let prev = meanRarity(RARITY_WEIGHTS.ground)
  for (const tier of CRATE_TIERS) {
    const m = meanRarity(RARITY_WEIGHTS[tier])
    assert.ok(m > prev, `${tier} mean rarity ${m} <= ${prev}`)
    prev = m
  }
})

test('ground loot always resolves to a real item', () => {
  const rng = makeRng(42)
  for (let i = 0; i < 2000; i++) {
    const item = rollGroundItem(rng)
    if (item.type === 'weapon') {
      assert.ok(WEAPON_BY_ID.has(item.weaponId))
      const def = WEAPON_BY_ID.get(item.weaponId)!
      assert.ok(RARITY_RANK[item.rarity] >= RARITY_RANK[def.floorRarity], 'floor rarity respected')
    } else if (item.type === 'heal') {
      assert.ok(HEAL_BY_ID.has(item.healId))
      assert.ok(item.amount >= 1)
    } else if (item.type === 'armor') {
      assert.ok(ARMOR_BY_ID.has(item.armorId))
    } else {
      assert.ok(item.amount > 0)
    }
  }
})

test('every crate carries a weapon and ammo', () => {
  const rng = makeRng(7)
  for (const tier of CRATE_TIERS) {
    for (let i = 0; i < 200; i++) {
      const items = rollCrate(rng, tier)
      assert.ok(items.some((it) => it.type === 'weapon'), tier)
      assert.ok(items.some((it) => it.type === 'ammo'), tier)
      assert.ok(items.length >= 3 && items.length <= 6, tier)
    }
  }
})

test('higher-grade districts spawn better crates', () => {
  const rng = makeRng(99)
  const mean = (grade: 1 | 2 | 3) => {
    let sum = 0
    const n = 3000
    for (let i = 0; i < n; i++) {
      sum += CRATE_TIERS.indexOf(crateTierForGrade(rng, grade))
    }
    return sum / n
  }
  const g1 = mean(1)
  const g2 = mean(2)
  const g3 = mean(3)
  assert.ok(g2 > g1 && g3 > g2, `grades ${g1} ${g2} ${g3}`)
})

test('supply drops are always endgame-tier', () => {
  const rng = makeRng(5)
  for (let i = 0; i < 500; i++) {
    const tier = supplyDropTier(rng)
    assert.ok(['legendary', 'mythic', 'exotic'].includes(tier))
  }
})
