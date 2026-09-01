// The damage model. This is deliberately pure: the future authoritative
// server runs exactly this code, so the client can never invent damage.

export interface Vitals {
  health: number // 0..100
  armor: number // 0..100
}

export const MAX_HEALTH = 100
export const MAX_ARMOR = 100

/** Fraction of incoming body damage soaked by armor while any remains. */
export const ARMOR_ABSORB = 0.65

export interface HitResult {
  vitals: Vitals
  healthDamage: number
  armorDamage: number
  killed: boolean
  headshot: boolean
}

/**
 * Apply one hit. Headshot multiplier is applied to the raw damage first;
 * armor then soaks ARMOR_ABSORB of what it can. Armor never prevents the
 * last sliver of chip damage entirely — fights always end.
 */
export function applyHit(v: Vitals, rawDamage: number, headshotMult = 1): HitResult {
  const dmg = rawDamage * headshotMult
  const headshot = headshotMult > 1

  const soakWanted = dmg * ARMOR_ABSORB
  const armorDamage = Math.min(v.armor, soakWanted)
  const healthDamage = dmg - armorDamage

  const health = Math.max(0, v.health - healthDamage)
  const armor = Math.max(0, v.armor - armorDamage)

  return {
    vitals: { health, armor },
    healthDamage,
    armorDamage,
    killed: health <= 0 && v.health > 0,
    headshot,
  }
}

/** Damage falloff by distance: full inside `near`, floor beyond `far`. */
export function falloff(damage: number, distance: number, near: number, far: number, floor = 0.45): number {
  if (distance <= near) return damage
  if (distance >= far) return damage * floor
  const t = (distance - near) / (far - near)
  return damage * (1 - t * (1 - floor))
}

/** Shots-to-kill a full-vitals target with body shots — used by balance tests. */
export function shotsToKill(damagePerShot: number): number {
  let v: Vitals = { health: MAX_HEALTH, armor: MAX_ARMOR }
  let shots = 0
  while (v.health > 0 && shots < 1000) {
    v = applyHit(v, damagePerShot).vitals
    shots++
  }
  return shots
}
