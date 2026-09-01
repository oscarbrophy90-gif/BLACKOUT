// Wire protocol for the future dedicated server. Nothing in the client may
// invent the values these messages carry — see docs/NETWORKING.md.
//
// Phase 3 (multiplayer) swaps BotManager's local simulation for a
// NetworkManager speaking exactly these messages; the shapes are defined now
// so every system is written against them from day one.

export const SERVER_TICK_HZ = 30
export const CLIENT_INPUT_HZ = 60
export const SNAPSHOT_HZ = 20

export interface ClientInputMsg {
  type: 'input'
  seq: number
  /** Movement intent, not position: the server integrates. */
  move: { x: number; z: number }
  jump: boolean
  crouch: boolean
  sprint: boolean
  yaw: number
  pitch: number
  fire: boolean
  ads: boolean
  reload: boolean
  interact: boolean
  slot: number | null
}

export interface PlayerSnap {
  id: string
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  crouch: boolean
  weaponId: string | null
  firing: boolean
  /** Current emitted-light scalar 0..1 — THE Blackout information channel.
   *  Computed server-side from movement/fire state; clients only render it. */
  lum: number
}

export interface SnapshotMsg {
  type: 'snapshot'
  tick: number
  ackSeq: number
  players: PlayerSnap[]
  alive: number
  zone: { cx: number; cz: number; r: number; phase: number; shrinking: boolean }
  blackout: { active: boolean; tLeft: number; nextIn: number }
}

export type ServerEventMsg =
  | { type: 'hit'; targetId: string; damage: number; headshot: boolean }
  | { type: 'elim'; victimId: string; killerId: string | null; weaponId: string | null; inBlackout: boolean }
  | { type: 'crate'; crateId: string; openerId: string }
  | { type: 'drop'; x: number; z: number; tier: string }
  | { type: 'phase'; phase: number }
  | { type: 'ended'; winnerId: string }

export type ServerMsg = SnapshotMsg | ServerEventMsg
export type ClientMsg = ClientInputMsg | { type: 'join'; name: string } | { type: 'ping'; t: number }
