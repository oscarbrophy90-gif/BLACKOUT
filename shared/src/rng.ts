// Deterministic seeded RNG. Every system that rolls dice takes one of these
// instead of Math.random(), so a match seed fully determines loot, zone pulls
// and bot personalities — which is what lets the future server replay and
// verify a match, and lets tests pin down exact outcomes.

export type Rng = () => number

/** mulberry32 — small, fast, good enough distribution for gameplay. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Derive a child seed so subsystems don't share one stream. */
export function deriveSeed(seed: number, label: string): number {
  let h = seed >>> 0
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 2654435761)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

export function rangeInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

export function rangeFloat(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min)
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const a = items.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Weighted pick: entries of [item, weight]. Weights need not sum to 1. */
export function pickWeighted<T>(rng: Rng, entries: readonly (readonly [T, number])[]): T {
  let total = 0
  for (const [, w] of entries) total += w
  let roll = rng() * total
  for (const [item, w] of entries) {
    roll -= w
    if (roll <= 0) return item
  }
  return entries[entries.length - 1][0]
}
