import type { Rng } from '@blackout/shared'
import { heightAt } from './terrain.ts'

// The building kit. Every enterable structure is assembled from boxes:
// floor slabs, walls with door and window openings, room partitions,
// stairs, upper floors with a stairwell, a roof, and optionally a solid
// mass above (city towers). Interiors register loot points and doors so
// bots can path through the right opening.

export interface BoxOut {
  x: number
  y: number
  z: number
  w: number
  h: number
  d: number
  color: string
  solid: boolean
  edges: boolean
}

export interface Building {
  id: number
  style: BuildingStyle
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  baseY: number
  doors: { x: number; z: number; /** outward normal */ nx: number; nz: number }[]
  /** Interior points by floor, for loot and bot searching. */
  rooms: { x: number; z: number; y: number; floor: number }[]
}

export type BuildingStyle = 'house' | 'city' | 'warehouse' | 'bunker' | 'hangar' | 'cabin' | 'shed'

export interface BuildingSpec {
  x: number
  z: number
  w: number
  d: number
  style: BuildingStyle
  color: string
  /** Floors with interiors (1-2). */
  floors: 1 | 2
  /** Extra solid mass on top (city towers keep their skyline). */
  solidAbove: number
}

export interface KitOut {
  boxes: BoxOut[]
  lootPoints: { x: number; z: number; y: number; grade: 1 | 2 | 3; buildingId: number }[]
  cratePoints: { x: number; z: number; y: number; grade: 1 | 2 | 3; buildingId: number }[]
  signs: { x: number; y: number; z: number; w: number; h: number; d: number }[]
  building: Building
}

const WALL = 0.32
const FLOOR_H = 3.2
const SLAB = 0.22
const DOOR_W = 1.3
const DOOR_H = 2.3
const WIN_W = 1.4
const WIN_BOTTOM = 1.1
const WIN_TOP = 2.1

interface Opening {
  from: number
  to: number
  bottom: number
  top: number
}

const registry: Building[] = []
let nextId = 1

export function allBuildings(): readonly Building[] {
  return registry
}

export function resetBuildings(): void {
  registry.length = 0
  nextId = 1
}

export function buildingAt(x: number, z: number): Building | null {
  for (const b of registry) {
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return b
  }
  return null
}

export function nearestDoor(b: Building, x: number, z: number): { x: number; z: number; nx: number; nz: number } {
  let best = b.doors[0]
  let bd = Infinity
  for (const d of b.doors) {
    const dd = Math.hypot(d.x - x, d.z - z)
    if (dd < bd) {
      bd = dd
      best = d
    }
  }
  return best
}

/**
 * A wall along one axis with rectangular openings cut out. Returns boxes.
 * axis 'x': wall runs along x at fixed z. axis 'z': runs along z at fixed x.
 */
function wall(
  axis: 'x' | 'z', fixed: number, from: number, to: number, baseY: number, height: number,
  openings: Opening[], color: string, edges: boolean, out: BoxOut[],
): void {
  const mk = (a0: number, a1: number, y0: number, y1: number) => {
    if (a1 - a0 < 0.05 || y1 - y0 < 0.05) return
    const mid = (a0 + a1) / 2
    out.push({
      x: axis === 'x' ? mid : fixed,
      z: axis === 'x' ? fixed : mid,
      y: baseY + y0,
      w: axis === 'x' ? a1 - a0 : WALL,
      d: axis === 'x' ? WALL : a1 - a0,
      h: y1 - y0,
      color, solid: true, edges,
    })
  }
  const sorted = openings.filter((o) => o.to - o.from >= 0.05).sort((p, q) => p.from - q.from)
  let cursor = from
  for (const o of sorted) {
    mk(cursor, o.from, 0, height)
    mk(o.from, o.to, 0, o.bottom)
    mk(o.from, o.to, o.top, height)
    cursor = o.to
  }
  mk(cursor, to, 0, height)
}

function slab(x0: number, x1: number, z0: number, z1: number, y: number, color: string, out: BoxOut[], hole?: { x0: number; x1: number; z0: number; z1: number }): void {
  const push = (a: number, b: number, c: number, d: number) => {
    if (b - a < 0.05 || d - c < 0.05) return
    out.push({ x: (a + b) / 2, z: (c + d) / 2, y, w: b - a, d: d - c, h: SLAB, color, solid: true, edges: false })
  }
  if (!hole) {
    push(x0, x1, z0, z1)
    return
  }
  push(x0, hole.x0, z0, z1)
  push(hole.x1, x1, z0, z1)
  push(hole.x0, hole.x1, z0, hole.z0)
  push(hole.x0, hole.x1, hole.z1, z1)
}

