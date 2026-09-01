import * as THREE from 'three'
import { WEAPON_SKINS } from '@blackout/shared'
import type { CharmDef, WeaponDef } from '@blackout/shared'

// First-person weapon models, built from primitives at runtime and painted
// by the equipped skin. Skins are [body, accent, emissive-trim]; animated
// skins breathe their trim. Charms dangle from the barrel lug.

export interface ViewmodelPose {
  moveFactor: number
  adsFactor: number
  dt: number
  time: number
}

function part(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  return m
}

function charmMesh(charm: CharmDef): THREE.Object3D {
  const g = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial({ color: charm.color })
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.05, 0.004), new THREE.MeshBasicMaterial({ color: '#888' }))
  line.position.y = -0.025
  g.add(line)
  let m: THREE.Mesh
  switch (charm.shape) {
    case 'bolt':
      m = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.06, 4), mat)
      break
    case 'star':
      m = new THREE.Mesh(new THREE.OctahedronGeometry(0.024), mat)
      break
    case 'skull':
      m = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), mat)
      break
    case 'moth':
      m = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.02, 3), mat)
      break
    case 'planet':
      m = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), mat)
      break
    case 'fuse':
      m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.045, 6), mat)
      break
    default:
      m = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.032, 0.032), mat)
  }
  m.position.y = -0.07
  g.add(m)
  return g
}

export class Viewmodel {
  readonly group = new THREE.Group()
  readonly muzzleLight: THREE.PointLight
  private gun: THREE.Group | null = null
  private magMesh: THREE.Mesh | null = null
  private trimMats: THREE.MeshBasicMaterial[] = []
  private trimBase = new THREE.Color()
  private animatedSkin = false
  private muzzleLocal = new THREE.Vector3(0, 0, -0.6)
  private recoilK = 0
  private reloadT = 0
  private reloadTotal = 1
  private drawT = 0
  private meleeT = 0
  private swayX = 0
  private swayY = 0

  constructor(camera: THREE.Camera) {
    camera.add(this.group)
    this.group.position.set(0.3, -0.3, -0.55)
    this.muzzleLight = new THREE.PointLight('#ffc987', 0, 22, 1.8)
    this.group.add(this.muzzleLight)
  }

