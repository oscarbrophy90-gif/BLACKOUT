import * as THREE from 'three'
import type { EffectId } from '@blackout/shared'
import { Emitter } from '../world/particles.ts'
import type { EmitterConfig } from '../world/particles.ts'
import { CharacterRig } from './rig.ts'
import type { Pose } from './rig.ts'

// Every EffectId from the vocabulary. Most are emitter recipes; the rest
// touch the rig (clones, giant, vanish, rewind…) through the host hooks.

export interface EffectHost {
  scene: THREE.Object3D
  rig: CharacterRig
  currentPose(): Pose
  /** Playback controls for time effects. */
  setTimeScale(s: number): void
  setVisible(v: boolean): void
  palette: [string, string]
}

interface Live {
  update: (t: number, dt: number) => void
  dispose: () => void
}

function lam(color: string, opacity = 1, emissive = true): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color, emissive: emissive ? color : '#000', emissiveIntensity: emissive ? 0.9 : 0,
    transparent: opacity < 1, opacity, depthWrite: opacity >= 1,
  })
}

export class CharacterEffects {
  private live: Live[] = []
  private host: EffectHost

  constructor(host: EffectHost) {
    this.host = host
  }

  start(ids: EffectId[]): void {
    for (const id of ids) {
      const l = this.make(id)
      if (l) this.live.push(l)
    }
  }

  update(t: number, dt: number): void {
    for (const l of this.live) l.update(t, dt)
  }

  dispose(): void {
    for (const l of this.live) l.dispose()
    this.live = []
  }

  private emitter(cfg: EmitterConfig, y = 0): Live {
    const e = new Emitter(cfg)
    e.points.position.y = y
    this.host.scene.add(e.points)
    return {
      update: (_t, dt) => e.update(dt),
      dispose: () => { this.host.scene.remove(e.points); e.dispose() },
    }
  }

  private mesh(obj: THREE.Object3D, update: (t: number, dt: number) => void): Live {
    this.host.scene.add(obj)
    return {
      update,
      dispose: () => {
        this.host.scene.remove(obj)
        obj.traverse((o) => {
          const m = o as THREE.Mesh
          m.geometry?.dispose()
          const mat = m.material as THREE.Material | undefined
          mat?.dispose()
        })
      },
    }
  }

  /** A second rig that mirrors the host pose with an offset/tint. */
  private clone(tint: string, opacity: number, offset: THREE.Vector3, yawOffset = 0, scale = 1, emissive = true): { rig: CharacterRig; live: Live } {
    const rig = new CharacterRig({ body: tint, trim: tint, visor: tint })
    for (const m of rig.allMeshes()) {
      m.material = lam(tint, opacity, emissive)
    }
    this.host.scene.add(rig.root)
    const live: Live = {
      update: () => {
        const p = this.host.currentPose()
        rig.apply(p)
        rig.root.position.add(offset)
        rig.root.rotation.y += yawOffset
        rig.root.scale.multiplyScalar(scale)
      },
      dispose: () => { this.host.scene.remove(rig.root); rig.dispose() },
    }
    return { rig, live }
  }

