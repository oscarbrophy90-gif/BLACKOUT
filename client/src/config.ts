// Client-wide tuning constants. Gameplay numbers live in @blackout/shared —
// this file is only presentation and simulation-budget knobs.

export const COLORS = {
  indigo: '#26214d',
  indigoDeep: '#141029',
  sodium: '#ffc247',
  sodiumDim: '#8a6a2a',
  cyan: '#39f0e0',
  cyanDim: '#1a6f68',
  danger: '#ff2d55',
  green: '#7fe08a',
} as const

/** Island geometry (metres). */
export const ISLAND_RADIUS = 950
export const MAP_SIZE = 2400
export const WATER_LEVEL = -1.6

/** Simulation LOD: bots inside this range of the camera get full simulation
 *  and a body; everyone else lives on the abstract 2 Hz tick. */
export const EMBODY_RADIUS = 240
export const MAX_EMBODIED = 22

/** Blackout Cycle base timing (phase escalation applied in game/blackout.ts). */
export const BLACKOUT_BASE_INTERVAL = 75
export const BLACKOUT_BASE_DURATION = 12
export const BLACKOUT_WARN = 5
/** Involuntary heartbeat pulse period — the floor under invisibility. */
export const HEARTBEAT_PERIOD = 4
export const HEARTBEAT_RANGE = 30

/** Movement. */
export const WALK_SPEED = 5.2
export const SPRINT_SPEED = 7.7
export const CROUCH_SPEED = 2.7
export const SLIDE_SPEED = 10.2
export const JUMP_SPEED = 8.2
export const GRAVITY = 23
export const EYE_STAND = 1.62
export const EYE_CROUCH = 1.05
export const EYE_SLIDE = 0.82
export const PLAYER_RADIUS = 0.45

export const MATCH_PLAYERS = 100

/** Seconds after landing before the Deadgrid starts advancing. */
export const GRACE_BEFORE_ZONE = 30
