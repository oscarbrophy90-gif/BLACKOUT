import * as THREE from 'three'
import {
  AMMO_LABEL, ARMOR_BY_ID, HEAL_BY_ID, RARITY_COLOR, RARITY_LABEL, RARITY_RANK,
  WEAPON_BY_ID, crateTierForGrade, dps, rollCrate, rollGroundItem,
} from '@blackout/shared'
import type { CrateTier, ItemKind, Rarity, Rng, WeaponClass } from '@blackout/shared'
import { emit, on } from '../core/events.ts'
import { audio } from '../core/audio.ts'
import type { Fx } from '../world/fx.ts'
import type { WorldData } from '../world/builder.ts'
import { heightAt } from '../world/terrain.ts'
import { mergedWeaponGeometry } from '../weapons/models.ts'

// Everything lying on Vantera's ground. Floor items render as what they
// ARE — a recognisable weapon model, an ammo tin, a med cell, a vest —
// wrapped in a rarity-coloured outline (inverted hull) and, for Mil-Spec
// and better, a glow sprite and a light column in the dark.

export interface FloorLoot {
  id: number
  item: ItemKind
  x: number
  y: number
  z: number
  rarity: Rarity
  kind: VisualKind
  slot: number
  buildingId: number | null
}

export interface CrateInst {
  id: number
  tier: CrateTier
  x: number
  y: number
  z: number
  state: 'closed' | 'opening' | 'open'
  t: number
  group: THREE.Group
  lid: THREE.Mesh
  beam: THREE.Mesh | null
  falling: boolean
  pending: ItemKind[] | null
  buildingId: number | null
}

type VisualKind = WeaponClass | 'ammo' | 'heal' | 'armor'
const KINDS: VisualKind[] = ['ar', 'smg', 'shotgun', 'sniper', 'dmr', 'pistol', 'ammo', 'heal', 'armor']
const CAP: Record<VisualKind, number> = { ar: 260, smg: 260, shotgun: 200, sniper: 160, dmr: 200, pistol: 260, ammo: 500, heal: 420, armor: 260 }

const TIER_RARITY: Record<CrateTier, Rarity> = {
  normal: 'common', rare: 'rare', epic: 'epic',
  legendary: 'legendary', mythic: 'mythic', exotic: 'exotic',
}

export function itemLabel(item: ItemKind): { label: string; rarity: Rarity } {
  switch (item.type) {
    case 'weapon': {
      const def = WEAPON_BY_ID.get(item.weaponId)!
      return { label: `${def.name} — ${RARITY_LABEL[item.rarity]}`, rarity: item.rarity }
    }
    case 'ammo':
      return { label: `${AMMO_LABEL[item.ammo]} ×${item.amount}`, rarity: 'common' }
    case 'heal': {
      const def = HEAL_BY_ID.get(item.healId)!
      const rarity: Rarity = item.healId === 'trickle' ? 'common' : item.healId === 'surge' ? 'uncommon' : item.healId === 'medloop' ? 'rare' : 'epic'
      return { label: item.amount > 1 ? `${def.name} ×${item.amount}` : def.name, rarity }
    }
    case 'armor': {
      const def = ARMOR_BY_ID.get(item.armorId)!
      return { label: def.name, rarity: def.rarity }
    }
  }
}

function visualKind(item: ItemKind): VisualKind {
  if (item.type === 'weapon') return WEAPON_BY_ID.get(item.weaponId)!.cls
  return item.type
}

/** Non-weapon pickups get their own recognisable shapes. */
function kindGeometry(kind: VisualKind): THREE.BufferGeometry {
  if (kind === 'ammo') {
    const g = new THREE.BoxGeometry(0.28, 0.16, 0.18)
    const col = new Float32Array(g.attributes.position.count * 3).fill(0.35)
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }
  if (kind === 'heal') {
    const g = new THREE.CapsuleGeometry(0.07, 0.22, 3, 8)
    g.rotateZ(Math.PI / 2)
    const n = g.attributes.position.count
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { col[i * 3] = 0.85; col[i * 3 + 1] = 0.9; col[i * 3 + 2] = 0.95 }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }
  if (kind === 'armor') {
    const g = new THREE.BoxGeometry(0.34, 0.4, 0.08)
    const n = g.attributes.position.count
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { col[i * 3] = 0.22; col[i * 3 + 1] = 0.26; col[i * 3 + 2] = 0.3 }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }
  const merged = mergedWeaponGeometry(kind).clone()
  merged.scale(2.2, 2.2, 2.2) // floor weapons read bigger than the viewmodel
  return merged
}

