import test from 'node:test'
import assert from 'node:assert/strict'
import { matchRewards, levelFromTotalXp, xpForNextLevel, placementXp } from '../src/xp.ts'
import { dailyChallenges, weeklyChallenges, emptyMetrics, addMetrics } from '../src/challenges.ts'
import { shopForDay, findCosmetic, DEFAULT_OWNED, WEAPON_SKINS, SUITS, CHARMS, EMOTES, PRICE_BY_RARITY } from '../src/cosmetics.ts'
import { makeCallsign } from '../src/names.ts'
import { makeRng } from '../src/rng.ts'

test('winning pays more than anything else', () => {
  const win = matchRewards({ placement: 1, players: 100, kills: 0, survivalSeconds: 600, cratesOpened: 0, headshotKills: 0 })
  const second = matchRewards({ placement: 2, players: 100, kills: 0, survivalSeconds: 600, cratesOpened: 0, headshotKills: 0 })
  assert.ok(win.xp > second.xp)
  assert.ok(win.coins > second.coins)
  assert.ok(win.breakdown.some((b) => b.label === 'LAST ONE STANDING'))
})

test('placement XP is monotone', () => {
  let prev = Infinity
  for (const place of [1, 3, 5, 10, 25, 50, 100]) {
    const xp = placementXp(place, 100)
    assert.ok(xp <= prev, `#${place}`)
    prev = xp
  }
})

test('level curve is increasing and total XP round-trips', () => {
  assert.ok(xpForNextLevel(10) > xpForNextLevel(1))
  const { level, into } = levelFromTotalXp(0)
  assert.equal(level, 1)
  assert.equal(into, 0)
  const later = levelFromTotalXp(10000)
  assert.ok(later.level > 3)
  assert.ok(later.into < later.needed)
})

test('daily and weekly rotations are deterministic and distinct per key', () => {
  const a = dailyChallenges(19999)
  const b = dailyChallenges(19999)
  assert.deepEqual(a, b)
  assert.equal(a.length, 3)
  const w = weeklyChallenges(2857)
  assert.equal(w.length, 3)
  const ids = new Set(a.map((c) => c.id))
  assert.equal(ids.size, 3)
})

test('metrics accumulate', () => {
  const m = addMetrics(emptyMetrics(), { ...emptyMetrics(), kills: 3, distance: 500 })
  const m2 = addMetrics(m, { ...emptyMetrics(), kills: 2 })
  assert.equal(m2.kills, 5)
  assert.equal(m2.distance, 500)
})

test('the shop rotates deterministically and never sells starters', () => {
  const s1 = shopForDay(20000)
  const s2 = shopForDay(20000)
  const s3 = shopForDay(20001)
  assert.deepEqual(s1, s2)
  assert.notDeepEqual(s1.map((e) => e.id), s3.map((e) => e.id))
  assert.equal(s1.length, 6)
  for (const e of s1) {
    assert.ok(!DEFAULT_OWNED.includes(e.id))
    assert.equal(e.price, PRICE_BY_RARITY[e.rarity])
  }
  assert.ok(['legendary', 'mythic', 'exotic'].includes(s1[0].rarity))
})

test('cosmetic ids are unique across kinds and findable', () => {
  const ids = [...WEAPON_SKINS, ...SUITS, ...CHARMS, ...EMOTES].map((c) => c.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const id of DEFAULT_OWNED) assert.ok(findCosmetic(id), id)
})

test('callsigns avoid collisions', () => {
  const rng = makeRng(11)
  const taken = new Set<string>()
  for (let i = 0; i < 99; i++) {
    const name = makeCallsign(rng, taken)
    assert.ok(!taken.has(name))
    taken.add(name)
  }
})
