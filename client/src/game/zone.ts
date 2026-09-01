import * as THREE from 'three'
import { ZONE_PHASES, lerpCircle, nextCircle, isInside } from '@blackout/shared'
import type { Circle, Rng } from '@blackout/shared'
import { COLORS, ISLAND_RADIUS } from '../config.ts'
import { emit } from '../core/events.ts'

// The Deadgrid. Vantera's grid dies sector by sector; the live zone is
// literally where the power still is. Its wall is the Grid Shimmer — an
// aurora curtain that doubles as the game's diegetic zone UI, and the only
// landmark guaranteed to survive a Blackout.

const PHASE_LABELS = [
  'SECTOR COLLAPSE 1/7', 'SECTOR COLLAPSE 2/7', 'SECTOR COLLAPSE 3/7',
  'SECTOR COLLAPSE 4/7', 'SECTOR COLLAPSE 5/7', 'SECTOR COLLAPSE 6/7',
  'FINAL CIRCUIT',
]

export class ZoneController {
  current: Circle
  target: Circle
  /** Index into ZONE_PHASES of the phase being waited-for / shrunk-to. */
  phaseIdx = -1
  mode: 'idle' | 'waiting' | 'shrinking' | 'done' = 'idle'
  tLeft = 0
  private shrinkFrom: Circle
  private rng: Rng
  private wall: THREE.Mesh
  private wallMat: THREE.ShaderMaterial
  private nextRing: THREE.LineLoop

  constructor(scene: THREE.Scene, rng: Rng) {
    this.rng = rng
    this.current = { center: { x: 0, z: 0 }, radius: ISLAND_RADIUS }
    this.target = this.current
    this.shrinkFrom = this.current

    this.wallMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        time: { value: 0 },
        tint: { value: new THREE.Color(COLORS.cyan) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float time;
        uniform vec3 tint;
        void main() {
          float ribbon = sin(vUv.x * 220.0 + time * 1.7) * 0.5 + 0.5;
          float ribbon2 = sin(vUv.x * 90.0 - time * 0.9 + 2.0) * 0.5 + 0.5;
          float bands = ribbon * 0.6 + ribbon2 * 0.4;
          float vert = (1.0 - vUv.y);
          float a = bands * vert * vert * 0.5 + vert * 0.08;
          gl_FragColor = vec4(tint * (0.6 + bands * 0.7), a);
        }
      `,
    })
    const wallGeo = new THREE.CylinderGeometry(1, 1, 320, 128, 1, true)
    wallGeo.translate(0, 160, 0)
    this.wall = new THREE.Mesh(wallGeo, this.wallMat)
    this.wall.frustumCulled = false
    scene.add(this.wall)

    const pts: THREE.Vector3[] = []
    for (let i = 0; i < 129; i++) {
      const a = (i / 128) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)))
    }
    this.nextRing = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.5 }),
    )
    this.nextRing.visible = false
    this.nextRing.position.y = 2
    this.nextRing.frustumCulled = false
    scene.add(this.nextRing)
    this.syncWall()
  }

  /** Kick off the first collapse (after the landing grace period). */
  begin(): void {
    if (this.mode !== 'idle') return
    this.advance()
  }

  private advance(): void {
    this.phaseIdx++
    if (this.phaseIdx >= ZONE_PHASES.length) {
      this.mode = 'done'
      this.nextRing.visible = false
      return
    }
    const phase = ZONE_PHASES[this.phaseIdx]
    this.target = nextCircle(this.rng, this.current, ISLAND_RADIUS * phase.radiusFrac, ISLAND_RADIUS)
    this.mode = 'waiting'
    this.tLeft = phase.wait
    this.nextRing.visible = this.target.radius > 1
    this.nextRing.position.set(this.target.center.x, 2, this.target.center.z)
    this.nextRing.scale.setScalar(Math.max(0.01, this.target.radius))
    emit('phase', { index: this.phaseIdx, label: PHASE_LABELS[this.phaseIdx] ?? 'COLLAPSE' })
  }

  /** Damage per second at a position right now (0 inside the live zone). */
  dpsAt(x: number, z: number): number {
    if (this.phaseIdx < 0) return 0
    if (isInside(this.current, { x, z })) return 0
    const idx = Math.min(this.phaseIdx, ZONE_PHASES.length - 1)
    return ZONE_PHASES[idx].dps
  }

  /** 0 far from the wall → 1 at/inside it, for the hum + vignette. */
  wallProximity(x: number, z: number): number {
    const d = Math.hypot(x - this.current.center.x, z - this.current.center.z)
    const gap = this.current.radius - d
    if (gap < 0) return 1
    return Math.max(0, 1 - gap / 60)
  }

  update(dt: number, time: number): void {
    this.wallMat.uniforms.time.value = time
    if (this.mode === 'waiting') {
      this.tLeft -= dt
      if (this.tLeft <= 0) {
        this.mode = 'shrinking'
        this.shrinkFrom = { center: { ...this.current.center }, radius: this.current.radius }
        this.tLeft = ZONE_PHASES[this.phaseIdx].shrink
      }
    } else if (this.mode === 'shrinking') {
      this.tLeft -= dt
      const phase = ZONE_PHASES[this.phaseIdx]
      const t = 1 - Math.max(0, this.tLeft) / phase.shrink
      this.current = lerpCircle(this.shrinkFrom, this.target, t)
      this.syncWall()
      if (this.tLeft <= 0) {
        this.current = this.target
        this.advance()
      }
    }
    // The Shimmer reddens as Vantera runs out of island.
    const death = Math.min(1, Math.max(0, this.phaseIdx) / 6)
    ;(this.wallMat.uniforms.tint.value as THREE.Color)
      .set(COLORS.cyan)
      .lerp(new THREE.Color(COLORS.danger), death * 0.8)
  }

  private syncWall(): void {
    this.wall.position.set(this.current.center.x, 0, this.current.center.z)
    this.wall.scale.set(Math.max(0.5, this.current.radius), 1, Math.max(0.5, this.current.radius))
  }

  /** Data the minimap needs. */
  minimap(): { cur: Circle; next: Circle | null; secondsToShrink: number; shrinking: boolean } {
    return {
      cur: this.current,
      next: this.mode === 'waiting' || this.mode === 'shrinking' ? this.target : null,
      secondsToShrink: this.mode === 'waiting' ? this.tLeft : 0,
      shrinking: this.mode === 'shrinking',
    }
  }
}