interface KindPool {
  mesh: THREE.InstancedMesh
  outline: THREE.InstancedMesh
  free: number[]
}

export class LootSystem {
  private scene: THREE.Scene
  private fx: Fx
  private floor = new Map<number, FloorLoot>()
  private crates = new Map<number, CrateInst>()
  private nextId = 1
  private pools: Record<VisualKind, KindPool>
  private glows = new Map<number, THREE.Sprite>()
  private glowTex: THREE.Texture
  private unsubs: (() => void)[] = []
  private mat4 = new THREE.Matrix4()
  private mat4b = new THREE.Matrix4()
  private readonly rotZ = new THREE.Matrix4().makeRotationZ(0.35)
  private readonly outlineScale = new THREE.Matrix4().makeScale(1.16, 1.16, 1.16)
  private touched = new Set<VisualKind>()
  private color = new THREE.Color()
  private dark = false
  private lootBeams = new Map<number, THREE.Mesh>()
  private spinT = 0

  constructor(scene: THREE.Scene, fx: Fx) {
    this.scene = scene
    this.fx = fx
    this.glowTex = makeGlowTexture()
    this.pools = {} as Record<VisualKind, KindPool>
    for (const kind of KINDS) {
      const geo = kindGeometry(kind)
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), CAP[kind])
      const outline = new THREE.InstancedMesh(
        geo,
        new THREE.MeshBasicMaterial({ side: THREE.BackSide, transparent: true, opacity: 0.85 }),
        CAP[kind],
      )
      mesh.frustumCulled = false
      outline.frustumCulled = false
      const free: number[] = []
      for (let i = 0; i < CAP[kind]; i++) {
        this.mat4.makeScale(0, 0, 0)
        mesh.setMatrixAt(i, this.mat4)
        outline.setMatrixAt(i, this.mat4)
        free.push(CAP[kind] - 1 - i)
      }
      scene.add(mesh, outline)
      this.pools[kind] = { mesh, outline, free }
    }
    this.unsubs.push(on('blackoutStart', () => this.setDark(true)))
    this.unsubs.push(on('blackoutEnd', () => this.setDark(false)))
  }

  dispose(): void {
    for (const u of this.unsubs) u()
    this.crates.clear()
  }

  populate(world: WorldData, rng: Rng): void {
    for (const p of world.lootPoints) {
      const chance = p.buildingId ? 0.8 : 0.62
      if (rng() < chance) {
        let item = rollGroundItem(rng)
        if (p.grade >= 2 && item.type === 'weapon' && rng() < (p.grade === 3 ? 0.5 : 0.25)) {
          const again = rollGroundItem(rng)
          if (again.type === 'weapon' && RARITY_RANK[again.rarity] > RARITY_RANK[item.rarity]) item = again
        }
        this.spawnFloor(item, p.x, p.z, p.y, p.buildingId ?? null)
      }
    }
    for (const p of world.cratePoints) {
      if (rng() < 0.78) this.spawnCrate(crateTierForGrade(rng, p.grade), p.x, p.z, false, p.y, p.buildingId ?? null)
    }
  }

  private setDark(dark: boolean): void {
    this.dark = dark
    if (dark) {
      for (const f of this.floor.values()) this.maybeBeam(f)
    } else {
      for (const b of this.lootBeams.values()) this.fx.stopBeam(b)
      this.lootBeams.clear()
    }
    // Rarity glows are the Blackout's loot language: brighter in the dark.
    for (const [id, s] of this.glows) {
      const f = this.floor.get(id)
      if (f) (s.material as THREE.SpriteMaterial).opacity = dark ? 0.9 : 0.45
    }
  }

  private maybeBeam(f: FloorLoot): void {
    if (!this.dark || this.lootBeams.has(f.id)) return
    if (RARITY_RANK[f.rarity] < RARITY_RANK.legendary) return
    const beam = this.fx.beam(f.x, f.y, f.z, RARITY_COLOR[f.rarity], 0.5, 60, 0)
    if (beam) this.lootBeams.set(f.id, beam)
  }

  private writeInstance(loot: FloorLoot, spin: number): void {
    const pool = this.pools[loot.kind]
    const lift = loot.item.type === 'weapon' ? 0.42 : 0.28
    const bob = Math.sin(spin * 1.7 + loot.id) * 0.03
    // Scratch matrices only: this runs for every nearby item every frame.
    this.mat4.makeRotationY(spin + loot.id * 0.7)
    if (loot.item.type === 'weapon') this.mat4.multiply(this.rotZ)
    this.mat4.setPosition(loot.x, loot.y + lift + bob, loot.z)
    pool.mesh.setMatrixAt(loot.slot, this.mat4)
    this.mat4b.copy(this.mat4).multiply(this.outlineScale)
    pool.outline.setMatrixAt(loot.slot, this.mat4b)
  }

  /** Bots only ever reach the level they stand on (they do not climb stairs). */
  private static sameLevel(fy: number, y: number): boolean {
    return Math.abs(fy - y) < 1.5
  }

  spawnFloor(item: ItemKind, x: number, z: number, y?: number, buildingId: number | null = null): FloorLoot | null {
    const kind = visualKind(item)
    const pool = this.pools[kind]
    const slot = pool.free.pop()
    if (slot === undefined) return null
    const { rarity } = itemLabel(item)
    const fy = y ?? Math.max(0.2, heightAt(x, z))
    const loot: FloorLoot = { id: this.nextId++, item, x, y: fy, z, rarity, kind, slot, buildingId }
    this.floor.set(loot.id, loot)
    this.writeInstance(loot, this.spinT)
    pool.outline.setColorAt(slot, this.color.set(RARITY_COLOR[rarity]))
    pool.mesh.instanceMatrix.needsUpdate = true
    pool.outline.instanceMatrix.needsUpdate = true
    if (pool.outline.instanceColor) pool.outline.instanceColor.needsUpdate = true
    // Rare and better: a soft glow sprite so the eye finds it across a room.
    if (RARITY_RANK[rarity] >= RARITY_RANK.rare) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, color: RARITY_COLOR[rarity], transparent: true, opacity: this.dark ? 0.9 : 0.45,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }))
      sprite.position.set(x, fy + 0.45, z)
      sprite.scale.setScalar(1.2 + RARITY_RANK[rarity] * 0.25)
      this.scene.add(sprite)
      this.glows.set(loot.id, sprite)
    }
    this.maybeBeam(loot)
    return loot
  }

  getFloor(id: number): FloorLoot | null {
    return this.floor.get(id) ?? null
  }

  takeFloor(id: number): ItemKind | null {
    const loot = this.floor.get(id)
    if (!loot) return null
    this.floor.delete(id)
    const beam = this.lootBeams.get(id)
    if (beam) {
      this.fx.stopBeam(beam)
      this.lootBeams.delete(id)
    }
    const glow = this.glows.get(id)
    if (glow) {
      this.scene.remove(glow)
      glow.material.dispose()
      this.glows.delete(id)
    }
    const pool = this.pools[loot.kind]
    this.mat4.makeScale(0, 0, 0)
    pool.mesh.setMatrixAt(loot.slot, this.mat4)
    pool.outline.setMatrixAt(loot.slot, this.mat4)
    pool.mesh.instanceMatrix.needsUpdate = true
    pool.outline.instanceMatrix.needsUpdate = true
    pool.free.push(loot.slot)
    return loot.item
  }

  spawnCrate(tier: CrateTier, x: number, z: number, falling = false, y?: number, buildingId: number | null = null): CrateInst {
    const cy = y ?? Math.max(0.2, heightAt(x, z))
    const group = new THREE.Group()
    const c = RARITY_COLOR[TIER_RARITY[tier]]
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 0.95), new THREE.MeshLambertMaterial({ color: '#2e2c33' }))
    base.position.y = 0.35
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.09, 0.99), new THREE.MeshBasicMaterial({ color: c }))
    trim.position.y = 0.72
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.16, 0.95), new THREE.MeshLambertMaterial({ color: '#3a3741' }))
    lid.geometry.translate(0, 0.08, 0.475)
    lid.position.set(0, 0.76, -0.475)
    group.add(base, trim, lid)
    group.position.set(x, falling ? 300 : cy, z)
    group.rotation.y = (x * 13 + z * 7) % Math.PI
    this.scene.add(group)
    const crate: CrateInst = {
      id: this.nextId++, tier, x, y: cy, z, state: 'closed', t: 0, group, lid,
      beam: falling ? this.fx.beam(x, cy, z, c, 1.2, 200, 0) : null,
      falling, pending: null, buildingId,
    }
    this.crates.set(crate.id, crate)
    return crate
  }

  supplyDrop(x: number, z: number, tier: CrateTier): void {
    this.spawnCrate(tier, x, z, true)
    emit('supplyDrop', { x, z })
    audio.supplyDropFlare()
  }

  nearestInteractable(pos: THREE.Vector3, maxDist = 2.8): { kind: 'floor' | 'crate'; id: number; label: string; color: string } | null {
    let best: { kind: 'floor' | 'crate'; id: number; label: string; color: string } | null = null
    let bestD = maxDist
    for (const f of this.floor.values()) {
      const d = Math.hypot(f.x - pos.x, f.z - pos.z)
      if (d < bestD && Math.abs(f.y + 0.4 - pos.y) < 2.6) {
        const { label, rarity } = itemLabel(f.item)
        best = { kind: 'floor', id: f.id, label, color: RARITY_COLOR[rarity] }
        bestD = d
      }
    }
    for (const c of this.crates.values()) {
      if (c.state !== 'closed' || c.falling) continue
      const d = Math.hypot(c.x - pos.x, c.z - pos.z)
      if (d < bestD && Math.abs(c.y + 0.4 - pos.y) < 2.6) {
        best = { kind: 'crate', id: c.id, label: `${c.tier.toUpperCase()} CRATE`, color: RARITY_COLOR[TIER_RARITY[c.tier]] }
        bestD = d
      }
    }
    return best
  }

  openCrate(id: number, rng: Rng): boolean {
    const c = this.crates.get(id)
    if (!c || c.state !== 'closed' || c.falling) return false
    c.state = 'opening'
    c.t = 0
    audio.crateOpen(TIER_RARITY[c.tier])
    c.pending = rollCrate(rng, c.tier)
    return true
  }

  botOpenCrateNear(x: number, y: number, z: number, radius: number, rng: Rng): boolean {
    for (const c of this.crates.values()) {
      if (c.state !== 'closed' || c.falling) continue
      if (!LootSystem.sameLevel(c.y, y)) continue
      if (Math.hypot(c.x - x, c.z - z) <= radius) return this.openCrate(c.id, rng)
    }
    return false
  }

  /** Bots take a weapon only when it beats what they carry (0 = anything). */
  botTakeBestWeaponNear(x: number, y: number, z: number, radius: number, minPower: number): ItemKind | null {
    let best: FloorLoot | null = null
    let bestPower = minPower
    for (const f of this.floor.values()) {
      if (f.item.type !== 'weapon') continue
      if (!LootSystem.sameLevel(f.y, y)) continue
      const d = Math.hypot(f.x - x, f.z - z)
      if (d > radius) continue
      const def = WEAPON_BY_ID.get(f.item.weaponId)
      if (!def) continue
      const power = dps(def, f.item.rarity)
      if (power > bestPower) {
        best = f
        bestPower = power
      }
    }
    return best ? this.takeFloor(best.id) : null
  }

  /** Bots also pocket consumables and armour lying around them. */
  botTakeSuppliesNear(x: number, y: number, z: number, radius: number, wantArmor: boolean): ItemKind[] {
    const got: ItemKind[] = []
    for (const f of [...this.floor.values()]) {
      if (f.item.type === 'weapon') continue
      if (f.item.type === 'armor' && !wantArmor) continue
      if (!LootSystem.sameLevel(f.y, y)) continue
      if (Math.hypot(f.x - x, f.z - z) > radius) continue
      const it = this.takeFloor(f.id)
      if (it) got.push(it)
      if (got.length >= 2) break
    }
    return got
  }

  /** Nearest floor weapon for a bot goal; interiors count, but only this level and never a blacklisted id. */
  nearestWeaponPoint(x: number, y: number, z: number, radius: number, minPower: number, exclude?: ReadonlySet<number>): { id: number; x: number; z: number; buildingId: number | null } | null {
    let best: FloorLoot | null = null
    let bestD = radius
    for (const f of this.floor.values()) {
      if (f.item.type !== 'weapon') continue
      if (!LootSystem.sameLevel(f.y, y) || exclude?.has(f.id)) continue
      const def = WEAPON_BY_ID.get(f.item.weaponId)
      if (!def || dps(def, f.item.rarity) <= minPower) continue
      const d = Math.hypot(f.x - x, f.z - z)
      if (d < bestD) {
        best = f
        bestD = d
      }
    }
    return best ? { id: best.id, x: best.x, z: best.z, buildingId: best.buildingId } : null
  }

  /** QA hook: the nearest floor weapon with its resting height. */
  debugNearestWeapon(x: number, z: number): { x: number; y: number; z: number; buildingId: number | null } | null {
    let best: FloorLoot | null = null
    let bestD = Infinity
    for (const f of this.floor.values()) {
      if (f.item.type !== 'weapon') continue
      const d = Math.hypot(f.x - x, f.z - z)
      if (d < bestD) {
        best = f
        bestD = d
      }
    }
    return best ? { x: best.x, y: best.y, z: best.z, buildingId: best.buildingId } : null
  }

  nearestCrate(x: number, y: number, z: number, radius: number, exclude?: ReadonlySet<number>): { id: number; x: number; z: number; buildingId: number | null } | null {
    let best: CrateInst | null = null
    let bestD = radius
    for (const c of this.crates.values()) {
      if (c.state !== 'closed' || c.falling) continue
      if (!LootSystem.sameLevel(c.y, y) || exclude?.has(c.id)) continue
      const d = Math.hypot(c.x - x, c.z - z)
      if (d < bestD) {
        best = c
        bestD = d
      }
    }
    return best ? { id: best.id, x: best.x, z: best.z, buildingId: best.buildingId } : null
  }

  update(dt: number, cameraPos: THREE.Vector3): void {
    this.spinT += dt
    // Slow spin + bob for items near the camera — the classic loot read.
    const touched = this.touched
    touched.clear()
    for (const f of this.floor.values()) {
      const dx = f.x - cameraPos.x
      const dz = f.z - cameraPos.z
      if (dx * dx + dz * dz > 70 * 70) continue
      this.writeInstance(f, this.spinT)
      touched.add(f.kind)
    }
    for (const k of touched) {
      this.pools[k].mesh.instanceMatrix.needsUpdate = true
      this.pools[k].outline.instanceMatrix.needsUpdate = true
    }
    for (const [id, s] of this.glows) {
      const f = this.floor.get(id)
      if (f) s.scale.setScalar((1.2 + RARITY_RANK[f.rarity] * 0.25) * (1 + Math.sin(this.spinT * 3 + id) * 0.12))
    }
    for (const c of this.crates.values()) {
      if (c.falling) {
        c.group.position.y = Math.max(c.y, c.group.position.y - 42 * dt)
        if (c.group.position.y <= c.y + 0.01) {
          c.falling = false
          this.fx.ring(c.x, c.y, c.z, '#ffc247', 8, 0.8)
          audio.land()
        }
      }
      if (c.state === 'opening') {
        c.t += dt
        c.lid.rotation.x = -Math.min(1.9, c.t * 2.4)
        if (c.t >= 0.9 && c.pending) {
          const items = c.pending
          c.pending = null
          c.state = 'open'
          if (c.beam) {
            this.fx.stopBeam(c.beam)
            c.beam = null
          }
          this.fx.beam(c.x, c.y, c.z, RARITY_COLOR[TIER_RARITY[c.tier]], 0.8, 40, 1.2)
          items.forEach((item, i) => {
            const ang = (i / items.length) * Math.PI * 2 + c.group.rotation.y
            this.spawnFloor(item, c.x + Math.cos(ang) * 1.1, c.z + Math.sin(ang) * 1.1, c.y, c.buildingId)
          })
          emit('crateOpened', { tier: c.tier, x: c.x, z: c.z })
        }
      }
    }
  }
}

function makeGlowTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,0.9)')
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}
