import * as THREE from 'three'
import { WEAPON_BY_ID, falloff, scaledDamage, scaledMag, signatureOf } from '@blackout/shared'
import type { WeaponDef, WeaponSkinItem } from '@blackout/shared'
import { audio } from '../core/audio.ts'
import { emit } from '../core/events.ts'
import type { Input } from '../core/input.ts'
import type { CollisionWorld } from '../world/collision.ts'
import { rayVsActor } from '../world/collision.ts'
import type { Fx } from '../world/fx.ts'
import type { Emissions } from '../game/blackout.ts'
import type { FPSController } from '../player/controller.ts'
import type { Inventory } from '../player/inventory.ts'
import { Viewmodel } from './viewmodel.ts'

// Firing, spread, recoil, reload — all data-driven from the shared weapon
// table. Anything that can be hit implements TargetField (today: bots).

export interface HitTarget {
  id: string
  x: number
  y: number
  z: number
  eyeHeight: number
}

export interface TargetField {
  shootable(): HitTarget[]
  damage(id: string, amount: number, headshot: boolean, weaponDefId: string | null): { killed: boolean }
}

const TRACER_COLOR: Record<string, string> = {
  'Voskaya Combine': '#ffc247',
  'Halcyon Grid Authority': '#a8dfe8',
  'Brant & Marrow': '#ff9a4d',
}

export const MELEE_DAMAGE = 55
export const MELEE_RANGE = 2.7

export class WeaponSystem {
  private inv: Inventory
  private controller: FPSController
  private vm: Viewmodel
  private fx: Fx
  private col: CollisionWorld
  private field: TargetField
  private emissions: Emissions
  adsFactor = 0
  private bloom = 0
  private cooldown = 0
  private switchT = 0
  private meleeCd = 0
  private reloading: { tLeft: number; total: number; racked: boolean } | null = null
  private tmpEye = new THREE.Vector3()
  private tmpDir = new THREE.Vector3()
  private tmpMuzzle = new THREE.Vector3()
  private tmpEnd = new THREE.Vector3()
  /** Match metric hooks. */
  onDamageDealt: ((amount: number) => void) | null = null
  dark = false

  constructor(opts: {
    inv: Inventory
    controller: FPSController
    viewmodel: Viewmodel
    fx: Fx
    col: CollisionWorld
    field: TargetField
    emissions: Emissions
  }) {
    this.inv = opts.inv
    this.controller = opts.controller
    this.vm = opts.viewmodel
    this.fx = opts.fx
    this.col = opts.col
    this.field = opts.field
    this.emissions = opts.emissions
  }

  activeDef(): WeaponDef | null {
    const w = this.inv.activeWeapon()
    return w ? WEAPON_BY_ID.get(w.defId)! : null
  }

  /** Multiply the base FOV by this (ADS zoom). */
  fovScale(): number {
    const def = this.activeDef()
    if (!def) return 1
    return THREE.MathUtils.lerp(1, 1 / def.adsZoom, this.adsFactor)
  }

  /** Crosshair spread in degrees, for the HUD. */
  spreadDeg(): number {
    const def = this.activeDef()
    if (!def) return 0.8
    return this.currentSpread(def)
  }

  private currentSpread(def: WeaponDef): number {
    const ads = this.adsFactor
    const base = def.baseSpread * THREE.MathUtils.lerp(1, def.adsSpreadMult, ads)
    const movePenalty = def.baseSpread * 0.7 * this.controller.moveFactor * (1 - ads * 0.6)
    const crouchBonus = this.controller.crouching ? 0.8 : 1
    return (base + movePenalty + this.bloom * (1 - ads * 0.5)) * crouchBonus
  }

  /** Refresh the held model after inventory changes (pickup, swap). */
  refreshViewmodel(skin: WeaponSkinItem): void {
    const w = this.inv.activeWeapon()
    if (this.inv.active === 2) this.vm.setWeapon({ type: 'melee' }, skin)
    else if (w) this.vm.setWeapon({ type: 'gun', def: WEAPON_BY_ID.get(w.defId)! }, skin)
    else this.vm.setWeapon({ type: 'none' }, skin)
    this.switchT = 0.3
    this.reloading = null
    this.vm.cancelReload()
  }

  startReload(): void {
    const w = this.inv.activeWeapon()
    if (!w || this.reloading) return
    const def = WEAPON_BY_ID.get(w.defId)!
    const magCap = scaledMag(def, w.rarity)
    if (w.mag >= magCap || this.inv.ammo[def.ammo] <= 0) return
    const dur = def.reloadTime
    this.reloading = { tLeft: dur, total: dur, racked: false }
    this.vm.startReload(dur)
    audio.reload('out')
  }