  private make(id: EffectId): Live | null {
    const [a, b] = this.host.palette
    switch (id) {
      case 'none': return null
      case 'sparks': return this.emitter({ count: 60, color: ['#fff3b0', a], size: 0.08, life: 0.7, shape: 'point', radius: 0, height: 1.2, speed: [1.5, 3.5], dir: 'random', gravity: 6, rate: 40, sprite: 'spark' })
      case 'confetti': return this.emitter({ count: 220, color: [a, b], size: 0.07, life: 2.6, shape: 'ceiling', radius: 1.6, height: 3.4, speed: [0.2, 0.6], dir: 'down', gravity: 0.6, rate: 70, sprite: 'square', additive: false, drag: 0.6, spin: 0.6 })
      case 'fireworks': {
        const bursts: Emitter[] = []
        let next = 0.2
        const group = new THREE.Group()
        this.host.scene.add(group)
        return {
          update: (t, dt) => {
            next -= dt
            if (next <= 0) {
              next = 0.45 + Math.random() * 0.5
              const e = new Emitter({ count: 90, color: [Math.random() < 0.5 ? a : b, '#ffffff'], size: 0.09, life: 1.3, shape: 'point', radius: 0, height: 0, speed: [2.5, 4.5], dir: 'random', gravity: 2.5, rate: 0, drag: 1.2 })
              e.points.position.set((Math.random() - 0.5) * 4, 3 + Math.random() * 2, (Math.random() - 0.5) * 4)
              group.add(e.points)
              bursts.push(e)
            }
            for (const e of bursts) e.update(dt)
            for (let i = bursts.length - 1; i >= 0; i--) if (bursts[i].finished) { group.remove(bursts[i].points); bursts[i].dispose(); bursts.splice(i, 1) }
            void t
          },
          dispose: () => { for (const e of bursts) { e.dispose() } this.host.scene.remove(group) },
        }
      }
      case 'ring': {
        const rings: THREE.Mesh[] = []
        const group = new THREE.Group()
        let next = 0
        return this.mesh(group, (_t, dt) => {
          next -= dt
          if (next <= 0) {
            next = 0.7
            const r = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), new THREE.MeshBasicMaterial({ color: a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }))
            r.rotation.x = -Math.PI / 2
            r.position.y = 0.05
            r.scale.setScalar(0.1)
            group.add(r)
            rings.push(r)
          }
          for (const r of rings) { r.scale.addScalar(dt * 2.6); (r.material as THREE.MeshBasicMaterial).opacity -= dt * 0.55 }
          for (let i = rings.length - 1; i >= 0; i--) if ((rings[i].material as THREE.MeshBasicMaterial).opacity <= 0) { group.remove(rings[i]); rings.splice(i, 1) }
        })
      }
      case 'beam': {
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 12, 12, 1, true), new THREE.MeshBasicMaterial({ color: a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }))
        beam.position.y = 6
        return this.mesh(beam, (t) => { (beam.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(t * 5) * 0.1; beam.rotation.y = t })
      }
      case 'hologram': {
        const c = this.clone(a, 0.35, new THREE.Vector3(0, 2.6, 0), 0, 1.6)
        return { update: (t, dt) => { c.live.update(t, dt); c.rig.root.rotation.y += t * 0.5 }, dispose: c.live.dispose }
      }
      case 'lightning': {
        const group = new THREE.Group()
        const bolts: THREE.Line[] = []
        let next = 0
        return this.mesh(group, (_t, dt) => {
          next -= dt
          if (next <= 0) {
            next = 0.12 + Math.random() * 0.25
            const pts: THREE.Vector3[] = []
            const x0 = (Math.random() - 0.5) * 3
            const z0 = (Math.random() - 0.5) * 3
            for (let i = 0; i <= 8; i++) pts.push(new THREE.Vector3(x0 + (Math.random() - 0.5) * 0.8, 7 - i * 0.85, z0 + (Math.random() - 0.5) * 0.8))
            const bolt = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#dcefff', transparent: true, opacity: 1 }))
            group.add(bolt)
            bolts.push(bolt)
          }
          for (const bl of bolts) (bl.material as THREE.LineBasicMaterial).opacity -= dt * 6
          for (let i = bolts.length - 1; i >= 0; i--) if ((bolts[i].material as THREE.LineBasicMaterial).opacity <= 0) { group.remove(bolts[i]); bolts.splice(i, 1) }
        })
      }
      case 'shadow': {
        const c = this.clone('#05050a', 0.85, new THREE.Vector3(0.9, 0, 0.6), 0.6, 1, false)
        return c.live
      }
      case 'stars': return this.emitter({ count: 120, color: ['#ffffff', a], size: 0.09, life: 3, shape: 'sphere', radius: 2.2, height: 1.5, speed: [0.02, 0.1], dir: 'random', gravity: 0, rate: 30, sprite: 'spark' })
      case 'snow': return this.emitter({ count: 260, color: ['#ffffff', '#dfefff'], size: 0.07, life: 4, shape: 'ceiling', radius: 3, height: 4.5, speed: [0.5, 1.1], dir: 'down', gravity: 0.1, rate: 60, drag: 0.4 })
      case 'flames': return this.emitter({ count: 160, color: ['#ff6a1a', '#ffd27a'], size: 0.16, life: 1.0, shape: 'ring', radius: 0.9, height: 0.05, speed: [1.2, 2.4], dir: 'up', gravity: -1.5, rate: 110 })
      case 'glitch': {
        const c = this.clone(a, 0.7, new THREE.Vector3(0, 0, 0))
        let jitter = 0
        return {
          update: (t, dt) => {
            jitter -= dt
            const off = jitter > 0 ? (Math.random() - 0.5) * 0.5 : 0
            if (jitter <= -0.3) jitter = 0.08
            c.live.update(t, dt)
            c.rig.root.position.x += off
            c.rig.root.visible = jitter > 0
          },
          dispose: c.live.dispose,
        }
      }
      case 'portal': {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.08, 10, 40), lam(a))
        ring.position.set(0, 1.3, -1.6)
        const disc = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), new THREE.MeshBasicMaterial({ color: b, transparent: true, opacity: 0.55, side: THREE.DoubleSide }))
        disc.position.copy(ring.position)
        const group = new THREE.Group()
        group.add(ring, disc)
        const swirl = new Emitter({ count: 120, color: [a, b], size: 0.08, life: 1.4, shape: 'ring', radius: 1.0, height: 1.3, speed: [0.5, 1.2], dir: 'in', gravity: 0, rate: 60, spin: 3 })
        swirl.points.position.z = -1.6
        group.add(swirl.points)
        return this.mesh(group, (t, dt) => { ring.rotation.z = t * 2; swirl.update(dt) })
      }
      case 'crown': {
        const cr = new THREE.Group()
        cr.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.14, 8), lam('#ffc247')))
        for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), lam('#ffc247')); sp.position.set(Math.cos((i / 6) * Math.PI * 2) * 0.27, 0.15, Math.sin((i / 6) * Math.PI * 2) * 0.27); cr.add(sp) }
        return this.mesh(cr, (t) => { cr.position.y = 2.4 + Math.sin(t * 2) * 0.1; cr.rotation.y = t })
      }
      case 'spotlight': {
        const coneM = new THREE.Mesh(new THREE.ConeGeometry(1.6, 8, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#fff4d6', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))
        coneM.position.y = 4
        const disc = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), new THREE.MeshBasicMaterial({ color: '#fff4d6', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }))
        disc.rotation.x = -Math.PI / 2
        disc.position.y = 0.03
        const group = new THREE.Group()
        group.add(coneM, disc)
        return this.mesh(group, () => undefined)
      }
      case 'smoke': return this.emitter({ count: 120, color: ['#8a8a96', '#3a3a44'], size: 0.5, life: 3, shape: 'ring', radius: 1.2, height: 0.05, speed: [0.2, 0.5], dir: 'up', gravity: -0.05, rate: 30, additive: false })
      case 'petals': return this.emitter({ count: 160, color: ['#ff9ad5', '#ffd6ec'], size: 0.09, life: 3.2, shape: 'ceiling', radius: 2.2, height: 3.6, speed: [0.2, 0.5], dir: 'down', gravity: 0.25, rate: 40, sprite: 'square', spin: 0.8, additive: false })
      case 'bubbles': return this.emitter({ count: 100, color: ['#a8e6ff', '#ffffff'], size: 0.14, life: 3, shape: 'ring', radius: 0.9, height: 0.1, speed: [0.3, 0.7], dir: 'up', gravity: -0.1, rate: 25 })
      case 'rain': return this.emitter({ count: 400, color: ['#9fc4ff', '#dfe9ff'], size: 0.1, life: 0.9, shape: 'ceiling', radius: 3, height: 5, speed: [6, 8], dir: 'down', gravity: 0, rate: 300, sprite: 'streak' })
      case 'aurora': {
        const geo = new THREE.PlaneGeometry(9, 3, 40, 1)
        const mat = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
          uniforms: { time: { value: 0 }, c1: { value: new THREE.Color(a) }, c2: { value: new THREE.Color(b) } },
          vertexShader: 'varying vec2 vUv; uniform float time; void main(){ vUv=uv; vec3 p=position; p.y += sin(uv.x*12.0+time*2.0)*0.3; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}',
          fragmentShader: 'varying vec2 vUv; uniform float time; uniform vec3 c1; uniform vec3 c2; void main(){ float band=sin(vUv.x*30.0+time*1.5)*0.5+0.5; float v=(1.0-abs(vUv.y-0.5)*2.0); gl_FragColor=vec4(mix(c1,c2,band)*(0.4+band*0.6), v*0.55);}',
        })
        const plane = new THREE.Mesh(geo, mat)
        plane.position.set(0, 4.5, -3)
        return this.mesh(plane, (t) => { mat.uniforms.time.value = t })
      }
      case 'orbitals': {
        const group = new THREE.Group()
        const balls: THREE.Mesh[] = []
        for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), lam(i % 2 ? a : b)); group.add(s); balls.push(s) }
        return this.mesh(group, (t) => { balls.forEach((s, i) => { const ang = t * (1.2 + i * 0.2) + i; s.position.set(Math.cos(ang) * (1 + i * 0.15), 1.2 + Math.sin(ang * 1.7) * 0.6, Math.sin(ang) * (1 + i * 0.15)) }) })
      }
      case 'shockwave': {
        const r = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }))
        r.rotation.x = -Math.PI / 2
        r.position.y = 0.05
        let phase = 0
        return this.mesh(r, (_t, dt) => { phase += dt; const k = phase % 1.6; r.scale.setScalar(0.2 + k * 5); (r.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - k * 0.6) })
      }
      case 'fracture': {
        const group = new THREE.Group()
        const shards: { m: THREE.Mesh; v: THREE.Vector3; r: THREE.Vector3 }[] = []
        for (let i = 0; i < 40; i++) {
          const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.25 + Math.random() * 0.4), new THREE.MeshLambertMaterial({ color: '#0a0a14', emissive: a, emissiveIntensity: 0.35, transparent: true, opacity: 0.9 }))
          const ang = Math.random() * Math.PI * 2
          const rad = 1 + Math.random() * 2
          m.position.set(Math.cos(ang) * rad, 0.5 + Math.random() * 3, Math.sin(ang) * rad)
          group.add(m)
          shards.push({ m, v: new THREE.Vector3(Math.cos(ang) * 0.6, 0.4, Math.sin(ang) * 0.6), r: new THREE.Vector3().randomDirection() })
        }
        let age = 0
        return this.mesh(group, (_t, dt) => { age += dt; for (const s of shards) { s.m.position.addScaledVector(s.v, dt * (age < 1.5 ? 1 : 0.2)); s.m.rotation.x += s.r.x * dt; s.m.rotation.y += s.r.y * dt } })
      }
      case 'rewind': {
        let phase = 0
        const tintClone = this.clone('#6fa8ff', 0.3, new THREE.Vector3(0, 0, 0), 0, 1.03)
        return {
          update: (t, dt) => {
            phase += dt
            const rewinding = (phase % 3.2) > 2.2
            this.host.setTimeScale(rewinding ? -2.2 : 1)
            tintClone.rig.root.visible = rewinding
            tintClone.live.update(t, dt)
          },
          dispose: () => { this.host.setTimeScale(1); tintClone.live.dispose() },
        }
      }
      case 'vanish': {
        let phase = 0
        const puff = new Emitter({ count: 80, color: [a, b], size: 0.12, life: 0.8, shape: 'column', radius: 0.4, height: 1.8, speed: [0.5, 1.5], dir: 'random', gravity: 0, rate: 0 })
        this.host.scene.add(puff.points)
        let hidden = false
        return {
          update: (_t, dt) => {
            phase += dt
            const cyc = phase % 2.6
            const shouldHide = cyc > 1.0 && cyc < 1.8
            if (shouldHide !== hidden) { hidden = shouldHide; this.host.setVisible(!hidden) }
            puff.update(dt)
          },
          dispose: () => { this.host.setVisible(true); this.host.scene.remove(puff.points); puff.dispose() },
        }
      }
      case 'throne': {
        const th = new THREE.Group()
        const M = lam('#26214d', 1, false)
        const G = lam('#ffc247')
        const parts: [number, number, number, number, number, number][] = [[1.1, 0.14, 1.0, 0, 0.55, 0], [1.1, 1.8, 0.14, 0, 1.4, 0.45], [0.14, 0.55, 1.0, -0.5, 0.85, 0], [0.14, 0.55, 1.0, 0.5, 0.85, 0], [1.3, 0.5, 1.3, 0, 0.25, 0]]
        for (const [w, h, d, x, y, z] of parts) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M); m.position.set(x, y, z); th.add(m) }
        for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4, 5), G); sp.position.set(-0.4 + i * 0.2, 2.45, 0.45); th.add(sp) }
        th.position.z = 0.15
        th.scale.setScalar(0.01)
        return this.mesh(th, (_t, dt) => { th.scale.setScalar(Math.min(1, th.scale.x + dt * 2.5)) })
      }
      case 'giant': {
        let phase = 0
        return {
          update: (_t, dt) => { phase += dt; const k = phase < 0.8 ? 1 + (phase / 0.8) * 1.6 : 2.6; this.host.rig.root.scale.multiplyScalar(k) },
          dispose: () => undefined,
        }
      }
      case 'nova': {
        const s = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }))
        s.position.y = 1.2
        let phase = 0
        return this.mesh(s, (_t, dt) => { phase += dt; const k = phase % 2.4; s.scale.setScalar(0.2 + k * 3.5); (s.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - k * 0.45); (s.material as THREE.MeshBasicMaterial).color.set(k < 0.6 ? '#ffffff' : a) })
      }
      case 'void': {
        const s = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 16), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.7 }))
        s.position.y = 1.2
        const rim = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.04, 8, 48), lam('#7d3bff'))
        rim.position.y = 1.2
        const group = new THREE.Group()
        group.add(s, rim)
        const pull = new Emitter({ count: 150, color: ['#7d3bff', '#12001f'], size: 0.09, life: 1.6, shape: 'sphere', radius: 3.2, height: 1.2, speed: [1, 2], dir: 'in', gravity: 0, rate: 60 })
        group.add(pull.points)
        return this.mesh(group, (t, dt) => { rim.rotation.x = t; rim.rotation.y = t * 0.7; pull.update(dt) })
      }
      case 'frost': {
        const group = new THREE.Group()
        for (let i = 0; i < 12; i++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.15 + Math.random() * 0.25), lam('#bfe9ff', 0.85)); c.scale.y = 2.2; const ang = (i / 12) * Math.PI * 2; c.position.set(Math.cos(ang) * (0.9 + Math.random() * 0.6), 0.2, Math.sin(ang) * (0.9 + Math.random() * 0.6)); c.rotation.z = (Math.random() - 0.5) * 0.6; group.add(c) }
        const flakes = new Emitter({ count: 120, color: ['#ffffff', '#bfe9ff'], size: 0.07, life: 2.5, shape: 'sphere', radius: 1.6, height: 1.2, speed: [0.05, 0.2], dir: 'random', gravity: 0.05, rate: 30 })
        group.add(flakes.points)
        return this.mesh(group, (_t, dt) => { flakes.update(dt) })
      }
      case 'embers': return this.emitter({ count: 120, color: ['#ff7a1a', '#ffd27a'], size: 0.08, life: 2.2, shape: 'ring', radius: 1.4, height: 0.05, speed: [0.3, 0.9], dir: 'up', gravity: -0.15, rate: 40, drag: 0.4 })
      case 'pulse': {
        const rings: THREE.Mesh[] = []
        const group = new THREE.Group()
        let next = 0
        return this.mesh(group, (_t, dt) => {
          next -= dt
          if (next <= 0) { next = 0.5; const r = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 40), lam(a, 0.8)); r.position.y = 1.2; group.add(r); rings.push(r) }
          for (const r of rings) { r.scale.addScalar(dt * 4); (r.material as THREE.MeshLambertMaterial).opacity -= dt * 0.9 }
          for (let i = rings.length - 1; i >= 0; i--) if ((rings[i].material as THREE.MeshLambertMaterial).opacity <= 0) { group.remove(rings[i]); rings.splice(i, 1) }
        })
      }
      case 'glow': {
        const mats = this.host.rig.allMeshes().map((m) => m.material as THREE.MeshLambertMaterial)
        const saved = mats.map((m) => ({ e: m.emissive.clone(), i: m.emissiveIntensity }))
        return {
          update: (t) => { for (const m of mats) { m.emissive.set(a); m.emissiveIntensity = 0.45 + Math.sin(t * 4) * 0.25 } },
          dispose: () => { mats.forEach((m, i) => { m.emissive.copy(saved[i].e); m.emissiveIntensity = saved[i].i }) },
        }
      }
      case 'trail': {
        const ghosts: { c: { rig: CharacterRig; live: Live }; age: number; pose: Pose }[] = []
        let next = 0
        return {
          update: (_t, dt) => {
            next -= dt
            if (next <= 0 && ghosts.length < 6) {
              next = 0.18
              const c = this.clone(a, 0.5, new THREE.Vector3(0, 0, 0))
              const pose = this.host.currentPose()
              const frozen = JSON.parse(JSON.stringify(pose)) as Pose
              c.rig.apply(frozen)
              ghosts.push({ c, age: 0, pose: frozen })
            }
            for (const g of ghosts) { g.age += dt; for (const m of g.c.rig.allMeshes()) (m.material as THREE.MeshLambertMaterial).opacity = Math.max(0, 0.5 - g.age * 0.55) }
            for (let i = ghosts.length - 1; i >= 0; i--) if (ghosts[i].age > 0.95) { ghosts[i].c.live.dispose(); ghosts.splice(i, 1) }
          },
          dispose: () => { for (const g of ghosts) g.c.live.dispose() },
        }
      }
      case 'lasers': {
        const group = new THREE.Group()
        const beams: THREE.Mesh[] = []
        for (let i = 0; i < 8; i++) { const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 12, 6), lam(i % 2 ? a : b, 0.7)); bm.position.y = 4; group.add(bm); beams.push(bm) }
        return this.mesh(group, (t) => { beams.forEach((bm, i) => { bm.rotation.z = Math.sin(t * 1.3 + i) * 0.9; bm.rotation.y = t * 0.8 + i * 0.8 }) })
      }
      case 'coins': return this.emitter({ count: 160, color: ['#ffd24a', '#ffb000'], size: 0.1, life: 2.2, shape: 'point', radius: 0, height: 1.5, speed: [2, 4], dir: 'random', gravity: 6, rate: 60, sprite: 'square' })
      case 'feathers': return this.emitter({ count: 120, color: ['#ffffff', '#dfe6ff'], size: 0.1, life: 4, shape: 'ceiling', radius: 2, height: 3.5, speed: [0.15, 0.4], dir: 'down', gravity: 0.08, rate: 26, sprite: 'square', drag: 1.2, spin: 0.5, additive: false })
      case 'leaves': return this.emitter({ count: 140, color: ['#7fe08a', '#c9a24a'], size: 0.1, life: 3.5, shape: 'ceiling', radius: 2.4, height: 3.5, speed: [0.3, 0.7], dir: 'down', gravity: 0.2, rate: 34, sprite: 'square', spin: 1.2, additive: false })
      case 'discoball': {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), new THREE.MeshLambertMaterial({ color: '#dfe9ff', emissive: '#8aa0ff', emissiveIntensity: 0.5, flatShading: true }))
        ball.position.y = 3.4
        const dots = new Emitter({ count: 60, color: [a, b], size: 0.16, life: 1.2, shape: 'sphere', radius: 3.5, height: 1, speed: [0, 0], dir: 'random', gravity: 0, rate: 40 })
        const group = new THREE.Group()
        group.add(ball, dots.points)
        return this.mesh(group, (t, dt) => { ball.rotation.y = t * 1.5; dots.update(dt) })
      }
      case 'runes': {
        const group = new THREE.Group()
        for (let i = 0; i < 10; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.02), lam(a)); const ang = (i / 10) * Math.PI * 2; r.position.set(Math.cos(ang) * 1.4, 0.4, Math.sin(ang) * 1.4); r.rotation.y = -ang; group.add(r) }
        const circle = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.03, 6, 48), lam(a))
        circle.rotation.x = Math.PI / 2
        circle.position.y = 0.05
        group.add(circle)
        return this.mesh(group, (t) => { group.rotation.y = t * 0.5 })
      }
      case 'eclipse': {
        const disc = new THREE.Mesh(new THREE.CircleGeometry(2.2, 40), new THREE.MeshBasicMaterial({ color: '#000000' }))
        const corona = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.7, 40), new THREE.MeshBasicMaterial({ color: a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }))
        const group = new THREE.Group()
        group.add(disc, corona)
        group.position.set(0, 4.5, -5)
        return this.mesh(group, (t) => { corona.scale.setScalar(1 + Math.sin(t * 2) * 0.05) })
      }
      case 'tornado': return this.emitter({ count: 300, color: [a, '#8a93a1'], size: 0.09, life: 2.5, shape: 'ring', radius: 0.6, height: 0.05, speed: [0.6, 1.2], dir: 'spiral', gravity: -0.6, rate: 120, spin: 5 })
      case 'meteor': {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5), new THREE.MeshLambertMaterial({ color: '#3a3038', emissive: '#ff6a1a', emissiveIntensity: 0.5 }))
        const trail = new Emitter({ count: 120, color: ['#ff6a1a', '#ffd27a'], size: 0.16, life: 0.7, shape: 'point', radius: 0, height: 0, speed: [0.5, 1.5], dir: 'random', gravity: 0, rate: 90 })
        const group = new THREE.Group()
        group.add(rock, trail.points)
        let phase = 0
        return this.mesh(group, (_t, dt) => {
          phase += dt
          const k = phase % 3
          const y = k < 1.2 ? 9 - k * 7 : 0.4
          rock.position.set(-2 + Math.min(k, 1.2) * 1.6, y, -2 + Math.min(k, 1.2) * 1.6)
          trail.points.position.copy(rock.position)
          trail.update(dt)
          rock.rotation.x += dt * 4
        })
      }
      case 'wormhole': {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 12, 48), lam(a))
        ring.position.y = 1.3
        const inner = new Emitter({ count: 200, color: [a, b], size: 0.08, life: 1.2, shape: 'ring', radius: 1.5, height: 1.3, speed: [0.8, 1.6], dir: 'in', gravity: 0, rate: 120, spin: 4 })
        const group = new THREE.Group()
        group.add(ring, inner.points)
        return this.mesh(group, (t, dt) => { ring.rotation.y = t * 1.5; ring.rotation.x = Math.sin(t) * 0.4; inner.update(dt) })
      }
      case 'timefreeze': {
        let phase = 0
        const shards = new Emitter({ count: 80, color: ['#bfe9ff', '#ffffff'], size: 0.1, life: 5, shape: 'sphere', radius: 2.4, height: 1.3, speed: [0, 0.02], dir: 'random', gravity: 0, rate: 0, sprite: 'square' })
        this.host.scene.add(shards.points)
        return {
          update: (_t, dt) => { phase += dt; const frozen = (phase % 3) > 1.6; this.host.setTimeScale(frozen ? 0 : 1); shards.points.visible = frozen; shards.update(dt) },
          dispose: () => { this.host.setTimeScale(1); this.host.scene.remove(shards.points); shards.dispose() },
        }
      }
      case 'mirrorworld': {
        const c = this.clone(b, 0.55, new THREE.Vector3(0, 0, -2.4), Math.PI)
        const floor = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), new THREE.MeshBasicMaterial({ color: b, transparent: true, opacity: 0.2, side: THREE.DoubleSide }))
        floor.rotation.x = -Math.PI / 2
        floor.position.set(0, 0.03, -2.4)
        this.host.scene.add(floor)
        return { update: c.live.update, dispose: () => { c.live.dispose(); this.host.scene.remove(floor) } }
      }
      case 'galaxy': {
        const pts = new Float32Array(900 * 3)
        const cols = new Float32Array(900 * 3)
        const ca = new THREE.Color(a)
        const cb = new THREE.Color(b)
        for (let i = 0; i < 900; i++) {
          const arm = i % 3
          const r = Math.sqrt(i / 900) * 3.2
          const ang = r * 2.2 + (arm / 3) * Math.PI * 2 + (Math.random() - 0.5) * 0.5
          pts[i * 3] = Math.cos(ang) * r
          pts[i * 3 + 1] = (Math.random() - 0.5) * 0.25
          pts[i * 3 + 2] = Math.sin(ang) * r
          const c = i % 2 ? ca : cb
          cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(pts, 3))
        geo.setAttribute('color', new THREE.BufferAttribute(cols, 3))
        const p = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }))
        p.position.y = 0.4
        return this.mesh(p, (t) => { p.rotation.y = t * 0.35; p.position.y = 0.4 + Math.sin(t) * 0.2 })
      }
      case 'clones': {
        const cs = [this.clone(a, 0.75, new THREE.Vector3(-1.6, 0, 0.3), 0.3), this.clone(b, 0.75, new THREE.Vector3(1.6, 0, 0.3), -0.3), this.clone(a, 0.6, new THREE.Vector3(0, 0, 1.8), 0)]
        return { update: (t, dt) => cs.forEach((c) => c.live.update(t, dt)), dispose: () => cs.forEach((c) => c.live.dispose()) }
      }
    }
    return null
  }
}
