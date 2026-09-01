import type { AmmoType, Rarity, WeaponClass } from './types.ts'
import { RARITY_RANK } from './types.ts'

// Every weapon in the game is a row of data. The WeaponSystem, the bots, the
// balance tests and (later) the authoritative server all read this one table.
// Nothing about a gun lives in client code.

export interface WeaponDef {
  id: string
  name: string
  maker: string
  cls: WeaponClass
  ammo: AmmoType
  /** Damage per bullet (per pellet for shotguns) before rarity scaling. */
  damage: number
  /** Rounds per minute (trigger pulls for shotguns). */
  rpm: number
  magSize: number
  reloadTime: number // seconds
  pellets: number // 1 for everything but shotguns
  headshotMult: number
  /** Full damage inside `near` metres, falloff floor beyond `far`. */
  near: number
  far: number
  falloffFloor: number
  /** Hip-fire half-angle in degrees; ADS multiplies it down. */
  baseSpread: number
  adsSpreadMult: number
  /** Extra spread added per shot, decaying over ~0.5s. */
  bloomPerShot: number
  maxBloom: number
  /** Camera kick per shot in degrees (vertical, horizontal jitter). */
  recoilUp: number
  recoilSide: number
  /** FOV divisor while aiming: 1.35 = mild, 4 = sniper glass. */
  adsZoom: number
  adsTime: number // seconds to fully aim
  /** True = hold to fire, false = one shot per click. */
  auto: boolean
  /** Lowest rarity this weapon spawns at (exotics never spawn common). */
  floorRarity: Rarity
}

