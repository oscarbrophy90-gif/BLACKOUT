import type { Pose } from './rig.ts'

// Procedural locomotion for the shared Linewalker rig: idle breathing,
// walk/run stride, and weapon-holding arms. Bots run on this between
// emotes; nothing here is authored per cosmetic, so every body — player
// or bot — moves the same way with whatever it is wearing.

export interface LocoInput {
  /** Stride phase in radians; the caller advances it with speed. */
  phase: number
  /** 0 standing … 1 sprinting. */
  speed: number
  /** Wall time, for idle breathing. */
  time: number
  /** Holding a gun: right arm carries it. */
  armed: boolean
  /** Shouldering the gun at a target: both arms forward. */
  aiming: boolean
}

const FWD = Math.PI / 2

/** Write the locomotion target pose into `out` (arrays reused, no allocation). */
export function locomotionPose(inp: LocoInput, out: Pose): Pose {
  const s = Math.min(1, Math.max(0, inp.speed))
  const moving = s > 0.03
  const ph = inp.phase
  const swing = moving ? Math.sin(ph) * (0.35 + 0.5 * s) : 0
  const breathe = Math.sin(inp.time * 1.3) * 0.02

  // Legs: opposite swing; the trailing leg bends at the knee.
  out.hipL[0] = swing
  out.hipL[1] = 0
  out.hipL[2] = 0.03
  out.hipR[0] = -swing
  out.hipR[1] = 0
  out.hipR[2] = -0.03
  out.kneeL[0] = moving ? -(0.15 + 0.6 * Math.max(0, -Math.sin(ph))) * (0.4 + 0.6 * s) : 0
  out.kneeL[1] = 0
  out.kneeL[2] = 0
  out.kneeR[0] = moving ? -(0.15 + 0.6 * Math.max(0, Math.sin(ph))) * (0.4 + 0.6 * s) : 0
  out.kneeR[1] = 0
  out.kneeR[2] = 0

  // Arms.
  if (inp.aiming && inp.armed) {
    // Gun up: right arm straight out, left hand supporting across.
    out.shR[0] = FWD * 0.98; out.shR[1] = 0; out.shR[2] = -0.12
    out.elR[0] = 0.12; out.elR[1] = 0; out.elR[2] = 0
    out.shL[0] = FWD * 0.9; out.shL[1] = 0; out.shL[2] = 0.5
    out.elL[0] = 0.85; out.elL[1] = 0; out.elL[2] = 0
  } else if (inp.armed) {
    // Gun low-ready in the right hand, left arm swings a little.
    out.shR[0] = 0.5 + swing * 0.15; out.shR[1] = 0; out.shR[2] = -0.1
    out.elR[0] = 0.55; out.elR[1] = 0; out.elR[2] = 0
    out.shL[0] = -swing * 0.6; out.shL[1] = 0; out.shL[2] = 0.1
    out.elL[0] = 0.25 + 0.2 * s; out.elL[1] = 0; out.elL[2] = 0
  } else {
    // Empty hands: natural counter-swing.
    out.shL[0] = -swing * 0.75; out.shL[1] = 0; out.shL[2] = 0.08
    out.shR[0] = swing * 0.75; out.shR[1] = 0; out.shR[2] = -0.08
    out.elL[0] = 0.15 + 0.3 * s; out.elL[1] = 0; out.elL[2] = 0
    out.elR[0] = 0.15 + 0.3 * s; out.elR[1] = 0; out.elR[2] = 0
  }

  // Lean into speed; breathe when still.
  out.torso[0] = 0.1 * s + (moving ? 0 : breathe)
  out.torso[1] = moving ? Math.sin(ph) * 0.06 * s : 0
  out.torso[2] = 0
  out.head[0] = -0.06 * s + (moving ? 0 : breathe * 0.5)
  out.head[1] = 0
  out.head[2] = 0
  out.hips[0] = 0
  out.hips[1] = moving ? -Math.sin(ph) * 0.05 * s : 0
  out.hips[2] = 0

  // Two bobs per stride.
  out.rootY = moving ? (0.5 - 0.5 * Math.cos(2 * ph)) * 0.035 * s : breathe * 0.25
  out.rootYaw = 0
  out.rootX = 0
  out.rootZ = 0
  out.scale = 1
  return out
}

/** Stride frequency (rad/s) for a ground speed in m/s. */
export function strideRate(speed: number): number {
  return speed <= 0.05 ? 0 : 4.2 + speed * 1.15
}
