import * as THREE from 'three'
import type { AccSpec, AnimSpec, CameraId, SkinSpec, SlotId, SuitDef, WeaponClass } from '@blackout/shared'
import { CharacterAnimator } from '../character/animator.ts'
import { CharacterRig } from '../character/rig.ts'
import { buildWeaponGroup, weaponLength } from '../weapons/models.ts'
import { applySkin, makeSkinMaterials } from '../weapons/skins.ts'
import type { Emitter } from '../world/particles.ts'

// A small self-contained 3D viewport for the lobby, the loadout and the
// shop: the Linewalker rig (idle, an emote or a celebration, wearing any
// accessories) or a skinned weapon on a lit pedestal. One WebGL context
// is shared by every panel; it is moved between hosts rather than rebuilt.

export interface CharacterShow {
  suit: SuitDef
  accessories: AccSpec[]
  anim: AnimSpec | null
  /** Loop the animation (emotes) or replay it after a pause (celebrations). */
  loop?: boolean
  /** Frame a slot instead of the whole body (accessory previews). */
  focus?: SlotId | null
}

const FOCUS: Record<SlotId, { y: number; dist: number; behind: boolean }> = {
  head: { y: 1.78, dist: 1.7, behind: false },
  face: { y: 1.7, dist: 1.5, behind: false },
  back: { y: 1.35, dist: 2.3, behind: true },
  shoulder: { y: 1.5, dist: 1.9, behind: false },
  wrist: { y: 0.95, dist: 1.7, behind: false },
  neck: { y: 1.55, dist: 1.6, behind: false },
  waist: { y: 0.95, dist: 1.9, behind: false },
  float: { y: 1.15, dist: 3.8, behind: false },
  aura: { y: 1.05, dist: 4.0, behind: false },
  pet: { y: 0.8, dist: 4.2, behind: false },
}

export class Preview3D {
  readonly canvas = document.createElement('canvas')
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(34, 1, 0.05, 80)
  private stage = new THREE.Group()
  private rig: CharacterRig | null = null
  private anim: CharacterAnimator | null = null
  private weapon: THREE.Group | null = null
  private mats = makeSkinMaterials()
  private skinUpdate: ((t: number) => void) | null = null
  private particles: Emitter | null = null
  private rim: THREE.PointLight
  private ringMat: THREE.MeshBasicMaterial
  private grid: THREE.PolarGridHelper
  private raf = 0
  private last = 0
  private time = 0
  private yaw = 0.45
  private yawVel = 0
  private dragging = false
  private lastX = 0
  private camMode: CameraId = 'static'
  private focusY = 1.02
  private dist = 3.7
  private baseDist = 3.7
  private replayAt = -1
  private spec: AnimSpec | null = null
  private mode: 'none' | 'character' | 'weapon' = 'none'
  private host: HTMLElement | null = null
  private ro: ResizeObserver

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.canvas.className = 'preview-canvas'
    this.scene.add(this.stage)

    const hemi = new THREE.HemisphereLight('#d6ddff', '#1a1430', 1.7)
    const sun = new THREE.DirectionalLight('#fff1d0', 1.8)
    sun.position.set(2.5, 4.5, -3)
    const fill = new THREE.DirectionalLight('#9fb4ff', 0.7)
    fill.position.set(-3, 2, -2)
    this.rim = new THREE.PointLight('#39f0e0', 14, 9, 1.6)
    this.rim.position.set(-2.2, 2.4, 2)
    this.scene.add(hemi, sun, fill, this.rim)