  update(dt: number, input: Input, opts: { skin: WeaponSkinItem; frozen: boolean; time: number }): void {
    this.cooldown = Math.max(0, this.cooldown - dt)
    this.switchT = Math.max(0, this.switchT - dt)
    this.meleeCd = Math.max(0, this.meleeCd - dt)
    const def = this.activeDef()
    this.bloom = Math.max(0, this.bloom - dt * (def ? def.maxBloom : 2) * 2.2)

    // Slot switching.
    if (!opts.frozen) {
      if (input.justPressed('Digit1') && this.inv.active !== 0 && this.inv.slots[0]) {
        this.inv.active = 0
        this.refreshViewmodel(opts.skin)
      } else if (input.justPressed('Digit2') && this.inv.active !== 1 && this.inv.slots[1]) {
        this.inv.active = 1
        this.refreshViewmodel(opts.skin)
      } else if ((input.justPressed('Digit3') || input.justPressed('KeyV')) && this.inv.active !== 2) {
        this.inv.active = 2
        this.refreshViewmodel(opts.skin)
      }
    }

    // ADS.
    const wantAds = !opts.frozen && input.mouseDown(2) && def !== null && this.reloading === null
    const adsSpeed = def ? 1 / Math.max(0.08, def.adsTime) : 8
    this.adsFactor = THREE.MathUtils.clamp(this.adsFactor + (wantAds ? dt : -dt) * adsSpeed, 0, 1)

    // Reload.
    if (!opts.frozen && input.justPressed('KeyR')) this.startReload()
    if (this.reloading) {
      this.reloading.tLeft -= dt
      if (!this.reloading.racked && this.reloading.tLeft < this.reloading.total * 0.35) {
        this.reloading.racked = true
        audio.reload('in')
      }
      if (this.reloading.tLeft <= 0) {
        const w = this.inv.activeWeapon()
        if (w) {
          const d = WEAPON_BY_ID.get(w.defId)!
          const cap = scaledMag(d, w.rarity)
          const need = cap - w.mag
          const got = Math.min(need, this.inv.ammo[d.ammo])
          w.mag += got
          this.inv.ammo[d.ammo] -= got
          audio.reload('rack')
        }
        this.reloading = null
      }
    }

    // Fire.
    if (!opts.frozen && this.switchT <= 0 && this.reloading === null) {
      if (this.inv.active === 2) {
        if (input.mouseJustPressed(0) && this.meleeCd <= 0) this.melee()
      } else if (def) {
        const trigger = def.auto ? input.mouseDown(0) : input.mouseJustPressed(0)
        if (trigger && this.cooldown <= 0) this.fire(def)
      }
    }
  }

