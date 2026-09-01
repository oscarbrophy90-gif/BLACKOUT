import * as THREE from 'three'
import { makeRng, deriveSeed } from '@blackout/shared'
import { ISLAND_RADIUS, MAP_SIZE, WATER_LEVEL } from '../config.ts'

// Vantera itself. The island is analytic — heightAt(x, z) is a pure function
// of fixed world seed — so collision, bots and the minimap never need a
// raycast against the terrain mesh. The map is the SAME every match by
// design (a designed home turf, like a real BR map); matches differ through
// loot, zone pulls and the other 99 contracts.

export const WORLD_SEED = 0x9e3779b9

export type DistrictArchetype = 'city' | 'industrial' | 'forest' | 'mountain' | 'coast' | 'military' | 'suburb' | 'mine'

export interface District {
  id: string
  name: string
  archetype: DistrictArchetype
  cx: number
  cz: number
  r: number
  /** Loot quality 1..3. */
  grade: 1 | 2 | 3
  /** If set, terrain blends to this plateau height inside the district. */
  flatten: number | null
}

export const DISTRICTS: readonly District[] = [
  { id: 'filament', name: 'Filament Row', archetype: 'city', cx: -60, cz: 150, r: 250, grade: 2, flatten: 9 },
  { id: 'coilworks', name: 'The Coilworks', archetype: 'industrial', cx: 400, cz: -190, r: 200, grade: 2, flatten: 7 },
  { id: 'glasspine', name: 'Glasspine Reach', archetype: 'forest', cx: -430, cz: -270, r: 270, grade: 1, flatten: null },
  { id: 'pylon', name: 'Pylon Ridge', archetype: 'mountain', cx: 360, cz: 390, r: 240, grade: 1, flatten: null },
  { id: 'breakwater', name: 'Breakwater Terminal', archetype: 'coast', cx: -170, cz: -600, r: 190, grade: 2, flatten: 3.5 },
  { id: 'substation', name: 'Substation Zero', archetype: 'military', cx: 90, cz: -330, r: 150, grade: 3, flatten: 11 },
  { id: 'sinks', name: 'The Sinks', archetype: 'suburb', cx: -520, cz: 230, r: 190, grade: 1, flatten: 1.2 },
  { id: 'quarry', name: 'Hollowlight Quarry', archetype: 'mine', cx: 520, cz: 140, r: 170, grade: 2, flatten: -4 },
] as const

// ——— Deterministic value noise ———

const PERM = (() => {
  const rng = makeRng(deriveSeed(WORLD_SEED, 'noise'))
  const p = new Uint8Array(512)
  const base = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[base[i], base[j]] = [base[j], base[i]]
  }
  for (let i = 0; i < 512; i++) p[i] = base[i & 255]
  return p
})()

function hash2(ix: number, iz: number): number {
  return PERM[(PERM[ix & 255] + iz) & 255] / 255
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = smooth(x - ix)
  const fz = smooth(z - iz)
  const a = hash2(ix, iz)
  const b = hash2(ix + 1, iz)
  const c = hash2(ix, iz + 1)
  const d = hash2(ix + 1, iz + 1)
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz
}

function fbm(x: number, z: number, octaves: number): number {
  let amp = 0.5
  let freq = 1
  let sum = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, z * freq)
    amp *= 0.5
    freq *= 2.1
  }
  return sum
}

// ——— The height function ———

export function heightAt(x: number, z: number): number {
  const r = Math.hypot(x, z)
  // Island mask: 1 inland, 0 at the rim, negative under the sea.
  const rim = 1 - smooth(Math.min(1, Math.max(0, (r - ISLAND_RADIUS * 0.72) / (ISLAND_RADIUS * 0.28))))
  if (rim <= 0) return WATER_LEVEL - 3 - (r - ISLAND_RADIUS) * 0.05

  let h = fbm(x * 0.0018, z * 0.0018, 4) * 42 * rim + rim * 4 - 2

  // Pylon Ridge lifts the north-east into real mountains.
  const ridge = Math.max(0, 1 - Math.hypot(x - 360, z - 390) / 300)
  h += smooth(ridge) * 55 * (0.6 + 0.4 * fbm(x * 0.004, z * 0.004, 3))

  // District plateaus: streets need to be flat enough to fight on.
  for (const d of DISTRICTS) {
    if (d.flatten === null) continue
    const dist = Math.hypot(x - d.cx, z - d.cz)
    if (dist < d.r) {
      const w = smooth(1 - dist / d.r)
      h = h + (d.flatten - h) * Math.min(1, w * 1.6)
    }
  }
  return h
}

export function districtAt(x: number, z: number): District | null {
  for (const d of DISTRICTS) {
    if (Math.hypot(x - d.cx, z - d.cz) < d.r) return d
  }
  return null
}

// ——— Terrain + water meshes ———

const GROUND_COLORS = {
  sand: new THREE.Color('#6e6250'),
  moss: new THREE.Color('#3b4a33'),
  rock: new THREE.Color('#4d4a52'),
  high: new THREE.Color('#5c5964'),
  street: new THREE.Color('#33363e'),
  mud: new THREE.Color('#463f33'),
}

export function buildTerrain(): { ground: THREE.Mesh; water: THREE.Mesh } {
  const segs = 160
  const geo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, segs, segs)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const tint = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const h = heightAt(x, z)
    pos.setY(i, h)
    const d = districtAt(x, z)
    if (d && d.flatten !== null && h > WATER_LEVEL + 0.5) {
      tint.copy(d.archetype === 'suburb' ? GROUND_COLORS.mud : GROUND_COLORS.street)
    } else if (h < 1.2) tint.copy(GROUND_COLORS.sand)
    else if (h > 34) tint.copy(GROUND_COLORS.high)
    else if (h > 20) tint.copy(GROUND_COLORS.rock)
    else tint.copy(GROUND_COLORS.moss)
    // Grain keeps big flats from reading as untextured voids.
    const grain = 0.92 + valueNoise(x * 0.05, z * 0.05) * 0.16
    colors[i * 3] = tint.r * grain
    colors[i * 3 + 1] = tint.g * grain
    colors[i * 3 + 2] = tint.b * grain
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  const ground = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  )
  ground.name = 'terrain'

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_SIZE * 2.5, MAP_SIZE * 2.5),
    new THREE.MeshLambertMaterial({ color: '#101b2a' }),
  )
  water.rotation.x = -Math.PI / 2
  water.position.y = WATER_LEVEL
  water.name = 'water'
  return { ground, water }
}
