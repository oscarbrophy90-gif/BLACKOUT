import { heightAt } from './terrain.ts'

// Hand-rolled collision: the world is a heightfield plus a few thousand
// axis-aligned boxes. No physics engine — cheap, deterministic, and the
// authoritative server can run the identical code.

export interface AABB {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
}

export class CollisionWorld {
  private boxes: AABB[] = []
  /** Coarse hash grid: cell -> box indices, so queries touch a handful. */
  private grid = new Map<number, number[]>()
  private cell = 32

  addBox(b: AABB): void {
    const idx = this.boxes.length
    this.boxes.push(b)
    const x0 = Math.floor(b.minX / this.cell)
    const x1 = Math.floor(b.maxX / this.cell)
    const z0 = Math.floor(b.minZ / this.cell)
    const z1 = Math.floor(b.maxZ / this.cell)
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const key = x * 73856093 + z * 19349663
        let list = this.grid.get(key)
        if (!list) {
          list = []
          this.grid.set(key, list)
        }
        list.push(idx)
      }
    }
  }

  private near(x: number, z: number, out: number[]): number[] {
    out.length = 0
    const cx = Math.floor(x / this.cell)
    const cz = Math.floor(z / this.cell)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = this.grid.get((cx + dx) * 73856093 + (cz + dz) * 19349663)
        if (list) for (const i of list) if (!out.includes(i)) out.push(i)
      }
    }
    return out
  }

  private scratch: number[] = []

  /**
   * Move a capsule (feet at y, radius r, height h) and slide along walls.
   * Returns the resolved position. Ground snapping is the caller's job.
   */
  resolve(x: number, y: number, z: number, r: number, h: number): { x: number; z: number } {
    const ids = this.near(x, z, this.scratch)
    let px = x
    let pz = z
    for (let pass = 0; pass < 2; pass++) {
      for (const i of ids) {
        const b = this.boxes[i]
        // Skip boxes entirely above the head or below the feet (arcade
        // undercrofts: you can walk beneath a raised building).
        if (y + h < b.minY + 0.05 || y + 0.4 > b.maxY) continue
        const nx = Math.max(b.minX, Math.min(px, b.maxX))
        const nz = Math.max(b.minZ, Math.min(pz, b.maxZ))
        const dx = px - nx
        const dz = pz - nz
        const d2 = dx * dx + dz * dz
        if (d2 >= r * r) continue
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2)
          px = nx + (dx / d) * r
          pz = nz + (dz / d) * r
        } else {
          // Centre inside the box: push out the thinnest face.
          const west = px - b.minX + r
          const east = b.maxX - px + r
          const north = pz - b.minZ + r
          const south = b.maxZ - pz + r
          const m = Math.min(west, east, north, south)
          if (m === west) px = b.minX - r
          else if (m === east) px = b.maxX + r
          else if (m === north) pz = b.minZ - r
          else pz = b.maxZ + r
        }
      }
    }
    return { x: px, z: pz }
  }

  /** Highest walkable surface under (x, z) at feet height y: terrain or a
   *  box top the actor is standing on / falling onto. `sweepFromY` is the
   *  feet height BEFORE this frame's fall — any roof crossed during the
   *  frame still counts, so fast falls can't tunnel through rooftops. */
  groundHeight(x: number, z: number, y: number, r: number, sweepFromY = y): number {
    let g = heightAt(x, z)
    const top = Math.max(y, sweepFromY) + 0.6
    const ids = this.near(x, z, this.scratch)
    for (const i of ids) {
      const b = this.boxes[i]
      if (x + r < b.minX || x - r > b.maxX || z + r < b.minZ || z - r > b.maxZ) continue
      if (b.maxY <= top && b.maxY > g) g = b.maxY
    }
    return g
  }

  /** Lowest box underside above the feet within the capsule's height —
   *  the ceiling a jump bumps against. Null when headroom is clear. */
  lowestCeiling(x: number, y: number, z: number, r: number, h: number): number | null {
    let best: number | null = null
    const ids = this.near(x, z, this.scratch)
    for (const i of ids) {
      const b = this.boxes[i]
      if (x + r < b.minX || x - r > b.maxX || z + r < b.minZ || z - r > b.maxZ) continue
      if (b.minY >= y + 0.2 && b.minY < y + h && (best === null || b.minY < best)) best = b.minY
    }
    return best
  }

  /**
   * Nearest spot to (x, z) that is on open terrain — not on a roof, not
   * inside a structure footprint, not in the sea. Used for drop landings
   * and bot spawns so nobody starts trapped on (or in) a building.
   */
  findClearGround(x: number, z: number, maxRadius = 60): { x: number; z: number } {
    const clear = (px: number, pz: number): boolean => {
      const terrain = heightAt(px, pz)
      if (terrain < 0.5) return false
      const g = this.groundHeight(px, pz, 500, 0.6)
      return g - terrain < 0.5
    }
    if (clear(x, z)) return { x, z }
    for (let r = 4; r <= maxRadius; r += 4) {
      const steps = Math.max(8, Math.floor(r * 1.2))
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2 + r
        const px = x + Math.cos(a) * r
        const pz = z + Math.sin(a) * r
        if (clear(px, pz)) return { x: px, z: pz }
      }
    }
    return { x, z }
  }

  /**
   * Raycast for bullets and bot vision. Checks boxes (slab test) and marches
   * the terrain. Returns hit distance, or null for a clear line.
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): number | null {
    let best: number | null = null
    // Boxes: walk the grid cells along the ray at cell stride.
    const step = this.cell * 0.9
    const seen = new Set<number>()
    for (let t = 0; t <= maxDist + step; t += step) {
      const cx = ox + dx * Math.min(t, maxDist)
      const cz = oz + dz * Math.min(t, maxDist)
      const ids = this.near(cx, cz, this.scratch)
      for (const i of ids) {
        if (seen.has(i)) continue
        seen.add(i)
        const d = rayAabb(ox, oy, oz, dx, dy, dz, this.boxes[i])
        if (d !== null && d <= maxDist && (best === null || d < best)) best = d
      }
    }
    // Terrain: coarse march, refined once.
    const tstep = 3
    let prevY = oy - heightAt(ox, oz)
    for (let t = tstep; t <= Math.min(maxDist, best ?? maxDist); t += tstep) {
      const x = ox + dx * t
      const y = oy + dy * t
      const z = oz + dz * t
      const dyTerr = y - heightAt(x, z)
      if (dyTerr <= 0) {
        const f = prevY / Math.max(1e-6, prevY - dyTerr)
        const d = t - tstep + tstep * f
        if (best === null || d < best) best = d
        break
      }
      prevY = dyTerr
    }
    return best
  }

  /** True if B is visible from A (no geometry between). */
  lineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax
    const dy = by - ay
    const dz = bz - az
    const dist = Math.hypot(dx, dy, dz)
    if (dist < 1e-6) return true
    const hit = this.raycast(ax, ay, az, dx / dist, dy / dist, dz / dist, dist - 0.5)
    return hit === null
  }
}

