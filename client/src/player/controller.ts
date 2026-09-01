import * as THREE from 'three'
import {
  CROUCH_SPEED, EYE_CROUCH, EYE_SLIDE, EYE_STAND, GRAVITY, JUMP_SPEED,
  PLAYER_RADIUS, SLIDE_SPEED, SPRINT_SPEED, WALK_SPEED,
} from '../config.ts'
import type { Input } from '../core/input.ts'
import type { CollisionWorld } from '../world/collision.ts'

// First-person movement: walk, sprint, crouch, slide, jump. Tuned for the
// "smooth and responsive" bar — instant acceleration on the ground with a
// short landing recovery, air control at one third.

export class FPSController {
  pos = new THREE.Vector3()
  vel = new THREE.Vector3()
  yaw = 0
  pitch = 0
  grounded = false
  crouching = false
  sliding = false
  private slideT = 0
  private slideDir = new THREE.Vector2()
  private eyeSmooth = EYE_STAND
  private bobT = 0
  private stepAcc = 0
  private fallStart = 0
  sensitivity = 1
  invertY = false
  /** Fired on each footstep with the current gait. */
  onStep: ((sprinting: boolean) => void) | null = null
  onLand: ((fallDist: number) => void) | null = null
  /** 0 idle → 1 sprinting, drives viewmodel sway + spread. */
  moveFactor = 0
  sprinting = false
  /** External systems can freeze movement (deploy, death). */
  frozen = false

  place(x: number, z: number, col: CollisionWorld): void {
    const y = col.groundHeight(x, z, 500, PLAYER_RADIUS)
    this.pos.set(x, y, z)
    this.vel.set(0, 0, 0)
  }

  eyeHeight(): number {
    return this.eyeSmooth
  }