    // Pedestal: a dark disc with a glowing rim and a faint polar grid.
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.25, 0.12, 40),
      new THREE.MeshStandardMaterial({ color: '#141029', roughness: 0.6, metalness: 0.3 }),
    )
    disc.position.y = -0.06
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#39f0e0', transparent: true, opacity: 0.85 })
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.018, 6, 64), this.ringMat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.005
    this.grid = new THREE.PolarGridHelper(1.9, 8, 3, 40, '#1a4a48', '#1a4a48')
    this.grid.position.y = -0.11
    this.scene.add(disc, ring, this.grid)

    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true
      this.lastX = e.clientX
      this.canvas.setPointerCapture(e.pointerId)
    })
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return
      const dx = e.clientX - this.lastX
      this.lastX = e.clientX
      this.yaw += dx * 0.012
      this.yawVel = dx * 0.4
    })
    const up = () => {
      this.dragging = false
    }
    this.canvas.addEventListener('pointerup', up)
    this.canvas.addEventListener('pointercancel', up)
    this.ro = new ResizeObserver(() => this.resize())
  }

  /** Attach to a host element (moving from any previous host). */
  mount(host: HTMLElement): void {
    if (this.host === host) return
    if (this.host) this.ro.unobserve(this.host)
    this.host = host
    host.appendChild(this.canvas)
    this.ro.observe(host)
    this.resize()
    if (!this.raf) {
      this.last = performance.now()
      const tick = (now: number) => {
        this.raf = requestAnimationFrame(tick)
        const dt = Math.min(0.05, (now - this.last) / 1000)
        this.last = now
        this.update(dt)
      }
      this.raf = requestAnimationFrame(tick)
    }
  }

  unmount(): void {
    if (this.host) this.ro.unobserve(this.host)
    this.host = null
    this.canvas.remove()
    cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  private resize(): void {
    if (!this.host) return
    const w = Math.max(64, this.host.clientWidth)
    const h = Math.max(64, this.host.clientHeight)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /** Rarity tint for the rim light and pedestal ring. */
  setAccent(hex: string): void {
    this.rim.color.set(hex)
    this.ringMat.color.set(hex)
  }

  private clearStage(): void {
    if (this.anim) {
      this.anim.dispose()
      this.anim = null
    }
    if (this.rig) {
      this.stage.remove(this.rig.root)
      this.rig.dispose()
      this.rig = null
    }
    if (this.weapon) {
      this.stage.remove(this.weapon)
      this.weapon.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
      this.weapon = null
    }
    if (this.particles) {
      this.particles.dispose()
      this.particles = null
    }
    this.skinUpdate = null
    this.spec = null
    this.replayAt = -1
    this.camMode = 'static'
    this.stage.rotation.y = 0
  }

  showCharacter(show: CharacterShow): void {
    this.clearStage()
    this.mode = 'character'
    const [body, trim, visor] = show.suit.colors
    this.rig = new CharacterRig({ body, trim, visor })
    this.stage.add(this.rig.root)
    this.anim = new CharacterAnimator(this.stage, this.rig)
    this.anim.setAccessories(show.accessories)
    const f = show.focus ? FOCUS[show.focus] : null
    this.focusY = f ? f.y : 1.02
    this.baseDist = f ? f.dist : 3.7
    this.dist = this.baseDist
    if (f?.behind) this.yaw = Math.PI + 0.3
    else if (f) this.yaw = 0.35
    if (show.anim) {
      this.spec = show.anim
      this.anim.play(show.anim, { loop: show.loop ?? show.anim.loop })
      this.camMode = show.anim.camera
    }
    this.grid.visible = true
  }

  showWeapon(cls: WeaponClass, skin: SkinSpec): void {
    this.clearStage()
    this.mode = 'weapon'
    const { update, particles } = applySkin(this.mats, skin, 1)
    this.skinUpdate = update
    const g = buildWeaponGroup(cls, cls === 'sniper' || cls === 'dmr', this.mats)
    // Centre the model on the pedestal and blow it up to hero size.
    const box = new THREE.Box3().setFromObject(g)
    const c = box.getCenter(new THREE.Vector3())
    g.position.set(-c.x, -c.y, -c.z)
    const holder = new THREE.Group()
    holder.add(g)
    const scale = 1.9
    holder.scale.setScalar(scale)
    holder.position.y = 0.95
    holder.rotation.y = Math.PI / 2
    holder.rotation.z = -0.12
    if (particles) {
      this.particles = particles
      particles.points.position.set(0, 0.02, -0.15)
      g.add(particles.points)
    }
    this.weapon = holder
    this.stage.add(holder)
    this.focusY = 0.95
    this.baseDist = 2.1 + weaponLength(cls) * 2.6
    this.dist = this.baseDist
    this.camMode = 'orbit'
    this.grid.visible = false
  }

  private update(dt: number): void {
    this.time += dt
    if (!this.dragging) {
      this.yaw += this.yawVel * dt
      this.yawVel *= Math.max(0, 1 - dt * 4)
    }
    let camY = this.focusY + (this.mode === 'weapon' ? 0.35 : 0.55)
    let dist = this.baseDist
    let yaw = this.yaw
    let shake = 0
    const p = this.anim?.progress ?? 0
    switch (this.camMode) {
      case 'orbit': yaw += this.time * (this.mode === 'weapon' ? 0.55 : 0.4); break
      case 'zoom': dist = this.baseDist * (1 - 0.28 * Math.sin(p * Math.PI)); break
      case 'dramatic': camY = this.focusY - 0.35; yaw += this.time * 0.22; break
      case 'lowangle': camY = this.focusY - 0.6; break
      case 'crane': camY = this.focusY + 2.6 - 2.2 * Math.min(1, p * 1.6); break
      case 'shake': shake = 0.035; break
      case 'dolly': dist = this.baseDist * (1.45 - 0.55 * Math.min(1, p * 1.4)); break
      default: break
    }
    this.dist += (dist - this.dist) * Math.min(1, dt * 5)
    const jx = shake ? (Math.random() - 0.5) * shake : 0
    const jy = shake ? (Math.random() - 0.5) * shake : 0
    // The rig faces -Z: the camera orbits on that side so the visor reads.
    this.camera.position.set(-Math.sin(yaw) * this.dist + jx, camY + jy, -Math.cos(yaw) * this.dist)
    this.camera.lookAt(0, this.focusY, 0)

    if (this.anim) {
      this.anim.update(dt)
      if (this.spec && !this.spec.loop && this.anim.finished) {
        if (this.replayAt < 0) this.replayAt = this.time + 1.4
        else if (this.time >= this.replayAt) {
          this.replayAt = -1
          this.anim.play(this.spec, { loop: false })
        }
      }
    }
    if (this.weapon) this.weapon.rotation.y += dt * 0.35
    this.skinUpdate?.(this.time)
    this.particles?.update(dt)
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.unmount()
    this.clearStage()
    this.renderer.dispose()
  }
}
