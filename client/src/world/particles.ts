import * as THREE from 'three'

// A small, reusable GPU-friendly particle emitter: one THREE.Points per
// emitter, CPU-simulated. Character effects, weapon-skin particles,
// accessory sparkle and the podium all use this — configured, not coded.

export interface EmitterConfig {
  count: number
  color: string | [string, string]
  size: number
  /** Seconds each particle lives. */
  life: number
  /** Spawn volume: 'point' | 'sphere' | 'ring' | 'column' | 'ceiling' | 'ground' */
  shape: 'point' | 'sphere' | 'ring' | 'column' | 'ceiling' | 'ground'
  radius: number
  height: number
  /** Initial speed range. */
  speed: [number, number]
  /** Direction bias: 'up' | 'out' | 'down' | 'random' | 'spiral' | 'in' */
  dir: 'up' | 'out' | 'down' | 'random' | 'spiral' | 'in'
  gravity: number
  /** Particles per second; 0 = burst everything at start. */
  rate: number
  drag?: number
  spin?: number
  fade?: boolean
  additive?: boolean
  /** 'soft' | 'square' | 'streak' | 'spark' */
  sprite?: 'soft' | 'square' | 'streak' | 'spark'
}

let spriteCache: Record<string, THREE.Texture> = {}

function sprite(kind: string): THREE.Texture {
  if (spriteCache[kind]) return spriteCache[kind]
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 32
  const g = c.getContext('2d')!
  if (kind === 'square') {
    g.fillStyle = '#fff'
    g.fillRect(6, 6, 20, 20)
  } else if (kind === 'streak') {
    const grad = g.createLinearGradient(16, 0, 16, 32)
    grad.addColorStop(0, 'rgba(255,255,255,0)')
    grad.addColorStop(0.5, 'rgba(255,255,255,1)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(13, 0, 6, 32)
  } else if (kind === 'spark') {
    g.strokeStyle = '#fff'
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(16, 2)
    g.lineTo(16, 30)
    g.moveTo(2, 16)
    g.lineTo(30, 16)
    g.stroke()
  } else {
    const grad = g.createRadialGradient(16, 16, 1, 16, 16, 16)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.4, 'rgba(255,255,255,0.6)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 32, 32)
  }
  const t = new THREE.CanvasTexture(c)
  spriteCache[kind] = t
  return t
}

export class Emitter {
  readonly points: THREE.Points
  private cfg: EmitterConfig
  private pos: Float32Array
  private vel: Float32Array
  private age: Float32Array
  private alive: Uint8Array
  private colors: Float32Array
  private spawnAcc = 0
  private cA = new THREE.Color()
  private cB = new THREE.Color()
  private t = 0
  /** Stop spawning; existing particles finish naturally. */
  stopped = false

  constructor(cfg: EmitterConfig) {
    this.cfg = cfg
    const n = cfg.count
    this.pos = new Float32Array(n * 3)
    this.vel = new Float32Array(n * 3)
    this.age = new Float32Array(n)
    this.alive = new Uint8Array(n)
    this.colors = new Float32Array(n * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3))
    const mat = new THREE.PointsMaterial({
      size: cfg.size,
      map: sprite(cfg.sprite ?? 'soft'),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: cfg.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
      opacity: 1,
    })
    this.points = new THREE.Points(geo, mat)
    this.points.frustumCulled = false
    this.cA.set(Array.isArray(cfg.color) ? cfg.color[0] : cfg.color)
    this.cB.set(Array.isArray(cfg.color) ? cfg.color[1] : cfg.color)
    // Hide everything until spawned.
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -9999
    if (cfg.rate === 0) for (let i = 0; i < n; i++) this.spawn(i)
  }

  private spawn(i: number): void {
    const c = this.cfg
    let x = 0
    let y = 0
    let z = 0
    const a = Math.random() * Math.PI * 2
    const r = c.radius * (c.shape === 'ring' ? 1 : Math.sqrt(Math.random()))
    switch (c.shape) {
      case 'sphere': {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(c.radius * Math.cbrt(Math.random()))
        x = v.x
        y = v.y + c.height
        z = v.z
        break
      }
      case 'ring':
      case 'ground':
        x = Math.cos(a) * r
        z = Math.sin(a) * r
        y = c.shape === 'ground' ? 0.02 : c.height
        break
      case 'column':
        x = Math.cos(a) * r
        z = Math.sin(a) * r
        y = Math.random() * c.height
        break
      case 'ceiling':
        x = Math.cos(a) * r
        z = Math.sin(a) * r
        y = c.height
        break
      default:
        y = c.height
    }
    const sp = c.speed[0] + Math.random() * (c.speed[1] - c.speed[0])
    let vx = 0
    let vy = 0
    let vz = 0
    switch (c.dir) {
      case 'up':
        vx = (Math.random() - 0.5) * sp * 0.4
        vy = sp
        vz = (Math.random() - 0.5) * sp * 0.4
        break
      case 'down':
        vx = (Math.random() - 0.5) * sp * 0.3
        vy = -sp
        vz = (Math.random() - 0.5) * sp * 0.3
        break
      case 'out': {
        const len = Math.hypot(x, z) || 1
        vx = (x / len) * sp
        vz = (z / len) * sp
        vy = (Math.random() - 0.3) * sp * 0.5
        break
      }
      case 'in': {
        const len = Math.hypot(x, z) || 1
        vx = (-x / len) * sp
        vz = (-z / len) * sp
        vy = (Math.random() - 0.5) * sp * 0.3
        break
      }
      case 'spiral':
        vx = -Math.sin(a) * sp
        vz = Math.cos(a) * sp
        vy = sp * 0.6
        break
      default: {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(sp)
        vx = v.x
        vy = v.y
        vz = v.z
      }
    }
    this.pos[i * 3] = x
    this.pos[i * 3 + 1] = y
    this.pos[i * 3 + 2] = z
    this.vel[i * 3] = vx
    this.vel[i * 3 + 1] = vy
    this.vel[i * 3 + 2] = vz
    this.age[i] = 0
    this.alive[i] = 1
    const mix = Math.random()
    this.colors[i * 3] = this.cA.r + (this.cB.r - this.cA.r) * mix
    this.colors[i * 3 + 1] = this.cA.g + (this.cB.g - this.cA.g) * mix
    this.colors[i * 3 + 2] = this.cA.b + (this.cB.b - this.cA.b) * mix
  }

  update(dt: number): void {
    const c = this.cfg
    this.t += dt
    const n = c.count
    if (!this.stopped && c.rate > 0) {
      this.spawnAcc += c.rate * dt
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1
        let picked = -1
        for (let i = 0; i < n; i++) {
          if (!this.alive[i]) {
            picked = i
            break
          }
        }
        if (picked < 0) break
        this.spawn(picked)
      }
    }
    const drag = c.drag ?? 0
    let anyAlive = false
    for (let i = 0; i < n; i++) {
      if (!this.alive[i]) continue
      this.age[i] += dt
      if (this.age[i] >= c.life) {
        this.alive[i] = 0
        this.pos[i * 3 + 1] = -9999
        continue
      }
      anyAlive = true
      this.vel[i * 3 + 1] -= c.gravity * dt
      if (drag > 0) {
        const k = Math.max(0, 1 - drag * dt)
        this.vel[i * 3] *= k
        this.vel[i * 3 + 1] *= k
        this.vel[i * 3 + 2] *= k
      }
      if (c.spin) {
        const x = this.pos[i * 3]
        const z = this.pos[i * 3 + 2]
        const ang = c.spin * dt
        this.pos[i * 3] = x * Math.cos(ang) - z * Math.sin(ang)
        this.pos[i * 3 + 2] = x * Math.sin(ang) + z * Math.cos(ang)
      }
      this.pos[i * 3] += this.vel[i * 3] * dt
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
      if (c.fade !== false) {
        const f = 1 - this.age[i] / c.life
        const base = f * 0.9 + 0.1
        const mix = (i % 7) / 7
        this.colors[i * 3] = (this.cA.r + (this.cB.r - this.cA.r) * mix) * base
        this.colors[i * 3 + 1] = (this.cA.g + (this.cB.g - this.cA.g) * mix) * base
        this.colors[i * 3 + 2] = (this.cA.b + (this.cB.b - this.cA.b) * mix) * base
      }
    }
    ;(this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true
    this.points.visible = anyAlive || (!this.stopped && c.rate > 0)
  }

  get finished(): boolean {
    if (!this.stopped && this.cfg.rate > 0) return false
    for (let i = 0; i < this.cfg.count; i++) if (this.alive[i]) return false
    return true
  }

  dispose(): void {
    this.points.geometry.dispose()
    ;(this.points.material as THREE.Material).dispose()
  }
}

