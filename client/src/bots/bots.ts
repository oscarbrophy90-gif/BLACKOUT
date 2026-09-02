import * as THREE from 'three'
import {
  ACCESSORIES, CELEBRATIONS, SUITS, WEAPON_BY_ID, WEAPONS, applyHit, dps, falloff, makeCallsign,
  scaledDamage, signatureOf, RARITY_RANK, RARITIES,
} from '@blackout/shared'
import type { ItemKind, Rarity, Rng, Vitals, WeaponDef } from '@blackout/shared'
import { EMBODY_RADIUS, ISLAND_RADIUS, MAX_EMBODIED } from '../config.ts'
import { audio } from '../core/audio.ts'
import { emit } from '../core/events.ts'
import type { CollisionWorld } from '../world/collision.ts'
import { rayVsActor } from '../world/collision.ts'
import type { Fx } from '../world/fx.ts'
import { heightAt, DISTRICTS } from '../world/terrain.ts'
import { allBuildings, buildingAt, nearestDoor } from '../world/buildings.ts'
import type { Building } from '../world/buildings.ts'
import { Emissions } from '../game/blackout.ts'
import type { LootSystem } from '../game/loot.ts'
import type { ZoneController } from '../game/zone.ts'
import type { HitTarget, TargetField } from '../weapons/weapons.ts'

// The other 99 contracts. Every one of them drops in EMPTY-HANDED, exactly
// like the player, and runs the same loop: land → search buildings and
// crates → find a weapon → gear up → fight → rotate → survive. Nearby bots
// are embodied (full perception, real doors, real pickups); distant bots
// run an abstract 2 Hz tick that models the same loop statistically.
//
// SENSORY CONTRACT (design bible rule 4): during a Blackout a bot's target
// acquisition reads exactly one number about you — your emitted-light
// scalar — plus noise events. No bot ever sees through the dark for free.

export type BotState = 'loot' | 'search' | 'rotate' | 'engage' | 'heal' | 'wander' | 'flee'

interface Gear {
  defId: string
  rarity: Rarity
  power: number
}

interface Waypoint {
  x: number
  z: number
  /** What the bot does on arrival. */
  kind: 'door' | 'loot' | 'room' | 'point'
}

export interface Bot {
  id: string
  name: string
  pos: THREE.Vector3
  yaw: number
  vitals: Vitals
  /** null until the bot finds a gun — the Linewalker loop starts empty. */
  gear: Gear | null
  heals: number
  skill: number
  aggression: number
  state: BotState
  embodied: boolean
  mesh: THREE.Group | null
  path: Waypoint[]
  goalBuilding: number | null
  visited: Set<number>
  /** Loot/crate ids this bot could not reach (stall blacklist) and what it walks to now. */
  failedLoot: Set<number>
  failedCrates: Set<number>
  goalLootId: number | null
  goalCrateId: number | null
  /** Rooms searched in the current building. */
  seenRooms: number
  /** Seconds without a target while engaged — hysteresis before giving up the chase. */
  lostT: number
  targetId: string | null
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
  fleeT: number
  meleeT: number
  fight: { otherId: string; tLeft: number } | null
  alive: boolean
  /** Cosmetics for the podium: every rival has a look and a celebration. */
  suitIndex: number
  celebrationId: string
  accessoryId: string | null
  /** Decision flag: the loot loop re-plans on the next tick. */
  chooseNext?: boolean
}

export interface PlayerRef {
  pos: THREE.Vector3
  eyeHeight: number
  alive: boolean
  moveFactor: number
  crouching: boolean
}

