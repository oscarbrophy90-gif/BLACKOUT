import * as THREE from 'three'
import {
  AMMO_LABEL, ARMOR_BY_ID, HEAL_BY_ID, RARITY_COLOR, RARITY_LABEL, RARITY_RANK,
  WEAPON_BY_ID, crateTierForGrade, rollCrate, rollGroundItem,
} from '@blackout/shared'
import type { CrateTier, ItemKind, Rarity, Rng } from '@blackout/shared'
import { emit, on } from '../core/events.ts'
import { audio } from '../core/audio.ts'
import type { Fx } from '../world/fx.ts'
import type { WorldData } from '../world/builder.ts'
import { heightAt } from '../world/terrain.ts'

// Everything lying on Vantera's ground: floor loot, crates, the supply drop.
// Floor items live in one InstancedMesh; crates are a few dozen real groups
// because their lids animate.

export interface FloorLoot {
  id: number
  item: ItemKind
  x: number
  y: number
  z: number
  rarity: Rarity
  slot: number
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
}

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

export class LootSystem {
  private scene: THREE.Scene
  private fx: Fx
  private floor = new Map<number, FloorLoot>()
  private crates = new Map<number, CrateInst>()
  private nextId = 1
  private inst: THREE.InstancedMesh
  private freeSlots: number[] = []
  private unsubs: (() => void)[] = []
  private mat4 = new THREE.Matrix4()
  private color = new THREE.Color()

  constructor(scene: THREE.Scene, fx: Fx) {
    this.scene = scene
    this.fx = fx
    const geo = new THREE.OctahedronGeometry(0.34)
    geo.translate(0, 0.55, 0)
    this.inst = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(), 1800)
    this.inst.frustumCulled = false
    for (let i = 0; i < 1800; i++) {
      this.mat4.makeScale(0, 0, 0)
      this.inst.setMatrixAt(i, this.mat4)
      this.freeSlots.push(1800 - 1 - i)
    }
    scene.add(this.inst)