function rayAabb(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: AABB): number | null {
  let tmin = 0
  let tmax = Infinity
  const o = [ox, oy, oz]
  const d = [dx, dy, dz]
  const mins = [b.minX, b.minY, b.minZ]
  const maxs = [b.maxX, b.maxY, b.maxZ]
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mins[i] || o[i] > maxs[i]) return null
    } else {
      let t1 = (mins[i] - o[i]) / d[i]
      let t2 = (maxs[i] - o[i]) / d[i]
      if (t1 > t2) [t1, t2] = [t2, t1]
      tmin = Math.max(tmin, t1)
      tmax = Math.min(tmax, t2)
      if (tmin > tmax) return null
    }
  }
  return tmin >= 0 ? tmin : null
}

/** Segment vs vertical capsule (an actor). Returns 'head' | 'body' | null. */
export function rayVsActor(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDist: number,
  ax: number, ay: number, az: number,
  eyeHeight: number,
): { part: 'head' | 'body'; dist: number } | null {
  // Head: sphere at the eye. Body: sphere chain up the torso.
  const head = raySphere(ox, oy, oz, dx, dy, dz, ax, ay + eyeHeight, az, 0.24)
  if (head !== null && head <= maxDist) return { part: 'head', dist: head }
  let best: number | null = null
  for (let i = 0; i < 4; i++) {
    const y = ay + 0.25 + (i / 3) * (eyeHeight - 0.5)
    const d = raySphere(ox, oy, oz, dx, dy, dz, ax, y, az, 0.34)
    if (d !== null && d <= maxDist && (best === null || d < best)) best = d
  }
  return best === null ? null : { part: 'body', dist: best }
}

function raySphere(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  cx: number, cy: number, cz: number,
  r: number,
): number | null {
  const lx = cx - ox
  const ly = cy - oy
  const lz = cz - oz
  const tca = lx * dx + ly * dy + lz * dz
  if (tca < 0) return null
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca
  if (d2 > r * r) return null
  const thc = Math.sqrt(r * r - d2)
  return tca - thc
}
