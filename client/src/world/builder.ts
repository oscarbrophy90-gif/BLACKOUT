import * as THREE from 'three'
import { deriveSeed, makeRng } from '@blackout/shared'
import { COLORS, ISLAND_RADIUS } from '../config.ts'
import type { CollisionWorld } from './collision.ts'
import { DISTRICTS, WORLD_SEED, heightAt } from './terrain.ts'
import type { District } from './terrain.ts'
import { makeBuilding, resetBuildings } from './buildings.ts'
import type { BuildingStyle } from './buildings.ts'

// Builds every structure on Vantera out of instanced primitives. One
// InstancedMesh per primitive kind keeps the whole island at a handful of
// draw calls; the parallel AABB list feeds collision, bullets and bot vision.

export interface SpawnPoint {
  x: number
  z: number
  grade: 1 | 2 | 3
  /** Floor height for interior points; undefined = terrain. */
  y?: number
  buildingId?: number
}

export interface WorldData {
  cratePoints: SpawnPoint[]
  lootPoints: SpawnPoint[]
  /** Toggled visible only during Blackouts — the navigation whisper. */
  setBlackout(dark: boolean): void
}

interface BoxSpec {
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

const MAX_BOXES = 14000
const MAX_CYLS = 160
const MAX_ROCKS = 300
const MAX_SIGNS = 400
const MAX_TREES = 2200

const SIGN_PALETTE = [COLORS.sodium, COLORS.cyan, '#ff7a3d', '#7d6bff', '#7fe08a']

export function buildWorld(scene: THREE.Scene, col: CollisionWorld): WorldData {
  resetBuildings()
  const rng = makeRng(deriveSeed(WORLD_SEED, 'structures'))
  const boxes: BoxSpec[] = []
  const signs: { x: number; y: number; z: number; w: number; h: number; d: number; color: string }[] = []
  const cyls: { x: number; y: number; z: number; r: number; h: number; color: string }[] = []
  const trees: { x: number; z: number; s: number }[] = []
  const rocks: { x: number; z: number; s: number }[] = []
  const cratePoints: SpawnPoint[] = []
  const lootPoints: SpawnPoint[] = []

  // Placed enterable footprints: a new building must not intersect one
  // (padded so door approach points 2.2 m outside a wall stay clear).
  const footprints: { minX: number; maxX: number; minZ: number; maxZ: number }[] = []
  const FOOTPRINT_PAD = 3
  const footprintFree = (x: number, z: number, w: number, d: number): boolean => {
    const minX = x - w / 2 - FOOTPRINT_PAD
    const maxX = x + w / 2 + FOOTPRINT_PAD
    const minZ = z - d / 2 - FOOTPRINT_PAD
    const maxZ = z + d / 2 + FOOTPRINT_PAD
    for (const f of footprints) {
      if (minX < f.maxX && maxX > f.minX && minZ < f.maxZ && maxZ > f.minZ) return false
    }
    return true
  }

  const box = (s: BoxSpec) => {
    if (boxes.length < MAX_BOXES) boxes.push(s)
  }

  /**
   * An enterable building from the kit: rooms, doors, windows, stairs,
   * interior loot. `style` picks the layout; city towers keep a solid
   * skyline mass above their two enterable floors.
   */
  function building(
    x: number, z: number, w: number, h: number, d: number,
    color: string, opts: { style?: BuildingStyle; signs?: number; grade?: 1 | 2 | 3; floors?: 1 | 2 } = {},
  ): boolean {
    if (!footprintFree(x, z, w, d)) return false
    const style = opts.style ?? 'house'
    const floors = opts.floors ?? (style === 'city' ? 2 : 1)
    const usedH = floors * 3.42
    const kit = makeBuilding({ x, z, w, d, style, color, floors, solidAbove: Math.max(0, h - usedH) }, rng, opts.grade ?? 1)
    if (!kit) return false
    for (const b of kit.boxes) box(b)
    footprints.push({ minX: kit.building.minX, maxX: kit.building.maxX, minZ: kit.building.minZ, maxZ: kit.building.maxZ })
    for (const p of kit.lootPoints) lootPoints.push({ x: p.x, z: p.z, grade: p.grade, y: p.y, buildingId: p.buildingId })
    for (const p of kit.cratePoints) cratePoints.push({ x: p.x, z: p.z, grade: p.grade, y: p.y, buildingId: p.buildingId })
    for (const sg of kit.signs) if (signs.length < MAX_SIGNS) signs.push({ ...sg, color: SIGN_PALETTE[Math.floor(rng() * SIGN_PALETTE.length)] })
    const nSigns = opts.signs ?? 0
    for (let i = 0; i < nSigns && signs.length < MAX_SIGNS; i++) {
      const side = Math.floor(rng() * 4)
      const along = (rng() - 0.5) * (side < 2 ? w : d) * 0.7
      const base = kit.building.baseY
      const sy = base + 2.4 + rng() * 0.6
      const c = SIGN_PALETTE[Math.floor(rng() * SIGN_PALETTE.length)]
      const sw = side < 2 ? 1.6 + rng() * 3 : 0.24
      const sd = side < 2 ? 0.24 : 1.6 + rng() * 3
      signs.push({
        x: x + (side === 0 ? along : side === 1 ? along : side === 2 ? -w / 2 - 0.14 : w / 2 + 0.14),
        y: sy,
        z: side === 0 ? z - d / 2 - 0.14 : side === 1 ? z + d / 2 + 0.14 : z + along,
        w: sw, h: 0.5 + rng() * 0.6, d: sd, color: c,
      })
    }
    return true
  }

  function scatterPoints(d: District, n: number, into: SpawnPoint[], grade: 1 | 2 | 3): void {
    for (let i = 0; i < n; i++) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const ang = rng() * Math.PI * 2
        const rr = Math.sqrt(rng()) * d.r * 0.92
        const x = d.cx + Math.cos(ang) * rr
        const z = d.cz + Math.sin(ang) * rr
        if (heightAt(x, z) < 0.6) continue
        if (insideAnyBox(boxes, x, z)) continue
        into.push({ x, z, grade })
        break
      }
    }
  }

  // ——— Districts ———
  for (const d of DISTRICTS) {
    switch (d.archetype) {
      case 'city': {
        // Street grid of towers; the brightest place on the island.
        const step = 42
        for (let gx = -5; gx <= 5; gx++) {
          for (let gz = -5; gz <= 5; gz++) {
            const x = d.cx + gx * step + (rng() - 0.5) * 8
            const z = d.cz + gz * step + (rng() - 0.5) * 8
            if (Math.hypot(x - d.cx, z - d.cz) > d.r * 0.9) continue
            if (rng() < 0.28) continue // plazas
            const h = 10 + rng() * 22
            const grey = 0.32 + rng() * 0.2
            const c = new THREE.Color(grey * 0.9, grey * 0.92, grey * 1.05)
            building(x, z, 15 + rng() * 9, h, 15 + rng() * 9, `#${c.getHexString()}`, {
              style: 'city', grade: 2, floors: 2, signs: 1 + Math.floor(rng() * 2),
            })
          }
        }
        scatterPoints(d, 40, lootPoints, d.grade)
        scatterPoints(d, 8, cratePoints, d.grade)
        break
      }
      case 'industrial': {
        for (let i = 0; i < 11; i++) {
          for (let attempt = 0; attempt < 10; attempt++) {
            const ang = rng() * Math.PI * 2
            const rr = Math.sqrt(rng()) * d.r * 0.75
            if (building(d.cx + Math.cos(ang) * rr, d.cz + Math.sin(ang) * rr,
              22 + rng() * 16, 8, 30 + rng() * 14, '#4a4238', { style: 'warehouse', grade: 2, signs: 1 })) break
          }
        }
        // Capacitor stacks — the island's Blackout clock arcs here.
        for (let i = 0; i < 8 && cyls.length < MAX_CYLS; i++) {
          const ang = rng() * Math.PI * 2
          const rr = rng() * d.r * 0.6
          const x = d.cx + Math.cos(ang) * rr
          const z = d.cz + Math.sin(ang) * rr
          cyls.push({ x, y: heightAt(x, z), z, r: 3 + rng() * 2, h: 14 + rng() * 10, color: '#5a5348' })
        }
        scatterPoints(d, 55, lootPoints, d.grade)
        scatterPoints(d, 12, cratePoints, d.grade)
        break
      }
      case 'forest': {
        for (let i = 0; i < 700 && trees.length < MAX_TREES; i++) {
          const ang = rng() * Math.PI * 2
          const rr = Math.sqrt(rng()) * d.r
          const x = d.cx + Math.cos(ang) * rr
          const z = d.cz + Math.sin(ang) * rr
          if (heightAt(x, z) < 0.8) continue
          trees.push({ x, z, s: 0.75 + rng() * 0.8 })
        }
        for (let i = 0; i < 7; i++) {
          for (let attempt = 0; attempt < 10; attempt++) {
            const ang = rng() * Math.PI * 2
            const rr = rng() * d.r * 0.7
            if (building(d.cx + Math.cos(ang) * rr, d.cz + Math.sin(ang) * rr,
              7.5 + rng() * 3, 3.5, 8 + rng() * 3, '#4f4335', { style: 'cabin', grade: 1, signs: rng() < 0.4 ? 1 : 0 })) break
          }
        }
        scatterPoints(d, 45, lootPoints, d.grade)
        scatterPoints(d, 8, cratePoints, d.grade)
        break
      }
      case 'mountain': {
        for (let i = 0; i < 4; i++) {
          const ang = (i / 4) * Math.PI * 2 + rng()
          const rr = d.r * (0.35 + rng() * 0.45)
          const x = d.cx + Math.cos(ang) * rr
          const z = d.cz + Math.sin(ang) * rr
          box({ x, y: heightAt(x, z), z, w: 6, h: 14, d: 6, color: '#57505a', solid: true, edges: true })
          signs.push({ x, y: heightAt(x, z) + 13, z: z - 3.1, w: 2, h: 0.5, d: 0.2, color: COLORS.sodium })
        }
        // Summit relay.
        building(d.cx, d.cz, 12, 6, 12, '#5c5560', { style: 'bunker', grade: 1, signs: 2 })
        for (let i = 0; i < 60 && rocks.length < MAX_ROCKS; i++) {
          const ang = rng() * Math.PI * 2
          const rr = Math.sqrt(rng()) * d.r
          rocks.push({ x: d.cx + Math.cos(ang) * rr, z: d.cz + Math.sin(ang) * rr, s: 1.5 + rng() * 3.5 })
        }
        scatterPoints(d, 40, lootPoints, d.grade)
        scatterPoints(d, 8, cratePoints, d.grade)
        break
      }
      case 'coast': {
        // Container yard rows.
        for (let row = 0; row < 6; row++) {
          for (let i = 0; i < 10; i++) {
            if (rng() < 0.3) continue
            const x = d.cx - 70 + i * 14
            const z = d.cz - 45 + row * 18
            const base = heightAt(x, z)
            if (base < 0.4) continue
            const c = SIGN_PALETTE[Math.floor(rng() * SIGN_PALETTE.length)]
            const tint = new THREE.Color(c).multiplyScalar(0.34)
            box({
              x, y: base, z, w: 12, h: 3.2 + (rng() < 0.35 ? 3.2 : 0), d: 5,
              color: `#${tint.getHexString()}`, solid: true, edges: true,
            })
          }
        }
        building(d.cx + 60, d.cz + 40, 26, 8, 36, '#44484f', { style: 'warehouse', grade: 2, signs: 2 })
        // Piers reaching into black water: march each one to the actual
        // shoreline instead of guessing where the sea is.
        for (let i = 0; i < 3; i++) {
          const px = d.cx - 40 + i * 45
          let z = d.cz
          while (heightAt(px, z) > 0 && z > d.cz - 450) z -= 4
          if (heightAt(px, z) > 0) continue
          box({ x: px, y: -0.7, z: z - 24, w: 6, h: 1.2, d: 70, color: '#3d3a33', solid: true, edges: false })
        }
        scatterPoints(d, 55, lootPoints, d.grade)
        scatterPoints(d, 12, cratePoints, d.grade)
        break
      }
      case 'military': {
        // Perimeter wall with gates — segmented so each stretch hugs the
        // terrain instead of floating off one centre height sample.
        const w = d.r * 0.85
        for (const [ox, oz, ww, dd] of [
          [0, -w, w * 1.7, 2], [0, w, w * 1.7, 2], [-w, 0, 2, w * 1.4], [w, 0, 2, w * 1.4],
        ]) {
          const segments = 8
          const alongX = ww > dd
          const len = alongX ? ww : dd
          for (let s = 0; s < segments; s++) {
            const off = -len / 2 + (s + 0.5) * (len / segments)
            const sx = d.cx + ox + (alongX ? off : 0)
            const sz = d.cz + oz + (alongX ? 0 : off)
            box({
              x: sx, y: heightAt(sx, sz) - 0.3, z: sz,
              w: alongX ? len / segments + 0.1 : 2, h: 4.8, d: alongX ? 2 : len / segments + 0.1,
              color: '#3c4038', solid: true, edges: false,
            })
          }
        }
        for (let i = 0; i < 3; i++) {
          building(d.cx - 60 + i * 60, d.cz - 30, 24, 10, 30, '#41463d', { style: 'hangar', grade: 3 })
        }
        for (let i = 0; i < 6; i++) {
          for (let attempt = 0; attempt < 10; attempt++) {
            const ang = rng() * Math.PI * 2
            const rr = rng() * d.r * 0.55
            if (building(d.cx + Math.cos(ang) * rr, d.cz + 25 + Math.sin(ang) * rr * 0.5, 9.5, 3.5, 9.5, '#373b34', { style: 'bunker', grade: 3 })) break
          }
        }
        building(d.cx, d.cz + 60, 10, 22, 10, '#454a41', { style: 'city', grade: 3, floors: 2, signs: 2 })
        scatterPoints(d, 60, lootPoints, d.grade)
        scatterPoints(d, 16, cratePoints, d.grade)
        break
      }
      case 'suburb': {
        for (let i = 0; i < 30; i++) {
          for (let attempt = 0; attempt < 10; attempt++) {
            const ang = rng() * Math.PI * 2
            const rr = Math.sqrt(rng()) * d.r * 0.9
            const x = d.cx + Math.cos(ang) * rr
            const z = d.cz + Math.sin(ang) * rr
            if (heightAt(x, z) < 0.6) continue
            const grey = 0.3 + rng() * 0.18
            const c = new THREE.Color(grey, grey * 0.95, grey * 0.9)
            if (building(x, z, 7 + rng() * 3, 3.6, 8 + rng() * 3, `#${c.getHexString()}`, { style: 'house', grade: 1 })) break
          }
        }
        scatterPoints(d, 30, lootPoints, d.grade)
        scatterPoints(d, 6, cratePoints, d.grade)
        break
      }
      case 'mine': {
        // Heliostat field: mirror posts that catch the dusk.
        for (let i = 0; i < 16 && cyls.length < MAX_CYLS; i++) {
          const ang = rng() * Math.PI * 2
          const rr = Math.sqrt(rng()) * d.r * 0.8
          const x = d.cx + Math.cos(ang) * rr
          const z = d.cz + Math.sin(ang) * rr
          cyls.push({ x, y: heightAt(x, z), z, r: 0.3, h: 6, color: '#55504a' })
          signs.push({ x, y: heightAt(x, z) + 6.2, z, w: 2.6, h: 1.6, d: 0.2, color: '#8a97a5' })
        }
        for (let i = 0; i < 5; i++) {
          for (let attempt = 0; attempt < 10; attempt++) {
            const ang = rng() * Math.PI * 2
            const rr = rng() * d.r * 0.6
            if (building(d.cx + Math.cos(ang) * rr, d.cz + Math.sin(ang) * rr, 10, 3.5, 14, '#4c463c', { style: 'shed', grade: 2, signs: 1 })) break
          }
        }
        scatterPoints(d, 50, lootPoints, d.grade)
        scatterPoints(d, 11, cratePoints, d.grade)
        break
      }
    }
  }

  // ——— Island-wide scatter ———
  for (let i = 0; i < 500 && trees.length < MAX_TREES; i++) {
    const ang = rng() * Math.PI * 2
    const rr = Math.sqrt(rng()) * ISLAND_RADIUS * 0.9
    const x = Math.cos(ang) * rr
    const z = Math.sin(ang) * rr
    if (heightAt(x, z) < 1 || districtAtFast(x, z)) continue
    trees.push({ x, z, s: 0.7 + rng() * 0.7 })
  }
  for (let i = 0; i < 120 && rocks.length < MAX_ROCKS; i++) {
    const ang = rng() * Math.PI * 2
    const rr = Math.sqrt(rng()) * ISLAND_RADIUS * 0.95
    const x = Math.cos(ang) * rr
    const z = Math.sin(ang) * rr
    if (heightAt(x, z) < 0.5) continue
    rocks.push({ x, z, s: 1 + rng() * 2.5 })
  }
  // Wilderness loot so rotations stay fed.
  for (let i = 0; i < 90; i++) {
    const ang = rng() * Math.PI * 2
    const rr = Math.sqrt(rng()) * ISLAND_RADIUS * 0.88
    const x = Math.cos(ang) * rr
    const z = Math.sin(ang) * rr
    if (heightAt(x, z) < 0.8) continue
    lootPoints.push({ x, z, grade: 1 })
  }
  for (let i = 0; i < 12; i++) {
    const ang = rng() * Math.PI * 2
    const rr = Math.sqrt(rng()) * ISLAND_RADIUS * 0.85
    const x = Math.cos(ang) * rr
    const z = Math.sin(ang) * rr
    if (heightAt(x, z) < 0.8) continue
    cratePoints.push({ x, z, grade: 1 })
  }

  // The pylon ring — always-lit navigation, per the design bible.
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2
    const x = Math.cos(ang) * ISLAND_RADIUS * 0.55
    const z = Math.sin(ang) * ISLAND_RADIUS * 0.55
    const base = heightAt(x, z)
    if (base < 0.5) continue
    cyls.push({ x, y: base, z, r: 1.1, h: 42, color: '#3f3d46' })
    box({ x, y: base + 34, z, w: 14, h: 1.2, d: 1.2, color: '#3f3d46', solid: false, edges: false })
    signs.push({ x, y: base + 43, z, w: 1.4, h: 1.4, d: 1.4, color: COLORS.danger })
  }

  // Structures sit on sloped terrain but sample height once: sink every
  // grounded box to its lowest footprint corner (top face stays put) so no
  // wall floats a shoot-under slit above downhill ground. Raised boxes
  // (arcade slabs, crossarms, piers over water) are left alone.
  for (const b of boxes) {
    if (!b.solid) continue
    if (b.y - heightAt(b.x, b.z) > 0.6) continue
    let minH = b.y
    for (const [cx, cz] of [
      [b.x - b.w / 2, b.z - b.d / 2], [b.x + b.w / 2, b.z - b.d / 2],
      [b.x - b.w / 2, b.z + b.d / 2], [b.x + b.w / 2, b.z + b.d / 2],
    ]) {
      minH = Math.min(minH, heightAt(cx, cz))
    }
    if (b.y - minH > 0.05) {
      b.h += b.y - minH
      b.y = minH
    }
  }

  // ——— Bake the instanced meshes ———
  const boxGeo = new THREE.BoxGeometry(1, 1, 1)
  boxGeo.translate(0, 0.5, 0)
  const boxMesh = new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial(), boxes.length)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const cvec = new THREE.Color()
  boxes.forEach((b, i) => {
    m.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(b.w, b.h, b.d))
    boxMesh.setMatrixAt(i, m)
    boxMesh.setColorAt(i, cvec.set(b.color))
    if (b.solid) {
      col.addBox({
        minX: b.x - b.w / 2, minY: b.y, minZ: b.z - b.d / 2,
        maxX: b.x + b.w / 2, maxY: b.y + b.h, maxZ: b.z + b.d / 2,
      })
    }
  })
  scene.add(boxMesh)

  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8)
  cylGeo.translate(0, 0.5, 0)
  const cylMesh = new THREE.InstancedMesh(cylGeo, new THREE.MeshLambertMaterial(), cyls.length)
  cyls.forEach((c, i) => {
    m.compose(new THREE.Vector3(c.x, c.y, c.z), q, new THREE.Vector3(c.r, c.h, c.r))
    cylMesh.setMatrixAt(i, m)
    cylMesh.setColorAt(i, cvec.set(c.color))
    col.addBox({
      minX: c.x - c.r, minY: c.y, minZ: c.z - c.r,
      maxX: c.x + c.r, maxY: c.y + c.h, maxZ: c.z + c.r,
    })
  })
  scene.add(cylMesh)

  const rockGeo = new THREE.DodecahedronGeometry(1)
  const rockMesh = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ color: '#514d55' }), rocks.length)
  rocks.forEach((r, i) => {
    const y = heightAt(r.x, r.z)
    m.compose(
      new THREE.Vector3(r.x, y + r.s * 0.2, r.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(r.x, r.z, 0)),
      new THREE.Vector3(r.s, r.s * 0.7, r.s),
    )
    rockMesh.setMatrixAt(i, m)
    if (r.s > 2.2) {
      col.addBox({
        minX: r.x - r.s * 0.7, minY: y, minZ: r.z - r.s * 0.7,
        maxX: r.x + r.s * 0.7, maxY: y + r.s * 0.6, maxZ: r.z + r.s * 0.7,
      })
    }
  })
  scene.add(rockMesh)

  // Glasspine trees: trunk + vitrified glass crown.
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 3.4, 5)
  trunkGeo.translate(0, 1.7, 0)
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: '#39302b' }), trees.length)
  const crownGeo = new THREE.ConeGeometry(1.6, 5.4, 6)
  crownGeo.translate(0, 5.6, 0)
  const crownMesh = new THREE.InstancedMesh(
    crownGeo,
    new THREE.MeshLambertMaterial({ color: '#4c6b52' }),
    trees.length,
  )
  trees.forEach((t, i) => {
    const y = heightAt(t.x, t.z)
    const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.x * 7)
    m.compose(new THREE.Vector3(t.x, y, t.z), rot, new THREE.Vector3(t.s, t.s, t.s))
    trunkMesh.setMatrixAt(i, m)
    crownMesh.setMatrixAt(i, m)
    col.addBox({
      minX: t.x - 0.3, minY: y, minZ: t.z - 0.3,
      maxX: t.x + 0.3, maxY: y + 3.2 * t.s, maxZ: t.z + 0.3,
    })
  })
  scene.add(trunkMesh, crownMesh)

  // Neon signs and beacons: MeshBasic ignores lighting, so these survive
  // Blackouts untouched — the landmark rule.
  const signGeo = new THREE.BoxGeometry(1, 1, 1)
  const signMesh = new THREE.InstancedMesh(signGeo, new THREE.MeshBasicMaterial(), signs.length)
  signs.forEach((s, i) => {
    m.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(s.w, s.h, s.d))
    signMesh.setMatrixAt(i, m)
    signMesh.setColorAt(i, cvec.set(s.color))
  })
  scene.add(signMesh)

  // Edge-glow: every flagged box contributes 12 additive edges, visible only
  // in the dark. "Hidden in the dark, never lost in it."
  const edgeBoxes = boxes.filter((b) => b.edges)
  const positions = new Float32Array(edgeBoxes.length * 24 * 3)
  let off = 0
  const E = [
    [0, 0, 0, 1, 0, 0], [0, 0, 1, 1, 0, 1], [0, 1, 0, 1, 1, 0], [0, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1],
    [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1],
  ]
  for (const b of edgeBoxes) {
    for (const e of E) {
      positions[off++] = b.x + (e[0] - 0.5) * b.w
      positions[off++] = b.y + e[1] * b.h
      positions[off++] = b.z + (e[2] - 0.5) * b.d
      positions[off++] = b.x + (e[3] - 0.5) * b.w
      positions[off++] = b.y + e[4] * b.h
      positions[off++] = b.z + (e[5] - 0.5) * b.d
    }
  }
  const edgeGeo = new THREE.BufferGeometry()
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const edgeGlow = new THREE.LineSegments(
    edgeGeo,
    new THREE.LineBasicMaterial({
      color: COLORS.cyanDim,
      transparent: true,
      opacity: 0.33,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  edgeGlow.visible = false
  scene.add(edgeGlow)

  return {
    cratePoints,
    lootPoints,
    setBlackout(dark: boolean) {
      edgeGlow.visible = dark
    },
  }
}

function insideAnyBox(boxes: BoxSpec[], x: number, z: number): boolean {
  for (const b of boxes) {
    if (
      x > b.x - b.w / 2 - 1 && x < b.x + b.w / 2 + 1 &&
      z > b.z - b.d / 2 - 1 && z < b.z + b.d / 2 + 1
    ) return true
  }
  return false
}

function districtAtFast(x: number, z: number): boolean {
  for (const d of DISTRICTS) {
    if (Math.hypot(x - d.cx, z - d.cz) < d.r) return true
  }
  return false
}
