import type { MoveId } from '@blackout/shared'
import { P } from './rig.ts'
import type { Pose } from './rig.ts'

// Every MoveId from the vocabulary as keyframed poses. A move is a list of
// (t, pose) pairs over `duration` seconds at tempo 1; the animator lerps
// between them. Root fields carry jumps, spins and steps.

export interface MoveDef {
  duration: number
  frames: { t: number; pose: Pose }[]
}

const PI = Math.PI
const UP = PI * 0.95
const FWD = PI / 2

// Reusable poses.
const armsUp: Partial<Pose> = { shL: [UP, 0, -0.25], shR: [UP, 0, 0.25], elL: [0.1, 0, 0], elR: [0.1, 0, 0] }
const armsOut: Partial<Pose> = { shL: [0, 0, -FWD], shR: [0, 0, FWD], elL: [0, 0, 0], elR: [0, 0, 0] }
const fistR: Partial<Pose> = { shR: [FWD * 1.5, 0, 0.25], elR: [1.5, 0, 0] }
const fistL: Partial<Pose> = { shL: [FWD * 1.5, 0, -0.25], elL: [1.5, 0, 0] }
const pointR: Partial<Pose> = { shR: [FWD, 0, -0.05], elR: [0, 0, 0] }
const sitPose: Partial<Pose> = { hipL: [FWD, 0, 0.12], hipR: [FWD, 0, -0.12], kneeL: [-FWD * 0.98, 0, 0], kneeR: [-FWD * 0.98, 0, 0], rootY: -0.47 }
const crouch: Partial<Pose> = { hipL: [FWD * 0.9, 0, 0.2], hipR: [FWD * 0.9, 0, -0.2], kneeL: [-FWD * 1.7, 0, 0], kneeR: [-FWD * 1.7, 0, 0], rootY: -0.5, torso: [-0.25, 0, 0] }
const kneelPose: Partial<Pose> = { hipL: [-FWD * 0.9, 0, 0.05], kneeL: [FWD * 0.05, 0, 0], hipR: [FWD * 0.95, 0, -0.1], kneeR: [-FWD * 0.95, 0, 0], rootY: -0.42 }
const flexPose: Partial<Pose> = { shL: [FWD * 0.9, 0, -1.2], shR: [FWD * 0.9, 0, 1.2], elL: [2.3, 0, 0.3], elR: [2.3, 0, -0.3] }
const clapOpen: Partial<Pose> = { shL: [FWD * 0.9, 0, -0.35], shR: [FWD * 0.9, 0, 0.35], elL: [0.9, 0, 0], elR: [0.9, 0, 0] }
const clapShut: Partial<Pose> = { shL: [FWD * 0.9, 0, 0.55], shR: [FWD * 0.9, 0, -0.55], elL: [0.9, 0, 0], elR: [0.9, 0, 0] }
const stepL: Partial<Pose> = { hipL: [0.55, 0, 0.03], hipR: [-0.45, 0, -0.03], kneeL: [-0.2, 0, 0], kneeR: [-0.7, 0, 0], shL: [-0.5, 0, 0.08], shR: [0.5, 0, -0.08] }
const stepR: Partial<Pose> = { hipR: [0.55, 0, -0.03], hipL: [-0.45, 0, 0.03], kneeR: [-0.2, 0, 0], kneeL: [-0.7, 0, 0], shR: [-0.5, 0, -0.08], shL: [0.5, 0, 0.08] }

const f = (t: number, over: Partial<Pose>) => ({ t, pose: P(over) })
const def = (duration: number, frames: { t: number; pose: Pose }[]): MoveDef => ({ duration, frames })