    this.unsubs.push(on('blackoutStart', () => this.setDark(true)))
    this.unsubs.push(on('blackoutEnd', () => this.setDark(false)))
  }

  dispose(): void {
    for (const u of this.unsubs) u()
  }

  populate(world: WorldData, rng: Rng): void {
    for (const p of world.lootPoints) {
      if (rng() < 0.68) {
        // Better districts roll better weapons by nudging extra rolls.
        let item = rollGroundItem(rng)
        if (p.grade >= 2 && item.type === 'weapon' && rng() < (p.grade === 3 ? 0.5 : 0.25)) {
          const again = rollGroundItem(rng)
          if (again.type === 'weapon' && RARITY_RANK[again.rarity] > RARITY_RANK[item.rarity]) item = again
        }
        this.spawnFloor(item, p.x, p.z)
      }
    }
    for (const p of world.cratePoints) {
      if (rng() < 0.78) this.spawnCrate(crateTierForGrade(rng, p.grade), p.x, p.z)
    }
  }

  private setDark(dark: boolean): void {
    // Mil-Spec and better sends up a light column only the dark reveals —
    // Blackouts are the aggressor's (and looter's) window.
    if (dark) {
      for (const f of this.floor.values()) {
        if (RARITY_RANK[f.rarity] >= RARITY_RANK.legendary) {
          const beam = this.fx.beam(f.x, f.y, f.z, RARITY_COLOR[f.rarity], 0.5, 60, 0)
          if (beam) this.lootBeams.push(beam)
        }
      }
    } else {
      this.stopLootBeams()
    }
  }

  private lootBeams: THREE.Mesh[] = []

  private stopLootBeams(): void {
    for (const b of this.lootBeams) this.fx.stopBeam(b)
    this.lootBeams.length = 0
  }

  spawnFloor(item: ItemKind, x: number, z: number, y?: number): FloorLoot | null {
    const slot = this.freeSlots.pop()
    if (slot === undefined) return null
    const { rarity } = itemLabel(item)
    const fy = y ?? Math.max(0.2, heightAt(x, z))
    const loot: FloorLoot = { id: this.nextId++, item, x, y: fy, z, rarity, slot }
    this.floor.set(loot.id, loot)
    this.mat4.makeRotationY((loot.id % 12) * 0.5)
    this.mat4.setPosition(x, fy, z)
    this.inst.setMatrixAt(slot, this.mat4)
    this.inst.setColorAt(slot, this.color.set(RARITY_COLOR[rarity]))
    this.inst.instanceMatrix.needsUpdate = true
    if (this.inst.instanceColor) this.inst.instanceColor.needsUpdate = true
    return loot
  }

  takeFloor(id: number): ItemKind | null {
    const loot = this.floor.get(id)
    if (!loot) return null
    this.floor.delete(id)
    this.mat4.makeScale(0, 0, 0)
    this.inst.setMatrixAt(loot.slot, this.mat4)
    this.inst.instanceMatrix.needsUpdate = true
    this.freeSlots.push(loot.slot)
    return loot.item
  }

  spawnCrate(tier: CrateTier, x: number, z: number, falling = false): CrateInst {
    const y = Math.max(0.2, heightAt(x, z))
    const group = new THREE.Group()
    const c = RARITY_COLOR[TIER_RARITY[tier]]
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.7, 0.95),
      new THREE.MeshLambertMaterial({ color: '#2e2c33' }),
    )
    base.position.y = 0.35
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(1.34, 0.09, 0.99),
      new THREE.MeshBasicMaterial({ color: c }),
    )
    trim.position.y = 0.72
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.16, 0.95),
      new THREE.MeshLambertMaterial({ color: '#3a3741' }),
    )
    lid.geometry.translate(0, 0.08, 0.475)
    lid.position.set(0, 0.76, -0.475)
    group.add(base, trim, lid)
    group.position.set(x, falling ? 300 : y, z)
    group.rotation.y = (x * 13 + z * 7) % Math.PI
    this.scene.add(group)
    const crate: CrateInst = {
      id: this.nextId++, tier, x, y, z, state: 'closed', t: 0, group, lid,
      beam: falling ? this.fx.beam(x, y, z, c, 1.2, 200, 0) : null,
      falling,
    }
    this.crates.set(crate.id, crate)
    return crate
  }

  /** The mid-match event everyone can see falling. */
  supplyDrop(x: number, z: number, tier: CrateTier): void {
    this.spawnCrate(tier, x, z, true)
    emit('supplyDrop', { x, z })
    audio.supplyDropFlare()
  }

  /**
   * Closest thing the player can interact with, favouring what they look at.
   */
  nearestInteractable(pos: THREE.Vector3, maxDist = 2.8): { kind: 'floor' | 'crate'; id: number; label: string; color: string } | null {
    let best: { kind: 'floor' | 'crate'; id: number; label: string; color: string } | null = null
    let bestD = maxDist
    for (const f of this.floor.values()) {
      const d = Math.hypot(f.x - pos.x, f.z - pos.z)
      if (d < bestD && Math.abs(f.y - pos.y) < 3.5) {
        const { label, rarity } = itemLabel(f.item)
        best = { kind: 'floor', id: f.id, label, color: RARITY_COLOR[rarity] }
        bestD = d
      }
    }
    for (const c of this.crates.values()) {
      if (c.state !== 'closed' || c.falling) continue
      const d = Math.hypot(c.x - pos.x, c.z - pos.z)
      if (d < bestD && Math.abs(c.y - pos.y) < 3.5) {
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
    // Contents resolve when the lid finishes swinging.
    const items = rollCrate(rng, c.tier)
    window.setTimeout(() => {
      if (!this.crates.has(id)) return
      c.state = 'open'
      if (c.beam) {
        this.fx.stopBeam(c.beam)
        c.beam = null
      }
      this.fx.beam(c.x, c.y, c.z, RARITY_COLOR[TIER_RARITY[c.tier]], 0.8, 40, 1.2)
      items.forEach((item, i) => {
        const ang = (i / items.length) * Math.PI * 2 + c.group.rotation.y
        this.spawnFloor(item, c.x + Math.cos(ang) * 1.3, c.z + Math.sin(ang) * 1.3)
      })
      emit('crateOpened', { tier: c.tier })
    }, 900)
    return true
  }

  /** Bots vacuum the best weapon near them; abstractly, no animations. */
  botTakeBestWeaponNear(x: number, z: number, radius: number): ItemKind | null {
    let best: FloorLoot | null = null
    for (const f of this.floor.values()) {
      if (f.item.type !== 'weapon') continue
      const d = Math.hypot(f.x - x, f.z - z)
      if (d > radius) continue
      if (!best || RARITY_RANK[f.rarity] > RARITY_RANK[best.rarity]) best = f
    }
    return best ? this.takeFloor(best.id) : null
  }

  /** Nearest closed crate for bot goal-seeking. */
  nearestCrate(x: number, z: number, radius: number): { x: number; z: number } | null {
    let best: CrateInst | null = null
    let bestD = radius
    for (const c of this.crates.values()) {
      if (c.state !== 'closed' || c.falling) continue
      const d = Math.hypot(c.x - x, c.z - z)
      if (d < bestD) {
        best = c
        bestD = d
      }
    }
    return best ? { x: best.x, z: best.z } : null
  }

  update(dt: number): void {
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
      }
    }
  }
}