/** Ready-made emitter recipes keyed by the PARTICLES vocabulary, so weapon
 *  skins and accessories can ask for "embers" and get embers. */
export function particleRecipe(kind: string, tint: string, scale = 1): EmitterConfig | null {
  const base = {
    count: 40, size: 0.05 * scale, life: 1.2, shape: 'sphere' as const, radius: 0.12 * scale,
    height: 0, speed: [0.05, 0.2] as [number, number], dir: 'up' as const, gravity: 0, rate: 18, fade: true,
  }
  switch (kind) {
    case 'embers': return { ...base, color: ['#ff7a1a', '#ffd27a'], dir: 'up', gravity: -0.1, drag: 0.5 }
    case 'frost': return { ...base, color: ['#bfe9ff', '#ffffff'], dir: 'random', speed: [0.02, 0.08], life: 1.8 }
    case 'sparks': return { ...base, color: ['#fff3b0', '#ffb347'], dir: 'random', speed: [0.4, 0.9], gravity: 2, life: 0.5, rate: 14, sprite: 'spark' }
    case 'void': return { ...base, color: ['#5b2bff', '#12001f'], dir: 'in', speed: [0.1, 0.3], radius: 0.35 * scale, life: 1.4, additive: false }
    case 'stars': return { ...base, color: ['#ffffff', tint], dir: 'random', speed: [0.01, 0.05], life: 2.2, sprite: 'spark', size: 0.04 * scale }
    case 'glitch': return { ...base, color: ['#39f0e0', '#ff2d55'], dir: 'random', speed: [0.5, 1.2], life: 0.25, rate: 30, sprite: 'square', drag: 4 }
    case 'leaves': return { ...base, color: ['#7fe08a', '#3d8a45'], dir: 'down', gravity: 0.2, life: 2, sprite: 'square', size: 0.04 * scale, drag: 1 }
    case 'bubbles': return { ...base, color: ['#a8e6ff', '#ffffff'], dir: 'up', speed: [0.1, 0.25], life: 2, additive: true }
    case 'petals': return { ...base, color: ['#ff9ad5', '#ffd6ec'], dir: 'spiral', speed: [0.1, 0.3], gravity: 0.15, life: 2.2, sprite: 'square', size: 0.045 * scale }
    case 'smoke': return { ...base, color: ['#6a6a75', '#2b2b33'], dir: 'up', speed: [0.1, 0.25], life: 2, size: 0.12 * scale, additive: false, rate: 10 }
    case 'lightning': return { ...base, color: ['#dcefff', tint], dir: 'random', speed: [0.8, 1.6], life: 0.18, rate: 24, sprite: 'spark', size: 0.07 * scale }
    case 'confetti': return { ...base, color: [tint, '#ffffff'], dir: 'up', speed: [0.4, 1.0], gravity: 1.5, life: 1.6, sprite: 'square', size: 0.04 * scale, rate: 30, additive: false }
    case 'coins': return { ...base, color: ['#ffd24a', '#ffb000'], dir: 'up', speed: [0.4, 0.9], gravity: 2.2, life: 1.2, sprite: 'square', size: 0.05 * scale, rate: 16 }
    case 'dust': return { ...base, color: ['#c9b89a', '#8a7d63'], dir: 'random', speed: [0.02, 0.06], life: 2.5, additive: false, size: 0.03 * scale }
    case 'orbs': return { ...base, color: [tint, '#ffffff'], dir: 'spiral', speed: [0.2, 0.4], life: 2.4, size: 0.07 * scale, spin: 1.5 }
    case 'feathers': return { ...base, color: ['#ffffff', '#dfe6ff'], dir: 'down', speed: [0.05, 0.15], gravity: 0.08, life: 2.6, sprite: 'square', size: 0.045 * scale, drag: 1.2 }
    case 'notes': return { ...base, color: [tint, '#ffffff'], dir: 'up', speed: [0.2, 0.4], life: 1.6, sprite: 'square', size: 0.05 * scale, rate: 8 }
    case 'hearts': return { ...base, color: ['#ff4d6a', '#ff9ad5'], dir: 'up', speed: [0.2, 0.4], life: 1.6, rate: 8, size: 0.06 * scale }
    case 'skulls': return { ...base, color: ['#d8d8e0', '#5a5a66'], dir: 'up', speed: [0.1, 0.2], life: 1.8, sprite: 'square', rate: 6, size: 0.06 * scale, additive: false }
    case 'snow': return { ...base, color: ['#ffffff', '#dfefff'], dir: 'down', speed: [0.1, 0.25], life: 2.4, shape: 'ceiling', height: 0.6 * scale, radius: 0.5 * scale, rate: 24 }
    case 'rain': return { ...base, color: ['#9fc4ff', '#dfe9ff'], dir: 'down', speed: [1.5, 2.5], life: 0.6, shape: 'ceiling', height: 0.9 * scale, radius: 0.5 * scale, rate: 60, sprite: 'streak', size: 0.06 * scale }
    case 'fireflies': return { ...base, color: ['#e8ff8a', '#7fe08a'], dir: 'random', speed: [0.05, 0.15], life: 2.8, radius: 0.4 * scale, rate: 10, size: 0.035 * scale }
    default: return null
  }
}