export const MOVE_DEFS: Record<MoveId, MoveDef> = {
  idle: def(2.4, [f(0, {}), f(0.5, { torso: [0.03, 0, 0], head: [0.02, 0, 0], rootY: 0.01 }), f(1, {})]),
  point: def(1.1, [f(0, {}), f(0.25, { ...pointR, torso: [0, -0.2, 0] }), f(0.8, { ...pointR, torso: [0, -0.2, 0] }), f(1, {})]),
  nod: def(0.9, [f(0, {}), f(0.3, { head: [-0.35, 0, 0] }), f(0.55, { head: [0.05, 0, 0] }), f(0.8, { head: [-0.3, 0, 0] }), f(1, {})]),
  fistpump: def(0.9, [f(0, {}), f(0.35, { ...fistR, torso: [-0.1, 0, 0] }), f(0.55, { shR: [FWD * 1.9, 0, 0.3], elR: [1.2, 0, 0], torso: [0.1, 0, 0], rootY: 0.06 }), f(1, {})]),
  handsup: def(1.3, [f(0, {}), f(0.3, armsUp), f(0.85, { ...armsUp, rootY: 0.03 }), f(1, {})]),
  shoulders: def(1.2, [f(0, {}), f(0.2, { torso: [0, 0, 0.18], shL: [0, 0, 0.3] }), f(0.45, { torso: [0, 0, -0.18], shR: [0, 0, -0.3] }), f(0.7, { torso: [0, 0, 0.18], shL: [0, 0, 0.3] }), f(1, {})]),
  wave: def(1.4, [f(0, {}), f(0.2, { shR: [UP * 0.9, 0, 0.5], elR: [0.6, 0, 0.5] }), f(0.4, { shR: [UP * 0.9, 0, 0.5], elR: [0.6, 0, -0.4] }), f(0.6, { shR: [UP * 0.9, 0, 0.5], elR: [0.6, 0, 0.5] }), f(0.8, { shR: [UP * 0.9, 0, 0.5], elR: [0.6, 0, -0.4] }), f(1, {})]),
  jump: def(1.0, [f(0, {}), f(0.2, { ...crouch, rootY: -0.25 }), f(0.5, { rootY: 0.75, ...armsUp, hipL: [0.4, 0, 0.1], hipR: [0.4, 0, -0.1], kneeL: [-0.9, 0, 0], kneeR: [-0.9, 0, 0] }), f(0.85, { rootY: -0.15, kneeL: [-0.6, 0, 0], kneeR: [-0.6, 0, 0], hipL: [0.35, 0, 0.1], hipR: [0.35, 0, -0.1] }), f(1, {})]),
  raise: def(1.3, [f(0, {}), f(0.4, { shL: [UP, 0, -0.05], shR: [UP, 0, 0.05], head: [0.35, 0, 0], torso: [0.15, 0, 0] }), f(0.85, { shL: [UP, 0, -0.05], shR: [UP, 0, 0.05], head: [0.35, 0, 0], torso: [0.15, 0, 0] }), f(1, {})]),
  pose: def(1.6, [f(0, {}), f(0.3, { shL: [0, 0, -0.9], elL: [2.0, 0, 0.5], shR: [FWD * 0.6, 0, 0.6], elR: [0.4, 0, 0], torso: [0, 0.35, 0.1], hipR: [0.2, 0.3, -0.35], head: [0.1, 0.3, 0] }), f(0.9, { shL: [0, 0, -0.9], elL: [2.0, 0, 0.5], shR: [FWD * 0.6, 0, 0.6], elR: [0.4, 0, 0], torso: [0, 0.35, 0.1], hipR: [0.2, 0.3, -0.35], head: [0.1, 0.3, 0] }), f(1, {})]),
  walk: def(1.6, [f(0, {}), f(0.2, { ...stepL, rootY: 0.03, rootZ: -0.15 }), f(0.4, { ...stepR, rootY: 0.03, rootZ: -0.3 }), f(0.6, { ...stepL, rootY: 0.03, rootZ: -0.45 }), f(0.8, { ...stepR, rootY: 0.03, rootZ: -0.6 }), f(1, { rootZ: -0.6, torso: [0, 0, 0], head: [0.1, 0, 0] })]),
  dance1: def(1.6, [f(0, {}), f(0.25, { hips: [0, 0, 0.2], shL: [FWD * 0.7, 0, -0.9], shR: [0, 0, 0.5], kneeL: [-0.4, 0, 0], rootY: -0.05 }), f(0.5, { hips: [0, 0, -0.2], shR: [FWD * 0.7, 0, 0.9], shL: [0, 0, -0.5], kneeR: [-0.4, 0, 0], rootY: -0.05 }), f(0.75, { hips: [0, 0, 0.2], shL: [FWD * 0.7, 0, -0.9], shR: [0, 0, 0.5], kneeL: [-0.4, 0, 0], rootY: -0.05 }), f(1, {})]),
  dance2: def(1.6, [f(0, {}), f(0.25, { torso: [0, 0.6, 0], shL: [FWD * 1.2, 0, -0.4], shR: [-0.6, 0, 0.3], rootY: 0.02 }), f(0.5, { torso: [0, -0.6, 0], shR: [FWD * 1.2, 0, 0.4], shL: [-0.6, 0, -0.3], rootY: 0.02 }), f(0.75, { torso: [0, 0.6, 0], shL: [FWD * 1.2, 0, -0.4], shR: [-0.6, 0, 0.3], rootY: 0.02 }), f(1, {})]),
  clap: def(1.2, [f(0, {}), f(0.15, clapOpen), f(0.3, clapShut), f(0.45, clapOpen), f(0.6, clapShut), f(0.75, clapOpen), f(0.9, clapShut), f(1, {})]),
  sidestep: def(1.4, [f(0, {}), f(0.3, { rootX: -0.4, hipL: [0, 0, -0.4], kneeL: [-0.3, 0, 0], shR: [0, 0, 0.4] }), f(0.55, { rootX: 0, kneeL: [-0.2, 0, 0], kneeR: [-0.2, 0, 0] }), f(0.8, { rootX: 0.4, hipR: [0, 0, 0.4], kneeR: [-0.3, 0, 0], shL: [0, 0, -0.4] }), f(1, {})]),
  flex: def(1.5, [f(0, {}), f(0.3, flexPose), f(0.55, { ...flexPose, torso: [0, 0.25, 0] }), f(0.8, { ...flexPose, torso: [0, -0.25, 0] }), f(1, {})]),
  spin: def(1.3, [f(0, {}), f(0.5, { rootYaw: PI, shL: [0, 0, -0.5], shR: [0, 0, 0.5] }), f(1, { rootYaw: PI * 2 })]),
  chesttap: def(1.0, [f(0, {}), f(0.3, { shR: [FWD * 0.9, 0, 0.5], elR: [2.1, 0, 0] }), f(0.5, { shR: [FWD * 0.9, 0, 0.5], elR: [1.8, 0, 0] }), f(0.7, { shR: [FWD * 0.9, 0, 0.5], elR: [2.1, 0, 0] }), f(1, {})]),
  airpunch: def(0.9, [f(0, {}), f(0.3, { shR: [FWD * 1.9, 0, 0.1], elR: [0.05, 0, 0], torso: [0.12, 0, 0], rootY: 0.1, kneeL: [-0.4, 0, 0] }), f(0.65, { shR: [FWD * 1.9, 0, 0.1], elR: [0.05, 0, 0], torso: [0.12, 0, 0], rootY: 0.05 }), f(1, {})]),
  bow: def(1.5, [f(0, {}), f(0.35, { torso: [-0.85, 0, 0], head: [-0.2, 0, 0], shR: [FWD * 0.6, 0, 0.9], elR: [1.4, 0, 0] }), f(0.75, { torso: [-0.85, 0, 0], head: [-0.2, 0, 0], shR: [FWD * 0.6, 0, 0.9], elR: [1.4, 0, 0] }), f(1, {})]),
  salute: def(1.4, [f(0, {}), f(0.25, { shR: [FWD * 1.2, 0, 0.9], elR: [2.4, 0, -0.4], torso: [0.05, 0, 0] }), f(0.8, { shR: [FWD * 1.2, 0, 0.9], elR: [2.4, 0, -0.4], torso: [0.05, 0, 0] }), f(1, {})]),
  sit: def(1.8, [f(0, {}), f(0.3, sitPose), f(0.65, { ...sitPose, elL: [1.2, 0, 0], elR: [1.2, 0, 0], shL: [0.5, 0, 0.1], shR: [0.5, 0, -0.1] }), f(1, { ...sitPose, elL: [1.2, 0, 0], elR: [1.2, 0, 0], shL: [0.5, 0, 0.1], shR: [0.5, 0, -0.1] })]),
  kneel: def(1.6, [f(0, {}), f(0.35, { ...kneelPose, shR: [0.4, 0, -0.2], elR: [1.6, 0, 0], head: [-0.3, 0, 0] }), f(1, { ...kneelPose, shR: [0.4, 0, -0.2], elR: [1.6, 0, 0], head: [-0.3, 0, 0] })]),
  shuffle: def(1.2, [f(0, {}), f(0.25, { rootX: -0.15, kneeL: [-0.5, 0, 0], kneeR: [-0.3, 0, 0], hips: [0, 0, 0.1], rootY: -0.06 }), f(0.5, { rootX: 0.15, kneeR: [-0.5, 0, 0], kneeL: [-0.3, 0, 0], hips: [0, 0, -0.1], rootY: -0.06 }), f(0.75, { rootX: -0.15, kneeL: [-0.5, 0, 0], kneeR: [-0.3, 0, 0], hips: [0, 0, 0.1], rootY: -0.06 }), f(1, {})]),
  moonwalk: def(1.8, [f(0, { torso: [0.1, 0, 0] }), f(0.25, { hipL: [-0.5, 0, 0.03], kneeL: [-0.1, 0, 0], hipR: [0.3, 0, -0.03], kneeR: [-0.9, 0, 0], rootZ: 0.2, torso: [0.1, 0, 0], shL: [0, 0, 0.3], shR: [0, 0, -0.3] }), f(0.5, { hipR: [-0.5, 0, -0.03], kneeR: [-0.1, 0, 0], hipL: [0.3, 0, 0.03], kneeL: [-0.9, 0, 0], rootZ: 0.4, torso: [0.1, 0, 0] }), f(0.75, { hipL: [-0.5, 0, 0.03], kneeL: [-0.1, 0, 0], hipR: [0.3, 0, -0.03], kneeR: [-0.9, 0, 0], rootZ: 0.6, torso: [0.1, 0, 0] }), f(1, { rootZ: 0.8 })]),
  backflip: def(1.3, [f(0, {}), f(0.2, { ...crouch }), f(0.5, { rootY: 0.9, hips: [-PI, 0, 0], kneeL: [-1.6, 0, 0], kneeR: [-1.6, 0, 0], hipL: [1.0, 0, 0.1], hipR: [1.0, 0, -0.1] }), f(0.8, { rootY: 0.2, hips: [-PI * 2, 0, 0], kneeL: [-0.6, 0, 0], kneeR: [-0.6, 0, 0] }), f(1, { hips: [-PI * 2, 0, 0] })]),
  crouchpose: def(1.5, [f(0, {}), f(0.3, { ...crouch, shR: [0.3, 0, 0.4], elR: [1.9, 0, 0], head: [0.2, 0, 0] }), f(1, { ...crouch, shR: [0.3, 0, 0.4], elR: [1.9, 0, 0], head: [0.2, 0, 0] })]),
  headbang: def(1.0, [f(0, {}), f(0.25, { head: [-0.7, 0, 0], torso: [-0.2, 0, 0], ...fistL, ...fistR }), f(0.5, { head: [0.3, 0, 0], torso: [0.05, 0, 0], ...fistL, ...fistR }), f(0.75, { head: [-0.7, 0, 0], torso: [-0.2, 0, 0], ...fistL, ...fistR }), f(1, {})]),
  twirl: def(1.4, [f(0, {}), f(0.5, { rootYaw: PI, ...armsOut, rootY: 0.05 }), f(1, { rootYaw: PI * 2, ...armsUp })]),
  armswing: def(1.2, [f(0, {}), f(0.25, { shL: [FWD * 0.8, 0, 0.9], shR: [-0.6, 0, 0.6], torso: [0, 0.3, 0] }), f(0.5, { shR: [FWD * 0.8, 0, -0.9], shL: [-0.6, 0, -0.6], torso: [0, -0.3, 0] }), f(0.75, { shL: [FWD * 0.8, 0, 0.9], shR: [-0.6, 0, 0.6], torso: [0, 0.3, 0] }), f(1, {})]),
  stomp: def(1.0, [f(0, {}), f(0.3, { hipR: [1.3, 0, -0.1], kneeR: [-1.6, 0, 0], ...fistR, rootY: 0.02 }), f(0.5, { hipR: [0.05, 0, -0.05], kneeR: [-0.2, 0, 0], rootY: -0.12, torso: [-0.15, 0, 0], shR: [0.6, 0, -0.1] }), f(1, {})]),
  lookaround: def(1.8, [f(0, {}), f(0.3, { head: [0, 0.8, 0], torso: [0, 0.2, 0] }), f(0.65, { head: [0, -0.8, 0], torso: [0, -0.2, 0] }), f(1, {})]),
  shrug: def(1.2, [f(0, {}), f(0.35, { shL: [0.3, 0, -0.6], shR: [0.3, 0, 0.6], elL: [2.2, 0, 0.4], elR: [2.2, 0, -0.4], head: [0, 0, 0.25], torso: [0, 0, 0] }), f(0.75, { shL: [0.3, 0, -0.6], shR: [0.3, 0, 0.6], elL: [2.2, 0, 0.4], elR: [2.2, 0, -0.4], head: [0, 0, -0.2] }), f(1, {})]),
  laugh: def(1.4, [f(0, {}), f(0.2, { torso: [0.25, 0, 0], head: [0.45, 0, 0], shL: [0.5, 0, 0.2], elL: [2.2, 0, 0] }), f(0.4, { torso: [0.15, 0, 0], head: [0.3, 0, 0], shL: [0.5, 0, 0.2], elL: [2.2, 0, 0], rootY: 0.03 }), f(0.6, { torso: [0.28, 0, 0], head: [0.5, 0, 0], shL: [0.5, 0, 0.2], elL: [2.2, 0, 0] }), f(0.8, { torso: [0.15, 0, 0], head: [0.3, 0, 0], rootY: 0.03 }), f(1, {})]),
  facepalm: def(1.5, [f(0, {}), f(0.3, { shR: [UP * 0.8, 0, 0.3], elR: [2.7, 0, 0], head: [-0.4, 0, 0], torso: [-0.1, 0, 0] }), f(0.8, { shR: [UP * 0.8, 0, 0.3], elR: [2.7, 0, 0], head: [-0.4, 0, 0.15], torso: [-0.1, 0, 0] }), f(1, {})]),
  thumbsup: def(1.1, [f(0, {}), f(0.3, { shR: [FWD * 0.75, 0, 0.35], elR: [1.7, 0, 0], head: [0, -0.2, 0] }), f(0.8, { shR: [FWD * 0.75, 0, 0.35], elR: [1.7, 0, 0], head: [0, -0.2, 0] }), f(1, {})]),
  yawn: def(1.8, [f(0, {}), f(0.35, { shL: [UP * 0.7, 0, -0.9], shR: [UP * 0.7, 0, 0.9], elL: [0.8, 0, 0], elR: [0.8, 0, 0], head: [0.5, 0, 0], torso: [0.15, 0, 0] }), f(0.7, { shL: [UP * 0.7, 0, -0.9], shR: [UP * 0.7, 0, 0.9], elL: [0.8, 0, 0], elR: [0.8, 0, 0], head: [0.5, 0, 0], torso: [0.15, 0, 0] }), f(1, {})]),
  stretch: def(1.8, [f(0, {}), f(0.35, { ...armsUp, torso: [0, 0, 0.35], head: [0, 0, 0.2] }), f(0.7, { ...armsUp, torso: [0, 0, -0.35], head: [0, 0, -0.2] }), f(1, {})]),
  think: def(1.6, [f(0, {}), f(0.3, { shR: [FWD * 0.8, 0, 0.25], elR: [2.5, 0, 0], head: [0.1, 0.25, 0.2], torso: [0, 0.1, 0] }), f(0.65, { shR: [FWD * 0.8, 0, 0.25], elR: [2.5, 0, 0], head: [0.1, -0.25, 0.2] }), f(1, {})]),
  taunt: def(1.2, [f(0, {}), f(0.25, { shR: [FWD, 0, 0], elR: [0.6, 0, 0], head: [0, 0, 0.15] }), f(0.45, { shR: [FWD, 0, 0], elR: [1.6, 0, 0] }), f(0.65, { shR: [FWD, 0, 0], elR: [0.6, 0, 0] }), f(0.85, { shR: [FWD, 0, 0], elR: [1.6, 0, 0] }), f(1, {})]),
  cheer: def(1.3, [f(0, {}), f(0.25, { ...fistR, rootY: 0.08, torso: [0.1, 0, 0] }), f(0.5, { ...fistL, rootY: 0.08, torso: [0.1, 0, 0] }), f(0.75, { ...armsUp, rootY: 0.2, kneeL: [-0.5, 0, 0], kneeR: [-0.5, 0, 0] }), f(1, {})]),
  march: def(1.6, [f(0, {}), f(0.2, { hipL: [1.2, 0, 0.05], kneeL: [-1.2, 0, 0], shR: [0.9, 0, -0.1], shL: [-0.7, 0, 0.1], rootY: 0.02 }), f(0.45, { hipR: [1.2, 0, -0.05], kneeR: [-1.2, 0, 0], shL: [0.9, 0, 0.1], shR: [-0.7, 0, -0.1], rootY: 0.02 }), f(0.7, { hipL: [1.2, 0, 0.05], kneeL: [-1.2, 0, 0], shR: [0.9, 0, -0.1], shL: [-0.7, 0, 0.1], rootY: 0.02 }), f(1, {})]),
  robot: def(1.8, [f(0, {}), f(0.2, { shR: [FWD, 0, 0], elR: [FWD, 0, 0], head: [0, 0.5, 0] }), f(0.4, { shR: [FWD, 0, 0], elR: [FWD, 0, 0], shL: [0, 0, -FWD], head: [0, 0.5, 0] }), f(0.6, { shR: [FWD, 0, 0], elR: [0, 0, 0], shL: [0, 0, -FWD], elL: [FWD, 0, 0], head: [0, -0.5, 0], torso: [0, 0.3, 0] }), f(0.8, { shL: [0, 0, -FWD], elL: [FWD, 0, 0], head: [0, -0.5, 0], torso: [0, 0.3, 0], hipR: [FWD * 0.6, 0, 0] }), f(1, {})]),
  wiggle: def(1.2, [f(0, {}), f(0.2, { hips: [0, 0.35, 0], ...armsOut }), f(0.4, { hips: [0, -0.35, 0], ...armsOut }), f(0.6, { hips: [0, 0.35, 0], ...armsOut }), f(0.8, { hips: [0, -0.35, 0], ...armsOut }), f(1, {})]),
  leap: def(1.2, [f(0, {}), f(0.2, { ...crouch, rootY: -0.3 }), f(0.55, { rootY: 1.0, hipL: [1.3, 0, 0.1], hipR: [-0.9, 0, -0.1], kneeL: [-0.3, 0, 0], ...armsUp }), f(0.9, { rootY: -0.1, kneeL: [-0.7, 0, 0], kneeR: [-0.7, 0, 0] }), f(1, {})]),
  landslam: def(1.3, [f(0, {}), f(0.2, { rootY: 0.9, ...armsUp, kneeL: [-0.8, 0, 0], kneeR: [-0.8, 0, 0] }), f(0.5, { ...kneelPose, rootY: -0.42, shR: [FWD * 1.1, 0, 0], elR: [0.2, 0, 0], torso: [-0.4, 0, 0] }), f(0.85, { ...kneelPose, rootY: -0.42, shR: [FWD * 1.1, 0, 0], elR: [0.2, 0, 0], torso: [-0.4, 0, 0] }), f(1, {})]),
  crossarms: def(1.5, [f(0, {}), f(0.35, { shL: [FWD * 0.8, 0, 0.7], elL: [2.1, 0, 0.5], shR: [FWD * 0.8, 0, -0.7], elR: [2.1, 0, -0.5], head: [0.1, 0, 0] }), f(1, { shL: [FWD * 0.8, 0, 0.7], elL: [2.1, 0, 0.5], shR: [FWD * 0.8, 0, -0.7], elR: [2.1, 0, -0.5], head: [0.1, 0, 0] })]),
  hipsway: def(1.4, [f(0, {}), f(0.25, { hips: [0, 0, 0.25], torso: [0, 0, -0.2], shL: [0, 0, -0.3] }), f(0.5, { hips: [0, 0, -0.25], torso: [0, 0, 0.2], shR: [0, 0, 0.3] }), f(0.75, { hips: [0, 0, 0.25], torso: [0, 0, -0.2], shL: [0, 0, -0.3] }), f(1, {})]),
  punchcombo: def(1.1, [f(0, {}), f(0.2, { shL: [FWD, 0, 0.1], elL: [0, 0, 0], torso: [0, 0.35, 0], shR: [0.6, 0, -0.2], elR: [2, 0, 0] }), f(0.45, { shR: [FWD, 0, -0.1], elR: [0, 0, 0], torso: [0, -0.35, 0], shL: [0.6, 0, 0.2], elL: [2, 0, 0] }), f(0.7, { shL: [FWD * 1.4, 0, 0.1], elL: [0, 0, 0], torso: [0.1, 0.4, 0], rootY: 0.05 }), f(1, {})]),
  kick: def(1.0, [f(0, {}), f(0.3, { hipR: [1.3, 0, -0.05], kneeR: [-1.3, 0, 0], torso: [0.2, 0, 0], shL: [0.4, 0, -0.4] }), f(0.55, { hipR: [1.5, 0, -0.05], kneeR: [-0.1, 0, 0], torso: [0.35, 0, 0], shL: [0.6, 0, -0.5], shR: [-0.5, 0, 0.3] }), f(1, {})]),
  spinjump: def(1.3, [f(0, {}), f(0.2, { ...crouch }), f(0.55, { rootY: 0.8, rootYaw: PI, ...armsOut, kneeL: [-0.9, 0, 0], kneeR: [-0.9, 0, 0] }), f(0.9, { rootY: -0.1, rootYaw: PI * 2, kneeL: [-0.6, 0, 0], kneeR: [-0.6, 0, 0] }), f(1, { rootYaw: PI * 2 })]),
  slide: def(1.3, [f(0, {}), f(0.25, { ...crouch, rootZ: -0.3, shL: [0.5, 0, -0.5] }), f(0.7, { ...crouch, rootZ: -0.9, hipR: [1.4, 0, -0.1], kneeR: [-0.2, 0, 0], shL: [0.9, 0, -0.5] }), f(1, { rootZ: -1.0 })]),
  heelclick: def(1.0, [f(0, {}), f(0.3, { rootY: 0.5, hipL: [0, 0, 0.5], hipR: [0, 0, -0.5], kneeL: [-0.4, 0, 0], kneeR: [-0.4, 0, 0], ...armsOut }), f(0.5, { rootY: 0.55, hipL: [0, 0, -0.05], hipR: [0, 0, 0.05], kneeL: [-0.4, 0, 0], kneeR: [-0.4, 0, 0], ...armsUp }), f(0.85, { rootY: -0.08, kneeL: [-0.5, 0, 0], kneeR: [-0.5, 0, 0] }), f(1, {})]),
  pray: def(1.6, [f(0, {}), f(0.35, { shL: [FWD * 0.75, 0, 0.6], shR: [FWD * 0.75, 0, -0.6], elL: [1.9, 0, 0], elR: [1.9, 0, 0], head: [-0.35, 0, 0], torso: [-0.15, 0, 0] }), f(1, { shL: [FWD * 0.75, 0, 0.6], shR: [FWD * 0.75, 0, -0.6], elL: [1.9, 0, 0], elR: [1.9, 0, 0], head: [-0.35, 0, 0], torso: [-0.15, 0, 0] })]),
  meditate: def(2.2, [f(0, {}), f(0.3, { ...sitPose, hipL: [FWD, 0.4, 0.5], hipR: [FWD, -0.4, -0.5], shL: [0.4, 0, -0.5], shR: [0.4, 0, 0.5], elL: [1.3, 0, 0], elR: [1.3, 0, 0], rootY: -0.4 }), f(1, { ...sitPose, hipL: [FWD, 0.4, 0.5], hipR: [FWD, -0.4, -0.5], shL: [0.4, 0, -0.5], shR: [0.4, 0, 0.5], elL: [1.3, 0, 0], elR: [1.3, 0, 0], rootY: -0.35 })]),
  wallpush: def(1.4, [f(0, {}), f(0.3, { shL: [FWD, 0, -0.1], shR: [FWD, 0, 0.1], elL: [0.1, 0, 0], elR: [0.1, 0, 0], torso: [-0.25, 0, 0], hipL: [-0.4, 0, 0.05], rootZ: -0.1 }), f(0.6, { shL: [FWD, 0, -0.1], shR: [FWD, 0, 0.1], elL: [0.4, 0, 0], elR: [0.4, 0, 0], torso: [-0.35, 0, 0], hipL: [-0.5, 0, 0.05], rootZ: -0.15 }), f(1, {})]),
  sweep: def(1.6, [f(0, {}), f(0.3, { shR: [0, 0, FWD * 1.1], elR: [0, 0, 0], torso: [-0.7, 0.2, 0], head: [-0.2, 0, 0], hipL: [-0.3, 0, 0.05] }), f(0.75, { shR: [0, 0, FWD * 1.1], elR: [0, 0, 0], torso: [-0.7, -0.2, 0], head: [-0.2, 0, 0], hipL: [-0.3, 0, 0.05] }), f(1, {})]),
  conduct: def(1.4, [f(0, {}), f(0.2, { shR: [UP * 0.7, 0, 0.6], elR: [0.5, 0, 0], shL: [FWD * 0.5, 0, -0.5], elL: [1.2, 0, 0] }), f(0.4, { shR: [FWD * 0.6, 0, 0.2], elR: [1.2, 0, 0], shL: [UP * 0.7, 0, -0.6], elL: [0.5, 0, 0] }), f(0.6, { shR: [UP * 0.9, 0, 0.9], elR: [0.3, 0, 0], shL: [UP * 0.9, 0, -0.9], elL: [0.3, 0, 0] }), f(0.8, { shR: [FWD * 0.6, 0, 0.2], elR: [1.2, 0, 0], shL: [FWD * 0.6, 0, -0.2], elL: [1.2, 0, 0] }), f(1, {})]),
  drum: def(1.0, [f(0, {}), f(0.15, { shR: [FWD * 0.7, 0, 0.3], elR: [1.8, 0, 0], shL: [FWD * 0.7, 0, -0.3], elL: [1.0, 0, 0] }), f(0.3, { shR: [FWD * 0.7, 0, 0.3], elR: [1.0, 0, 0], shL: [FWD * 0.7, 0, -0.3], elL: [1.8, 0, 0] }), f(0.45, { shR: [FWD * 0.7, 0, 0.3], elR: [1.8, 0, 0], shL: [FWD * 0.7, 0, -0.3], elL: [1.0, 0, 0] }), f(0.6, { shR: [FWD * 0.7, 0, 0.3], elR: [1.0, 0, 0], shL: [FWD * 0.7, 0, -0.3], elL: [1.8, 0, 0] }), f(0.8, { shR: [FWD * 0.7, 0, 0.3], elR: [1.8, 0, 0], shL: [FWD * 0.7, 0, -0.3], elL: [1.8, 0, 0], head: [-0.3, 0, 0] }), f(1, {})]),
  strum: def(1.2, [f(0, {}), f(0.2, { shL: [FWD * 0.7, 0, -0.9], elL: [1.6, 0, 0], shR: [FWD * 0.5, 0, 0.4], elR: [1.9, 0, 0], torso: [0, 0.1, 0] }), f(0.4, { shL: [FWD * 0.7, 0, -0.9], elL: [1.6, 0, 0], shR: [FWD * 0.5, 0, 0.4], elR: [1.4, 0, 0], torso: [0, 0.1, 0], head: [-0.2, 0, 0] }), f(0.6, { shL: [FWD * 0.7, 0, -0.9], elL: [1.6, 0, 0], shR: [FWD * 0.5, 0, 0.4], elR: [1.9, 0, 0], torso: [0, 0.1, 0] }), f(0.8, { shL: [FWD * 0.7, 0, -0.9], elL: [1.6, 0, 0], shR: [FWD * 0.5, 0, 0.4], elR: [1.4, 0, 0], head: [-0.2, 0, 0] }), f(1, {})]),
  sing: def(1.5, [f(0, {}), f(0.3, { shR: [FWD * 0.9, 0, 0.3], elR: [2.4, 0, 0], head: [0.4, 0, 0], torso: [0.15, 0, 0], shL: [FWD * 0.6, 0, -0.9] }), f(0.65, { shR: [FWD * 0.9, 0, 0.3], elR: [2.4, 0, 0], head: [0.5, 0, 0.1], torso: [0.2, 0, 0], shL: [UP * 0.8, 0, -0.9] }), f(1, {})]),
  juggle: def(1.2, [f(0, {}), f(0.2, { shL: [FWD * 0.9, 0, -0.3], elL: [1.6, 0, 0], shR: [FWD * 0.9, 0, 0.3], elR: [0.9, 0, 0], head: [0.3, 0, 0] }), f(0.45, { shL: [FWD * 0.9, 0, -0.3], elL: [0.9, 0, 0], shR: [FWD * 0.9, 0, 0.3], elR: [1.6, 0, 0], head: [0.35, 0.2, 0] }), f(0.7, { shL: [FWD * 0.9, 0, -0.3], elL: [1.6, 0, 0], shR: [FWD * 0.9, 0, 0.3], elR: [0.9, 0, 0], head: [0.3, -0.2, 0] }), f(1, {})]),
  freeze: def(1.8, [f(0, {}), f(0.25, { shR: [UP, 0, 0.4], elR: [0.2, 0, 0], shL: [0, 0, -FWD], hipL: [0, 0, 0.6], kneeL: [-0.2, 0, 0], torso: [0, 0.2, -0.2], head: [0.15, 0.2, 0] }), f(1, { shR: [UP, 0, 0.4], elR: [0.2, 0, 0], shL: [0, 0, -FWD], hipL: [0, 0, 0.6], kneeL: [-0.2, 0, 0], torso: [0, 0.2, -0.2], head: [0.15, 0.2, 0] })]),
  levitate: def(2.2, [f(0, {}), f(0.35, { ...sitPose, hipL: [FWD, 0.4, 0.5], hipR: [FWD, -0.4, -0.5], rootY: 0.2, ...armsOut }), f(0.7, { ...sitPose, hipL: [FWD, 0.4, 0.5], hipR: [FWD, -0.4, -0.5], rootY: 0.45, ...armsOut }), f(1, { ...sitPose, hipL: [FWD, 0.4, 0.5], hipR: [FWD, -0.4, -0.5], rootY: 0.4, ...armsOut })]),
  collapse: def(1.6, [f(0, {}), f(0.3, { ...crouch, rootY: -0.4 }), f(0.65, { hips: [-FWD * 0.95, 0, 0], rootY: -0.75, kneeL: [-0.3, 0, 0], kneeR: [-0.3, 0, 0], shL: [0, 0, -FWD], shR: [0, 0, FWD] }), f(1, { hips: [-FWD * 0.95, 0, 0], rootY: -0.75, kneeL: [-0.3, 0, 0], kneeR: [-0.3, 0, 0], shL: [0, 0, -FWD], shR: [0, 0, FWD] })]),
}