const MELEE_DMG = 32
const SUPPLY_THRESHOLD = 2

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
  private matchTime = 0
  dark = false
  player: PlayerRef | null = null
  /** Every eliminated bot in the order they went down (podium + summary). */
  readonly deathOrder: Bot[] = []
  onPlayerDamaged: ((amount: number, headshotMult: number, sourceAngle: number, attackerName: string) => void) | null = null

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
      const commonAcc = ACCESSORIES.filter((a) => a.rarity === 'common' || a.rarity === 'uncommon')
      const bot: Bot = {
        id: `bot${i}`,
        name,
        pos: new THREE.Vector3(x, Math.max(0.2, heightAt(x, z)), z),
        yaw: this.rng() * Math.PI * 2,
        vitals: { health: 100, armor: 0 },
        gear: null,
        heals: 0,
        skill: 0.3 + this.rng() * 0.62,
        aggression: 0.35 + this.rng() * 0.6,
        state: 'loot',
        embodied: false,
        mesh: null,
        path: [],
        goalBuilding: null,
        visited: new Set(),
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
        fleeT: 0,
        meleeT: 0,
        failedLoot: new Set(),
        failedCrates: new Set(),
        goalLootId: null,
        goalCrateId: null,
        seenRooms: 0,
        lostT: 0,
        fight: null,
        alive: true,
        suitIndex: Math.floor(this.rng() * SUITS.length),
        celebrationId: CELEBRATIONS.length ? CELEBRATIONS[Math.floor(this.rng() * CELEBRATIONS.length)].id : 'WC_001',
        accessoryId: commonAcc.length && this.rng() < 0.6 ? commonAcc[Math.floor(this.rng() * commonAcc.length)].id : null,
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

  /** How many have found a gun — the HUD/summary can show the loot race. */
  armedCount(): number {
    let n = 0
    for (const b of this.bots.values()) if (b.alive && b.gear) n++
    return n
  }

  // ——— TargetField (what the player's gun can hit) ———

  shootable(): HitTarget[] {
    const out: HitTarget[] = []
    for (const b of this.bots.values()) {
      if (b.alive && b.embodied) out.push({ id: b.id, x: b.pos.x, y: b.pos.y, z: b.pos.z, eyeHeight: 1.62 })
    }
    return out
  }

  damage(id: string, amount: number, headshot: boolean, weaponDefId: string | null): { killed: boolean } {
    return this.damageBot(id, amount, headshot, 'player', weaponDefId)
  }

  damageBot(id: string, amount: number, headshot: boolean, attackerId: string, weaponDefId: string | null): { killed: boolean } {
    const b = this.bots.get(id)
    if (!b || !b.alive) return { killed: false }
    const res = applyHit(b.vitals, amount, 1)
    b.vitals = res.vitals
    this.emissions.report(id, 'hurt', 0.6)
    if (b.embodied) {
      this.fx.flare(this.tmp.copy(b.pos).add(this.tmp2.set(0, 1.1, 0)), '#ff2d55', 0.6, 0.25)
      if (b.reactT <= 0) {
        b.targetId = attackerId === 'player' ? 'player' : attackerId
        b.reactT = 0.2 + (1 - b.skill) * 0.4
        // Unarmed and under fire: run for it. Armed: fight back.
        b.state = b.gear ? 'engage' : 'flee'
        b.fleeT = 5
      }
    }
    if (res.killed) this.kill(b, attackerId, weaponDefId, headshot)
    return { killed: res.killed }
  }

  private kill(b: Bot, attackerId: string, weaponDefId: string | null, headshot: boolean): void {
    b.alive = false
    b.fight = null
    this.deathOrder.push(b)
    this.emissions.remove(b.id)
    if (b.mesh) {
      this.fx.ring(b.pos.x, b.pos.y, b.pos.z, '#ff2d55', 3, 0.6)
      this.scene.remove(b.mesh)
      b.mesh = null
    }
    // Embodied deaths pay out: the dead drop whatever they had looted.
    if (b.embodied) {
      const inside = buildingAt(b.pos.x, b.pos.z)
      const bid = inside?.id ?? null
      if (b.gear) {
        this.loot.spawnFloor({ type: 'weapon', weaponId: b.gear.defId, rarity: b.gear.rarity }, b.pos.x, b.pos.z, b.pos.y, bid)
        const def = WEAPON_BY_ID.get(b.gear.defId)!
        this.loot.spawnFloor({ type: 'ammo', ammo: def.ammo, amount: 30 }, b.pos.x + 0.7, b.pos.z + 0.4, b.pos.y, bid)
      }
      if (b.heals > 0) this.loot.spawnFloor({ type: 'heal', healId: 'trickle', amount: b.heals }, b.pos.x - 0.6, b.pos.z + 0.5, b.pos.y, bid)
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

  /** QA hook: take a bot off the grid immediately (counts as a Deadgrid death). */
  debugKill(id: string): void {
    const b = this.bots.get(id)
    if (b?.alive) this.kill(b, 'deadgrid', null, false)
  }

  applyZoneDamage(): void {
    for (const b of this.bots.values()) {
      if (!b.alive) continue
      const dps_ = this.zone.dpsAt(b.pos.x, b.pos.z)
      if (dps_ <= 0) continue
      b.vitals.health -= dps_
      if (b.vitals.health <= 0) {
        this.kill(b, 'deadgrid', null, false)
        continue
      }
      if (!(b.embodied || this.rng() < 0.6)) continue
      // Already heading somewhere safe: keep the plan (and its exit doors).
      const last = b.path.length ? b.path[b.path.length - 1] : null
      if (last && this.zone.dpsAt(last.x, last.z) === 0) continue
      const p = this.pointInZone()
      if (b.embodied) this.pathTo(b, p.x, p.z, null, 'point')
      else {
        b.path = [{ ...p, kind: 'point' }]
        b.goalBuilding = null
      }
      if (b.state !== 'engage') b.state = 'rotate'
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
    const clear = this.col.findClearGround(x, z, 30)
    return clear
  }

  update(dt: number, time: number, cameraPos: THREE.Vector3): void {
    this.matchTime = time
    this.embodyT -= dt
    if (this.embodyT <= 0) {
      this.embodyT = 0.5
      this.manageEmbodiment(cameraPos)
    }
    for (const b of this.bots.values()) {
      if (!b.alive) continue
      if (b.embodied) this.updateEmbodied(b, dt)
    }
    this.abstractT -= dt
    if (this.abstractT <= 0) {
      this.abstractT = 0.55
      this.updateAbstract(0.55, cameraPos)
    }
  }

  private manageEmbodiment(cameraPos: THREE.Vector3): void {
    const alive = this.aliveBots()
    const endgame = alive.length + (this.player?.alive ? 1 : 0) <= 12
    const enter2 = EMBODY_RADIUS * EMBODY_RADIUS
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
    const terrain = heightAt(b.pos.x, b.pos.z)
    const surface = this.col.groundHeight(b.pos.x, b.pos.z, 400, 0.4)
    const inside = buildingAt(b.pos.x, b.pos.z)
    if (inside) {
      // Materialise on the building's floor slab, never its roof.
      b.pos.y = inside.baseY
    } else if (surface - terrain > 0.5) {
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
    this.refreshGunMesh(b)
  }

  private disembody(b: Bot): void {
    b.embodied = false
    if (b.mesh) this.scene.remove(b.mesh)
    b.targetId = null
  }

  private buildMesh(b: Bot): THREE.Group {
    const suit = SUITS[b.suitIndex]
    const g = new THREE.Group()
    const bodyMat = new THREE.MeshLambertMaterial({ color: suit.colors[0] })
    const trimMat = new THREE.MeshLambertMaterial({ color: suit.colors[1] })
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.85, 3, 8), bodyMat)
    body.position.y = 0.95
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 7), trimMat)
    head.position.y = 1.62
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.1), new THREE.MeshLambertMaterial({ color: suit.colors[2] }))
    visor.position.set(0, 1.64, -0.16)
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.55), new THREE.MeshLambertMaterial({ color: '#22242a' }))
    gun.name = 'gun'
    gun.position.set(0.28, 1.25, -0.3)
    gun.visible = false
    g.add(body, head, visor, gun)
    return g
  }

  /** The held gun only shows once the bot has actually found one. */
  private refreshGunMesh(b: Bot): void {
    const gun = b.mesh?.getObjectByName('gun')
    if (gun) gun.visible = b.gear !== null
  }

  private perceives(b: Bot, tx: number, ty: number, tz: number, lum: number, moveVisibility: number): boolean {
    const dx = tx - b.pos.x
    const dy = ty - b.pos.y
    const dz = tz - b.pos.z
    const dist = Math.hypot(dx, dy, dz)
    if (this.dark) return dist <= Emissions.darkDetectRange(lum)
    const range = 165 * (0.55 + 0.45 * moveVisibility) + 40
    if (dist > range) return false
    const facingX = -Math.sin(b.yaw)
    const facingZ = -Math.cos(b.yaw)
    const dot = (dx * facingX + dz * facingZ) / Math.max(0.01, dist)
    if (dot < Math.cos(THREE.MathUtils.degToRad(70)) && dist > 12) return false
    return this.col.lineOfSight(b.pos.x, b.pos.y + 1.55, b.pos.z, tx, ty, tz)
  }

  /** Build a door-aware path to a point, possibly inside a building. */
  private pathTo(b: Bot, x: number, z: number, buildingId: number | null, kind: Waypoint['kind']): void {
    const path: Waypoint[] = []
    const here = buildingAt(b.pos.x, b.pos.z)
    const target = buildingId !== null ? allBuildings().find((bl) => bl.id === buildingId) ?? null : null
    // Leaving a building first: head for its nearest door, then outside it.
    if (here && (!target || target.id !== here.id) && here.doors.length) {
      const d = nearestDoor(here, b.pos.x, b.pos.z)
      path.push({ x: d.x, z: d.z, kind: 'door' }, { x: d.x + d.nx * 2.2, z: d.z + d.nz * 2.2, kind: 'door' })
    }
    // Entering: outside the door, then through it.
    if (target && (!here || here.id !== target.id) && target.doors.length) {
      const d = nearestDoor(target, b.pos.x, b.pos.z)
      path.push({ x: d.x + d.nx * 2.2, z: d.z + d.nz * 2.2, kind: 'door' }, { x: d.x - d.nx * 1.4, z: d.z - d.nz * 1.4, kind: 'door' })
    }
    path.push({ x, z, kind })
    b.path = path
    b.goalBuilding = buildingId
  }

  /** Pick the next thing to do when the hands are free. */
  private chooseLootGoal(b: Bot): void {
    const minPower = b.gear ? b.gear.power : 0
    b.goalLootId = null
    b.goalCrateId = null
    // A visible upgrade nearby beats everything — on this floor, and never
    // one we already failed to reach.
    const wp = this.loot.nearestWeaponPoint(b.pos.x, b.pos.y, b.pos.z, b.gear ? 60 : 140, minPower, b.failedLoot)
    const crate = this.loot.nearestCrate(b.pos.x, b.pos.y, b.pos.z, b.gear ? 70 : 120, b.failedCrates)
    const pickCrate = crate && (!wp || (this.rng() < 0.45 && Math.hypot(crate.x - b.pos.x, crate.z - b.pos.z) < Math.hypot(wp.x - b.pos.x, wp.z - b.pos.z) * 1.3))
    if (pickCrate && crate) {
      this.pathTo(b, crate.x, crate.z, crate.buildingId, 'loot')
      b.goalCrateId = crate.id
      b.state = 'loot'
      return
    }
    if (wp) {
      this.pathTo(b, wp.x, wp.z, wp.buildingId, 'loot')
      b.goalLootId = wp.id
      b.state = 'loot'
      return
    }
    // Otherwise search the nearest unvisited building room by room.
    let best: Building | null = null
    let bestD = 160
    for (const bl of allBuildings()) {
      if (b.visited.has(bl.id) || bl.rooms.length === 0) continue
      const cx = (bl.minX + bl.maxX) / 2
      const cz = (bl.minZ + bl.maxZ) / 2
      const d = Math.hypot(cx - b.pos.x, cz - b.pos.z)
      if (d < bestD && this.zone.dpsAt(cx, cz) === 0) {
        best = bl
        bestD = d
      }
    }
    if (best) {
      const room = best.rooms.find((r) => r.floor === 0) ?? best.rooms[0]
      this.pathTo(b, room.x, room.z, best.id, 'room')
      b.state = 'search'
      return
    }
    const p = this.pointInZone()
    this.pathTo(b, p.x, p.z, null, 'point')
    b.state = this.rng() < 0.4 ? 'wander' : 'rotate'
  }

  /** On arrival at a loot/room waypoint: take what is useful here. */
  private lootHere(b: Bot): void {
    b.goalLootId = null
    b.goalCrateId = null
    if (this.loot.botOpenCrateNear(b.pos.x, b.pos.y, b.pos.z, 4, this.rng)) {
      b.decideT = 1.6 // wait for the lid
      return
    }
    const got = this.loot.botTakeBestWeaponNear(b.pos.x, b.pos.y, b.pos.z, 5, b.gear ? b.gear.power : 0)
    if (got && got.type === 'weapon') {
      if (b.gear) {
        this.loot.spawnFloor({ type: 'weapon', weaponId: b.gear.defId, rarity: b.gear.rarity }, b.pos.x + 0.5, b.pos.z + 0.5, b.pos.y, buildingAt(b.pos.x, b.pos.z)?.id ?? null)
      }
      b.gear = this.makeGear(got.weaponId, got.rarity)
      this.refreshGunMesh(b)
      audio.pickup()
    }
    const supplies = this.loot.botTakeSuppliesNear(b.pos.x, b.pos.y, b.pos.z, 5, b.vitals.armor < 50)
    for (const s of supplies) this.applySupply(b, s)
  }

  private applySupply(b: Bot, s: ItemKind): void {
    if (s.type === 'heal') b.heals = Math.min(6, b.heals + s.amount)
    else if (s.type === 'armor') b.vitals.armor = Math.max(b.vitals.armor, s.armorId === 'vest_faraday' ? 100 : s.armorId === 'vest_insul' ? 75 : 50)
  }

  private updateEmbodied(b: Bot, dt: number): void {
    b.reactT = Math.max(0, b.reactT - dt)
    b.fireT = Math.max(0, b.fireT - dt)
    b.meleeT = Math.max(0, b.meleeT - dt)
    b.decideT -= dt
    b.losT -= dt
    if (b.fleeT > 0) b.fleeT -= dt

    const player = this.player
    // ——— Decisions at 5 Hz ———
    if (b.decideT <= 0) {
      b.decideT = 0.2
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
      } else if (!bestTarget && (b.state === 'engage' || b.state === 'flee')) {
        b.targetId = null
      }

      // Class behaviour: a pistol is not a reason to start a fight at range;
      // a shotgun wants to close; a sniper wants to hold.
      const def = b.gear ? WEAPON_BY_ID.get(b.gear.defId)! : null
      const engageRange = !def ? 3 : def.cls === 'pistol' ? 34 : def.cls === 'shotgun' ? 26 : def.cls === 'smg' ? 45 : def.cls === 'sniper' ? 220 : def.cls === 'dmr' ? 150 : 110
      const wantsFight = bestTarget !== null && (bestDist <= engageRange || b.state === 'engage')

      if (bestTarget) b.lostT = 0
      if (b.vitals.health < 40 && b.heals > 0 && !bestTarget) {
        b.state = 'heal'
      } else if (bestTarget && !b.gear && bestDist > 3.5) {
        // Unarmed and spotted someone: get out of the open, keep looting.
        if (b.state !== 'flee') {
          b.state = 'flee'
          b.fleeT = 4
        }
      } else if (wantsFight) {
        b.state = 'engage'
      } else if (b.state === 'heal') {
        // Patched up (or out of supplies): back to the loop.
        b.state = 'rotate'
        b.chooseNext = true
      } else if (b.state === 'engage') {
        // Target gone: give it a moment to reappear, then get back to work.
        b.lostT += 0.2
        if (b.lostT > 1.2) {
          b.lostT = 0
          b.state = 'rotate'
          b.targetId = null
          b.chooseNext = true
        }
      } else if (b.state === 'flee' && b.fleeT <= 0) {
        b.state = 'rotate'
        b.targetId = null
        b.chooseNext = true
      }

      // Path progression / arrival.
      if (b.state !== 'engage' && b.state !== 'heal' && b.state !== 'flee') {
        if (b.path.length === 0 || b.chooseNext) {
          b.chooseNext = false
          const needsGear = !b.gear || (this.matchTime < 240 && b.gear.power < 150) || b.heals < SUPPLY_THRESHOLD
          if (needsGear || this.rng() < 0.35) this.chooseLootGoal(b)
          else {
            const p = this.pointInZone()
            this.pathTo(b, p.x, p.z, null, 'point')
            b.state = this.rng() < 0.4 ? 'wander' : 'rotate'
          }
        } else {
          const wp = b.path[0]
          const d = Math.hypot(wp.x - b.pos.x, wp.z - b.pos.z)
          if (d < (wp.kind === 'door' ? 1.3 : 2.4)) {
            b.path.shift()
            if (wp.kind === 'loot' || wp.kind === 'room') {
              this.lootHere(b)
              if (wp.kind === 'room' && b.goalBuilding !== null) {
                // Next room in this building, else mark it searched.
                const bl = allBuildings().find((x) => x.id === b.goalBuilding)
                const done = b.visited
                if (bl) {
                  const nextRoom = bl.rooms.find((r) => r.floor === 0 && Math.hypot(r.x - wp.x, r.z - wp.z) > 2 && !b.path.some((p) => Math.hypot(p.x - r.x, p.z - r.z) < 1))
                  if (nextRoom && b.seenRooms < 3) {
                    b.seenRooms++
                    b.path.push({ x: nextRoom.x, z: nextRoom.z, kind: 'room' })
                  } else {
                    done.add(bl.id)
                    b.seenRooms = 0
                  }
                }
              }
            }
          }
        }
      }
    }

    // ——— Behaviour ———
    let speed = 0
    let wishX = 0
    let wishZ = 0
    if (b.state === 'heal') {
      if (b.heals <= 0 || b.vitals.health >= 100) {
        b.state = 'rotate'
        b.chooseNext = true
      } else {
        b.healT += dt
        if (b.healT > 3.2) {
          b.healT = 0
          b.heals--
          b.vitals.health = Math.min(100, b.vitals.health + 60)
          this.emissions.report(b.id, 'heal', 0.5)
        }
      }
    } else if (b.state === 'flee' && b.targetId) {
      const t = b.targetId === 'player' ? player?.pos : this.bots.get(b.targetId)?.pos
      if (t) {
        const dx = b.pos.x - t.x
        const dz = b.pos.z - t.z
        const dist = Math.hypot(dx, dz) || 1
        wishX = dx / dist
        wishZ = dz / dist
        b.yaw = Math.atan2(-wishX, -wishZ)
        speed = 6.8
      }
    } else if (b.state === 'engage' && b.targetId) {
      const t = b.targetId === 'player' ? player : this.bots.get(b.targetId)
      const tPos = b.targetId === 'player' ? player?.pos : (t as Bot | undefined)?.pos
      const tAlive = b.targetId === 'player' ? player?.alive : (t as Bot | undefined)?.alive
      if (!tPos || !tAlive) {
        b.targetId = null
        b.state = 'rotate'
        b.chooseNext = true
      } else {
        const dx = tPos.x - b.pos.x
        const dz = tPos.z - b.pos.z
        const dist = Math.hypot(dx, dz)
        b.yaw = Math.atan2(-dx, -dz)
        b.strafeT -= dt
        if (b.strafeT <= 0) {
          b.strafeT = 0.7 + this.rng() * 1.2
          b.strafeDir = this.rng() < 0.5 ? -1 : 1
        }
        const def = b.gear ? WEAPON_BY_ID.get(b.gear.defId)! : null
        if (!def) {
          // Bare hands: rush and swing.
          wishX = dx / dist
          wishZ = dz / dist
          speed = 6.4
          if (dist < 2.4 && b.meleeT <= 0) {
            b.meleeT = 1.1
            this.meleeHit(b, tPos)
          }
        } else {
          const cls = def.cls
          const wantRange = cls === 'shotgun' ? 8 : cls === 'smg' ? 14 : cls === 'sniper' ? 90 : cls === 'dmr' ? 50 : cls === 'pistol' ? 18 : 34
          const rush = cls === 'shotgun' || cls === 'smg'
          const approach = dist > wantRange ? (rush ? 1.3 : 1) : dist < wantRange * 0.5 ? -0.7 : 0
          const strafe = cls === 'sniper' ? 0.25 : 0.9
          wishX = (dx / dist) * approach + (-dz / dist) * b.strafeDir * strafe
          wishZ = (dz / dist) * approach + (dx / dist) * b.strafeDir * strafe
          speed = cls === 'sniper' && Math.abs(approach) < 0.1 ? 1.2 : rush ? 5.2 : 4.3
          if (b.losT <= 0) {
            b.losT = 0.25
            const ty = b.targetId === 'player' ? (player ? player.pos.y + player.eyeHeight : 0) : (t as Bot).pos.y + 1.55
            b.losOk = this.col.lineOfSight(b.pos.x, b.pos.y + 1.55, b.pos.z, tPos.x, ty, tPos.z)
          }
          if (b.losOk && b.reactT <= 0) this.tryFire(b, def, tPos, dist, dt)
        }
      }
    } else if (b.path.length > 0) {
      const wp = b.path[0]
      const dx = wp.x - b.pos.x
      const dz = wp.z - b.pos.z
      const dist = Math.hypot(dx, dz)
      if (dist > 0.6) {
        wishX = dx / dist
        wishZ = dz / dist
        b.yaw = Math.atan2(-wishX, -wishZ)
        const urgent = this.zone.dpsAt(b.pos.x, b.pos.z) > 0
        const indoors = buildingAt(b.pos.x, b.pos.z) !== null
        speed = urgent ? 6.6 : indoors ? 3.2 : b.state === 'wander' ? 3.4 : !b.gear ? 5.6 : 4.8
      }
    }

    if (speed > 0) {
      const px = b.pos.x
      const pz = b.pos.z
      const nx = b.pos.x + wishX * speed * dt
      const nz = b.pos.z + wishZ * speed * dt
      const solved = this.col.resolve(nx, b.pos.y, nz, 0.4, 1.8)
      b.pos.x = solved.x
      b.pos.z = solved.z
      b.pos.y = this.col.groundHeight(b.pos.x, b.pos.z, b.pos.y + 0.5, 0.4, b.pos.y + 0.1)
      const moved = Math.hypot(b.pos.x - px, b.pos.z - pz)
      if (b.state !== 'engage' && moved < speed * dt * 0.3) {
        b.stallT += dt
        if (b.stallT > 1.5) {
          b.stallT = 0
          // Stuck on a wall: blacklist what we were walking to, then re-plan.
          if (b.goalLootId !== null) b.failedLoot.add(b.goalLootId)
          if (b.goalCrateId !== null) b.failedCrates.add(b.goalCrateId)
          if (b.goalBuilding !== null) b.visited.add(b.goalBuilding)
          b.goalLootId = null
          b.goalCrateId = null
          b.path = []
          b.goalBuilding = null
          if (b.state !== 'flee') b.state = 'rotate'
          b.chooseNext = true
        }
      } else {
        b.stallT = 0
      }
      b.stepT -= dt
      if (b.stepT <= 0) {
        b.stepT = speed > 6 ? 0.3 : 0.42
        if (this.dark && speed > 6) this.fx.footstep(b.pos.x, b.pos.y, b.pos.z, '#39f0e0', 2)
      }
    }
    this.emissions.setMove(b.id, speed > 6 ? 0.5 : speed > 3.6 ? 0.25 : speed > 0 ? 0.12 : 0.02)

    if (b.mesh) {
      b.mesh.position.copy(b.pos)
      b.mesh.rotation.y = b.yaw
    }
  }

  private meleeHit(b: Bot, tPos: THREE.Vector3): void {
    audio.melee(true)
    this.emissions.report(b.id, 'fire', 0.25)
    if (b.targetId === 'player') {
      const angle = Math.atan2(b.pos.x - tPos.x, b.pos.z - tPos.z)
      this.onPlayerDamaged?.(MELEE_DMG, 1, angle, b.name)
    } else if (b.targetId) {
      this.damageBot(b.targetId, MELEE_DMG, false, b.id, null)
    }
  }

  private tryFire(b: Bot, def: WeaponDef, tPos: THREE.Vector3, dist: number, dt: number): void {
    if (b.fireT > 0) return
    if (b.burstLeft <= 0) {
      if (b.burstPause > 0) {
        b.burstPause -= dt * (0.6 + b.skill * 0.8)
        return
      }
      b.burstLeft = def.auto ? 3 + Math.floor(this.rng() * 4) : 1
      b.burstPause = 0.5 + (1 - b.skill) * 0.9
    }
    b.burstLeft--
    b.fireT = (60 / def.rpm) * (def.auto ? 1 : 1.4 + (1 - b.skill))

    const isPlayer = b.targetId === 'player'
    const targetLum = this.emissions.lumOf(isPlayer ? 'player' : b.targetId!)
    const darkPenalty = this.dark ? THREE.MathUtils.lerp(2.3, 1.0, Math.min(1, targetLum)) : 1
    // Snipers and marksmen settle their aim when holding still.
    const steady = (def.cls === 'sniper' || def.cls === 'dmr') ? 0.6 : 1
    const errDeg = (1.6 + (1 - b.skill) * 4.2) * (1 + dist / 150) * darkPenalty * steady
    const eye = this.tmp.set(b.pos.x, b.pos.y + 1.55, b.pos.z)
    const targetEye = this.tmp2.set(tPos.x, tPos.y + (isPlayer ? (this.player?.eyeHeight ?? 1.55) : 1.55) * 0.85, tPos.z)
    const dir = targetEye.sub(eye)
    const len = dir.length()
    dir.normalize()
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
    const listenerDist = this.player ? muzzle.distanceTo(this.player.pos) : dist
    audio.shot(def.cls, listenerDist > 55)
    this.emissions.report(b.id, 'fire', 0.7 + sig.bloom * 0.3)

    const rarity = b.gear?.rarity ?? 'common'
    if (hit === 'player') {
      const dmg = falloff(scaledDamage(def, rarity) * def.pellets * (def.pellets > 1 ? 0.75 : 1), hitDist, def.near, def.far, def.falloffFloor)
      const mult = headshot ? def.headshotMult : 1
      const angle = Math.atan2(b.pos.x - tPos.x, b.pos.z - tPos.z)
      this.onPlayerDamaged?.(dmg, mult, angle, b.name)
    } else if (hit) {
      const dmg = falloff(scaledDamage(def, rarity) * def.pellets * (def.pellets > 1 ? 0.75 : 1), hitDist, def.near, def.far, def.falloffFloor)
      this.damageBot(hit, dmg * (headshot ? def.headshotMult : 1), headshot, b.id, def.id)
    } else if (worldDist !== null && hitDist >= worldDist - 0.01) {
      this.fx.sparks(end, dir.clone().multiplyScalar(-1))
    }
  }

  // ——— The abstract tick: the other ~75 lives on the island ———

  private updateAbstract(step: number, cameraPos: THREE.Vector3): void {
    const abstracts: Bot[] = []
    for (const b of this.bots.values()) if (b.alive && !b.embodied) abstracts.push(b)
    for (const b of abstracts) {
      if (b.fight) {
        b.fight.tLeft -= step
        const other = this.bots.get(b.fight.otherId)
        if (!other?.alive || other.embodied) b.fight = null
        else if (b.fight.tLeft <= 0) {
          const myPower = (b.gear?.power ?? 12) * (0.5 + b.skill) * (0.6 + this.rng() * 0.8)
          const theirPower = (other.gear?.power ?? 12) * (0.5 + other.skill) * (0.6 + this.rng() * 0.8)
          const winner = myPower >= theirPower ? b : other
          const loser = winner === b ? other : b
          winner.vitals.health = Math.max(12, winner.vitals.health - (15 + this.rng() * 40))
          winner.fight = null
          loser.fight = null
          if (loser.gear && (!winner.gear || loser.gear.power > winner.gear.power)) winner.gear = loser.gear
          this.kill(loser, winner.id, winner.gear?.defId ?? null, false)
        }
        continue
      }

      // Move toward the current goal (loot early, zone later).
      if (b.path.length === 0) {
        const wantLoot = !b.gear || this.matchTime < 200
        if (wantLoot) {
          // Abstractly "search" the nearest building.
          let best: Building | null = null
          let bestD = 180
          for (const bl of allBuildings()) {
            if (b.visited.has(bl.id)) continue
            const cx = (bl.minX + bl.maxX) / 2
            const cz = (bl.minZ + bl.maxZ) / 2
            const d = Math.hypot(cx - b.pos.x, cz - b.pos.z)
            if (d < bestD) {
              best = bl
              bestD = d
            }
          }
          if (best) {
            b.path = [{ x: (best.minX + best.maxX) / 2, z: (best.minZ + best.maxZ) / 2, kind: 'room' }]
            b.goalBuilding = best.id
          } else b.path = [{ ...this.pointInZone(), kind: 'point' }]
        } else b.path = [{ ...this.pointInZone(), kind: 'point' }]
      }
      const wp = b.path[0]
      const dx = wp.x - b.pos.x
      const dz = wp.z - b.pos.z
      const dist = Math.hypot(dx, dz)
      const speed = this.zone.dpsAt(b.pos.x, b.pos.z) > 0 ? 6.4 : 3.6
      const move = Math.min(dist, speed * step)
      if (dist > 0.01) {
        b.pos.x += (dx / dist) * move
        b.pos.z += (dz / dist) * move
      }
      b.pos.y = Math.max(0.2, heightAt(b.pos.x, b.pos.z))
      if (dist < 3) {
        // Arrived: a building search abstractly yields loot.
        if (wp.kind === 'room' && b.goalBuilding !== null) {
          b.visited.add(b.goalBuilding)
          this.abstractLoot(b, 0.55)
        }
        b.path.shift()
        b.goalBuilding = null
      }
      // Ground loot along the way.
      if (this.rng() < 0.02) this.abstractLoot(b, 0.3)
      if (b.vitals.health < 70 && b.heals > 0 && this.rng() < 0.06) {
        b.heals--
        b.vitals.health = Math.min(100, b.vitals.health + 60)
      }
    }

    // Pair off abstract encounters — unarmed bots avoid each other.
    for (let i = 0; i < abstracts.length; i++) {
      const a = abstracts[i]
      if (!a.alive || a.fight) continue
      for (let j = i + 1; j < abstracts.length; j++) {
        const c = abstracts[j]
        if (!c.alive || c.fight) continue
        if (!a.gear && !c.gear) continue
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

  /** The statistical version of "searched a room": maybe a gun, supplies. */
  private abstractLoot(b: Bot, chance: number): void {
    if (this.rng() < chance) {
      const roll = WEAPONS[Math.floor(this.rng() * WEAPONS.length)]
      const rarityIdx = Math.min(RARITIES.length - 1, Math.max(RARITY_RANK[roll.floorRarity], Math.floor(this.rng() * this.rng() * 6)))
      const cand = this.makeGear(roll.id, RARITIES[rarityIdx])
      if (!b.gear || cand.power > b.gear.power) b.gear = cand
    }
    if (this.rng() < chance * 0.8) b.heals = Math.min(6, b.heals + 1)
    if (this.rng() < chance * 0.5) b.vitals.armor = Math.max(b.vitals.armor, 50)
  }
}
