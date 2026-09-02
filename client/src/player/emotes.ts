import * as THREE from 'three'
import { EMOTE_SLOTS } from '@blackout/shared'
import type { EmoteItem } from '@blackout/shared'
import { appearanceOf, buildCharacter } from '../character/appearance.ts'
import type { Character } from '../character/appearance.ts'
import { audio } from '../core/audio.ts'
import type { Input } from '../core/input.ts'
import type { Profile } from '../meta/data.ts'
import type { EmoteWheel } from '../ui/emotewheel.ts'
import type { CollisionWorld } from '../world/collision.ts'

// The player's emote flow: hold B → wheel → release on a slot → the
// camera eases behind the same Linewalker the depot shows → the emote
// plays → the camera eases back into the helmet → 10 s cooldown.

export const EMOTE_COOLDOWN = 10
/** Looping emotes stop after this; one-shots stop when they finish (hard cap as a safety net). */
const LOOP_MAX_SECONDS = 6
const ONESHOT_MAX_SECONDS = 14
/** Seconds after the wheel closes during which the trigger stays dead — a click-select must never fire the gun. */
const FIRE_LOCK = 0.25
const BLEND_IN = 0.4
const BLEND_OUT = 0.32
const WHEEL_RADIUS = 140
const WHEEL_DEADZONE = 26
const CAM_DIST = 3.3
const CAM_HEIGHT = 1.75

export interface EmoteRefs {
  scene: THREE.Scene
  profile: Profile
  col: CollisionWorld
  wheel: EmoteWheel
  /** Called when an emote starts / stops so the match can freeze and hide the gun. */
  onFreeze: (frozen: boolean) => void
  onViewmodel: (visible: boolean) => void
}

type Phase = 'idle' | 'wheel' | 'playing' | 'exiting'

export class EmoteController {
  cooldown = 0
  private refs: EmoteRefs
  private phase: Phase = 'idle'
  private char: Character | null = null
  private t = 0
  /** 0 = first person, 1 = fully behind the character. */
  private blend = 0
  private cursorX = 0
  private cursorY = 0
  private highlighted = -1
  private wasB = false
  /** After a click-select, ignore B until it is released. */
  private eatHold = false
  private orbitYaw = 0
  private orbitPitch = 0
  private baseYaw = 0
  private loopEmote = false
  private fireLock = 0
  private tmpQ = new THREE.Quaternion()
  private tmpQ2 = new THREE.Quaternion()
  private tmpM = new THREE.Matrix4()
  private tmpV = new THREE.Vector3()
  private tmpV2 = new THREE.Vector3()
  private tmpE = new THREE.Euler(0, 0, 0, 'YXZ')

  constructor(refs: EmoteRefs) {
    this.refs = refs
  }

  /** The camera is (partly) behind the character. */
  get active(): boolean {
    return this.phase === 'playing' || this.phase === 'exiting'
  }

  /** The body is performing: no moving, no shooting. */
  get playing(): boolean {
    return this.phase === 'playing'
  }

  get wheelOpen(): boolean {
    return this.phase === 'wheel'
  }

  /** Weapons stay frozen while the wheel is up, while the camera is out of the helmet, and briefly after a click-select. */
  get suppressFire(): boolean {
    return this.phase !== 'idle' || this.fireLock > 0
  }

  /** Number of filled wheel slots, for the HUD. */
  get equippedCount(): number {
    return this.refs.profile.emoteSlots().filter(Boolean).length
  }

