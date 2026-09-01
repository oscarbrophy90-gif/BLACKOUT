import type { Rng } from './rng.ts'
import type { Vec2 } from './types.ts'
import { dist2d } from './types.ts'

// The shrinking playable area. Phases follow the design doc:
// each phase waits (next circle visible, current static), then shrinks.
// Damage outside ramps hard so the endgame cannot be camped from the dark.

export interface ZonePhase {
  /** Seconds the current circle holds while the next one is telegraphed. */
  wait: number
  /** Seconds the wall takes to move to the next circle. */
  shrink: number
  /** Next radius as a fraction of the FULL map radius. */
  radiusFrac: number
  /** Damage per second outside the safe circle during/after this phase. */
  dps: number
}

export const ZONE_PHASES: readonly ZonePhase[] = [
  { wait: 55, shrink: 60, radiusFrac: 0.75, dps: 1 },
  { wait: 45, shrink: 50, radiusFrac: 0.55, dps: 2 },
  { wait: 40, shrink: 40, radiusFrac: 0.4, dps: 4 },
  { wait: 30, shrink: 35, radiusFrac: 0.25, dps: 7 },
  { wait: 25, shrink: 30, radiusFrac: 0.12, dps: 10 },
  { wait: 20, shrink: 25, radiusFrac: 0.055, dps: 14 },
  { wait: 15, shrink: 70, radiusFrac: 0, dps: 18 },
] as const

export interface Circle {
  center: Vec2
  radius: number
}

/**
 * Pick the next circle: fully contained in the current one, and biased to
 * stay on the island (within `islandRadius` of the map origin) so the final
 * fights happen on land, not in the sea.
 */
export function nextCircle(rng: Rng, current: Circle, nextRadius: number, islandRadius: number): Circle {
  const slack = Math.max(0, current.radius - nextRadius)
  for (let attempt = 0; attempt < 24; attempt++) {
    const ang = rng() * Math.PI * 2
    // sqrt biases toward the rim early for variety; later circles have little slack anyway
    const r = Math.sqrt(rng()) * slack
    const center = {
      x: current.center.x + Math.cos(ang) * r,
      z: current.center.z + Math.sin(ang) * r,
    }
    if (Math.hypot(center.x, center.z) + nextRadius * 0.55 <= islandRadius) {
      return { center, radius: nextRadius }
    }
  }
  // Fall back to pulling toward the island centre.
  const len = Math.hypot(current.center.x, current.center.z)
  const scale = len > 0 ? Math.max(0, len - slack) / len : 0
  return {
    center: { x: current.center.x * scale, z: current.center.z * scale },
    radius: nextRadius,
  }
}

/** Interpolate the live wall between two circles as the shrink progresses. */
export function lerpCircle(from: Circle, to: Circle, t: number): Circle {
  const k = t < 0 ? 0 : t > 1 ? 1 : t
  return {
    center: {
      x: from.center.x + (to.center.x - from.center.x) * k,
      z: from.center.z + (to.center.z - from.center.z) * k,
    },
    radius: from.radius + (to.radius - from.radius) * k,
  }
}

export function isInside(circle: Circle, p: Vec2): boolean {
  return dist2d(circle.center, p) <= circle.radius
}

/** Total seconds from first phase start to full collapse. */
export function totalZoneSeconds(): number {
  return ZONE_PHASES.reduce((s, p) => s + p.wait + p.shrink, 0)
}
