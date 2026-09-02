import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { WeaponClass } from '@blackout/shared'

// One procedural model per weapon class, used three ways: the first-person
// viewmodel (separate materials per part), floor loot (merged, vertex-
// coloured, instanced) and shop previews. Part list is the single source.

export interface WeaponPart {
  kind: 'box' | 'cyl' | 'circle'
  size: [number, number, number] // box: w,h,d — cyl: rTop,rBottom,len — circle: r,-,-
  pos: [number, number, number]
  rotX?: number
  mat: 'body' | 'accent' | 'trim'
}

export function weaponLength(cls: WeaponClass): number {
  return cls === 'sniper' ? 0.62 : cls === 'dmr' ? 0.5 : cls === 'shotgun' ? 0.44 : cls === 'smg' ? 0.3 : cls === 'pistol' ? 0.16 : 0.4
}

export function weaponParts(cls: WeaponClass, longGlass: boolean): WeaponPart[] {
  const len = weaponLength(cls)
  const parts: WeaponPart[] = [
    { kind: 'box', size: [0.062, 0.085, 0.3], pos: [0, 0, -0.02], mat: 'body' },
    { kind: 'cyl', size: [0.017, 0.02, len], pos: [0, 0.008, -0.15 - len / 2], rotX: Math.PI / 2, mat: 'accent' },
    { kind: 'box', size: [0.05, 0.11, 0.05], pos: [0, -0.09, 0.06], mat: 'accent' },
  ]
  if (cls !== 'pistol') {
    if (cls === 'shotgun') parts.push({ kind: 'box', size: [0.045, 0.052, 0.112], pos: [0, -0.06, -0.05], mat: 'body' })
    else parts.push({ kind: 'box', size: [0.045, 0.13, 0.07], pos: [0, -0.1, -0.05], mat: 'body' })
    parts.push({ kind: 'box', size: [0.05, 0.08, 0.16], pos: [0, -0.005, 0.2], mat: 'body' })
  } else {
    parts.push({ kind: 'box', size: [0.04, 0.1, 0.05], pos: [0, -0.08, 0.05], mat: 'body' })
  }
  if (longGlass) {
    parts.push({ kind: 'cyl', size: [0.03, 0.03, 0.12], pos: [0, 0.075, -0.05], rotX: Math.PI / 2, mat: 'accent' })
    parts.push({ kind: 'circle', size: [0.024, 0, 0], pos: [0, 0.075, 0.012], mat: 'trim' })
  } else {
    parts.push({ kind: 'box', size: [0.008, 0.03, 0.008], pos: [0, 0.062, -0.13], mat: 'trim' })
    parts.push({ kind: 'box', size: [0.03, 0.02, 0.008], pos: [0, 0.058, 0.08], mat: 'accent' })
  }
  parts.push({ kind: 'box', size: [0.066, 0.012, 0.2], pos: [0, 0.02, -0.02], mat: 'trim' })
  if (cls === 'smg') parts.push({ kind: 'box', size: [0.05, 0.03, 0.12], pos: [0, -0.03, -0.14], mat: 'accent' })
  if (cls === 'shotgun') parts.push({ kind: 'cyl', size: [0.015, 0.015, len * 0.9], pos: [0, -0.02, -0.15 - len * 0.45], rotX: Math.PI / 2, mat: 'body' })
  if (cls === 'sniper') parts.push({ kind: 'box', size: [0.02, 0.06, 0.03], pos: [0, -0.04, -0.5], mat: 'accent' })
  return parts
}

function partGeometry(p: WeaponPart): THREE.BufferGeometry {
  let g: THREE.BufferGeometry
  if (p.kind === 'box') g = new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2])
  else if (p.kind === 'cyl') g = new THREE.CylinderGeometry(p.size[0], p.size[1], p.size[2], 8)
  else g = new THREE.CircleGeometry(p.size[0], 12)
  if (p.rotX) g.rotateX(p.rotX)
  g.translate(p.pos[0], p.pos[1], p.pos[2])
  return g
}

/** Separate meshes with shared materials — the viewmodel and previews. */
export function buildWeaponGroup(cls: WeaponClass, longGlass: boolean, mats: { body: THREE.Material; accent: THREE.Material; trim: THREE.Material }): THREE.Group {
  const g = new THREE.Group()
  for (const p of weaponParts(cls, longGlass)) {
    const mesh = new THREE.Mesh(partGeometry(p), mats[p.mat])
    g.add(mesh)
  }
  return g
}

const mergedCache = new Map<string, THREE.BufferGeometry>()

/** One merged, vertex-coloured geometry per class for InstancedMesh. */
export function mergedWeaponGeometry(cls: WeaponClass): THREE.BufferGeometry {
  const cached = mergedCache.get(cls)
  if (cached) return cached
  const longGlass = cls === 'sniper' || cls === 'dmr'
  const colors: Record<WeaponPart['mat'], THREE.Color> = {
    body: new THREE.Color('#3c4450'),
    accent: new THREE.Color('#22262e'),
    trim: new THREE.Color('#c8d2dc'),
  }
  const geos: THREE.BufferGeometry[] = []
  for (const p of weaponParts(cls, longGlass)) {
    const g = partGeometry(p).toNonIndexed()
    const n = g.attributes.position.count
    const col = new Float32Array(n * 3)
    const c = colors[p.mat]
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geos.push(g)
  }
  const merged = mergeGeometries(geos, false)!
  merged.computeVertexNormals()
  for (const g of geos) g.dispose()
  mergedCache.set(cls, merged)
  return merged
}