  /**
   * Per frame during live play. `pos`/`yaw` are the body; `canEmote` is
   * false when dead, airborne, or otherwise busy.
   */
  update(dt: number, input: Input, pos: THREE.Vector3, yaw: number, canEmote: boolean): void {
    this.cooldown = Math.max(0, this.cooldown - dt)
    this.fireLock = Math.max(0, this.fireLock - dt)
    const bDown = input.isDown('KeyB')
    const bReleased = this.wasB && !bDown
    this.wasB = bDown
    if (!bDown) this.eatHold = false

    switch (this.phase) {
      case 'idle':
        // Only with the pointer captured: without it the mouse cannot drive the wheel.
        if (bDown && !this.eatHold && canEmote && input.locked) this.openWheel()
        break
      case 'wheel': {
        // Lost the pointer (Esc → pause): close without firing anything.
        if (!input.locked) {
          this.closeWheel()
          break
        }
        // The pointer is locked: mouse deltas move a virtual cursor.
        const m = input.consumeMouse()
        this.cursorX = THREE.MathUtils.clamp(this.cursorX + m.dx * 0.9, -WHEEL_RADIUS, WHEEL_RADIUS)
        this.cursorY = THREE.MathUtils.clamp(this.cursorY + m.dy * 0.9, -WHEEL_RADIUS, WHEEL_RADIUS)
        const r = Math.hypot(this.cursorX, this.cursorY)
        if (r > WHEEL_DEADZONE) {
          // Slot 0 at the top, clockwise.
          const deg = (Math.atan2(this.cursorX, -this.cursorY) * 180) / Math.PI
          const span = 360 / EMOTE_SLOTS
          this.highlighted = Math.round(((deg + 360) % 360) / span) % EMOTE_SLOTS
        } else this.highlighted = -1
        this.refs.wheel.update(this.cursorX, this.cursorY, this.highlighted, this.cooldown, EMOTE_COOLDOWN)
        const click = input.mouseJustPressed(0)
        if (bReleased || click) {
          if (click) this.eatHold = true
          this.closeWheel()
          const slot = this.highlighted >= 0 ? this.refs.profile.emoteSlots()[this.highlighted] : null
          if (slot && canEmote) this.start(slot, pos, yaw)
          else if (this.highlighted >= 0) audio.ui('deny')
        }
        break
      }
      case 'playing': {
        this.t += dt
        this.blend = Math.min(1, this.blend + dt / BLEND_IN)
        // Mouse orbits the camera around the show instead of cancelling it.
        const m = input.consumeMouse()
        this.orbitYaw -= m.dx * 0.0025
        this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch - m.dy * 0.002, -0.5, 0.6)
        const c = this.char!
        c.anim.update(dt)
        if (this.blend > 0.3) this.refs.onViewmodel(false)
        const moved = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].some((k) => input.isDown(k))
        const done = c.anim.finished || this.t > (this.loopEmote ? LOOP_MAX_SECONDS : ONESHOT_MAX_SECONDS)
        if (done || moved || (bDown && !this.eatHold && this.t > 0.4)) this.cancel()
        break
      }
      case 'exiting': {
        this.blend = Math.max(0, this.blend - dt / BLEND_OUT)
        this.char?.anim.update(dt)
        if (this.blend <= 0) this.finishExit()
        break
      }
    }
  }

  private openWheel(): void {
    this.phase = 'wheel'
    this.cursorX = 0
    this.cursorY = 0
    this.highlighted = -1
    this.refs.wheel.show(this.refs.profile.emoteSlots())
    this.refs.wheel.update(0, 0, -1, this.cooldown, EMOTE_COOLDOWN)
    audio.ui('click')
  }

  private closeWheel(): void {
    this.refs.wheel.hide()
    this.fireLock = FIRE_LOCK
    if (this.phase === 'wheel') this.phase = 'idle'
  }

  private start(item: EmoteItem, pos: THREE.Vector3, yaw: number): void {
    if (this.cooldown > 0) {
      audio.ui('deny')
      return
    }
    // The cooldown starts at activation, so reopening the wheel cannot skip it.
    this.cooldown = EMOTE_COOLDOWN
    const c = buildCharacter(appearanceOf(this.refs.profile))
    c.holder.position.copy(pos)
    c.holder.rotation.y = yaw
    this.refs.scene.add(c.holder)
    c.anim.play(item.anim, { loop: item.anim.loop, withEffects: true })
    this.loopEmote = item.anim.loop
    this.char = c
    this.baseYaw = yaw
    this.orbitYaw = 0
    this.orbitPitch = 0
    this.t = 0
    this.blend = 0
    this.phase = 'playing'
    this.refs.onFreeze(true)
    audio.ui('equip')
  }

  /** Stop performing (damage, movement, death): ease the camera back first. */
  cancel(): void {
    if (this.phase === 'wheel') {
      this.closeWheel()
      return
    }
    if (this.phase !== 'playing') return
    // Freeze the final frame while the camera comes home.
    const c = this.char!
    c.anim.holdPose(c.anim.currentPose)
    c.anim.stopPlayback()
    this.phase = 'exiting'
    this.refs.onFreeze(false)
  }

  /** Immediate teardown (end of match): no blend.  */
  abort(): void {
    if (this.phase === 'wheel') this.closeWheel()
    if (this.phase === 'playing') this.refs.onFreeze(false)
    this.finishExit()
  }

  private finishExit(): void {
    this.char?.dispose()
    this.char = null
    this.blend = 0
    this.phase = 'idle'
    this.refs.onViewmodel(true)
  }

  /**
   * Write the camera: eye/yaw/pitch is the first-person transform; the
   * third-person one hangs behind the body; the two are blended smoothly.
   */
  applyCamera(cam: THREE.PerspectiveCamera, eye: THREE.Vector3, yaw: number, pitch: number): void {
    const k = this.blend
    const e = k * k * (3 - 2 * k)
    // First-person transform.
    this.tmpE.set(pitch, yaw, 0, 'YXZ')
    this.tmpQ.setFromEuler(this.tmpE)
    if (!this.char || e <= 0) {
      cam.position.copy(eye)
      cam.quaternion.copy(this.tmpQ)
      return
    }
    // Third-person transform: behind and above, ground-clamped, looking at the chest.
    const h = this.char.holder.position
    const camYaw = this.baseYaw + this.orbitYaw + Math.sin(this.t * 0.5) * 0.12
    const dist = CAM_DIST
    const cx = h.x + Math.sin(camYaw) * dist * Math.cos(this.orbitPitch)
    const cz = h.z + Math.cos(camYaw) * dist * Math.cos(this.orbitPitch)
    const cy = h.y + CAM_HEIGHT + Math.sin(this.orbitPitch) * dist
    const ground = this.refs.col.groundHeight(cx, cz, cy + 0.5, 0.3, cy + 2)
    this.tmpV.set(cx, Math.max(cy, ground + 0.35), cz)
    this.tmpV2.set(h.x, h.y + 1.05, h.z)
    this.tmpM.lookAt(this.tmpV, this.tmpV2, THREE.Object3D.DEFAULT_UP)
    this.tmpQ2.setFromRotationMatrix(this.tmpM)
    cam.position.lerpVectors(eye, this.tmpV, e)
    cam.quaternion.slerpQuaternions(this.tmpQ, this.tmpQ2, e)
  }

  dispose(): void {
    this.abort()
  }
}
