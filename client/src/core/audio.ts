import type { Rarity, WeaponClass } from '@blackout/shared'
import { RARITY_RANK } from '@blackout/shared'

// Every sound in BLACKOUT is synthesized at runtime with WebAudio — no
// asset files, nothing copyrighted, and the standalone build stays one file.

export class AudioSys {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private windGain: GainNode | null = null
  private zoneGain: GainNode | null = null
  private darkGain: GainNode | null = null
  volume = 0.7

  /** Must be called from a user gesture at least once. */
  ensure(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext()
        this.master = this.ctx.createGain()
        this.master.gain.value = this.volume
        this.master.connect(this.ctx.destination)
        this.startAmbience()
      } catch {
        return null
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  setVolume(v: number): void {
    this.volume = v
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05)
  }

  private noiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    return buf
  }

  private burst(opts: {
    dur: number
    gain: number
    filterType?: BiquadFilterType
    freq?: number
    freqEnd?: number
    q?: number
    delay?: number
  }): void {
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const t0 = ctx.currentTime + (opts.delay ?? 0)
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer(opts.dur)
    const filter = ctx.createBiquadFilter()
    filter.type = opts.filterType ?? 'lowpass'
    filter.frequency.setValueAtTime(opts.freq ?? 1000, t0)
    if (opts.freqEnd) filter.frequency.exponentialRampToValueAtTime(opts.freqEnd, t0 + opts.dur)
    filter.Q.value = opts.q ?? 0.8
    const g = ctx.createGain()
    g.gain.setValueAtTime(opts.gain, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur)
    src.connect(filter).connect(g).connect(this.master)
    src.start(t0)
    src.stop(t0 + opts.dur)
  }

  private tone(opts: {
    freq: number
    freqEnd?: number
    dur: number
    gain: number
    type?: OscillatorType
    delay?: number
  }): void {
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const t0 = ctx.currentTime + (opts.delay ?? 0)
    const osc = ctx.createOscillator()
    osc.type = opts.type ?? 'sine'
    osc.frequency.setValueAtTime(opts.freq, t0)
    if (opts.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqEnd), t0 + opts.dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(opts.gain, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur)
    osc.connect(g).connect(this.master)
    osc.start(t0)
    osc.stop(t0 + opts.dur)
  }

  // ——— Ambience beds ———

  private startAmbience(): void {
    const ctx = this.ctx!
    // Wind: looping filtered noise, gain driven by game state.
    const wind = ctx.createBufferSource()
    wind.buffer = this.noiseBuffer(2)
    wind.loop = true
    const windFilter = ctx.createBiquadFilter()
    windFilter.type = 'lowpass'
    windFilter.frequency.value = 320
    this.windGain = ctx.createGain()
    this.windGain.gain.value = 0.03
    wind.connect(windFilter).connect(this.windGain).connect(this.master!)
    wind.start()

    // Deadgrid wall hum: proximity-driven.
    const zoneOsc = ctx.createOscillator()
    zoneOsc.type = 'sawtooth'
    zoneOsc.frequency.value = 52
    const zoneFilter = ctx.createBiquadFilter()
    zoneFilter.type = 'lowpass'
    zoneFilter.frequency.value = 220
    this.zoneGain = ctx.createGain()
    this.zoneGain.gain.value = 0
    zoneOsc.connect(zoneFilter).connect(this.zoneGain).connect(this.master!)
    zoneOsc.start()

    // Blackout bed: near-subsonic pressure.
    const darkOsc = ctx.createOscillator()
    darkOsc.type = 'sine'
    darkOsc.frequency.value = 38
    this.darkGain = ctx.createGain()
    this.darkGain.gain.value = 0
    darkOsc.connect(this.darkGain).connect(this.master!)
    darkOsc.start()
  }

  setWind(level: number): void {
    if (this.windGain && this.ctx) this.windGain.gain.setTargetAtTime(0.015 + level * 0.06, this.ctx.currentTime, 0.4)
  }

  /** 0 = far from the Deadgrid wall, 1 = standing in it. */
  setZoneProximity(level: number): void {
    if (this.zoneGain && this.ctx) this.zoneGain.gain.setTargetAtTime(level * 0.11, this.ctx.currentTime, 0.3)
  }

  setBlackout(active: boolean): void {
    if (this.darkGain && this.ctx) this.darkGain.gain.setTargetAtTime(active ? 0.1 : 0, this.ctx.currentTime, 0.6)
  }

  // ——— One-shots ———

  shot(cls: WeaponClass, far = false): void {
    const dist = far ? 0.3 : 1
    switch (cls) {
      case 'sniper':
        this.burst({ dur: 0.5, gain: 0.5 * dist, freq: 900, freqEnd: 120, q: 0.5 })
        this.tone({ freq: 110, freqEnd: 40, dur: 0.4, gain: 0.3 * dist, type: 'triangle' })
        break
      case 'shotgun':
        this.burst({ dur: 0.28, gain: 0.55 * dist, freq: 650, freqEnd: 100 })
        this.tone({ freq: 90, freqEnd: 45, dur: 0.25, gain: 0.3 * dist, type: 'square' })
        break
      case 'dmr':
        this.burst({ dur: 0.22, gain: 0.42 * dist, freq: 1100, freqEnd: 180 })
        this.tone({ freq: 140, freqEnd: 60, dur: 0.18, gain: 0.2 * dist, type: 'triangle' })
        break
      case 'pistol':
        this.burst({ dur: 0.14, gain: 0.35 * dist, freq: 1400, freqEnd: 250 })
        break
      case 'smg':
        this.burst({ dur: 0.09, gain: 0.26 * dist, freq: 1800, freqEnd: 350 })
        break
      default: // ar
        this.burst({ dur: 0.13, gain: 0.33 * dist, freq: 1300, freqEnd: 240 })
        this.tone({ freq: 160, freqEnd: 80, dur: 0.09, gain: 0.12 * dist, type: 'square' })
    }
  }

  /** Distant abstract-fight gunfire: a faint rattle. */
  distantFight(): void {
    for (let i = 0; i < 3; i++) {
      this.burst({ dur: 0.08, gain: 0.05, freq: 500, freqEnd: 200, delay: i * 0.11 + Math.random() * 0.04 })
    }
  }

  reload(stage: 'out' | 'in' | 'rack'): void {
    if (stage === 'out') this.burst({ dur: 0.06, gain: 0.16, filterType: 'bandpass', freq: 900, q: 4 })
    else if (stage === 'in') this.burst({ dur: 0.07, gain: 0.2, filterType: 'bandpass', freq: 700, q: 4 })
    else this.burst({ dur: 0.09, gain: 0.24, filterType: 'bandpass', freq: 1400, q: 3 })
  }

  dryFire(): void {
    this.burst({ dur: 0.04, gain: 0.12, filterType: 'bandpass', freq: 2000, q: 6 })
  }

  melee(hit: boolean): void {
    this.burst({ dur: 0.12, gain: 0.2, freq: 500, freqEnd: 120 })
    if (hit) this.tone({ freq: 220, freqEnd: 90, dur: 0.12, gain: 0.22, type: 'triangle' })
  }

  step(sprinting: boolean): void {
    this.burst({ dur: 0.05, gain: sprinting ? 0.09 : 0.05, freq: 300 + Math.random() * 150, freqEnd: 90 })
  }

  land(): void {
    this.burst({ dur: 0.12, gain: 0.18, freq: 250, freqEnd: 70 })
  }

  hitmarker(killed: boolean, headshot: boolean): void {
    this.tone({ freq: headshot ? 1900 : 1500, dur: 0.05, gain: 0.14, type: 'square' })
    if (killed) {
      this.tone({ freq: 740, dur: 0.16, gain: 0.2, type: 'triangle', delay: 0.03 })
      this.tone({ freq: 494, dur: 0.22, gain: 0.18, type: 'triangle', delay: 0.1 })
    }
  }

  hurt(): void {
    this.burst({ dur: 0.14, gain: 0.3, freq: 500, freqEnd: 150 })
    this.tone({ freq: 180, freqEnd: 90, dur: 0.14, gain: 0.16, type: 'sawtooth' })
  }

  pickup(): void {
    this.tone({ freq: 620, dur: 0.06, gain: 0.12, type: 'triangle' })
    this.tone({ freq: 930, dur: 0.08, gain: 0.1, type: 'triangle', delay: 0.05 })
  }

  heal(): void {
    this.tone({ freq: 520, freqEnd: 780, dur: 0.3, gain: 0.1, type: 'sine' })
  }

  crateOpen(rarity: Rarity): void {
    this.burst({ dur: 0.25, gain: 0.22, filterType: 'bandpass', freq: 300, q: 2 })
    // Rarity sting: an arpeggio that climbs one step per rarity rank.
    const rank = RARITY_RANK[rarity]
    const base = 392
    for (let i = 0; i <= Math.min(rank + 1, 5); i++) {
      this.tone({ freq: base * Math.pow(1.335, i), dur: 0.2, gain: 0.1, type: 'triangle', delay: 0.25 + i * 0.09 })
    }
    if (rank >= 4) this.tone({ freq: base * 4, dur: 0.5, gain: 0.12, type: 'sine', delay: 0.85 })
  }

  blackoutWarn(): void {
    this.tone({ freq: 220, freqEnd: 460, dur: 1.6, gain: 0.12, type: 'sawtooth' })
    this.tone({ freq: 110, freqEnd: 230, dur: 1.6, gain: 0.08, type: 'sine' })
  }

  blackoutDrop(): void {
    this.tone({ freq: 300, freqEnd: 30, dur: 1.1, gain: 0.24, type: 'sawtooth' })
    this.burst({ dur: 0.9, gain: 0.18, freq: 800, freqEnd: 60 })
  }

  powerRestore(): void {
    this.tone({ freq: 60, freqEnd: 320, dur: 0.7, gain: 0.16, type: 'sawtooth' })
    this.tone({ freq: 523, dur: 0.3, gain: 0.08, type: 'sine', delay: 0.5 })
  }

  heartbeat(): void {
    this.tone({ freq: 55, freqEnd: 40, dur: 0.09, gain: 0.16, type: 'sine' })
    this.tone({ freq: 50, freqEnd: 36, dur: 0.11, gain: 0.12, type: 'sine', delay: 0.16 })
  }

  ui(kind: 'click' | 'buy' | 'deny' | 'equip' = 'click'): void {
    if (kind === 'click') this.tone({ freq: 700, dur: 0.04, gain: 0.08, type: 'square' })
    else if (kind === 'equip') this.tone({ freq: 520, freqEnd: 700, dur: 0.09, gain: 0.09, type: 'triangle' })
    else if (kind === 'deny') this.tone({ freq: 220, freqEnd: 160, dur: 0.16, gain: 0.12, type: 'square' })
    else {
      this.tone({ freq: 660, dur: 0.09, gain: 0.1, type: 'triangle' })
      this.tone({ freq: 990, dur: 0.14, gain: 0.1, type: 'triangle', delay: 0.08 })
    }
  }

  supplyDropFlare(): void {
    this.tone({ freq: 880, freqEnd: 440, dur: 1.4, gain: 0.09, type: 'sine' })
  }

  victory(): void {
    const notes = [392, 494, 587, 784]
    notes.forEach((f, i) => this.tone({ freq: f, dur: 0.5, gain: 0.14, type: 'triangle', delay: i * 0.16 }))
    this.tone({ freq: 784, dur: 1.6, gain: 0.1, type: 'sine', delay: 0.8 })
  }

  defeat(): void {
    this.tone({ freq: 330, freqEnd: 165, dur: 1.2, gain: 0.14, type: 'triangle' })
    this.tone({ freq: 65, dur: 1.4, gain: 0.12, type: 'sine' })
  }
}

export const audio = new AudioSys()