function stairs(x: number, z0: number, baseY: number, dirZ: 1 | -1, color: string, out: BoxOut[]): { x0: number; x1: number; z0: number; z1: number } {
  const steps = 8
  const rise = FLOOR_H / steps
  const run = 0.55
  for (let i = 0; i < steps; i++) {
    const z = z0 + dirZ * (i * run + run / 2)
    out.push({ x, z, y: baseY, w: 1.3, d: run + 0.02, h: rise * (i + 1), color, solid: true, edges: false })
  }
  const zEnd = z0 + dirZ * steps * run
  return {
    x0: x - 0.75, x1: x + 0.75,
    z0: Math.min(z0, zEnd) - 0.2, z1: Math.max(z0, zEnd) + 0.2,
  }
}

/**
 * Steps outside a door, descending from the floor to the terrain. Rises
 * stay under the collision step height so they walk both ways.
 */
function stoop(door: { x: number; z: number; nx: number; nz: number }, doorW: number, floorY: number, color: string, out: BoxOut[]): void {
  const RISE = 0.32
  const RUN = 0.5
  let top = floorY - RISE
  for (let i = 0; i < 16; i++) {
    const cx = door.x + door.nx * (WALL / 2 + RUN * (i + 0.5))
    const cz = door.z + door.nz * (WALL / 2 + RUN * (i + 0.5))
    const g = heightAt(cx, cz)
    if (top <= g + 0.12) break
    const along = doorW + 0.8
    out.push({
      x: cx, z: cz, y: g - 0.4,
      w: door.nx !== 0 ? RUN + 0.02 : along, d: door.nx !== 0 ? along : RUN + 0.02,
      h: top - (g - 0.4), color, solid: true, edges: false,
    })
    top -= RISE
  }
}

