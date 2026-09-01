import * as THREE from 'three'

// Pooled transient effects. During Blackouts these ARE the game — every
// entry here is an emission somebody can read. Additive materials with
// depthWrite off keep them visible and cheap.

function radialTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(c)
  return tex
}

interface Timed<T> {
  obj: T
  ttl: number
  ttl0: number
}

export class Fx {
  private spriteTex: THREE.Texture

  private tracers: (Timed<THREE.Mesh> & { free: boolean })[] = []
  private flares: (Timed<THREE.Sprite> & { free: boolean })[] = []
  private steps: (Timed<THREE.Mesh> & { free: boolean })[] = []
  private rings: (Timed<THREE.Mesh> & { free: boolean; maxR: number })[] = []
  private beams: (Timed<THREE.Mesh> & { free: boolean; persistent: boolean })[] = []
  private sparkBursts: (Timed<THREE.Points> & { free: boolean; vel: Float32Array })[] = []

  constructor(scene: THREE.Scene) {
    this.spriteTex = radialTexture()

    const tracerGeo = new THREE.BoxGeometry(0.055, 0.055, 1)
    for (let i = 0; i < 90; i++) {
      const mesh = new THREE.Mesh(
        tracerGeo,
        new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      )
      mesh.visible = false
      scene.add(mesh)
      this.tracers.push({ obj: mesh, ttl: 0, ttl0: 1, free: true })
    }
    for (let i = 0; i < 48; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.spriteTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      )
      sprite.visible = false
      scene.add(sprite)
      this.flares.push({ obj: sprite, ttl: 0, ttl0: 1, free: true })
    }
    const stepGeo = new THREE.CircleGeometry(0.32, 10)
    stepGeo.rotateX(-Math.PI / 2)
    for (let i = 0; i < 140; i++) {
      const mesh = new THREE.Mesh(
        stepGeo,
        new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      )
      mesh.visible = false
      scene.add(mesh)
      this.steps.push({ obj: mesh, ttl: 0, ttl0: 1, free: true })
    }
    const ringGeo = new THREE.RingGeometry(0.92, 1, 40)
    ringGeo.rotateX(-Math.PI / 2)
    for (let i = 0; i < 36; i++) {
      const mesh = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      )
      mesh.visible = false
      scene.add(mesh)
      this.rings.push({ obj: mesh, ttl: 0, ttl0: 1, free: true, maxR: 1 })
    }
    const beamGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, true)
    beamGeo.translate(0, 0.5, 0)
    // Sized for the permanent final Blackout, when every Mil-Spec+ item on
    // the ground wants its own persistent light column.
    for (let i = 0; i < 64; i++) {
      const mesh = new THREE.Mesh(
        beamGeo,
        new THREE.MeshBasicMaterial({
          transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }),
      )
      mesh.visible = false
      scene.add(mesh)
      this.beams.push({ obj: mesh, ttl: 0, ttl0: 1, free: true, persistent: false })
    }
    for (let i = 0; i < 16; i++) {
      const n = 22
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
      const pts = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          map: this.spriteTex, color: '#ffd9a0', size: 0.16, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      )
      pts.visible = false
      scene.add(pts)
      this.sparkBursts.push({ obj: pts, ttl: 0, ttl0: 1, free: true, vel: new Float32Array(n * 3) })
    }
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color: string, ttl: number): void {
    const t = this.tracers.find((x) => x.free)
    if (!t) return
    t.free = false
    t.ttl = t.ttl0 = ttl
    const mesh = t.obj
    mesh.visible = true
    ;(mesh.material as THREE.MeshBasicMaterial).color.set(color)
    const len = from.distanceTo(to)
    mesh.position.copy(from).add(to).multiplyScalar(0.5)
    mesh.lookAt(to)
    mesh.scale.set(1, 1, Math.max(0.5, len))
  }

  flare(pos: THREE.Vector3, color: string, scale: number, ttl: number): void {
    const f = this.flares.find((x) => x.free)
    if (!f) return
    f.free = false
    f.ttl = f.ttl0 = ttl
    f.obj.visible = true
    f.obj.position.copy(pos)
    f.obj.scale.setScalar(scale)
    ;(f.obj.material as THREE.SpriteMaterial).color.set(color)
  }

  footstep(x: number, y: number, z: number, color: string, ttl: number): void {
    const s = this.steps.find((v) => v.free)
    if (!s) return
    s.free = false
    s.ttl = s.ttl0 = ttl
    s.obj.visible = true
    s.obj.position.set(x, y + 0.03, z)
    ;(s.obj.material as THREE.MeshBasicMaterial).color.set(color)
  }

  ring(x: number, y: number, z: number, color: string, maxR: number, ttl: number): void {
    const r = this.rings.find((v) => v.free)
    if (!r) return
    r.free = false
    r.ttl = r.ttl0 = ttl
    r.maxR = maxR
    r.obj.visible = true
    r.obj.position.set(x, y + 0.06, z)
    r.obj.scale.setScalar(0.01)
    ;(r.obj.material as THREE.MeshBasicMaterial).color.set(color)
  }

  sparks(pos: THREE.Vector3, normal: THREE.Vector3): void {
    const b = this.sparkBursts.find((v) => v.free)
    if (!b) return
    b.free = false
    b.ttl = b.ttl0 = 0.45
    b.obj.visible = true
    const posAttr = b.obj.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < posAttr.count; i++) {
      posAttr.setXYZ(i, pos.x, pos.y, pos.z)
      const spread = new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 4)
      spread.addScaledVector(normal, 3 + Math.random() * 3)
      b.vel[i * 3] = spread.x
      b.vel[i * 3 + 1] = spread.y
      b.vel[i * 3 + 2] = spread.z
    }
    posAttr.needsUpdate = true
  }

  /** A vertical light column. ttl <= 0 makes it persistent until stopBeam. */
  beam(x: number, y: number, z: number, color: string, radius: number, height: number, ttl: number): THREE.Mesh | null {
    const b = this.beams.find((v) => v.free)
    if (!b) return null
    b.free = false
    b.persistent = ttl <= 0
    b.ttl = b.ttl0 = ttl > 0 ? ttl : 1
    b.obj.visible = true
    b.obj.position.set(x, y, z)
    b.obj.scale.set(radius * 2, height, radius * 2)
    const mat = b.obj.material as THREE.MeshBasicMaterial
    mat.color.set(color)
    mat.opacity = 0.4
    return b.obj
  }

  stopBeam(mesh: THREE.Mesh): void {
    const b = this.beams.find((v) => v.obj === mesh)
    if (b) {
      b.free = true
      b.persistent = false
      b.obj.visible = false
    }
  }

  update(dt: number): void {
    for (const t of this.tracers) {
      if (t.free) continue
      t.ttl -= dt
      if (t.ttl <= 0) {
        t.free = true
        t.obj.visible = false
      } else {
        ;(t.obj.material as THREE.MeshBasicMaterial).opacity = Math.min(1, (t.ttl / t.ttl0) * 1.6)
      }
    }
    for (const f of this.flares) {
      if (f.free) continue
      f.ttl -= dt
      if (f.ttl <= 0) {
        f.free = true
        f.obj.visible = false
      } else {
        ;(f.obj.material as THREE.SpriteMaterial).opacity = f.ttl / f.ttl0
      }
    }
    for (const s of this.steps) {
      if (s.free) continue
      s.ttl -= dt
      if (s.ttl <= 0) {
        s.free = true
        s.obj.visible = false
      } else {
        ;(s.obj.material as THREE.MeshBasicMaterial).opacity = 0.7 * (s.ttl / s.ttl0)
      }
    }
    for (const r of this.rings) {
      if (r.free) continue
      r.ttl -= dt
      if (r.ttl <= 0) {
        r.free = true
        r.obj.visible = false
      } else {
        const t = 1 - r.ttl / r.ttl0
        r.obj.scale.setScalar(Math.max(0.01, r.maxR * t))
        ;(r.obj.material as THREE.MeshBasicMaterial).opacity = 0.65 * (1 - t)
      }
    }
    for (const b of this.beams) {
      if (b.free || b.persistent) continue
      b.ttl -= dt
      if (b.ttl <= 0) {
        b.free = true
        b.obj.visible = false
      } else {
        ;(b.obj.material as THREE.MeshBasicMaterial).opacity = 0.4 * (b.ttl / b.ttl0)
      }
    }
    for (const s of this.sparkBursts) {
      if (s.free) continue
      s.ttl -= dt
      if (s.ttl <= 0) {
        s.free = true
        s.obj.visible = false
        continue
      }
      const posAttr = s.obj.geometry.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < posAttr.count; i++) {
        s.vel[i * 3 + 1] -= 14 * dt
        posAttr.setXYZ(
          i,
          posAttr.getX(i) + s.vel[i * 3] * dt,
          posAttr.getY(i) + s.vel[i * 3 + 1] * dt,
          posAttr.getZ(i) + s.vel[i * 3 + 2] * dt,
        )
      }
      posAttr.needsUpdate = true
      ;(s.obj.material as THREE.PointsMaterial).opacity = s.ttl / s.ttl0
    }
  }
}
