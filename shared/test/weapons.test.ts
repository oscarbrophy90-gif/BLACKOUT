import test from 'node:test'
import assert from 'node:assert/strict'
import { WEAPONS, WEAPON_BY_ID, dps, rarityScaling, scaledDamage, scaledMag, signatureOf, MAKER_SIGNATURE } from '../src/weapons.ts'
import { WEAPON_CLASSES, RARITIES } from '../src/types.ts'
import { shotsToKill } from '../src/combat.ts'

test('every class has at least two weapons and ids are unique', () => {
  for (const cls of WEAPON_CLASSES) {
    assert.ok(WEAPONS.filter((w) => w.cls === cls).length >= 2, `${cls} needs weapons`)
  }
  assert.equal(WEAPON_BY_ID.size, WEAPONS.length)
})

test('every weapon is well-formed', () => {
  for (const w of WEAPONS) {
    assert.ok(w.damage > 0 && w.rpm > 0 && w.magSize > 0 && w.reloadTime > 0, w.id)
    assert.ok(w.near < w.far, w.id)
    assert.ok(w.falloffFloor > 0 && w.falloffFloor <= 1, w.id)
    assert.ok(w.headshotMult > 1, w.id)
    assert.ok(w.pellets >= 1, w.id)
    assert.ok(w.adsZoom >= 1.1, w.id)
    assert.ok(MAKER_SIGNATURE[w.maker], `${w.id} has unknown maker ${w.maker}`)
  }
})

test('rarity is an edge, never an auto-win', () => {
  for (const w of WEAPONS) {
    const floor = dps(w, w.floorRarity)
    const exotic = dps(w, 'exotic')
    assert.ok(exotic > floor, w.id)
    assert.ok(exotic / floor <= 1.25, `${w.id} exotic gains ${(exotic / floor).toFixed(2)}x`)
  }
})

test('rarity strictly improves damage/reload and never shrinks the mag', () => {
  for (const w of WEAPONS) {
    let lastDmg = 0
    let lastReload = Infinity
    let lastMag = 0
    for (const r of RARITIES) {
      const s = rarityScaling(w, r)
      const d = scaledDamage(w, r)
      const m = scaledMag(w, r)
      assert.ok(d >= lastDmg, w.id)
      assert.ok(s.reloadTime <= lastReload, w.id)
      assert.ok(m >= lastMag, w.id)
      lastDmg = d
      lastReload = s.reloadTime
      lastMag = m
    }
  }
})

test('time-to-kill a full kit stays in the fair band', () => {
  for (const w of WEAPONS) {
    const perShot = scaledDamage(w, w.floorRarity) * w.pellets
    const shots = shotsToKill(perShot)
    const ttk = ((shots - 1) * 60) / w.rpm
    assert.ok(ttk >= 0.15, `${w.id} melts too fast: ${ttk.toFixed(2)}s`)
    assert.ok(ttk <= 4.5, `${w.id} tickles: ${ttk.toFixed(2)}s`)
  }
})

test('snipers can one-shot a bare head, nothing one-shots a full-kit body', () => {
  const bolt = WEAPON_BY_ID.get('sn_bolt')!
  assert.ok(bolt.damage * bolt.headshotMult >= 100)
  for (const w of WEAPONS) {
    const perShot = scaledDamage(w, 'exotic') * w.pellets
    assert.ok(shotsToKill(perShot) >= 2, `${w.id} one-shots a full kit`)
  }
})

test('makers trade firepower against light signature', () => {
  const voskaya = signatureOf(WEAPON_BY_ID.get('sn_bolt')!)
  const halcyon = signatureOf(WEAPON_BY_ID.get('ar_vk')!)
  assert.ok(voskaya.tracerHang > halcyon.tracerHang)
  assert.ok(voskaya.bloom > halcyon.bloom)
})