  eyePos(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.pos).add(new THREE.Vector3(0, this.eyeSmooth, 0))
  }

  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch))
  }

  applyRecoil(up: number, side: number): void {
    this.pitch += THREE.MathUtils.degToRad(up)
    this.yaw += THREE.MathUtils.degToRad(side)
  }

  update(dt: number, input: Input, col: CollisionWorld, adsFactor: number): void {
    // ——— Look ———
    const m = input.consumeMouse()
    const sens = 0.0021 * this.sensitivity * (1 - adsFactor * 0.45)
    this.yaw -= m.dx * sens
    this.pitch -= m.dy * sens * (this.invertY ? -1 : 1)
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.53, 1.53)

    if (this.frozen) {
      this.moveFactor = 0
      return
    }

    // ——— Intent ———
    let ix = 0
    let iz = 0
    if (input.isDown('KeyW')) iz -= 1
    if (input.isDown('KeyS')) iz += 1
    if (input.isDown('KeyA')) ix -= 1
    if (input.isDown('KeyD')) ix += 1
    const moving = ix !== 0 || iz !== 0
    const wantCrouch = input.isDown('KeyC') || input.isDown('ControlLeft')
    const wantSprint = input.isDown('ShiftLeft') && iz < 0 && !wantCrouch && adsFactor < 0.5

    // Slide: sprint + crouch tap while grounded.
    if (wantCrouch && this.sprinting && this.grounded && !this.sliding && moving) {
      this.sliding = true
      this.slideT = 0.8
      const f = new THREE.Vector2(-Math.sin(this.yaw), -Math.cos(this.yaw))
      const r = new THREE.Vector2(Math.cos(this.yaw), -Math.sin(this.yaw))
      this.slideDir.copy(f).multiplyScalar(-iz).addScaledVector(r, ix).normalize()
    }
    if (this.sliding) {
      this.slideT -= dt
      if (this.slideT <= 0 || !this.grounded || input.justPressed('Space')) this.sliding = false
    }
    let crouchNow = (wantCrouch || this.sliding) && this.grounded ? true : wantCrouch
    // No standing up under an arcade slab: keep crouching while the
    // headroom is short, or resolve() would eject us through a wall.
    if (this.crouching && !crouchNow) {
      const ceil = col.lowestCeiling(this.pos.x, this.pos.y, this.pos.z, PLAYER_RADIUS, 1.85)
      if (ceil !== null) crouchNow = true
    }
    this.crouching = crouchNow
    this.sprinting = wantSprint && moving && this.grounded && !this.sliding

    // ——— Horizontal velocity ———
    const speed = this.sliding
      ? SLIDE_SPEED * (0.45 + 0.55 * (this.slideT / 0.8))
      : this.crouching ? CROUCH_SPEED : this.sprinting ? SPRINT_SPEED : WALK_SPEED

    let wishX = 0
    let wishZ = 0
    if (this.sliding) {
      wishX = this.slideDir.x
      wishZ = this.slideDir.y
    } else if (moving) {
      const len = Math.hypot(ix, iz)
      const f = new THREE.Vector2(-Math.sin(this.yaw), -Math.cos(this.yaw))
      const r = new THREE.Vector2(Math.cos(this.yaw), -Math.sin(this.yaw))
      wishX = (f.x * -iz + r.x * ix) / len
      wishZ = (f.y * -iz + r.y * ix) / len
    }

    const control = this.grounded ? 14 : 4.5
    this.vel.x += (wishX * speed - this.vel.x) * Math.min(1, control * dt)
    this.vel.z += (wishZ * speed - this.vel.z) * Math.min(1, control * dt)

    // ——— Vertical ———
    if (this.grounded && input.justPressed('Space')) {
      this.vel.y = JUMP_SPEED
      this.grounded = false
      this.sliding = false
    }
    this.vel.y -= GRAVITY * dt
    // Terminal velocity keeps a single frame's fall inside the swept
    // ground-check window even at the dt clamp.
    if (this.vel.y < -38) this.vel.y = -38
    if (!this.grounded && this.vel.y > -0.1 && this.fallStart < this.pos.y) this.fallStart = this.pos.y

    // ——— Integrate + collide ———
    const prevFeet = this.pos.y
    const nx = this.pos.x + this.vel.x * dt
    const nz = this.pos.z + this.vel.z * dt
    const ny = this.pos.y + this.vel.y * dt
    const height = this.crouching ? 1.3 : 1.8
    const solved = col.resolve(nx, ny, nz, PLAYER_RADIUS, height)
    this.pos.x = solved.x
    this.pos.z = solved.z
    this.pos.y = ny

    // Ceiling bump: rising into an overhead slab stops the jump instead of
    // letting resolve()'s inside-a-box branch fling us sideways.
    if (this.vel.y > 0) {
      const ceil = col.lowestCeiling(this.pos.x, this.pos.y, this.pos.z, PLAYER_RADIUS, height)
      if (ceil !== null && this.pos.y + height > ceil) {
        this.pos.y = ceil - height
        this.vel.y = 0
      }
    }

    const ground = col.groundHeight(this.pos.x, this.pos.z, this.pos.y + 0.5, PLAYER_RADIUS, prevFeet + 0.1)
    if (this.pos.y <= ground + 0.001) {
      if (!this.grounded) {
        const fall = Math.max(0, this.fallStart - ground)
        this.fallStart = ground
        this.onLand?.(fall)
      }
      this.pos.y = ground
      this.vel.y = 0
      this.grounded = true
    } else if (this.pos.y - ground > 0.05) {
      this.grounded = false
    }

    // ——— Eye height, bob, steps ———
    const targetEye = this.sliding ? EYE_SLIDE : this.crouching ? EYE_CROUCH : EYE_STAND
    this.eyeSmooth += (targetEye - this.eyeSmooth) * Math.min(1, 12 * dt)
    const planarSpeed = Math.hypot(this.vel.x, this.vel.z)
    this.moveFactor = THREE.MathUtils.clamp(planarSpeed / SPRINT_SPEED, 0, 1)
    if (this.grounded && planarSpeed > 0.5 && !this.sliding) {
      this.bobT += dt * planarSpeed * 1.6
      this.stepAcc += dt * planarSpeed
      const stride = this.sprinting ? 3.4 : 2.4
      if (this.stepAcc >= stride) {
        this.stepAcc = 0
        this.onStep?.(this.sprinting)
      }
    }
  }

  /** Small camera bob; ADS flattens it out. */
  bobOffset(adsFactor: number): { y: number; x: number } {
    const amp = 0.032 * this.moveFactor * (1 - adsFactor * 0.85)
    return { y: Math.sin(this.bobT * 2) * amp, x: Math.cos(this.bobT) * amp * 0.6 }
  }
}
