import * as THREE from 'three'
import {
  SUITS, WEAPON_BY_ID, WEAPONS, applyHit, dps, falloff, makeCallsign,
  scaledDamage, signatureOf, RARITY_RANK, RARITIES,
} from '@blackout/shared'
import type { Rarity, Rng, Vitals, WeaponDef } from '@blackout/shared'
import { EMBODY_RADIUS, ISLAND_RADIUS, MAX_EMBODIED } from '../config.ts'
import { audio } from '../core/audio.ts'
import { emit } from '../core/events.ts'
import type { CollisionWorld } from '../world/collision.ts'
import { rayVsActor } from '../world/collision.ts'
import type { Fx } from '../world/fx.ts'
import { heightAt, DISTRICTS } from '../world/terrain.ts'
import { Emissions } from '../game/blackout.ts'
import type { LootSystem } from '../game/loot.ts'
import type { ZoneController } from '../game/zone.ts'
import type { HitTarget, TargetField } from '../weapons/weapons.ts'

// The other 99 contracts. Nearby bots are embodied — full perception,
// movement, and hitscan against real geometry. Distant bots run on an
// abstract 2 Hz tick: they rotate with the zone, gear up, and fight each
// other statistically, which keeps a 100-slot match alive at 60 fps.
//
// SENSORY CONTRACT (design bible rule 4): during a Blackout a bot's target
// acquisition reads exactly one number about you — your emitted-light
// scalar — plus noise events. No bot ever sees through the dark for free.

export type BotState = 'loot' | 'rotate' | 'engage' | 'heal' | 'wander'

interface Gear {
  defId: string
  rarity: Rarity
  power: number
}

export interface Bot {
  id: string
  name: string
  pos: THREE.Vector3
  yaw: number
  vitals: Vitals
  gear: Gear
  heals: number
  skill: number
  aggression: number
  state: BotState
  embodied: boolean
  mesh: THREE.Group | null
  goal: { x: number; z: number } | null
  targetId: string | null // 'player' or bot id
  losOk: boolean
  losT: number
  reactT: number
  fireT: number
  burstLeft: number
  burstPause: number
  strafeDir: number
  strafeT: number
  healT: number
  stepT: number
  stallT: number
  decideT: number
  fight: { otherId: string; tLeft: number } | null
  alive: boolean
}

export interface PlayerRef {
  pos: THREE.Vector3
  eyeHeight: number
  alive: boolean
  /** Player movement speed factor 0..1 for light-mode visibility. */
  moveFactor: number
  crouching: boolean
}

export class BotManager implements TargetField {
  bots = new Map<string, Bot>()
  private scene: THREE.Scene
  private col: CollisionWorld
  private loot: LootSystem
  private emissions: Emissions
  private fx: Fx
  private rng: Rng
  private zone: ZoneController
  private embodyT = 0
  private abstractT = 0
  private tmp = new THREE.Vector3()
  private tmp2 = new THREE.Vector3()
  dark = false
  player: PlayerRef | null = null
  onPlayerDamaged: ((amount: number, headshotMult: number, sourceAngle: number, attackerName: string) => void) | null = null
  /** Attacker id per bot for kill credit ('player' or bot id). */
  private lastAttacker = new Map<string, { id: string; weaponDefId: string | null; headshot: boolean }>()

  constructor(scene: THREE.Scene, col: CollisionWorld, loot: LootSystem, emissions: Emissions, fx: Fx, zone: ZoneController, rng: Rng) {
    this.scene = scene
    this.col = col
    this.loot = loot
    this.emissions = emissions
    this.fx = fx
    this.zone = zone
    this.rng = rng
  }

