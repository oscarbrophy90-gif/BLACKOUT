import * as THREE from 'three'
import type { WeaponDef, WeaponSkinItem } from '@blackout/shared'
import { buildWeaponGroup, weaponLength } from './models.ts'
import { applySkin, makeSkinMaterials } from './skins.ts'
import type { SkinMaterials } from './skins.ts'
import type { Emitter } from '../world/particles.ts'

// First-person weapon: the shared class model, painted by the equipped
// procedural skin (texture, finish, animated trim, particles).

export interface ViewmodelPose {
  moveFactor: number
  adsFactor: number
  dt: number
  time: number
}

export class Viewmodel {
  readonly group = new THREE.Group()
  readonly muzzleLight: THREE.PointLight
  private gun: THREE.Group | null = null
  private magMesh: THREE.Mesh | null = null
  private mats: SkinMaterials = makeSkinMaterials()
  private skinUpdate: ((t: number) => void) | null = null
  private particles: Emitter | null = null
  private muzzleLocal = new THREE.Vector3(0, 0, -0.6)
  private recoilK = 0
  private reloadT = 0
  private reloadTotal = 1
  private drawT = 0
  private meleeT = 0

  constructor(camera: THREE.Camera) {
    camera.add(this.group)
    this.group.position.set(0.3, -0.3, -0.55)
    this.muzzleLight = new THREE.PointLight('#ffc987', 0, 22, 1.8)
    this.group.add(this.muzzleLight)
  }

  setWeapon(kind: { type: 'gun'; def: WeaponDef } | { type: 'melee' } | { type: 'none' }, skin: WeaponSkinItem): void {
    if (this.gun) {
      this.group.remove(this.gun)
      this.gun.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
      this.gun = null
      this.magMesh = null
    }
    if (this.particles) {
      this.particles.dispose()
      this.particles = null
    }
    this.skinUpdate = null
    if (kind.type === 'none') return

    const { update, particles } = applySkin(this.mats, skin.skin)
    this.skinUpdate = update
    const g = new THREE.Group()
    if (kind.type === 'melee') {
      const part = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
        mesh.position.set(x, y, z)
        return mesh
      }
      g.add(part(0.02, 0.26, 0.02, this.mats.accent, 0, -0.02, 0))
      g.add(part(0.055, 0.05, 0.1, this.mats.body, 0, 0.12, 0))
      g.add(part(0.012, 0.02, 0.11, this.mats.trim, 0, 0.15, 0))
      g.position.set(0.08, -0.12, 0.06)
      g.rotation.set(-0.45, 0.25, 0.15)
      this.muzzleLocal.set(0, 0.14, -0.05)
    } else {
      const def = kind.def
      const longGlass = def.adsZoom >= 2
      const built = buildWeaponGroup(def.cls, longGlass, this.mats)
      g.add(built)
      // The magazine is the 4th part for rifles (drops during reload).
      this.magMesh = (built.children[3] as THREE.Mesh) ?? null
      this.muzzleLocal.set(0, 0.008, -0.15 - weaponLength(def.cls))
      if (particles) {
        this.particles = particles
        particles.points.position.set(0, 0.02, -0.15)
        g.add(particles.points)
      }
    }
    this.gun = g
    this.group.add(g)
    this.drawT = 0.25
  }

  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    out.copy(this.muzzleLocal)
    this.gun?.localToWorld(out)
    return out
  }

  kick(strength: number): void {
    this.recoilK = Math.min(1.4, this.recoilK + strength)
    this.muzzleLight.intensity = 3.2
  }

  startReload(duration: number): void {
    this.reloadT = duration
    this.reloadTotal = duration
  }

  cancelReload(): void {
    this.reloadT = 0
  }

  swing(): void {
    this.meleeT = 0.32
  }

  update(pose: ViewmodelPose): void {
    const { dt, time } = pose
    this.recoilK = Math.max(0, this.recoilK - dt * 7)
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 40)
    if (this.reloadT > 0) this.reloadT = Math.max(0, this.reloadT - dt)
    if (this.drawT > 0) this.drawT = Math.max(0, this.drawT - dt)
    if (this.meleeT > 0) this.meleeT = Math.max(0, this.meleeT - dt)

    const ads = pose.adsFactor
    const baseX = THREE.MathUtils.lerp(0.3, 0, ads)
    const baseY = THREE.MathUtils.lerp(-0.3, -0.218, ads)
    const baseZ = THREE.MathUtils.lerp(-0.55, -0.42, ads)
    const swayAmp = (1 - ads * 0.85) * (0.004 + pose.moveFactor * 0.012)
    const swayX = Math.sin(time * 1.7) * 0.003 + Math.cos(time * 6.1) * swayAmp
    const swayY = Math.sin(time * 12.2) * swayAmp * 0.6
    const reloadF = this.reloadT > 0 ? Math.sin((1 - this.reloadT / this.reloadTotal) * Math.PI) : 0
    const drawF = this.drawT / 0.25
    const meleeF = this.meleeT > 0 ? Math.sin((1 - this.meleeT / 0.32) * Math.PI) : 0

    this.group.position.set(
      baseX + swayX,
      baseY + swayY - reloadF * 0.16 - drawF * 0.3 - meleeF * 0.05,
      baseZ + this.recoilK * 0.055 + meleeF * -0.22,
    )
    this.group.rotation.set(
      -this.recoilK * 0.06 - reloadF * 0.85 - drawF * 0.6 + meleeF * -0.7,
      meleeF * 0.5,
      -reloadF * 0.25,
    )
    if (this.magMesh) {
      const out = reloadF > 0.55 ? (reloadF - 0.55) / 0.45 : 0
      this.magMesh.position.y = -0.1 - out * 0.2
      this.magMesh.visible = out < 0.9
    }
    this.skinUpdate?.(time)
    this.particles?.update(dt)
  }
}
