import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DRAW_WEIGHTS, EXOTIC_CHANCE, MYTHIC_CHANCE, ROTATION_MS, SHOP_CATEGORIES, SHOP_SLOTS,
  formatCountdown, msUntilRotation, rotationKey, shopRotation,
} from '../src/shop.ts'

test('rotation keys change every 15 minutes and the countdown counts down to it', () => {
  assert.equal(ROTATION_MS, 15 * 60 * 1000)
  const t0 = 1_700_000_000_000
  const k = rotationKey(t0)
  assert.equal(rotationKey(t0 + 1000), k)
  assert.equal(rotationKey(t0 + ROTATION_MS), k + 1)
  const left = msUntilRotation(t0)
  assert.ok(left > 0 && left <= ROTATION_MS)
  assert.equal(rotationKey(t0 + left), k + 1)
  assert.equal(formatCountdown(14 * 60 * 1000 + 32 * 1000), '14:32')
  assert.equal(formatCountdown(0), '0:00')
})

test('a rotation is deterministic, shows exactly SHOP_SLOTS per category, and is all-new next time', () => {
  assert.equal(SHOP_SLOTS, 20)
  const a = shopRotation(1234)
  const b = shopRotation(1234)
  assert.deepEqual(a.perCategory.celebration.map((i) => i.id), b.perCategory.celebration.map((i) => i.id))
  for (const cat of SHOP_CATEGORIES) {
    const items = a.perCategory[cat]
    assert.equal(items.length, SHOP_SLOTS, cat)
    assert.equal(new Set(items.map((i) => i.id)).size, SHOP_SLOTS, `${cat} has duplicates`)
    for (const it of items) assert.equal(it.category, cat)
    // Sorted best-first so the fanfare sits at the top of the grid.
    const order = ['exotic', 'mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common']
    for (let i = 1; i < items.length; i++) assert.ok(order.indexOf(items[i - 1].rarity) <= order.indexOf(items[i].rarity))
  }
  const c = shopRotation(1235)
  const overlap = a.perCategory.emote.filter((i) => c.perCategory.emote.some((j) => j.id === i.id)).length
  assert.ok(overlap < SHOP_SLOTS / 2, `rotations should differ, overlap ${overlap}`)
})

test('mythic and exotic are luck rolls, not the normal draw', () => {
  assert.ok(DRAW_WEIGHTS.every(([r]) => r !== 'mythic' && r !== 'exotic'))
  assert.ok(MYTHIC_CHANCE > EXOTIC_CHANCE)
  let mythics = 0
  let exotics = 0
  let both = 0
  const N = 600
  for (let k = 0; k < N; k++) {
    const rot = shopRotation(k)
    let m = 0
    let e = 0
    for (const cat of SHOP_CATEGORIES) {
      m += rot.perCategory[cat].filter((i) => i.rarity === 'mythic').length
      e += rot.perCategory[cat].filter((i) => i.rarity === 'exotic').length
    }
    assert.ok(m <= 1 && e <= 1, `rotation ${k} has ${m} mythic ${e} exotic`)
    assert.equal(m, rot.mythicIn ? 1 : 0)
    assert.equal(e, rot.exoticIn ? 1 : 0)
    if (m) mythics++
    if (e) exotics++
    if (m && e) both++
  }
  // Occasionally a Mythic, very rarely an Exotic, extremely rarely both.
  assert.ok(mythics / N > 0.04 && mythics / N < 0.2, `mythic rate ${mythics / N}`)
  assert.ok(exotics / N > 0.003 && exotics / N < 0.08, `exotic rate ${exotics / N}`)
  assert.ok(both < mythics && both < exotics + 1)
  assert.ok(mythics > exotics)
})

test('common dominates the normal draw and legendary is the ceiling', () => {
  const counts: Record<string, number> = {}
  for (let k = 0; k < 200; k++) {
    for (const cat of SHOP_CATEGORIES) {
      for (const it of shopRotation(k).perCategory[cat]) counts[it.rarity] = (counts[it.rarity] ?? 0) + 1
    }
  }
  assert.ok(counts.common > counts.uncommon && counts.uncommon > counts.rare && counts.rare > counts.epic && counts.epic > counts.legendary)
  assert.ok(counts.legendary > 0)
})