export const WEAPONS: readonly WeaponDef[] = [
  // ——— Assault rifles (medium) ———
  {
    id: 'ar_vk', name: 'Filament-3', maker: 'Halcyon Grid Authority', cls: 'ar', ammo: 'medium',
    damage: 24, rpm: 600, magSize: 30, reloadTime: 2.2, pellets: 1, headshotMult: 1.6,
    near: 35, far: 85, falloffFloor: 0.5, baseSpread: 1.5, adsSpreadMult: 0.25,
    bloomPerShot: 0.22, maxBloom: 2.2, recoilUp: 0.55, recoilSide: 0.3,
    adsZoom: 1.35, adsTime: 0.22, auto: true, floorRarity: 'common',
  },
  {
    id: 'ar_heavy', name: 'Rectifier-6', maker: 'Voskaya Combine', cls: 'ar', ammo: 'medium',
    damage: 31, rpm: 440, magSize: 25, reloadTime: 2.5, pellets: 1, headshotMult: 1.65,
    near: 40, far: 95, falloffFloor: 0.55, baseSpread: 1.7, adsSpreadMult: 0.22,
    bloomPerShot: 0.3, maxBloom: 2.4, recoilUp: 0.8, recoilSide: 0.4,
    adsZoom: 1.4, adsTime: 0.25, auto: true, floorRarity: 'common',
  },
  {
    id: 'ar_fast', name: 'Jumpwire-8', maker: 'Brant & Marrow', cls: 'ar', ammo: 'medium',
    damage: 19, rpm: 800, magSize: 35, reloadTime: 2.0, pellets: 1, headshotMult: 1.55,
    near: 28, far: 70, falloffFloor: 0.45, baseSpread: 1.9, adsSpreadMult: 0.3,
    bloomPerShot: 0.18, maxBloom: 2.6, recoilUp: 0.42, recoilSide: 0.34,
    adsZoom: 1.3, adsTime: 0.2, auto: true, floorRarity: 'common',
  },

  // ——— SMGs (light) ———
  {
    id: 'smg_cy', name: 'Fusebox-9', maker: 'Brant & Marrow', cls: 'smg', ammo: 'light',
    damage: 16, rpm: 900, magSize: 32, reloadTime: 1.8, pellets: 1, headshotMult: 1.45,
    near: 16, far: 42, falloffFloor: 0.4, baseSpread: 2.2, adsSpreadMult: 0.45,
    bloomPerShot: 0.16, maxBloom: 3.0, recoilUp: 0.32, recoilSide: 0.38,
    adsZoom: 1.2, adsTime: 0.14, auto: true, floorRarity: 'common',
  },
  {
    id: 'smg_wasp', name: 'Nocturne-5', maker: 'Halcyon Grid Authority', cls: 'smg', ammo: 'light',
    damage: 13, rpm: 1100, magSize: 40, reloadTime: 1.7, pellets: 1, headshotMult: 1.4,
    near: 12, far: 35, falloffFloor: 0.35, baseSpread: 2.6, adsSpreadMult: 0.5,
    bloomPerShot: 0.12, maxBloom: 3.4, recoilUp: 0.26, recoilSide: 0.44,
    adsZoom: 1.15, adsTime: 0.12, auto: true, floorRarity: 'common',
  },
  {
    id: 'smg_dr', name: 'Inductor-7', maker: 'Voskaya Combine', cls: 'smg', ammo: 'light',
    damage: 21, rpm: 700, magSize: 28, reloadTime: 2.0, pellets: 1, headshotMult: 1.5,
    near: 18, far: 48, falloffFloor: 0.42, baseSpread: 2.0, adsSpreadMult: 0.4,
    bloomPerShot: 0.2, maxBloom: 2.8, recoilUp: 0.4, recoilSide: 0.34,
    adsZoom: 1.25, adsTime: 0.16, auto: true, floorRarity: 'uncommon',
  },

  // ——— Shotguns (shells) ———
  {
    id: 'sg_pump', name: 'Breaker-12', maker: 'Voskaya Combine', cls: 'shotgun', ammo: 'shell',
    damage: 9, rpm: 68, magSize: 5, reloadTime: 2.8, pellets: 9, headshotMult: 1.35,
    near: 8, far: 24, falloffFloor: 0.15, baseSpread: 3.6, adsSpreadMult: 0.75,
    bloomPerShot: 0.6, maxBloom: 4.5, recoilUp: 2.4, recoilSide: 0.8,
    adsZoom: 1.15, adsTime: 0.18, auto: false, floorRarity: 'common',
  },
  {
    id: 'sg_auto', name: 'Arcwelder', maker: 'Brant & Marrow', cls: 'shotgun', ammo: 'shell',
    damage: 6, rpm: 170, magSize: 8, reloadTime: 3.0, pellets: 8, headshotMult: 1.3,
    near: 7, far: 20, falloffFloor: 0.12, baseSpread: 4.2, adsSpreadMult: 0.8,
    bloomPerShot: 0.5, maxBloom: 5.0, recoilUp: 1.6, recoilSide: 0.7,
    adsZoom: 1.1, adsTime: 0.16, auto: true, floorRarity: 'uncommon',
  },

  // ——— Snipers (heavy) ———
  {
    id: 'sn_bolt', name: 'Kilovolt-1', maker: 'Voskaya Combine', cls: 'sniper', ammo: 'heavy',
    damage: 95, rpm: 34, magSize: 5, reloadTime: 3.2, pellets: 1, headshotMult: 2.2,
    near: 120, far: 400, falloffFloor: 0.8, baseSpread: 5.0, adsSpreadMult: 0.02,
    bloomPerShot: 1.5, maxBloom: 6.0, recoilUp: 3.5, recoilSide: 0.5,
    adsZoom: 4.0, adsTime: 0.34, auto: false, floorRarity: 'rare',
  },
  {
    id: 'sn_light', name: 'Ohm-98 \'Quiet Hour\'', maker: 'Halcyon Grid Authority', cls: 'sniper', ammo: 'heavy',
    damage: 72, rpm: 55, magSize: 6, reloadTime: 2.9, pellets: 1, headshotMult: 2.0,
    near: 100, far: 350, falloffFloor: 0.75, baseSpread: 4.2, adsSpreadMult: 0.03,
    bloomPerShot: 1.2, maxBloom: 5.0, recoilUp: 2.6, recoilSide: 0.45,
    adsZoom: 3.4, adsTime: 0.3, auto: false, floorRarity: 'rare',
  },

  // ——— Marksman rifles (heavy) ———
  {
    id: 'dmr_std', name: 'Ammeter-4', maker: 'Halcyon Grid Authority', cls: 'dmr', ammo: 'heavy',
    damage: 42, rpm: 240, magSize: 12, reloadTime: 2.5, pellets: 1, headshotMult: 1.8,
    near: 70, far: 180, falloffFloor: 0.6, baseSpread: 2.4, adsSpreadMult: 0.08,
    bloomPerShot: 0.5, maxBloom: 3.2, recoilUp: 1.2, recoilSide: 0.35,
    adsZoom: 2.2, adsTime: 0.26, auto: false, floorRarity: 'uncommon',
  },
  {
    id: 'dmr_heavy', name: 'Commutator-3', maker: 'Voskaya Combine', cls: 'dmr', ammo: 'heavy',
    damage: 55, rpm: 165, magSize: 10, reloadTime: 2.7, pellets: 1, headshotMult: 1.85,
    near: 80, far: 220, falloffFloor: 0.65, baseSpread: 2.6, adsSpreadMult: 0.07,
    bloomPerShot: 0.7, maxBloom: 3.6, recoilUp: 1.7, recoilSide: 0.4,
    adsZoom: 2.5, adsTime: 0.28, auto: false, floorRarity: 'rare',
  },

  // ——— Pistols (light) ———
  {
    id: 'p_std', name: 'Diode-2', maker: 'Halcyon Grid Authority', cls: 'pistol', ammo: 'light',
    damage: 22, rpm: 380, magSize: 15, reloadTime: 1.6, pellets: 1, headshotMult: 1.6,
    near: 20, far: 55, falloffFloor: 0.45, baseSpread: 1.6, adsSpreadMult: 0.4,
    bloomPerShot: 0.3, maxBloom: 2.6, recoilUp: 0.7, recoilSide: 0.3,
    adsZoom: 1.2, adsTime: 0.12, auto: false, floorRarity: 'common',
  },
  {
    id: 'p_heavy', name: 'Short-Circuit', maker: 'Brant & Marrow', cls: 'pistol', ammo: 'light',
    damage: 45, rpm: 150, magSize: 7, reloadTime: 1.9, pellets: 1, headshotMult: 1.9,
    near: 25, far: 65, falloffFloor: 0.5, baseSpread: 1.8, adsSpreadMult: 0.35,
    bloomPerShot: 0.8, maxBloom: 3.2, recoilUp: 1.8, recoilSide: 0.5,
    adsZoom: 1.3, adsTime: 0.14, auto: false, floorRarity: 'uncommon',
  },
] as const

