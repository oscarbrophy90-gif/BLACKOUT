import { RARITIES } from '../types.ts'
import type { Rarity } from '../types.ts'
import {
  CAMERAS, EFFECTS, EMISSIVES, FINISHES, MOTIONS, MOVES, PARTICLES, PATTERNS, PROPS, SHAPES, SLOTS,
} from './vocab.ts'
import { CATEGORY_PREFIX, CATEGORY_SIZE, RARITY_QUOTA, designSignature } from './types.ts'
import type { CatalogItem, Category } from './types.ts'

// Catalogue rules, enforced by tests and by the authoring check script:
// exact counts, exact rarity quotas, unique ids, unique names, unique
// designs, and every enum value resolvable by the runtime.

const HEX = /^#[0-9a-fA-F]{6}$/

export function validateCategory(items: readonly CatalogItem[], category: Category): string[] {
  const errors: string[] = []
  if (items.length !== CATEGORY_SIZE) errors.push(`expected ${CATEGORY_SIZE} items, got ${items.length}`)

  const counts: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, mythic: 0, exotic: 0 }
  const ids = new Set<string>()
  const names = new Set<string>()
  const sigs = new Map<string, string>()
  const prefix = CATEGORY_PREFIX[category]
  const idRe = new RegExp(`^${prefix}_\\d{3}$`)

  items.forEach((it, i) => {
    const where = `${it.id ?? `#${i}`} (${it.name ?? '?'})`
    if (it.category !== category) errors.push(`${where}: category ${it.category} != ${category}`)
    if (!idRe.test(it.id)) errors.push(`${where}: id must match ${prefix}_NNN`)
    if (ids.has(it.id)) errors.push(`${where}: duplicate id`)
    ids.add(it.id)
    const nameKey = it.name.trim().toLowerCase()
    if (!nameKey) errors.push(`${where}: empty name`)
    if (names.has(nameKey)) errors.push(`${where}: duplicate name`)
    names.add(nameKey)
    if (!RARITIES.includes(it.rarity)) errors.push(`${where}: bad rarity ${it.rarity}`)
    else counts[it.rarity]++
    if (!it.description || it.description.trim().length < 12) errors.push(`${where}: description too short`)
    const sig = designSignature(it)
    const prior = sigs.get(sig)
    if (prior) errors.push(`${where}: same design as ${prior}`)
    sigs.set(sig, it.id)

    switch (it.category) {
      case 'celebration':
      case 'emote': {
        const a = it.anim
        if (!a.moves.length || a.moves.length > 6) errors.push(`${where}: 1-6 moves`)
        for (const m of a.moves) if (!MOVES.includes(m)) errors.push(`${where}: unknown move ${m}`)
        for (const p of a.props) if (!PROPS.includes(p)) errors.push(`${where}: unknown prop ${p}`)
        for (const e of a.effects) if (!EFFECTS.includes(e)) errors.push(`${where}: unknown effect ${e}`)
        if (!CAMERAS.includes(a.camera)) errors.push(`${where}: unknown camera ${a.camera}`)
        if (!(a.tempo >= 0.5 && a.tempo <= 1.8)) errors.push(`${where}: tempo out of range`)
        if (a.palette.length !== 2 || !a.palette.every((c) => HEX.test(c))) errors.push(`${where}: palette needs 2 hex colours`)
        break
      }
      case 'weaponSkin': {
        const s = it.skin
        if (!PATTERNS.includes(s.pattern)) errors.push(`${where}: unknown pattern ${s.pattern}`)
        if (!FINISHES.includes(s.finish)) errors.push(`${where}: unknown finish ${s.finish}`)
        if (!EMISSIVES.includes(s.emissive)) errors.push(`${where}: unknown emissive ${s.emissive}`)
        if (!PARTICLES.includes(s.particles)) errors.push(`${where}: unknown particles ${s.particles}`)
        if (s.palette.length !== 3 || !s.palette.every((c) => HEX.test(c))) errors.push(`${where}: palette needs 3 hex colours`)
        if (!s.theme) errors.push(`${where}: theme required`)
        break
      }
      case 'accessory': {
        const a = it.acc
        if (!SLOTS.includes(a.slot)) errors.push(`${where}: unknown slot ${a.slot}`)
        if (!SHAPES.includes(a.shape)) errors.push(`${where}: unknown shape ${a.shape}`)
        if (!MOTIONS.includes(a.motion)) errors.push(`${where}: unknown motion ${a.motion}`)
        if (!PARTICLES.includes(a.particles)) errors.push(`${where}: unknown particles ${a.particles}`)
        if (a.palette.length !== 3 || !a.palette.every((c) => HEX.test(c))) errors.push(`${where}: palette needs 3 hex colours`)
        if (!(a.scale >= 0.4 && a.scale <= 2.5)) errors.push(`${where}: scale out of range`)
        break
      }
    }
  })

  for (const r of RARITIES) {
    if (counts[r] !== RARITY_QUOTA[r]) errors.push(`rarity ${r}: expected ${RARITY_QUOTA[r]}, got ${counts[r]}`)
  }
  return errors
}