  spawnAll(count: number): void {
    const taken = new Set<string>()
    for (let i = 0; i < count; i++) {
      const district = DISTRICTS[Math.floor(this.rng() * DISTRICTS.length)]
      const ang = this.rng() * Math.PI * 2
      const r = Math.sqrt(this.rng()) * district.r * 1.2
      let x = district.cx + Math.cos(ang) * r
      let z = district.cz + Math.sin(ang) * r
      if (Math.hypot(x, z) > ISLAND_RADIUS * 0.9 || heightAt(x, z) < 0.5) {
        x = (this.rng() - 0.5) * ISLAND_RADIUS
        z = (this.rng() - 0.5) * ISLAND_RADIUS
      }
      const clear = this.col.findClearGround(x, z)
      x = clear.x
      z = clear.z
      const name = makeCallsign(this.rng, taken)
      taken.add(name)
      const skill = 0.3 + this.rng() * 0.62
      const bot: Bot = {
        id: `bot${i}`,
        name,
        pos: new THREE.Vector3(x, Math.max(0.2, heightAt(x, z)), z),
        yaw: this.rng() * Math.PI * 2,
        vitals: { health: 100, armor: this.rng() < 0.3 ? 50 : 0 },
        gear: this.makeGear('p_std', 'common'),
        heals: 1 + Math.floor(this.rng() * 3),
        skill,
        aggression: 0.35 + this.rng() * 0.6,
        state: 'loot',
        embodied: false,
        mesh: null,
        goal: null,
        targetId: null,
        losOk: false,
        losT: 0,
        reactT: 0,
        fireT: 0,
        burstLeft: 0,
        burstPause: 0,
        strafeDir: 1,
        strafeT: 0,
        healT: 0,
        stepT: 0,
        stallT: 0,
        decideT: this.rng(),
        fight: null,
        alive: true,
      }
      this.bots.set(bot.id, bot)
    }
  }

  private makeGear(defId: string, rarity: Rarity): Gear {
    const def = WEAPON_BY_ID.get(defId)!
    return { defId, rarity, power: dps(def, rarity) }
  }

  aliveCount(): number {
    let n = 0
    for (const b of this.bots.values()) if (b.alive) n++
    return n
  }

  aliveBots(): Bot[] {
    return [...this.bots.values()].filter((b) => b.alive)
  }

  // ——— TargetField (what the player's gun can hit) ———

  shootable(): HitTarget[] {
    const out: HitTarget[] = []
    for (const b of this.bots.values()) {
      if (b.alive && b.embodied) {
        // 1.62 matches the rendered head, so the helmet is hittable.
        out.push({ id: b.id, x: b.pos.x, y: b.pos.y, z: b.pos.z, eyeHeight: 1.62 })
      }
    }
    return out
  }

  damage(id: string, amount: number, headshot: boolean, weaponDefId: string | null): { killed: boolean } {
    return this.damageBot(id, amount, headshot, 'player', weaponDefId)
  }

  damageBot(id: string, amount: number, headshot: boolean, attackerId: string, weaponDefId: string | null): { killed: boolean } {
    const b = this.bots.get(id)
    if (!b || !b.alive) return { killed: false }
    const res = applyHit(b.vitals, amount, 1) // multiplier already applied by caller
    b.vitals = res.vitals
    this.lastAttacker.set(id, { id: attackerId, weaponDefId, headshot })
    this.emissions.report(id, 'hurt', 0.6)
    if (b.embodied) {
      this.fx.flare(this.tmp.copy(b.pos).add(this.tmp2.set(0, 1.1, 0)), '#ff2d55', 0.6, 0.25)
      // Getting shot makes a bot fight back or flee toward cover.
      if (b.state !== 'engage' && b.reactT <= 0) {
        b.targetId = attackerId === 'player' ? 'player' : attackerId
        b.reactT = 0.2 + (1 - b.skill) * 0.4
        b.state = 'engage'
      }
    }
    if (res.killed) this.kill(b, attackerId, weaponDefId, headshot)
    return { killed: res.killed }
  }