  setWeapon(kind: { type: 'gun'; def: WeaponDef } | { type: 'melee' } | { type: 'none' }, skinId: string, charm: CharmDef | null): void {
    if (this.gun) {
      this.group.remove(this.gun)
      this.gun.traverse((o) => {
        const mesh = o as THREE.Mesh
        mesh.geometry?.dispose()
      })
      this.gun = null
      this.magMesh = null
    }
    this.trimMats = []
    if (kind.type === 'none') return

    const skin = WEAPON_SKINS.find((s) => s.id === skinId) ?? WEAPON_SKINS[0]
    this.animatedSkin = skin.animated
    this.trimBase.set(skin.colors[2])
    const body = new THREE.MeshLambertMaterial({ color: skin.colors[0] })
    const accent = new THREE.MeshLambertMaterial({ color: skin.colors[1] })
    const trim = new THREE.MeshBasicMaterial({ color: skin.colors[2] })
    this.trimMats.push(trim)

    const g = new THREE.Group()
    if (kind.type === 'melee') {
      // The Linesman's Maul: a cable-cutter on a short haft, held low.
      g.add(part(0.02, 0.26, 0.02, accent, 0, -0.02, 0))
      g.add(part(0.055, 0.05, 0.1, body, 0, 0.12, 0))
      g.add(part(0.012, 0.02, 0.11, trim, 0, 0.15, 0))
      g.position.set(0.08, -0.12, 0.06)
      g.rotation.set(-0.45, 0.25, 0.15)
      this.muzzleLocal.set(0, 0.14, -0.05)
    } else {
      const def = kind.def
      const len = def.cls === 'sniper' ? 0.62 : def.cls === 'dmr' ? 0.5 : def.cls === 'shotgun' ? 0.44 : def.cls === 'smg' ? 0.3 : def.cls === 'pistol' ? 0.16 : 0.4
      // Receiver + barrel + grip are shared anatomy.
      g.add(part(0.062, 0.085, 0.3, body, 0, 0, -0.02))
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, len, 8), accent)
      barrel.rotation.x = Math.PI / 2
      barrel.position.set(0, 0.008, -0.15 - len / 2)
      g.add(barrel)
      g.add(part(0.05, 0.11, 0.05, accent, 0, -0.09, 0.06)) // grip
      if (def.cls !== 'pistol') {
        this.magMesh = part(0.045, 0.13, 0.07, body, 0, -0.1, -0.05)
        if (def.cls === 'shotgun') {
          this.magMesh.scale.set(1, 0.4, 1.6)
          this.magMesh.position.y = -0.06
        }
        g.add(this.magMesh)
        g.add(part(0.05, 0.08, 0.16, body, 0, -0.005, 0.2)) // stock
      } else {
        this.magMesh = part(0.04, 0.1, 0.05, body, 0, -0.08, 0.05)
        g.add(this.magMesh)
      }
      // Sights: irons for close guns, glass for the long ones.
      if (def.adsZoom >= 2) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), accent)
        tube.rotation.x = Math.PI / 2
        tube.position.set(0, 0.075, -0.05)
        g.add(tube)
        const glass = new THREE.Mesh(new THREE.CircleGeometry(0.024, 12), trim)
        glass.position.set(0, 0.075, 0.012)
        g.add(glass)
      } else {
        g.add(part(0.008, 0.03, 0.008, trim, 0, 0.062, -0.13))
        g.add(part(0.03, 0.02, 0.008, accent, 0, 0.058, 0.08))
      }
      // Emissive maker stripe — the skin's jewellery.
      g.add(part(0.066, 0.012, 0.2, trim, 0, 0.02, -0.02))
      this.muzzleLocal.set(0, 0.008, -0.15 - len)
      if (charm) {
        const c = charmMesh(charm)
        c.position.set(0, -0.03, -0.14)
        g.add(c)
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

    // Base pose lerps between hip and ADS.
    const ads = pose.adsFactor
    const baseX = THREE.MathUtils.lerp(0.3, 0, ads)
    const baseY = THREE.MathUtils.lerp(-0.3, -0.218, ads)
    const baseZ = THREE.MathUtils.lerp(-0.55, -0.42, ads)

    // Breathing sway + walk figure-eight, damped when aiming.
    const swayAmp = (1 - ads * 0.85) * (0.004 + pose.moveFactor * 0.012)
    this.swayX = Math.sin(time * 1.7) * 0.003 + Math.cos(time * 6.1) * swayAmp
    this.swayY = Math.sin(time * 12.2) * swayAmp * 0.6

    // Recoil pushes back and rotates up; reload dips and tilts.
    const reloadF = this.reloadT > 0 ? Math.sin((1 - this.reloadT / this.reloadTotal) * Math.PI) : 0
    const drawF = this.drawT / 0.25
    const meleeF = this.meleeT > 0 ? Math.sin((1 - this.meleeT / 0.32) * Math.PI) : 0

    this.group.position.set(
      baseX + this.swayX,
      baseY + this.swayY - reloadF * 0.16 - drawF * 0.3 - meleeF * 0.05,
      baseZ + this.recoilK * 0.055 + meleeF * -0.22,
    )
    this.group.rotation.set(
      -this.recoilK * 0.06 - reloadF * 0.85 - drawF * 0.6 + meleeF * -0.7,
      meleeF * 0.5,
      -reloadF * 0.25,
    )
    if (this.magMesh) {
      // Mag drops out for the middle of the reload.
      const out = reloadF > 0.55 ? (reloadF - 0.55) / 0.45 : 0
      this.magMesh.position.y = -0.1 - out * 0.2
      this.magMesh.visible = out < 0.9
    }
    if (this.animatedSkin && this.trimMats.length > 0) {
      const pulse = 0.6 + 0.4 * Math.sin(time * 3.2)
      this.trimMats[0].color.copy(this.trimBase).multiplyScalar(pulse)
    }
  }
}
