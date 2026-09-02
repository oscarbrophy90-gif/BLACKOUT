import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCESSORIES, BY_CATEGORY, CATALOG, CATEGORY_SIZE, CELEBRATIONS, EMOTES, RARITY_QUOTA, STARTER_ITEMS,
  WEAPON_SKINS_CATALOG, designSignature, priceOf, validateCategory,
} from '../src/catalog/index.ts'
import type { CatalogItem, Category } from '../src/catalog/index.ts'
import { SHOP_PRICE } from '../src/catalog/types.ts'
import { MOVES, PROPS, EFFECTS, PATTERNS, SHAPES } from '../src/catalog/vocab.ts'

const CATS: Category[] = ['celebration', 'emote', 'weaponSkin', 'accessory']

test('every category validates: 500 items, exact rarity quotas, unique names and designs', () => {
  for (const cat of CATS) {
    const problems = validateCategory(BY_CATEGORY[cat], cat)
    assert.deepEqual(problems, [], `${cat}: ${problems.slice(0, 5).join(' | ')}`)
    assert.equal(BY_CATEGORY[cat].length, CATEGORY_SIZE)
  }
})

test('the master catalogue holds exactly 2,000 unique ids', () => {
  assert.equal(CATALOG.size, 2000)
  assert.equal(CELEBRATIONS.length + EMOTES.length + WEAPON_SKINS_CATALOG.length + ACCESSORIES.length, 2000)
  const names = new Set<string>()
  for (const cat of CATS) {
    for (const it of BY_CATEGORY[cat]) names.add(`${cat}:${it.name.toLowerCase()}`)
  }
  assert.equal(names.size, 2000)
})

test('rarity quotas sum to a category and prices follow the rarity table', () => {
  const total = Object.values(RARITY_QUOTA).reduce((a, b) => a + b, 0)
  assert.equal(total, CATEGORY_SIZE)
  for (const it of CATALOG.values()) assert.equal(priceOf(it), SHOP_PRICE[it.rarity])
  assert.equal(SHOP_PRICE.legendary, 2500)
  assert.equal(SHOP_PRICE.mythic, 5000)
  assert.equal(SHOP_PRICE.exotic, 10000)
})

test('the mandated names exist at the right rarities', () => {
  const byName = (cat: Category) => new Map(BY_CATEGORY[cat].map((i) => [i.name, i]))
  const wc = byName('celebration')
  for (const n of ['Quick Point', 'Victory Nod', 'Air Punch']) assert.equal(wc.get(n)?.rarity, 'common', n)
  for (const n of ['Reality Breaker', 'Galaxy Throne', 'Time King', 'Dimension Shift', 'Ultimate Victory']) assert.equal(wc.get(n)?.rarity, 'exotic', n)
  const em = byName('emote')
  for (const n of ['Wave', 'Point', 'Clap', 'Taunt']) assert.equal(em.get(n)?.rarity, 'common', n)
  const ws = byName('weaponSkin')
  for (const n of ['Desert Camo', 'Scratched Metal']) assert.equal(ws.get(n)?.rarity, 'common', n)
  for (const n of ['Galaxy Core', 'Void Matter', 'Celestial Flame', 'Infinite Circuit', 'Storm God', 'Frozen Dimension', 'Solar Collapse', 'Neon Singularity', 'Cosmic Rift', 'Reality Engine']) assert.equal(ws.get(n)?.rarity, 'mythic', n)
  for (const n of ['Reality Rift', 'Infinite Galaxy', 'Void Emperor', 'Celestial Core', 'Universal Collapse']) assert.equal(ws.get(n)?.rarity, 'exotic', n)
  const ac = byName('accessory')
  for (const n of ['Baseball Cap', 'Simple Chain']) assert.equal(ac.get(n)?.rarity, 'common', n)
  for (const n of ['Floating Cosmic Crown', 'Shadow Wings', 'Energy Halo', 'Ancient Dragon Mask', 'Galaxy Backpack', 'Lightning Crown', 'Void Helmet', 'Celestial Wings', 'Holographic Guardian', 'Dimensional Aura']) assert.equal(ac.get(n)?.rarity, 'mythic', n)
  for (const n of ['Universe Crown', 'Reality Wings', 'Cosmic Guardian', 'Infinite Halo', 'Dimension Core']) assert.equal(ac.get(n)?.rarity, 'exotic', n)
})

test('starters resolve and are common', () => {
  for (const id of [STARTER_ITEMS.celebration, STARTER_ITEMS.emote, STARTER_ITEMS.weaponSkin]) {
    const it = CATALOG.get(id)
    assert.ok(it, id)
    assert.equal(it.rarity, 'common')
  }
})

test('items are recipes over the vocabulary, not recolours', () => {
  const sigs = new Map<string, CatalogItem>()
  for (const it of CATALOG.values()) {
    const sig = designSignature(it)
    assert.ok(!sigs.has(sig), `${it.id} duplicates ${sigs.get(sig)?.id}`)
    sigs.set(sig, it)
  }
  // Breadth: the catalogue actually uses the vocabulary it was built on.
  const used = { moves: new Set<string>(), props: new Set<string>(), effects: new Set<string>(), patterns: new Set<string>(), shapes: new Set<string>() }
  for (const it of CATALOG.values()) {
    if (it.category === 'celebration' || it.category === 'emote') {
      it.anim.moves.forEach((m) => used.moves.add(m))
      it.anim.props.forEach((p) => used.props.add(p))
      it.anim.effects.forEach((e) => used.effects.add(e))
    } else if (it.category === 'weaponSkin') used.patterns.add(it.skin.pattern)
    else used.shapes.add(it.acc.shape)
  }
  assert.ok(used.moves.size >= MOVES.length * 0.9, `moves used ${used.moves.size}/${MOVES.length}`)
  assert.ok(used.props.size >= PROPS.length * 0.8, `props used ${used.props.size}/${PROPS.length}`)
  assert.ok(used.effects.size >= EFFECTS.length * 0.8, `effects used ${used.effects.size}/${EFFECTS.length}`)
  assert.equal(used.patterns.size, PATTERNS.length)
  assert.ok(used.shapes.size >= SHAPES.length * 0.9, `shapes used ${used.shapes.size}/${SHAPES.length}`)
})

test('higher rarities carry more going on', () => {
  const avg = (cat: 'celebration' | 'emote', rarity: string) => {
    const items = BY_CATEGORY[cat].filter((i) => i.rarity === rarity)
    return items.reduce((s, i) => (i.category === 'celebration' || i.category === 'emote' ? s + i.anim.effects.filter((e) => e !== 'none').length + i.anim.props.filter((p) => p !== 'none').length : s), 0) / items.length
  }
  for (const cat of ['celebration', 'emote'] as const) {
    assert.ok(avg(cat, 'exotic') > avg(cat, 'legendary'), cat)
    assert.ok(avg(cat, 'legendary') > avg(cat, 'rare'), cat)
    assert.ok(avg(cat, 'rare') > avg(cat, 'common'), cat)
  }
  const skins = (r: string) => WEAPON_SKINS_CATALOG.filter((i) => i.rarity === r)
  assert.ok(skins('common').every((s) => s.skin.particles === 'none' && s.skin.emissive === 'none'))
  assert.ok(skins('exotic').every((s) => s.skin.particles !== 'none' && s.skin.emissive !== 'none'))
  const accs = (r: string) => ACCESSORIES.filter((i) => i.rarity === r)
  assert.ok(accs('exotic').every((a) => a.acc.emissive && a.acc.motion !== 'none' && a.acc.particles !== 'none'))
})