  private kill(b: Bot, attackerId: string, weaponDefId: string | null, headshot: boolean): void {
    b.alive = false
    b.fight = null
    this.emissions.remove(b.id)
    if (b.mesh) {
      this.fx.ring(b.pos.x, b.pos.y, b.pos.z, '#ff2d55', 3, 0.6)
      this.scene.remove(b.mesh)
      b.mesh = null
    }
    // Embodied deaths pay out: the dead drop their kit where they fell.
    if (b.embodied) {
      this.loot.spawnFloor({ type: 'weapon', weaponId: b.gear.defId, rarity: b.gear.rarity }, b.pos.x, b.pos.z, b.pos.y)
      const def = WEAPON_BY_ID.get(b.gear.defId)!
      this.loot.spawnFloor({ type: 'ammo', ammo: def.ammo, amount: 30 }, b.pos.x + 0.7, b.pos.z + 0.4, b.pos.y)
      if (b.heals > 0) this.loot.spawnFloor({ type: 'heal', healId: 'trickle', amount: b.heals }, b.pos.x - 0.6, b.pos.z + 0.5, b.pos.y)
    }
    const killerBot = attackerId !== 'player' && attackerId !== 'deadgrid' ? this.bots.get(attackerId) : null
    const weaponName = weaponDefId ? WEAPON_BY_ID.get(weaponDefId)?.name ?? 'melee' : attackerId === 'deadgrid' ? 'the Deadgrid' : 'melee'
    emit('kill', {
      killerName: attackerId === 'player' ? 'YOU' : attackerId === 'deadgrid' ? 'THE DEADGRID' : killerBot?.name ?? '??',
      victimName: b.name,
      weaponName,
      inBlackout: this.dark,
      victimIsPlayer: false,
      killerIsPlayer: attackerId === 'player',
      headshot,
    })
    emit('aliveChanged', { alive: this.aliveCount() + (this.player?.alive ? 1 : 0) })
  }

  /** Zone damage for all bots; the match calls this once per second. */
  applyZoneDamage(): void {
    for (const b of this.bots.values()) {
      if (!b.alive) continue
      const dps_ = this.zone.dpsAt(b.pos.x, b.pos.z)
      if (dps_ > 0) {
        b.vitals.health -= dps_
        if (b.vitals.health <= 0) this.kill(b, 'deadgrid', null, false)
        else if (b.embodied || this.rng() < 0.6) {
          // Being burned drives everyone inward.
          b.state = 'rotate'
          b.goal = this.pointInZone()
        }
      }
    }
  }

  private pointInZone(): { x: number; z: number } {
    const c = this.zone.current
    const ang = this.rng() * Math.PI * 2
    const r = Math.sqrt(this.rng()) * Math.max(8, c.radius * 0.7)
    let x = c.center.x + Math.cos(ang) * r
    let z = c.center.z + Math.sin(ang) * r
    if (Math.hypot(x, z) > ISLAND_RADIUS * 0.92) {
      x *= 0.8
      z *= 0.8
    }
    return { x, z }
  }

  update(dt: number, time: number, cameraPos: THREE.Vector3): void {
    this.embodyT -= dt
    if (this.embodyT <= 0) {
      this.embodyT = 0.5
      this.manageEmbodiment(cameraPos)
    }
    for (const b of this.bots.values()) {
      if (!b.alive) continue
      if (b.embodied) this.updateEmbodied(b, dt, time)
    }
    this.abstractT -= dt
    if (this.abstractT <= 0) {
      this.abstractT = 0.55
      this.updateAbstract(0.55, cameraPos)
    }
  }

