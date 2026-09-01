import test from 'node:test'
import assert from 'node:assert/strict'
import { applyHit, falloff, shotsToKill, MAX_HEALTH, MAX_ARMOR, ARMOR_ABSORB } from '../src/combat.ts'

test('armor soaks its share and never goes negative', () => {
  const r = applyHit({ health: 100, armor: 50 }, 40)
  assert.equal(r.vitals.armor, 50 - 40 * ARMOR_ABSORB)
  assert.ok(Math.abs(r.vitals.health - (100 - 40 * (1 - ARMOR_ABSORB))) < 1e-9)
  assert.equal(r.killed, false)
})

test('depleted armor stops helping', () => {
  const r = applyHit({ health: 100, armor: 5 }, 40)
  assert.equal(r.vitals.armor, 0)
  assert.ok(Math.abs(r.vitals.health - (100 - 35)) < 1e-9)
})

test('kills register exactly once', () => {
  const r = applyHit({ health: 10, armor: 0 }, 50)
  assert.equal(r.killed, true)
  const again = applyHit(r.vitals, 50)
  assert.equal(again.killed, false)
})

test('headshots multiply before armor', () => {
  const body = applyHit({ health: 100, armor: 0 }, 30)
  const head = applyHit({ health: 100, armor: 0 }, 30, 2)
  assert.equal(100 - head.vitals.health, 2 * (100 - body.vitals.health))
  assert.equal(head.headshot, true)
})

test('falloff is monotone and floored', () => {
  assert.equal(falloff(100, 10, 30, 80), 100)
  const mid = falloff(100, 55, 30, 80)
  assert.ok(mid < 100 && mid > 45)
  assert.equal(falloff(100, 500, 30, 80), 45)
})

test('full kit takes more shots than naked', () => {
  assert.ok(shotsToKill(25) > 4) // 4 shots kill naked 100hp
  assert.ok(shotsToKill(25) <= 9)
})

test('vitals constants are what the HUD assumes', () => {
  assert.equal(MAX_HEALTH, 100)
  assert.equal(MAX_ARMOR, 100)
})