  private fire(def: WeaponDef): void {
    const w = this.inv.activeWeapon()!
    this.cooldown = 60 / def.rpm
    if (w.mag <= 0) {
      // Completely dry: one polite click, not an 1100rpm castanet.
      if (this.inv.ammo[def.ammo] <= 0) this.cooldown = Math.max(this.cooldown, 0.45)
      audio.dryFire()
      this.startReload()
      return
    }
    w.mag--

    const sig = signatureOf(def)
    const spreadRad = THREE.MathUtils.degToRad(this.currentSpread(def))
    this.controller.eyePos(this.tmpEye)
    const range = Math.min(600, def.far * 3 + 80)
    const targets = this.field.shootable()
    let totalDamage = 0
    let anyKill = false
    let anyHead = false
    let anyHit = false

    for (let p = 0; p < def.pellets; p++) {
      this.controller.forward(this.tmpDir)
      // Random cone offset.
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * spreadRad
      const up = new THREE.Vector3(0, 1, 0)
      const side = new THREE.Vector3().crossVectors(this.tmpDir, up).normalize()
      const vert = new THREE.Vector3().crossVectors(side, this.tmpDir).normalize()
      this.tmpDir.addScaledVector(side, Math.cos(a) * Math.tan(r)).addScaledVector(vert, Math.sin(a) * Math.tan(r)).normalize()

      const worldDist = this.col.raycast(this.tmpEye.x, this.tmpEye.y, this.tmpEye.z, this.tmpDir.x, this.tmpDir.y, this.tmpDir.z, range)
      let hitDist = worldDist ?? range
      let hitTargetId: string | null = null
      let hitHead = false
      for (const t of targets) {
        const hit = rayVsActor(
          this.tmpEye.x, this.tmpEye.y, this.tmpEye.z,
          this.tmpDir.x, this.tmpDir.y, this.tmpDir.z,
          hitDist, t.x, t.y, t.z, t.eyeHeight,
        )
        if (hit && hit.dist < hitDist) {
          hitDist = hit.dist
          hitTargetId = t.id
          hitHead = hit.part === 'head'
        }
      }

      this.tmpEnd.copy(this.tmpEye).addScaledVector(this.tmpDir, hitDist)
      if (hitTargetId) {
        const dmg = falloff(scaledDamage(def, w.rarity), hitDist, def.near, def.far, def.falloffFloor)
        const mult = hitHead ? def.headshotMult : 1
        const res = this.field.damage(hitTargetId, dmg * mult, hitHead, def.id)
        totalDamage += dmg * mult
        anyHit = true
        anyHead = anyHead || hitHead
        anyKill = anyKill || res.killed
        this.fx.flare(this.tmpEnd, '#ff5c5c', 0.5, 0.12)
      } else if (worldDist !== null && hitDist >= worldDist - 0.01) {
        this.fx.sparks(this.tmpEnd, this.tmpDir.clone().multiplyScalar(-1))
      }

      // Tracer: the shot that hangs in the air and tells everyone where you
      // are. Blackouts double the hang — light is information.
      if (p === 0 || def.pellets <= 2 || p % 3 === 0) {
        this.vm.muzzleWorld(this.tmpMuzzle)
        const hang = sig.tracerHang * (this.dark ? 2 : 0.45)
        this.fx.tracer(this.tmpMuzzle, this.tmpEnd.clone(), TRACER_COLOR[def.maker] ?? '#ffc247', hang)
      }
    }

    if (anyHit) {
      emit('hitmarker', { killed: anyKill, headshot: anyHead })
      audio.hitmarker(anyKill, anyHead)
      this.onDamageDealt?.(totalDamage)
    }

    // Muzzle bloom, kick, sound, emission.
    this.vm.muzzleWorld(this.tmpMuzzle)
    this.fx.flare(this.tmpMuzzle, TRACER_COLOR[def.maker] ?? '#ffc987', 0.7 + sig.bloom * 0.6, 0.07)
    if (sig.sparks && Math.random() < 0.5) this.fx.sparks(this.tmpMuzzle, new THREE.Vector3(0, 1, 0))
    this.vm.kick(0.35 + def.recoilUp * 0.12)
    this.controller.applyRecoil(def.recoilUp * (0.65 + Math.random() * 0.3) * (this.adsFactor > 0.5 ? 0.75 : 1), (Math.random() - 0.5) * def.recoilSide * 1.6)
    this.bloom = Math.min(def.maxBloom, this.bloom + def.bloomPerShot)
    audio.shot(def.cls)
    this.emissions.report('player', 'fire', 0.8 + sig.bloom * 0.2)
  }

  private melee(): void {
    this.meleeCd = 0.55
    this.vm.swing()
    this.controller.eyePos(this.tmpEye)
    this.controller.forward(this.tmpDir)
    let hit = false
    for (const t of this.field.shootable()) {
      const dx = t.x - this.tmpEye.x
      const dy = t.y + t.eyeHeight * 0.6 - this.tmpEye.y
      const dz = t.z - this.tmpEye.z
      const dist = Math.hypot(dx, dy, dz)
      if (dist > MELEE_RANGE) continue
      const dot = (dx * this.tmpDir.x + dy * this.tmpDir.y + dz * this.tmpDir.z) / Math.max(0.01, dist)
      if (dot < 0.55) continue
      // A maul does not swing through masonry.
      if (!this.col.lineOfSight(this.tmpEye.x, this.tmpEye.y, this.tmpEye.z, t.x, t.y + t.eyeHeight * 0.6, t.z)) continue
      const res = this.field.damage(t.id, MELEE_DAMAGE, false, null)
      emit('hitmarker', { killed: res.killed, headshot: false })
      audio.hitmarker(res.killed, false)
      this.onDamageDealt?.(MELEE_DAMAGE)
      hit = true
      break
    }
    audio.melee(hit)
    this.emissions.report('player', 'fire', 0.25)
  }

  hud(): { name: string; mag: number | null; reserve: number | null; reloading: number } {
    const w = this.inv.activeWeapon()
    if (this.inv.active === 2 || !w) {
      return { name: "LINESMAN'S MAUL", mag: null, reserve: null, reloading: 0 }
    }
    const def = WEAPON_BY_ID.get(w.defId)!
    return {
      name: def.name.toUpperCase(),
      mag: w.mag,
      reserve: this.inv.ammo[def.ammo],
      reloading: this.reloading ? this.reloading.tLeft / this.reloading.total : 0,
    }
  }
}