  private manageEmbodiment(cameraPos: THREE.Vector3): void {
    const alive = this.aliveBots()
    // The endgame embodies everyone left, whatever the distance.
    const endgame = alive.length + (this.player?.alive ? 1 : 0) <= 12
    const enter2 = EMBODY_RADIUS * EMBODY_RADIUS
    // Hysteresis: an embodied bot keeps its body until well past the enter
    // radius, so boundary-straddlers don't blink in and out every half second.
    const exit2 = enter2 * 1.5
    const ranked = alive
      .map((b) => ({ b, d: b.pos.distanceToSquared(cameraPos) }))
      .sort((a, z) => (a.d - (a.b.embodied ? enter2 * 0.2 : 0)) - (z.d - (z.b.embodied ? enter2 * 0.2 : 0)))
    let n = 0
    for (const { b, d } of ranked) {
      const inRange = endgame || (b.embodied ? d < exit2 : d < enter2)
      const want = n < MAX_EMBODIED && inRange
      if (want) n++
      if (want && !b.embodied) this.embody(b)
      else if (!want && b.embodied) this.disembody(b)
    }
  }

  private embody(b: Bot): void {
    b.embodied = true
    b.fight = null
    // Abstract drift ignores structures; never materialize on (or in) a roof.
    const terrain = heightAt(b.pos.x, b.pos.z)
    const surface = this.col.groundHeight(b.pos.x, b.pos.z, 400, 0.4)
    if (surface - terrain > 0.5) {
      const clear = this.col.findClearGround(b.pos.x, b.pos.z, 40)
      b.pos.x = clear.x
      b.pos.z = clear.z
      b.pos.y = Math.max(heightAt(clear.x, clear.z), 0.2)
    } else {
      b.pos.y = Math.max(surface, terrain)
    }
    if (!b.mesh) b.mesh = this.buildMesh(b)
    this.scene.add(b.mesh)
    b.mesh.position.copy(b.pos)
  }

  private disembody(b: Bot): void {
    b.embodied = false
    if (b.mesh) this.scene.remove(b.mesh)
    b.targetId = null
  }

