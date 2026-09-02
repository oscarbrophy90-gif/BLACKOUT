import * as THREE from 'three'
import type { AnimSpec, AccSpec } from '@blackout/shared'
import { CharacterRig, REST, clonePose, lerpPose } from './rig.ts'
import type { Pose } from './rig.ts'
import { MOVE_DEFS } from './moves.ts'
import { buildProp } from './props.ts'
import type { BuiltProp } from './props.ts'
import { buildAccessory } from './accessories.ts'
import type { BuiltAccessory } from './accessories.ts'
import { CharacterEffects } from './effects.ts'

// Plays an AnimSpec on a rig: sequences moves at tempo, attaches props,
// runs effects, and reports the camera mode. Also carries the rig's
// equipped accessories so every preview/podium shows the full look.

export class CharacterAnimator {
  readonly rig: CharacterRig
  private scene: THREE.Object3D
  private spec: AnimSpec | null = null
  private time = 0
  private total = 0
  /** One factor per live time effect; the clock runs at their product. */
  private timeScales = new Map<string, number>()
  private timeScale = 1
  /** Unscaled seconds since play(): the safety net that finishes a one-shot no matter what time effects do. */
  private elapsed = 0
  private pose: Pose = clonePose(REST)
  private props: BuiltProp[] = []
  private accessories: BuiltAccessory[] = []
  private effects: CharacterEffects | null = null
  private wallT = 0
  private loop = false
  finished = false

  constructor(scene: THREE.Object3D, rig: CharacterRig) {
    this.scene = scene
    this.rig = rig
  }

  get cameraMode(): AnimSpec['camera'] {
    return this.spec?.camera ?? 'static'
  }

  get progress(): number {
    return this.total > 0 ? Math.min(1, this.time / this.total) : 1
  }

  /** Total duration in seconds at the spec's tempo. */
  get duration(): number {
    return this.total
  }

  play(spec: AnimSpec, opts: { loop?: boolean; withEffects?: boolean } = {}): void {
    this.stop()
    this.spec = spec
    this.loop = opts.loop ?? spec.loop
    this.time = 0
    this.elapsed = 0
    this.finished = false
    this.timeScales.clear()
    this.timeScale = 1
    this.total = spec.moves.reduce((s, m) => s + MOVE_DEFS[m].duration, 0) / spec.tempo
    // Props. Floor-standing props (chairs, thrones, crates…) live in the
    // holder, not the rig root, so sitting or spinning never drags them along;
    // a 'throne' effect already brings its own seat.
    for (const id of spec.props) {
      if (id === 'throne' && spec.effects.includes('throne')) continue
      const p = buildProp(id, spec.palette)
      if (!p) continue
      this.props.push(p)
      if (p.socket === 'float' || p.socket === 'feet') this.scene.add(p.obj)
      else this.rig.sockets[p.socket].add(p.obj)
    }
    if (opts.withEffects !== false) {
      this.effects = new CharacterEffects({
        scene: this.scene,
        rig: this.rig,
        currentPose: () => this.pose,
        setTimeScale: (key, s) => {
          this.timeScales.set(key, s)
          let k = 1
          for (const v of this.timeScales.values()) k *= v
          this.timeScale = k
        },
        setVisible: (v) => { this.rig.root.visible = v },
        palette: spec.palette,
      })
      this.effects.start(spec.effects)
    }
  }

  stop(): void {
    for (const p of this.props) {
      p.obj.parent?.remove(p.obj)
      disposeTree(p.obj)
    }
    this.props = []
    this.effects?.dispose()
    this.effects = null
    this.rig.root.visible = true
    this.spec = null
    this.pose = clonePose(REST)
    this.rig.apply(this.pose)
    this.timeScale = 1
  }

  setAccessories(specs: AccSpec[]): void {
    for (const a of this.accessories) {
      a.obj.parent?.remove(a.obj)
      a.emitter?.dispose()
      disposeTree(a.obj)
    }
    this.accessories = []
    for (const s of specs) {
      const built = buildAccessory(s)
      this.accessories.push(built)
      if (built.socket === 'float' || built.socket === 'pet' || built.socket === 'aura') this.rig.root.add(built.obj)
      else this.rig.sockets[built.socket].add(built.obj)
    }
  }

  private sample(t: number, out: Pose): void {
    const spec = this.spec!
    let cursor = 0
    for (let i = 0; i < spec.moves.length; i++) {
      const def = MOVE_DEFS[spec.moves[i]]
      const dur = def.duration / spec.tempo
      if (t <= cursor + dur || i === spec.moves.length - 1) {
        const local = Math.min(1, Math.max(0, (t - cursor) / dur))
        const frames = def.frames
        let k = 0
        while (k < frames.length - 1 && frames[k + 1].t < local) k++
        const f0 = frames[k]
        const f1 = frames[Math.min(k + 1, frames.length - 1)]
        const span = Math.max(1e-6, f1.t - f0.t)
        const u = f1 === f0 ? 0 : Math.min(1, (local - f0.t) / span)
        // Ease-in-out per keyframe pair for weight.
        const e = u * u * (3 - 2 * u)
        lerpPose(f0.pose, f1.pose, e, out)
        return
      }
      cursor += dur
    }
  }

  update(dt: number): void {
    this.wallT += dt
    for (const a of this.accessories) a.update(this.wallT, dt)
    if (!this.spec) {
      // Idle breathing when nothing is playing.
      this.sample_idle(this.wallT)
      return
    }
    this.elapsed += dt
    this.time += dt * this.timeScale
    if (this.time < 0) this.time = 0
    // A one-shot always ends: by its clock, or after 2.5x its length of
    // wall time if freezes and rewinds have been holding it back.
    if (this.time >= this.total || (!this.loop && this.elapsed > this.total * 2.5 + 1)) {
      if (this.loop) this.time = this.time % this.total
      else {
        this.time = this.total
        this.finished = true
      }
    }
    this.sample(this.time, this.pose)
    this.rig.apply(this.pose)
    for (const p of this.props) p.update?.(this.wallT)
    this.effects?.update(this.wallT, dt)
  }

  private sample_idle(t: number): void {
    const idle = MOVE_DEFS.idle
    const local = (t % idle.duration) / idle.duration
    let k = 0
    while (k < idle.frames.length - 1 && idle.frames[k + 1].t < local) k++
    const f0 = idle.frames[k]
    const f1 = idle.frames[Math.min(k + 1, idle.frames.length - 1)]
    const u = Math.min(1, (local - f0.t) / Math.max(1e-6, f1.t - f0.t))
    lerpPose(f0.pose, f1.pose, u, this.pose)
    this.rig.apply(this.pose)
  }

  dispose(): void {
    this.stop()
    for (const a of this.accessories) {
      a.obj.parent?.remove(a.obj)
      a.emitter?.dispose()
      disposeTree(a.obj)
    }
    this.accessories = []
  }
}

/** Free the GPU side of a detached prop/accessory subtree. */
function disposeTree(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
    else if (mat) mat.dispose()
  })
}
