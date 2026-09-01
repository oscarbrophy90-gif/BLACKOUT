import { BLACKOUT_BASE_DURATION, BLACKOUT_BASE_INTERVAL, BLACKOUT_WARN, HEARTBEAT_PERIOD } from '../config.ts'
import { emit } from '../core/events.ts'

// The Blackout Cycle — the mechanic the whole game is named for. On a fixed,
// telegraphed clock the island cuts to ink and only emissions render. This
// class owns the clock; renderers and bot perception subscribe to it.

export class BlackoutCycle {
  state: 'lit' | 'warn' | 'dark' = 'lit'
  private t = 0
  /** Set by the match as the Deadgrid advances; escalates the cycle. */
  zonePhase = 0
  /** The final circle: one permanent Blackout. */
  finalDark = false
  cycles = 0

  /** Seconds of light between darks (shrinks as the island dies). */
  interval(): number {
    return Math.max(45, BLACKOUT_BASE_INTERVAL - this.zonePhase * 5)
  }

  /** Seconds of dark (grows, capped at 60% of the whole cycle). */
  duration(): number {
    const d = BLACKOUT_BASE_DURATION + this.zonePhase * 2
    return Math.min(d, (this.interval() + d) * 0.6)
  }

  get isDark(): boolean {
    return this.state === 'dark'
  }

  /** Seconds until the next state flip (HUD countdown). */
  get stateTimeLeft(): number {
    if (this.finalDark) return Infinity
    if (this.state === 'lit') return Math.max(0, this.interval() - BLACKOUT_WARN - this.t)
    if (this.state === 'warn') return Math.max(0, BLACKOUT_WARN - this.t)
    return Math.max(0, this.duration() - this.t)
  }

  setFinal(): void {
    if (this.finalDark) return
    this.finalDark = true
    if (this.state !== 'dark') {
      this.state = 'dark'
      this.t = 0
      emit('blackoutStart', {})
    }
  }

  update(dt: number): void {
    this.t += dt
    if (this.finalDark) return
    switch (this.state) {
      case 'lit':
        if (this.t >= this.interval() - BLACKOUT_WARN) {
          this.state = 'warn'
          this.t = 0
          emit('blackoutWarn', {})
        }
        break
      case 'warn':
        if (this.t >= BLACKOUT_WARN) {
          this.state = 'dark'
          this.t = 0
          this.cycles++
          emit('blackoutStart', {})
        }
        break
      case 'dark':
        if (this.t >= this.duration()) {
          this.state = 'lit'
          this.t = 0
          emit('blackoutEnd', {})
        }
        break
    }
  }
}

// ——— Emissions ———
// One scalar per actor: how much light they are currently giving off.
// This is the ONLY thing bot perception may read during a Blackout — the
// sensory contract from the design bible. 0.06 is the involuntary
// heartbeat floor; nobody is ever perfectly invisible.

export interface EmissionState {
  move: number
  fire: number
  hurt: number
  heal: number
  pulseT: number
}

export class Emissions {
  private states = new Map<string, EmissionState>()
  /** Fired when an actor's heartbeat pulses (for the ring visual). */
  onPulse: ((id: string) => void) | null = null

  private get(id: string): EmissionState {
    let s = this.states.get(id)
    if (!s) {
      s = { move: 0, fire: 0, hurt: 0, heal: 0, pulseT: Math.random() * HEARTBEAT_PERIOD }
      this.states.set(id, s)
    }
    return s
  }

  remove(id: string): void {
    this.states.delete(id)
  }

  /** Continuous movement emission: 0.05 crouch, 0.25 walk, 0.5 sprint. */
  setMove(id: string, level: number): void {
    this.get(id).move = level
  }

  report(id: string, kind: 'fire' | 'hurt' | 'heal', amount: number): void {
    const s = this.get(id)
    s[kind] = Math.max(s[kind], amount)
  }

  lumOf(id: string): number {
    const s = this.states.get(id)
    if (!s) return 0.06
    const pulse = s.pulseT < 0.35 ? 0.25 : 0.06
    return Math.max(pulse, s.move, s.fire, s.hurt, s.heal)
  }

  update(dt: number): void {
    for (const [id, s] of this.states) {
      s.fire = Math.max(0, s.fire - dt / 1.4)
      s.hurt = Math.max(0, s.hurt - dt / 1.0)
      s.heal = Math.max(0, s.heal - dt / 1.2)
      s.pulseT += dt
      if (s.pulseT >= HEARTBEAT_PERIOD) {
        s.pulseT = 0
        this.onPulse?.(id)
      }
    }
  }

  /** Detection range in metres for a target with luminance `lum` in the dark.
   *  Heartbeat-only ≈ 30 m, walking ≈ 90 m, sprinting ≈ 150 m, firing ≈ 250 m. */
  static darkDetectRange(lum: number): number {
    return 15 + lum * 235
  }
}