  private buildMesh(b: Bot): THREE.Group {
    const suit = SUITS[Math.abs(hashCode(b.id)) % SUITS.length]
    const g = new THREE.Group()
    const bodyMat = new THREE.MeshLambertMaterial({ color: suit.colors[0] })
    const trimMat = new THREE.MeshLambertMaterial({ color: suit.colors[1] })
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.85, 3, 8), bodyMat)
    body.position.y = 0.95
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 7), trimMat)
    head.position.y = 1.62
    // Visor: Lambert, NOT Basic — bots must go dark in a Blackout too.
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.1), new THREE.MeshLambertMaterial({ color: suit.colors[2] }))
    visor.position.set(0, 1.64, -0.16)
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.55), new THREE.MeshLambertMaterial({ color: '#22242a' }))
    gun.position.set(0.28, 1.25, -0.3)
    g.add(body, head, visor, gun)
    return g
  }

  /**
   * Can this bot currently perceive the given point-target?
   * Light: distance + facing cone + line of sight.
   * Dark: the luminance scalar sets range; facing is irrelevant (a light
   * source is a light source); walls still block direct fire but a strong
   * emission is trackable through them (you know, you move, you cut angles).
   */
  private perceives(b: Bot, tx: number, ty: number, tz: number, lum: number, moveVisibility: number): boolean {
    const dx = tx - b.pos.x
    const dy = ty - b.pos.y
    const dz = tz - b.pos.z
    const dist = Math.hypot(dx, dy, dz)
    if (this.dark) {
      return dist <= Emissions.darkDetectRange(lum)
    }
    const range = 165 * (0.55 + 0.45 * moveVisibility) + 40
    if (dist > range) return false
    const facingX = -Math.sin(b.yaw)
    const facingZ = -Math.cos(b.yaw)
    const dot = (dx * facingX + dz * facingZ) / Math.max(0.01, dist)
    if (dot < Math.cos(THREE.MathUtils.degToRad(70)) && dist > 12) return false
    return this.col.lineOfSight(b.pos.x, b.pos.y + 1.55, b.pos.z, tx, ty, tz)
  }

  private updateEmbodied(b: Bot, dt: number, time: number): void {
    b.reactT = Math.max(0, b.reactT - dt)
    b.fireT = Math.max(0, b.fireT - dt)
    b.decideT -= dt
    b.losT -= dt

    const player = this.player
    // ——— Decisions at 5 Hz ———
    if (b.decideT <= 0) {
      b.decideT = 0.2
      // Target acquisition.
      let bestTarget: string | null = null
      let bestDist = Infinity
      if (player?.alive) {
        const lum = this.emissions.lumOf('player')
        const moveVis = player.crouching ? 0.25 : 0.4 + player.moveFactor * 0.6
        if (this.perceives(b, player.pos.x, player.pos.y + player.eyeHeight, player.pos.z, lum, moveVis)) {
          bestTarget = 'player'
          bestDist = b.pos.distanceTo(player.pos)
        }
      }
      // Bot-vs-bot keeps firefights alive around the player.
      for (const other of this.bots.values()) {
        if (other === b || !other.alive || !other.embodied) continue
        const d = b.pos.distanceTo(other.pos)
        if (d >= bestDist) continue
        const lum = this.emissions.lumOf(other.id)
        if (this.perceives(b, other.pos.x, other.pos.y + 1.55, other.pos.z, lum, 0.7)) {
          bestTarget = other.id
          bestDist = d
        }
      }
      if (bestTarget && b.targetId !== bestTarget) {
        b.targetId = bestTarget
        b.reactT = 0.25 + (1 - b.skill) * 0.5
      } else if (!bestTarget && b.state === 'engage') {
        b.targetId = null
      }

      // State selection.
      if (b.vitals.health < 40 && b.heals > 0 && !bestTarget) {
        b.state = 'heal'
      } else if (bestTarget) {
        b.state = 'engage'
      } else if (b.state === 'engage' || b.state === 'heal') {
        b.state = 'rotate'
        b.goal = this.pointInZone()
      } else if (!b.goal || Math.hypot(b.goal.x - b.pos.x, b.goal.z - b.pos.z) < 4) {
        // Poorly geared bots hunt loot; geared ones rotate.
        if (b.gear.power < 180 && this.rng() < 0.7) {
          const crate = this.loot.nearestCrate(b.pos.x, b.pos.z, 140)
          b.goal = crate ?? this.pointInZone()
          b.state = crate ? 'loot' : 'rotate'
        } else {
          b.goal = this.pointInZone()
          b.state = this.rng() < 0.4 ? 'wander' : 'rotate'
        }
      }
      // Arriving at loot: crack the crate open first, then take the spoils.
      if (b.state === 'loot' && b.goal && Math.hypot(b.goal.x - b.pos.x, b.goal.z - b.pos.z) < 6) {
        if (this.loot.botOpenCrateNear(b.pos.x, b.pos.z, 6, this.rng)) {
          // Wait by the crate for the contents to spill.
          b.decideT = 1.6
        } else {
          const got = this.loot.botTakeBestWeaponNear(b.pos.x, b.pos.z, 7, b.gear.power)
          if (got && got.type === 'weapon') {
            // Leave the old gun where the new one lay — loot begets loot.
            this.loot.spawnFloor({ type: 'weapon', weaponId: b.gear.defId, rarity: b.gear.rarity }, b.pos.x + 0.5, b.pos.z + 0.5, b.pos.y)
            b.gear = this.makeGear(got.weaponId, got.rarity)
          }
          b.goal = null
        }
      }
    }

    // ——— Behaviour ———
    let speed = 0
    let wishX = 0
    let wishZ = 0
    if (b.state === 'heal') {
      b.healT += dt
      if (b.healT > 3.2) {
        b.healT = 0
        b.heals--
        b.vitals.health = Math.min(100, b.vitals.health + 60)
        this.emissions.report(b.id, 'heal', 0.5)
      }
    } else if (b.state === 'engage' && b.targetId) {
      const t = b.targetId === 'player' ? player : this.bots.get(b.targetId)
      const tPos = b.targetId === 'player' ? player?.pos : (t as Bot | undefined)?.pos
      const tAlive = b.targetId === 'player' ? player?.alive : (t as Bot | undefined)?.alive
      if (!tPos || !tAlive) {
        b.targetId = null
      } else {
        const dx = tPos.x - b.pos.x
        const dz = tPos.z - b.pos.z
        const dist = Math.hypot(dx, dz)
        b.yaw = Math.atan2(-dx, -dz)
        // Strafe around the target; close in when far or timid when hurt.
        b.strafeT -= dt
        if (b.strafeT <= 0) {
          b.strafeT = 0.7 + this.rng() * 1.2
          b.strafeDir = this.rng() < 0.5 ? -1 : 1
        }
        const def = WEAPON_BY_ID.get(b.gear.defId)!
        const wantRange = def.cls === 'shotgun' || def.cls === 'smg' ? 14 : def.cls === 'sniper' ? 90 : 38
        const approach = dist > wantRange ? 1 : dist < wantRange * 0.5 ? -0.7 : 0
        wishX = (dx / dist) * approach + (-dz / dist) * b.strafeDir * 0.9
        wishZ = (dz / dist) * approach + (dx / dist) * b.strafeDir * 0.9
        speed = 4.3
        // LOS at 4 Hz.
        if (b.losT <= 0) {
          b.losT = 0.25
          const ty = (b.targetId === 'player' ? (player ? player.pos.y + player.eyeHeight : 0) : (t as Bot).pos.y + 1.55)
          b.losOk = this.col.lineOfSight(b.pos.x, b.pos.y + 1.55, b.pos.z, tPos.x, ty, tPos.z)
        }
        if (b.losOk && b.reactT <= 0) this.tryFire(b, def, tPos, dist, dt)
      }
    } else if (b.goal) {
      const dx = b.goal.x - b.pos.x
      const dz = b.goal.z - b.pos.z
      const dist = Math.hypot(dx, dz)
      if (dist > 2) {
        wishX = dx / dist
        wishZ = dz / dist
        b.yaw = Math.atan2(-wishX, -wishZ)
        const urgent = this.zone.dpsAt(b.pos.x, b.pos.z) > 0
        speed = urgent ? 6.6 : b.state === 'wander' ? 3.4 : 4.8
      }
    }

    // Movement + collisions + ground.
    if (speed > 0) {
      const px = b.pos.x
      const pz = b.pos.z
      const nx = b.pos.x + wishX * speed * dt
      const nz = b.pos.z + wishZ * speed * dt
      const solved = this.col.resolve(nx, b.pos.y, nz, 0.4, 1.8)
      b.pos.x = solved.x
      b.pos.z = solved.z
      b.pos.y = this.col.groundHeight(b.pos.x, b.pos.z, b.pos.y + 0.5, 0.4)
      // Stall detector: a goal inside a building leaves the bot grinding a
      // wall forever — give up and pick a new one.
      const moved = Math.hypot(b.pos.x - px, b.pos.z - pz)
      if (b.state !== 'engage' && moved < speed * dt * 0.3) {
        b.stallT += dt
        if (b.stallT > 1.5) {
          b.stallT = 0
          b.goal = this.pointInZone()
        }
      } else {
        b.stallT = 0
      }
      b.stepT -= dt
      if (b.stepT <= 0) {
        b.stepT = speed > 6 ? 0.3 : 0.42
        if (this.dark && speed > 6) {
          this.fx.footstep(b.pos.x, b.pos.y, b.pos.z, '#39f0e0', 2)
        }
      }
    }
    this.emissions.setMove(b.id, speed > 6 ? 0.5 : speed > 3.6 ? 0.25 : speed > 0 ? 0.12 : 0.02)

    if (b.mesh) {
      b.mesh.position.copy(b.pos)
      b.mesh.rotation.y = b.yaw
    }
  }

  private tryFire(b: Bot, def: WeaponDef, tPos: THREE.Vector3, dist: number, dt: number): void {
    if (b.fireT > 0) return
    if (b.burstLeft <= 0) {
      if (b.burstPause > 0) {
        // Real seconds — bot cadence must not scale with frame rate.
        b.burstPause -= dt * (0.6 + b.skill * 0.8)
        return
      }
      b.burstLeft = def.auto ? 3 + Math.floor(this.rng() * 4) : 1
      b.burstPause = 0.5 + (1 - b.skill) * 0.9
    }
    b.burstLeft--
    b.fireT = (60 / def.rpm) * (def.auto ? 1 : 1.4 + (1 - b.skill))

    // Aim with error. In the dark the target's own light steadies the shot.
    const isPlayer = b.targetId === 'player'
    const targetLum = this.emissions.lumOf(isPlayer ? 'player' : b.targetId!)
    const darkPenalty = this.dark ? THREE.MathUtils.lerp(2.3, 1.0, Math.min(1, targetLum)) : 1
    const errDeg = (1.6 + (1 - b.skill) * 4.2) * (1 + dist / 150) * darkPenalty
    const eye = this.tmp.set(b.pos.x, b.pos.y + 1.55, b.pos.z)
    const targetEye = this.tmp2.set(tPos.x, tPos.y + (isPlayer ? (this.player?.eyeHeight ?? 1.55) : 1.55) * 0.85, tPos.z)
    const dir = targetEye.sub(eye)
    const len = dir.length()
    dir.normalize()
    // Perturb.
    const err = THREE.MathUtils.degToRad(errDeg)
    dir.x += (this.rng() - 0.5) * err
    dir.y += (this.rng() - 0.5) * err * 0.7
    dir.z += (this.rng() - 0.5) * err
    dir.normalize()

    const sig = signatureOf(def)
    const worldDist = this.col.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, len + 30)
    let hitDist = worldDist ?? len + 30
    let hit: 'player' | string | null = null
    let headshot = false

    if (isPlayer && this.player?.alive) {
      const h = rayVsActor(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, hitDist, this.player.pos.x, this.player.pos.y, this.player.pos.z, this.player.eyeHeight)
      if (h && h.dist < hitDist) {
        hitDist = h.dist
        hit = 'player'
        headshot = h.part === 'head'
      }
    } else if (!isPlayer) {
      const other = this.bots.get(b.targetId!)
      if (other?.alive) {
        const h = rayVsActor(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, hitDist, other.pos.x, other.pos.y, other.pos.z, 1.55)
        if (h && h.dist < hitDist) {
          hitDist = h.dist
          hit = other.id
          headshot = h.part === 'head'
        }
      }
    }

    const end = new THREE.Vector3().copy(eye).addScaledVector(dir, hitDist)
    const muzzle = new THREE.Vector3(b.pos.x - Math.sin(b.yaw) * 0.5, b.pos.y + 1.35, b.pos.z - Math.cos(b.yaw) * 0.5)
    this.fx.tracer(muzzle, end, b.id.charCodeAt(3) % 2 === 0 ? '#ffc247' : '#ff9a4d', sig.tracerHang * (this.dark ? 2 : 0.4))
    this.fx.flare(muzzle, '#ffc987', 0.5 + sig.bloom * 0.5, 0.06)
    // Loudness belongs to the LISTENER's distance — sound is information.
    const listenerDist = this.player ? muzzle.distanceTo(this.player.pos) : dist
    audio.shot(def.cls, listenerDist > 55)
    this.emissions.report(b.id, 'fire', 0.7 + sig.bloom * 0.3)

    if (hit === 'player') {
      // Shotguns resolve as one ray carrying the full pellet load.
      const dmg = falloff(scaledDamage(def, b.gear.rarity) * def.pellets * (def.pellets > 1 ? 0.75 : 1), hitDist, def.near, def.far, def.falloffFloor)
      const mult = headshot ? def.headshotMult : 1
      const angle = Math.atan2(b.pos.x - tPos.x, b.pos.z - tPos.z)
      this.onPlayerDamaged?.(dmg, mult, angle, b.name)
    } else if (hit) {
      const dmg = falloff(scaledDamage(def, b.gear.rarity) * def.pellets * (def.pellets > 1 ? 0.75 : 1), hitDist, def.near, def.far, def.falloffFloor)
      this.damageBot(hit, dmg * (headshot ? def.headshotMult : 1), headshot, b.id, def.id)
    } else if (worldDist !== null && hitDist >= worldDist - 0.01) {
      this.fx.sparks(end, dir.clone().multiplyScalar(-1))
    }
  }

  // ——— The abstract tick: the other ~75 lives on the island ———

  private updateAbstract(step: number, cameraPos: THREE.Vector3): void {
    const abstracts: Bot[] = []
    for (const b of this.bots.values()) {
      if (b.alive && !b.embodied) abstracts.push(b)
    }
    for (const b of abstracts) {
      // Resolve scheduled fights.
      if (b.fight) {
        b.fight.tLeft -= step
        const other = this.bots.get(b.fight.otherId)
        if (!other?.alive || other.embodied) {
          b.fight = null
        } else if (b.fight.tLeft <= 0) {
          const myPower = b.gear.power * (0.5 + b.skill) * (0.6 + this.rng() * 0.8)
          const theirPower = other.gear.power * (0.5 + other.skill) * (0.6 + this.rng() * 0.8)
          const winner = myPower >= theirPower ? b : other
          const loser = winner === b ? other : b
          winner.vitals.health = Math.max(12, winner.vitals.health - (15 + this.rng() * 40))
          winner.fight = null
          loser.fight = null
          // Winners inherit some of the loser's kit.
          if (loser.gear.power > winner.gear.power) winner.gear = loser.gear
          this.kill(loser, winner.id, winner.gear.defId, false)
        }
        continue
      }

      // Move toward goal.
      if (!b.goal || Math.hypot(b.goal.x - b.pos.x, b.goal.z - b.pos.z) < 8) {
        b.goal = this.pointInZone()
      }
      const dx = b.goal.x - b.pos.x
      const dz = b.goal.z - b.pos.z
      const dist = Math.hypot(dx, dz)
      const speed = this.zone.dpsAt(b.pos.x, b.pos.z) > 0 ? 6.4 : 3.6
      const move = Math.min(dist, speed * step)
      b.pos.x += (dx / dist) * move
      b.pos.z += (dz / dist) * move
      b.pos.y = Math.max(0.2, heightAt(b.pos.x, b.pos.z))

      // Gear up over time, faster in richer districts.
      if (this.rng() < 0.035) {
        const roll = WEAPONS[Math.floor(this.rng() * WEAPONS.length)]
        const rarityIdx = Math.min(RARITIES.length - 1, Math.max(RARITY_RANK[roll.floorRarity], Math.floor(this.rng() * this.rng() * 6)))
        const cand = this.makeGear(roll.id, RARITIES[rarityIdx])
        if (cand.power > b.gear.power) b.gear = cand
      }
      // Slow off-screen recovery.
      if (b.vitals.health < 70 && b.heals > 0 && this.rng() < 0.06) {
        b.heals--
        b.vitals.health = Math.min(100, b.vitals.health + 60)
      }
    }

    // Pair off abstract encounters.
    for (let i = 0; i < abstracts.length; i++) {
      const a = abstracts[i]
      if (!a.alive || a.fight) continue
      for (let j = i + 1; j < abstracts.length; j++) {
        const c = abstracts[j]
        if (!c.alive || c.fight) continue
        const d = Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z)
        if (d < 42 && this.rng() < 0.25 * (a.aggression + c.aggression)) {
          const t = 2.5 + this.rng() * 4
          a.fight = { otherId: c.id, tLeft: t }
          c.fight = { otherId: a.id, tLeft: t }
          if (a.pos.distanceTo(cameraPos) < 320) audio.distantFight()
          break
        }
      }
    }
  }
}

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return h
}
