import type { Rng } from './rng.ts'
import { pick, rangeInt } from './rng.ts'

// Linewalker callsigns for the 99 contract rivals. Grid-flavored handles,
// no real-world names.

const FRONTS = [
  'Volt', 'Fuse', 'Arc', 'Ohm', 'Flux', 'Amp', 'Relay', 'Dyno', 'Ion', 'Grid',
  'Spark', 'Cinder', 'Ember', 'Static', 'Surge', 'Pylon', 'Filament', 'Neon',
  'Ozone', 'Copper', 'Cobalt', 'Mercury', 'Zinc', 'Gantry', 'Breaker', 'Diode',
  'Night', 'Dusk', 'Moth', 'Glass', 'Moss', 'Tide', 'Quarry', 'Hollow',
] as const

const BACKS = [
  'walker', 'jockey', 'runner', 'wright', 'smith', 'hound', 'jack', 'fox',
  'crow', 'wren', 'pike', 'cutter', 'bender', 'chaser', 'stepper', 'drifter',
  'warden', 'keeper', 'reader', 'singer', 'dancer', 'weaver', 'burner',
] as const

export function makeCallsign(rng: Rng, taken: ReadonlySet<string>): string {
  for (let i = 0; i < 60; i++) {
    let name = `${pick(rng, FRONTS)}${pick(rng, BACKS)}`
    if (rng() < 0.3) name += `_${rangeInt(rng, 2, 99)}`
    if (!taken.has(name)) return name
  }
  return `Linewalker_${rangeInt(rng, 100, 999)}`
}
