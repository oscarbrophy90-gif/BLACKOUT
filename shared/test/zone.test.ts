import test from 'node:test'
import assert from 'node:assert/strict'
import { ZONE_PHASES, nextCircle, lerpCircle, isInside, totalZoneSeconds } from '../src/zone.ts'
import { makeRng } from '../src/rng.ts'
import { dist2d } from '../src/types.ts'

test('phases strictly shrink to zero and escalate damage', () => {
  let prev = 1
  let prevDps = 0
  for (const p of ZONE_PHASES) {
    assert.ok(p.radiusFrac < prev, 'radius must shrink')
    assert.ok(p.dps > prevDps, 'dps must escalate')
    prev = p.radiusFrac
    prevDps = p.dps
  }
  assert.equal(ZONE_PHASES[ZONE_PHASES.length - 1].radiusFrac, 0)
})

test('match length lands in the 8-12 minute band', () => {
  const t = totalZoneSeconds()
  assert.ok(t >= 8 * 60 && t <= 12 * 60, `zone runs ${t}s`)
})

test('next circle is always contained in the current one', () => {
  const rng = makeRng(1234)
  const island = 950
  for (let trial = 0; trial < 500; trial++) {
    let cur = { center: { x: 0, z: 0 }, radius: 900 }
    for (const p of ZONE_PHASES) {
      const next = nextCircle(rng, cur, 900 * p.radiusFrac, island)
      const gap = dist2d(cur.center, next.center) + next.radius
      assert.ok(gap <= cur.radius + 1e-6, `next circle leaks out by ${gap - cur.radius}`)
      cur = next
    }
  }
})

test('the wall interpolates and clamps', () => {
  const a = { center: { x: 0, z: 0 }, radius: 100 }
  const b = { center: { x: 50, z: 0 }, radius: 40 }
  assert.deepEqual(lerpCircle(a, b, 0), a)
  assert.deepEqual(lerpCircle(a, b, 1), b)
  assert.deepEqual(lerpCircle(a, b, 2), b)
  const mid = lerpCircle(a, b, 0.5)
  assert.equal(mid.radius, 70)
  assert.ok(isInside(mid, { x: 25, z: 0 }))
  assert.ok(!isInside(mid, { x: 25, z: 71 }))
})