export function makeBuilding(spec: BuildingSpec, rng: Rng, grade: 1 | 2 | 3): KitOut | null {
  const { x, z, w, d, style, color } = spec
  const x0 = x - w / 2
  const x1 = x + w / 2
  const z0 = z - d / 2
  const z1 = z + d / 2
  // The floor must clear the HIGHEST ground under the footprint (or terrain
  // pokes through interiors and buries doors); the plinth reaches the LOWEST.
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 4; j++) {
      const h = heightAt(x0 + (w * i) / 4, z0 + (d * j) / 4)
      lo = Math.min(lo, h)
      hi = Math.max(hi, h)
    }
  }
  if (lo < 0.5) return null
  const out: BoxOut[] = []
  const base = hi + 0.1
  const floorY = base + SLAB
  const wallColor = color
  const darker = shade(color, 0.85)
  const building: Building = { id: nextId++, style, minX: x0, maxX: x1, minZ: z0, maxZ: z1, baseY: floorY, doors: [], rooms: [] }
  const lootPoints: KitOut['lootPoints'] = []
  const cratePoints: KitOut['cratePoints'] = []
  const signs: KitOut['signs'] = []

  const tall = style === 'warehouse' || style === 'hangar'
  const H = tall ? (style === 'hangar' ? 10 : 7.5) : FLOOR_H
  const floors = tall ? 1 : spec.floors

  // Plinth: from below the lowest corner up to the floor, so nothing floats.
  out.push({ x, z, y: lo - 0.5, w, d, h: floorY - (lo - 0.5), color: darker, solid: true, edges: false })

  // Exterior walls per floor with doors on the ground floor and windows.
  for (let f = 0; f < floors; f++) {
    const y = floorY + f * (FLOOR_H + SLAB)
    const h = f === 0 && tall ? H : FLOOR_H
    // Door placements: front (-z) always; a second on a random other side.
    const doorSides: ('n' | 's' | 'e' | 'w')[] = f === 0 ? ['s'] : []
    if (f === 0 && (w > 9 || style === 'city' || style === 'warehouse')) doorSides.push(rng() < 0.5 ? 'e' : 'w')
    if (f === 0 && style === 'hangar') doorSides.length = 0
    const doorW = style === 'warehouse' ? 3 : style === 'hangar' ? 8 : DOOR_W
    const doorH = style === 'warehouse' ? 3.4 : style === 'hangar' ? 6 : DOOR_H
    const sides: { axis: 'x' | 'z'; fixed: number; from: number; to: number; key: 'n' | 's' | 'e' | 'w'; nx: number; nz: number }[] = [
      { axis: 'x', fixed: z0 + WALL / 2, from: x0, to: x1, key: 's', nx: 0, nz: -1 },
      { axis: 'x', fixed: z1 - WALL / 2, from: x0, to: x1, key: 'n', nx: 0, nz: 1 },
      { axis: 'z', fixed: x0 + WALL / 2, from: z0, to: z1, key: 'w', nx: -1, nz: 0 },
      { axis: 'z', fixed: x1 - WALL / 2, from: z0, to: z1, key: 'e', nx: 1, nz: 0 },
    ]
    for (const s of sides) {
      const len = s.to - s.from
      const openings: Opening[] = []
      const isHangarFront = style === 'hangar' && s.key === 's' && f === 0
      if (isHangarFront) {
        const mid = (s.from + s.to) / 2
        openings.push({ from: mid - 4, to: mid + 4, bottom: 0, top: 6 })
        const door = { x: mid, z: s.fixed, nx: 0, nz: -1 }
        building.doors.push(door)
        stoop(door, 8, floorY, darker, out)
      } else if (doorSides.includes(s.key)) {
        const mid = s.from + len * (0.35 + rng() * 0.3)
        openings.push({ from: mid - doorW / 2, to: mid + doorW / 2, bottom: 0, top: doorH })
        const door = s.axis === 'x' ? { x: mid, z: s.fixed, nx: s.nx, nz: s.nz } : { x: s.fixed, z: mid, nx: s.nx, nz: s.nz }
        building.doors.push(door)
        stoop(door, doorW, floorY, darker, out)
      }
      // Windows: spaced along the wall, skipping door zones.
      const winCount = Math.max(0, Math.floor(len / 4.2))
      for (let i = 0; i < winCount; i++) {
        const c = s.from + (len / (winCount + 1)) * (i + 1)
        const wf = c - WIN_W / 2
        const wt = c + WIN_W / 2
        if (openings.some((o) => wt > o.from - 0.4 && wf < o.to + 0.4)) continue
        const wb = tall ? 3.2 : WIN_BOTTOM
        const wtop = tall ? 4.6 : WIN_TOP
        openings.push({ from: wf, to: wt, bottom: wb, top: wtop })
      }
      wall(s.axis, s.fixed, s.from, s.to, y, h, openings, wallColor, true, out)
    }
  }

  // Interior partitions + rooms per floor.
  let stairHole: { x0: number; x1: number; z0: number; z1: number } | undefined
  for (let f = 0; f < floors; f++) {
    const y = floorY + f * (FLOOR_H + SLAB)
    const interiorW = w - WALL * 2
    const interiorD = d - WALL * 2
    const rooms: { x0: number; x1: number; z0: number; z1: number }[] = []
    if (!tall && interiorW > 7 && interiorD > 7) {
      // Split into 2 (or 4) rooms with doorways in the partitions.
      const splitX = x0 + WALL + interiorW * (0.4 + rng() * 0.2)
      // One doorway of exactly DOOR_W, centred at a random offset kept clear of the ends.
      const maxOff = interiorD / 2 - DOOR_W / 2 - 0.5
      const doorOff = Math.max(-maxOff, Math.min(maxOff, (rng() - 0.5) * interiorD * 0.4))
      const zOpenings: Opening[] = [{ from: z + doorOff - DOOR_W / 2, to: z + doorOff + DOOR_W / 2, bottom: 0, top: DOOR_H }]
      // Doors were placed first: if the partition would stand inside (or a
      // capsule width from) an exterior doorway, cut it back so the entrance
      // opens into both rooms.
      const CLEAR = DOOR_W / 2 + WALL / 2 + 0.9
      const front = f === 0 ? building.doors.find((dd) => dd.nz === -1) : undefined
      if (front && Math.abs(front.x - splitX) < CLEAR) zOpenings.push({ from: z0 + WALL, to: z0 + WALL + DOOR_W + 0.6, bottom: 0, top: DOOR_H })
      wall('z', splitX, z0 + WALL, z1 - WALL, y, FLOOR_H, zOpenings, darker, false, out)
      if (interiorD > 12) {
        const splitZ = z0 + WALL + interiorD * (0.4 + rng() * 0.2)
        const xOpenings: Opening[] = [{ from: (x0 + splitX) / 2 - DOOR_W / 2, to: (x0 + splitX) / 2 + DOOR_W / 2, bottom: 0, top: DOOR_H }]
        const west = f === 0 ? building.doors.find((dd) => dd.nx === -1) : undefined
        if (west && Math.abs(west.z - splitZ) < CLEAR) xOpenings.push({ from: x0 + WALL, to: x0 + WALL + DOOR_W + 0.6, bottom: 0, top: DOOR_H })
        wall('x', splitZ, x0 + WALL, splitX - WALL / 2, y, FLOOR_H, xOpenings, darker, false, out)
        rooms.push({ x0: x0 + WALL, x1: splitX, z0: z0 + WALL, z1: splitZ }, { x0: x0 + WALL, x1: splitX, z0: splitZ, z1: z1 - WALL }, { x0: splitX, x1: x1 - WALL, z0: z0 + WALL, z1: z1 - WALL })
      } else {
        rooms.push({ x0: x0 + WALL, x1: splitX, z0: z0 + WALL, z1: z1 - WALL }, { x0: splitX, x1: x1 - WALL, z0: z0 + WALL, z1: z1 - WALL })
      }
    } else {
      rooms.push({ x0: x0 + WALL, x1: x1 - WALL, z0: z0 + WALL, z1: z1 - WALL })
    }
    // Warehouses: rows of stock to fight around.
    if (tall) {
      const rows = Math.floor(interiorD / 9)
      for (let r = 0; r < rows; r++) {
        const rz = z0 + WALL + 4 + r * 9
        for (let k = 0; k < Math.floor(interiorW / 8); k++) {
          if (rng() < 0.35) continue
          const rx = x0 + WALL + 4 + k * 8
          out.push({ x: rx, z: rz, y, w: 4, h: 2.4 + (rng() < 0.4 ? 2.4 : 0), d: 2.6, color: shade(color, 0.7), solid: true, edges: false })
        }
      }
    }
    // Stairs to the next floor, in the largest room's corner.
    if (f < floors - 1) {
      const room = rooms.reduce((a, b) => ((b.x1 - b.x0) * (b.z1 - b.z0) > (a.x1 - a.x0) * (a.z1 - a.z0) ? b : a))
      const sx = room.x1 - 1.2
      const sz = room.z0 + 0.6
      stairHole = stairs(sx, sz, y, 1, darker, out)
    }
    // Loot: 1-3 points per room, crates in some.
    for (const r of rooms) {
      const n = 1 + Math.floor(rng() * (style === 'city' ? 3 : 2))
      for (let i = 0; i < n; i++) {
        const px = r.x0 + 0.8 + rng() * Math.max(0.5, r.x1 - r.x0 - 1.6)
        const pz = r.z0 + 0.8 + rng() * Math.max(0.5, r.z1 - r.z0 - 1.6)
        if (stairHole && px > stairHole.x0 - 0.5 && px < stairHole.x1 + 0.5 && pz > stairHole.z0 - 0.5 && pz < stairHole.z1 + 0.5) continue
        lootPoints.push({ x: px, z: pz, y, grade, buildingId: building.id })
      }
      const rcx = (r.x0 + r.x1) / 2
      const rcz = (r.z0 + r.z1) / 2
      building.rooms.push({ x: rcx, z: rcz, y, floor: f })
      if (rng() < (grade === 3 ? 0.55 : grade === 2 ? 0.38 : 0.25)) {
        cratePoints.push({ x: rcx + (rng() - 0.5) * 2, z: rcz + (rng() - 0.5) * 2, y, grade, buildingId: building.id })
      }
    }
    // Next floor slab with the stairwell hole; or the roof.
    const topY = y + (f === 0 && tall ? H : FLOOR_H)
    if (f < floors - 1) slab(x0, x1, z0, z1, topY, darker, out, stairHole)
    else slab(x0, x1, z0, z1, topY, darker, out)
  }

  // Solid mass above for skyline (towers).
  if (spec.solidAbove > 0) {
    const roofY = floorY + floors * (FLOOR_H + SLAB) - SLAB + SLAB
    out.push({ x, z, y: roofY, w, h: spec.solidAbove, d, color, solid: true, edges: true })
    for (let i = 0; i < 2; i++) {
      const side = rng() < 0.5
      signs.push({
        x: side ? x + (rng() - 0.5) * w * 0.6 : x + (rng() < 0.5 ? -w / 2 - 0.12 : w / 2 + 0.12),
        y: roofY + 2 + rng() * Math.max(1, spec.solidAbove - 4),
        z: side ? (rng() < 0.5 ? z - d / 2 - 0.12 : z + d / 2 + 0.12) : z + (rng() - 0.5) * d * 0.6,
        w: side ? 1.6 + rng() * 3 : 0.24, h: 0.5 + rng() * 0.9, d: side ? 0.24 : 1.6 + rng() * 3,
      })
    }
  }

  registry.push(building)
  return { boxes: out, lootPoints, cratePoints, signs, building }
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k))
  const g = Math.min(255, Math.round(((n >> 8) & 255) * k))
  const b = Math.min(255, Math.round((n & 255) * k))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