export const WEAPON_BY_ID: ReadonlyMap<string, WeaponDef> = new Map(WEAPONS.map((w) => [w.id, w]))

// ——— Light signatures ———
// The Blackout Cycle makes light information. Each manufacturer trades
// firepower against how loudly its weapons glow in the dark:
//   Voskaya Combine      — hits hardest, tracers hang longest (you are a beacon)
//   Halcyon Grid Authority — precise and dim, signatures fade fast
//   Brant & Marrow       — brutal up close, messy sparking blooms
export interface LightSignature {
  /** Seconds a tracer stays visible after the shot (doubled during Blackouts). */
  tracerHang: number
  /** Relative brightness of muzzle bloom, 0..1 — drives bot detection range. */
  bloom: number
  /** Sparks linger at the muzzle after sustained fire. */
  sparks: boolean
}

export const MAKER_SIGNATURE: Record<string, LightSignature> = {
  'Voskaya Combine': { tracerHang: 2.2, bloom: 1.0, sparks: false },
  'Halcyon Grid Authority': { tracerHang: 0.8, bloom: 0.55, sparks: false },
  'Brant & Marrow': { tracerHang: 1.5, bloom: 0.85, sparks: true },
}

export function signatureOf(def: WeaponDef): LightSignature {
  return MAKER_SIGNATURE[def.maker] ?? MAKER_SIGNATURE['Brant & Marrow']
}

/** Stat multipliers per rarity rank above the weapon's floor. Small on
 *  purpose: rarity should feel like an edge, not an auto-win. */
export interface RarityScaling {
  damage: number
  reloadTime: number
  bloom: number
  magBonus: number
}

export function rarityScaling(def: WeaponDef, rarity: Rarity): RarityScaling {
  const steps = Math.max(0, RARITY_RANK[rarity] - RARITY_RANK[def.floorRarity])
  return {
    damage: 1 + steps * 0.035,
    reloadTime: Math.max(0.75, 1 - steps * 0.045),
    bloom: Math.max(0.6, 1 - steps * 0.07),
    magBonus: steps >= 4 ? 2 : steps >= 2 ? 1 : 0,
  }
}

export function scaledDamage(def: WeaponDef, rarity: Rarity): number {
  return def.damage * rarityScaling(def, rarity).damage
}

export function scaledMag(def: WeaponDef, rarity: Rarity): number {
  return def.magSize + rarityScaling(def, rarity).magBonus
}

/** Theoretical sustained body DPS at point blank — balance-test fodder. */
export function dps(def: WeaponDef, rarity: Rarity): number {
  return (scaledDamage(def, rarity) * def.pellets * def.rpm) / 60
}
