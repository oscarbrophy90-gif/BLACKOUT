import * as THREE from 'three'
import {
  RARITY_RANK, SUITS, WEAPON_BY_ID, ZONE_PHASES, deriveSeed, emptyMetrics, makeRng,
} from '@blackout/shared'
import type { MatchMetrics, MatchOutcome, Rng } from '@blackout/shared'
import { GRACE_BEFORE_ZONE, HEARTBEAT_RANGE, MATCH_PLAYERS } from '../config.ts'
import { audio } from '../core/audio.ts'
import type { Engine } from '../core/engine.ts'
import { clearAllHandlers, emit, on } from '../core/events.ts'
import type { Input } from '../core/input.ts'
import type { Profile } from '../meta/data.ts'
import { BotManager } from '../bots/bots.ts'
import type { Bot } from '../bots/bots.ts'
import { FPSController } from '../player/controller.ts'
import { LocalPlayer } from '../player/player.ts'
import { EmoteController } from '../player/emotes.ts'
import { EmoteWheel } from '../ui/emotewheel.ts'
import { Viewmodel } from '../weapons/viewmodel.ts'
import { WeaponSystem } from '../weapons/weapons.ts'
import { CollisionWorld } from '../world/collision.ts'
import { buildTerrain, heightAt } from '../world/terrain.ts'
import { buildWorld } from '../world/builder.ts'
import type { WorldData } from '../world/builder.ts'
import { Fx } from '../world/fx.ts'
import { Sky } from '../world/sky.ts'
import { BlackoutCycle, Emissions } from './blackout.ts'
import { LootSystem, itemLabel } from './loot.ts'
import { ZoneController } from './zone.ts'

// MatchManager: one instance per contract. Owns every per-match system and
// the phase flow: drop → live → spectate → ended.

/** Who stood where when the grid went quiet — drives the podium. */
export interface FinisherInfo {
  name: string
  isPlayer: boolean
  suitId: string
  celebrationId: string
  accessoryIds: string[]
}

export interface MatchResult {
  outcome: MatchOutcome
  metrics: MatchMetrics
  weaponKills: Record<string, number>
  winnerName: string
  killedBy: string | null
  won: boolean
  /** Top three, index 0 = 1st place. Empty when the contract was abandoned. */
  podium: FinisherInfo[]
  /** Everything the player picked up: distinct weapons (name + rarity) and a count of supplies. */
  collected: { weapons: { name: string; rarity: string }[]; items: number }
}

export interface HudState {
  health: number
  armor: number
  weaponName: string
  mag: number | null
  reserve: number | null
  reloading: number
  spreadDeg: number
  ads: boolean
  alive: number
  kills: number
  dark: boolean
  warn: boolean
  blackoutClock: string
  zoneSeconds: number
  zoneShrinking: boolean
  interact: { label: string; color: string } | null
  channel: { label: string; frac: number } | null
  heals: { id: string; count: number }[]
  slots: { name: string; rarityColor: string; active: boolean }[]
  yaw: number
  playerX: number
  playerZ: number
  phaseIdx: number
  spectating: string | null
  matchTime: number
  /** Seconds left before another emote may start (0 = ready). */
  emoteCooldown: number
  /** Filled wheel slots. */
  emoteSlots: number
  emoteWheel: boolean
}

export class Match {
  readonly phaseState = { phase: 'drop' as 'drop' | 'live' | 'spectate' | 'ended' }
  private engine: Engine
  private input: Input
  private profile: Profile
  private rng: Rng
  private col = new CollisionWorld()
  private world: WorldData
  private sky: Sky
  private fx: Fx
  private emissions = new Emissions()
  private cycle = new BlackoutCycle()
  private zone: ZoneController
  private loot: LootSystem
  private bots: BotManager
  private player = new LocalPlayer()
  private controller = new FPSController()
  private viewmodel: Viewmodel
  private weapons: WeaponSystem
  private metrics = emptyMetrics()
  private weaponKills: Record<string, number> = {}
  private kills = 0
  private matchTime = 0
  private landed = false
  private graceLeft = GRACE_BEFORE_ZONE
  private zoneTickAcc = 0
  private spectateTarget: string | null = null
  private placementAtDeath = 0
  private diedAt = 0
  private supplyDropsDone = new Set<number>()
  private unsubs: (() => void)[] = []
  private collectedWeapons = new Map<string, { name: string; rarity: string }>()
  private collectedItems = 0
  private emotes: EmoteController
  private wheel: EmoteWheel
  private tmp = new THREE.Vector3()
  private fovCurrent: number
  onEnded: ((result: MatchResult) => void) | null = null
  /** Fired once when the local player goes down (death screen). */
  onPlayerDied: ((info: { placement: number; killedBy: string | null; kills: number }) => void) | null = null
  /** Set while a wall of UI (pause) should freeze gameplay input. */
  paused = false

  constructor(engine: Engine, input: Input, profile: Profile, ui: HTMLElement, dropX: number, dropZ: number) {
    this.engine = engine
    this.input = input
    this.profile = profile
    this.wheel = new EmoteWheel(ui)
    const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0
    this.rng = makeRng(deriveSeed(seed, 'match'))

    const { ground, water } = buildTerrain()
    engine.scene.add(ground, water)
    this.world = buildWorld(engine.scene, this.col)
    this.sky = new Sky(engine.scene)
    this.fx = new Fx(engine.scene)
    this.zone = new ZoneController(engine.scene, makeRng(deriveSeed(seed, 'zone')))
    this.loot = new LootSystem(engine.scene, this.fx)
    this.loot.populate(this.world, makeRng(deriveSeed(seed, 'loot')))
    this.bots = new BotManager(engine.scene, this.col, this.loot, this.emissions, this.fx, this.zone, makeRng(deriveSeed(seed, 'bots')))
    this.bots.spawnAll(MATCH_PLAYERS - 1)

    this.viewmodel = new Viewmodel(engine.camera)
    engine.scene.add(engine.camera)
    this.weapons = new WeaponSystem({
      inv: this.player.inv,
      controller: this.controller,
      viewmodel: this.viewmodel,
      fx: this.fx,
      col: this.col,
      field: this.bots,
      emissions: this.emissions,
    })
    this.fovCurrent = profile.settings.fov
    this.emotes = new EmoteController({
      scene: engine.scene,
      profile,
      col: this.col,
      wheel: this.wheel,
      onFreeze: (f) => { this.controller.frozen = f },
      onViewmodel: (v) => { this.viewmodel.group.visible = v },
    })

    // Settings.
    this.controller.sensitivity = profile.settings.sensitivity
    this.controller.invertY = profile.settings.invertY
    audio.setVolume(profile.settings.volume)

    // Drop in — onto open ground, never a rooftop or a building footprint.
    const clear = this.col.findClearGround(dropX, dropZ)
    this.controller.pos.set(clear.x, 320, clear.z)
    this.controller.frozen = true

    this.wire()
    this.refreshHeld()
  }

  private wire(): void {
    // Player body ↔ bots.
    this.bots.player = {
      pos: this.controller.pos,
      eyeHeight: 1.55,
      alive: true,
      moveFactor: 0,
      crouching: false,
    }
    this.bots.onPlayerDamaged = (amount, mult, angle, name) => {
      this.emotes.cancel()
      this.player.takeDamage(amount, mult, angle - this.controller.yaw, name, this.matchTime)
    }
    this.player.onDeath = () => this.onPlayerDeath()

    this.controller.onStep = (sprinting) => {
      audio.step(sprinting)
      this.emissions.setMove('player', sprinting ? 0.5 : 0.25)
      if (this.cycle.isDark && sprinting) {
        this.fx.footstep(this.controller.pos.x, this.controller.pos.y, this.controller.pos.z, '#39f0e0', 2)
      }
    }
    this.controller.onLand = (fall) => {
      audio.land()
      if (fall > 7) this.player.takeEnvironmentalDamage((fall - 7) * 6, 'the fall')
    }
    this.weapons.onDamageDealt = (amount) => {
      this.metrics.damageDealt += amount
    }
    this.emissions.onPulse = (id) => {
      if (!this.cycle.isDark) return
      let px: number
      let py: number
      let pz: number
      if (id === 'player') {
        px = this.controller.pos.x
        py = this.controller.pos.y
        pz = this.controller.pos.z
        audio.heartbeat()
      } else {
        const b = this.bots.bots.get(id)
        if (!b || !b.alive || !b.embodied) return
        px = b.pos.x
        py = b.pos.y
        pz = b.pos.z
        if (b.pos.distanceTo(this.controller.pos) < HEARTBEAT_RANGE) audio.heartbeat()
      }
      this.fx.ring(px, py, pz, '#8fb0ff', 2.6, 1.1)
    }

    this.unsubs.push(on('blackoutStart', () => {
      this.sky.setBlackout(true)
      this.world.setBlackout(true)
      audio.setBlackout(true)
      audio.blackoutDrop()
      this.weapons.dark = true
      this.bots.dark = true
    }))
    this.unsubs.push(on('blackoutEnd', () => {
      this.sky.setBlackout(false)
      this.world.setBlackout(false)
      audio.setBlackout(false)
      audio.powerRestore()
      this.weapons.dark = false
      this.bots.dark = false
    }))
    this.unsubs.push(on('blackoutWarn', () => audio.blackoutWarn()))
    this.unsubs.push(on('phase', ({ index }) => {
      this.cycle.zonePhase = index
      if (index >= ZONE_PHASES.length - 1) this.cycle.setFinal()
      // Supply drops ride in on the second and fourth collapses.
      if ((index === 1 || index === 3) && !this.supplyDropsDone.has(index)) {
        this.supplyDropsDone.add(index)
        const c = this.zone.target
        const ang = this.rng() * Math.PI * 2
        const r = Math.sqrt(this.rng()) * c.radius * 0.7
        this.loot.supplyDrop(c.center.x + Math.cos(ang) * r, c.center.z + Math.sin(ang) * r, this.rng() < 0.55 ? 'legendary' : this.rng() < 0.75 ? 'mythic' : 'exotic')
        emit('toast', { text: 'SUPPLY DROP INBOUND', strong: true })
      }
    }))
    this.unsubs.push(on('kill', (k) => {
      if (k.killerIsPlayer) {
        this.kills++
        this.metrics.kills++
        if (k.inBlackout) this.metrics.blackoutKills++
        if (k.headshot) this.metrics.headshotKills++
        const def = [...WEAPON_BY_ID.values()].find((d) => d.name === k.weaponName)
        if (def) this.weaponKills[def.id] = (this.weaponKills[def.id] ?? 0) + 1
      }
    }))
  }

  private refreshHeld(): void {
    this.weapons.refreshViewmodel(this.profile.weaponSkin())
  }

  private onPlayerDeath(): void {
    this.emotes.abort()
    this.placementAtDeath = this.bots.aliveCount() + 1
    this.diedAt = this.matchTime
    if (this.bots.player) this.bots.player.alive = false
    this.emissions.remove('player')
    audio.defeat()
    this.phaseState.phase = 'spectate'
    this.spectateTarget = this.bots.aliveBots()[0]?.id ?? null
    emit('aliveChanged', { alive: this.bots.aliveCount() })
    this.onPlayerDied?.({ placement: this.placementAtDeath, killedBy: this.player.lastHitBy, kills: this.kills })
  }

  /** Re-read live-tunable settings after the pause screen closes. */
  applySettings(): void {
    this.controller.sensitivity = this.profile.settings.sensitivity
    this.controller.invertY = this.profile.settings.invertY
  }

  /** Read through a call so TypeScript's narrowing does not hide a phase change made by end(). */
  private isEnded(): boolean {
    return this.phaseState.phase === 'ended'
  }

  /** QA hook (main.ts, `?debug`): resolve the contract now at the given placement. */
  debugFinish(place: number): void {
    if (this.phaseState.phase === 'ended') return
    if (place <= 1) {
      this.end(true)
      return
    }
    const alive = this.bots.aliveBots()
    for (let i = place - 1; i < alive.length; i++) this.bots.debugKill(alive[i].id)
    if (this.player.alive) this.player.takeEnvironmentalDamage(1e6, 'the Deadgrid')
  }

  /** QA hook: stand 1.4 m from the nearest floor weapon, facing it. */
  debugGotoLoot(): { x: number; y: number; z: number; buildingId: number | null } | null {
    const p = this.controller.pos
    const target = this.loot.debugNearestWeapon(p.x, p.z)
    if (!target) return null
    const ang = Math.random() * Math.PI * 2
    const nx = target.x + Math.cos(ang) * 1.4
    const nz = target.z + Math.sin(ang) * 1.4
    const y = this.col.groundHeight(nx, nz, target.y + 0.6, 0.45, target.y + 0.6)
    this.emotes.abort()
    this.controller.pos.set(nx, y, nz)
    this.controller.vel.set(0, 0, 0)
    // Facing = (-sin yaw, -cos yaw): look straight at the item, slightly down.
    this.controller.yaw = Math.atan2(-(target.x - nx), -(target.z - nz))
    this.controller.pitch = -0.35
    return target
  }

  /** QA hook: stand a few metres from the nearest embodied bot, facing it. */
  debugGotoBot(): { name: string; x: number; z: number; armed: boolean } | null {
    const p = this.controller.pos
    let best: Bot | null = null
    let bestD = Infinity
    for (const b of this.bots.bots.values()) {
      if (!b.alive) continue
      const d = Math.hypot(b.pos.x - p.x, b.pos.z - p.z)
      if (d < bestD) {
        best = b
        bestD = d
      }
    }
    if (!best) return null
    const ang = Math.random() * Math.PI * 2
    const nx = best.pos.x + Math.cos(ang) * 4
    const nz = best.pos.z + Math.sin(ang) * 4
    const clear = this.col.findClearGround(nx, nz, 12)
    const y = this.col.groundHeight(clear.x, clear.z, best.pos.y + 0.6, 0.45, best.pos.y + 3)
    this.emotes.abort()
    this.controller.pos.set(clear.x, y, clear.z)
    this.controller.vel.set(0, 0, 0)
    this.controller.yaw = Math.atan2(-(best.pos.x - clear.x), -(best.pos.z - clear.z))
    this.controller.pitch = -0.05
    return { name: best.name, x: best.pos.x, z: best.pos.z, armed: best.gear !== null }
  }

  /** QA hook: the loot race and the phase, for automated checks. */
  debugInfo(): { phase: string; alive: number; armed: number; landed: boolean; emoting: boolean; wheel: boolean; emoteCooldown: number; camBlend: boolean; y: number } {
    return {
      phase: this.phaseState.phase,
      alive: this.bots.aliveCount(),
      armed: this.bots.armedCount(),
      landed: this.landed,
      emoting: this.emotes.playing,
      wheel: this.emotes.wheelOpen,
      emoteCooldown: this.emotes.cooldown,
      camBlend: this.emotes.active,
      y: this.controller.pos.y,
    }
  }

  /** Called by main when the player chooses to leave spectate. */
  finishNow(): void {
    if (this.phaseState.phase !== 'ended') this.end(false)
  }

  private end(won: boolean): void {
    if (this.phaseState.phase === 'ended') return
    this.phaseState.phase = 'ended'
    const placement = won ? 1 : this.placementAtDeath || this.bots.aliveCount() + 1
    const survival = won ? this.matchTime : this.diedAt || this.matchTime
    this.metrics.survivalSeconds = survival
    this.metrics.top10 = placement <= 10 ? 1 : 0
    this.metrics.top25 = placement <= 25 ? 1 : 0
    this.metrics.wins = won ? 1 : 0
    const outcome: MatchOutcome = {
      placement,
      players: MATCH_PLAYERS,
      kills: this.kills,
      survivalSeconds: survival,
      cratesOpened: this.metrics.cratesOpened,
      headshotKills: this.metrics.headshotKills,
    }
    // Only name a winner when the match actually resolved — an abandoned
    // contract has no last light yet.
    const resolved = won || (!this.player.alive && this.bots.aliveCount() <= 1)
    const winnerName = won ? this.profile.name : resolved ? this.bots.aliveBots()[0]?.name ?? 'nobody' : ''
    this.emotes.abort()
    this.onEnded?.({
      outcome,
      metrics: this.metrics,
      weaponKills: this.weaponKills,
      winnerName,
      killedBy: this.player.lastHitBy,
      won,
      podium: resolved ? this.podium(won, placement) : [],
      collected: { weapons: [...this.collectedWeapons.values()], items: this.collectedItems },
    })
  }

  /** Rank everyone who finished top three: the last light, then the last to fall. */
  private podium(won: boolean, placement: number): FinisherInfo[] {
    const botInfo = (b: Bot): FinisherInfo => ({
      name: b.name,
      isPlayer: false,
      suitId: SUITS[b.suitIndex].id,
      celebrationId: b.celebrationId,
      accessoryIds: b.accessoryId ? [b.accessoryId] : [],
    })
    const me: FinisherInfo = {
      name: this.profile.name,
      isPlayer: true,
      suitId: this.profile.equipped.suit,
      celebrationId: this.profile.equipped.celebration,
      accessoryIds: [...this.profile.equipped.accessories],
    }
    // Bots ranked best-first: whoever is still standing, then deaths latest-first.
    const ranked: FinisherInfo[] = [...this.bots.aliveBots().map(botInfo), ...this.bots.deathOrder.slice().reverse().map(botInfo)]
    ranked.splice(won ? 0 : Math.max(0, placement - 1), 0, me)
    return ranked.slice(0, 3)
  }

  /** Full teardown: scene, listeners, viewmodel, ambience beds. */
  dispose(): void {
    for (const u of this.unsubs) u()
    this.emotes.dispose()
    this.wheel.dispose()
    this.loot.dispose()
    clearAllHandlers()
    // The audio singleton outlives the match — silence its continuous beds
    // or a blackout drone follows the player into the lobby.
    audio.setBlackout(false)
    audio.setWind(0)
    audio.setZoneProximity(0)
    this.engine.camera.remove(this.viewmodel.group)
    this.engine.camera.clear()
    this.engine.clearScene()
    this.engine.camera.fov = this.profile.settings.fov
    this.engine.camera.updateProjectionMatrix()
  }

  update(dt: number, time: number): void {
    if (this.paused) return
    this.matchTime += dt
    const cam = this.engine.camera

    this.sky.update(dt)
    this.fx.update(dt)
    this.loot.update(dt, cam.position)
    this.emissions.update(dt)

    if (this.landed) {
      this.cycle.update(dt)
      this.zone.update(dt, time)
      if (this.graceLeft > 0) {
        this.graceLeft -= dt
        if (this.graceLeft <= 0) {
          this.zone.begin()
          emit('toast', { text: 'THE DEADGRID IS FAILING', strong: true })
        }
      }
    }

    switch (this.phaseState.phase) {
      case 'drop': {
        // Cable drop: fast vertical descent onto the chosen point.
        const prevY = this.controller.pos.y
        this.controller.pos.y -= 46 * dt
        const m = this.input.consumeMouse()
        this.controller.yaw -= m.dx * 0.002
        this.controller.pitch = THREE.MathUtils.clamp(this.controller.pitch - m.dy * 0.002, -1.4, 1.4)
        const ground = this.col.groundHeight(this.controller.pos.x, this.controller.pos.z, this.controller.pos.y, 0.45, prevY)
        audio.setWind(1)
        if (this.controller.pos.y <= ground) {
          this.controller.pos.y = ground
          this.controller.frozen = false
          this.landed = true
          this.phaseState.phase = 'live'
          this.fx.ring(this.controller.pos.x, ground, this.controller.pos.z, '#39f0e0', 6, 0.7)
          audio.land()
          audio.setWind(0.15)
          emit('toast', { text: 'CONTRACT ACTIVE — BE THE LAST LIGHT', strong: true })
        }
        break
      }
      case 'live': {
        this.updateLive(dt)
        break
      }
      case 'spectate': {
        this.updateSpectate()
        break
      }
      case 'ended':
        break
    }

    // Bots simulate in every phase after the drop.
    if (this.landed && this.phaseState.phase !== 'ended') {
      if (this.bots.player) {
        this.bots.player.moveFactor = this.controller.moveFactor
        this.bots.player.crouching = this.controller.crouching
        // Crouching genuinely shrinks the hitbox and hides the head.
        this.bots.player.eyeHeight = this.controller.eyeHeight()
      }
      this.bots.update(dt, time, cam.position)
      this.zoneTickAcc += dt
      if (this.zoneTickAcc >= 1) {
        this.zoneTickAcc -= 1
        this.bots.applyZoneDamage()
      }
      // Win/lose checks.
      const botsAlive = this.bots.aliveCount()
      if (this.player.alive && botsAlive === 0) this.end(true)
      else if (!this.player.alive && botsAlive <= 1 && this.phaseState.phase === 'spectate') this.end(false)
      // end() hands the camera to the ending sequence synchronously — never
      // write the camera or FOV again after that.
      if (this.isEnded()) return
    }

    // Camera.
    if (this.emotes.active) {
      // Third person for the emote, blended smoothly from and back to the helmet.
      this.controller.eyePos(this.tmp)
      this.emotes.applyCamera(cam, this.tmp, this.controller.yaw, this.controller.pitch)
    } else if (this.phaseState.phase === 'spectate') {
      const b = this.spectateTarget ? this.bots.bots.get(this.spectateTarget) : null
      if (b?.alive) {
        // Over the shoulder: the spectated Linewalker is a full body now, so
        // sit behind and above it rather than inside its helmet.
        const fx = -Math.sin(b.yaw)
        const fz = -Math.cos(b.yaw)
        const cx = b.pos.x - fx * 3.2
        const cz = b.pos.z - fz * 3.2
        const cy = b.pos.y + 2.1
        const ground = this.col.groundHeight(cx, cz, cy + 0.5, 0.3, cy + 2)
        cam.position.set(cx, Math.max(cy, ground + 0.4), cz)
        cam.lookAt(b.pos.x + fx * 2, b.pos.y + 1.2, b.pos.z + fz * 2)
      }
    } else {
      const bob = this.controller.bobOffset(this.weapons.adsFactor)
      this.controller.eyePos(this.tmp)
      cam.position.set(this.tmp.x + bob.x, this.tmp.y + bob.y, this.tmp.z)
      cam.rotation.order = 'YXZ'
      cam.rotation.y = this.controller.yaw
      cam.rotation.x = this.controller.pitch
      cam.rotation.z = 0
    }
    this.sky.track(cam.position)

    // FOV: settings + ADS zoom, smoothed.
    const targetFov = this.profile.settings.fov * this.weapons.fovScale()
    this.fovCurrent += (targetFov - this.fovCurrent) * Math.min(1, dt * 14)
    if (Math.abs(cam.fov - this.fovCurrent) > 0.05) {
      cam.fov = this.fovCurrent
      cam.updateProjectionMatrix()
    }
  }

  private updateLive(dt: number): void {
    const input = this.input
    // Hold B: the wheel. Release on a slot: the show. The grid keeps ticking throughout.
    const canEmote = this.player.alive && this.controller.grounded && this.player.channel === null
    this.emotes.update(dt, input, this.controller.pos, this.controller.yaw, canEmote)
    this.controller.update(dt, input, this.col, this.weapons.adsFactor)
    this.metrics.distance += Math.hypot(this.controller.vel.x, this.controller.vel.z) * dt

    // Emission from movement, continuous.
    const mf = this.controller.moveFactor
    // Showing off is loud on the grid: an emote lights you up like a sprint.
    this.emissions.setMove('player', this.emotes.playing ? 0.5 : this.controller.crouching ? 0.05 : mf > 0.75 ? 0.5 : mf > 0.1 ? 0.25 : 0.03)

    const channelling = this.player.update(dt)
    if (channelling && (this.controller.sprinting || !this.controller.grounded)) this.player.cancelChannel()
    if (this.player.channel) this.emissions.report('player', 'heal', 0.5)

    this.weapons.update(dt, input, {
      skin: this.profile.weaponSkin(),
      frozen: this.player.channel !== null || this.emotes.suppressFire,
      time: this.matchTime,
    })
    this.viewmodel.update({ moveFactor: mf, adsFactor: this.weapons.adsFactor, dt, time: this.matchTime })

    // Interaction.
    if (input.justPressed('KeyE') && !this.emotes.playing && !this.emotes.wheelOpen) this.tryInteract()
    if (input.justPressed('Digit4')) {
      if (!this.player.startHeal('trickle')) this.player.startHeal('medloop')
    }
    if (input.justPressed('Digit5')) {
      if (!this.player.startHeal('surge')) this.player.startHeal('capbank')
    }

    // Deadgrid damage + ambience.
    const dps = this.zone.dpsAt(this.controller.pos.x, this.controller.pos.z)
    if (dps > 0) this.player.takeEnvironmentalDamage(dps * dt, 'the Deadgrid')
    audio.setZoneProximity(this.zone.wallProximity(this.controller.pos.x, this.controller.pos.z))
    audio.setWind(Math.min(1, Math.max(0, (this.controller.pos.y - 20) / 60)) * 0.5 + mf * 0.2)
  }

  private tryInteract(): void {
    this.controller.eyePos(this.tmp)
    const near = this.loot.nearestInteractable(this.tmp)
    if (!near) return
    if (near.kind === 'crate') {
      if (this.loot.openCrate(near.id, this.rng)) this.metrics.cratesOpened++
      return
    }
    // Decide first, take second — a full pouch must never eat the item.
    const floor = this.loot.getFloor(near.id)
    if (!floor || !this.player.inv.canTake(floor.item)) return
    const origin = { x: floor.x, y: floor.y, z: floor.z }
    const lootItem = this.loot.takeFloor(near.id)
    if (!lootItem) return
    const { label } = itemLabel(lootItem)
    switch (lootItem.type) {
      case 'weapon': {
        const { dropped, slot } = this.player.inv.pickupWeapon(lootItem.weaponId, lootItem.rarity)
        if (dropped) {
          this.loot.spawnFloor(
            { type: 'weapon', weaponId: dropped.defId, rarity: dropped.rarity },
            this.controller.pos.x + 0.6, this.controller.pos.z + 0.4,
          )
        }
        this.player.inv.active = slot
        this.refreshHeld()
        if (RARITY_RANK[lootItem.rarity] >= RARITY_RANK.rare) this.metrics.rareWeaponsFound++
        const def = WEAPON_BY_ID.get(lootItem.weaponId)
        if (def) this.collectedWeapons.set(`${def.id}:${lootItem.rarity}`, { name: def.name, rarity: lootItem.rarity })
        break
      }
      case 'ammo': {
        this.collectedItems++
        const taken = this.player.inv.addAmmo(lootItem.ammo, lootItem.amount)
        if (taken < lootItem.amount) {
          this.loot.spawnFloor({ ...lootItem, amount: lootItem.amount - taken }, origin.x, origin.z, origin.y)
        }
        break
      }
      case 'heal': {
        this.collectedItems++
        const taken = this.player.inv.addHeal(lootItem.healId, lootItem.amount)
        if (taken < lootItem.amount) {
          this.loot.spawnFloor({ ...lootItem, amount: lootItem.amount - taken }, origin.x, origin.z, origin.y)
        }
        break
      }
      case 'armor':
        this.collectedItems++
        this.player.applyArmorPickup(lootItem.armorId)
        break
    }
    audio.pickup()
    emit('pickup', { label, rarityColor: near.color })
  }

  private updateSpectate(): void {
    const current = this.spectateTarget ? this.bots.bots.get(this.spectateTarget) : null
    // Retarget automatically when the spectated Linewalker goes down.
    if ((!current || !current.alive || this.input.mouseJustPressed(0))) {
      const alive = this.bots.aliveBots()
      if (alive.length > 0) {
        const idx = alive.findIndex((b) => b.id === this.spectateTarget)
        this.spectateTarget = alive[(idx + 1) % alive.length].id
      }
    }
  }

  /** Everything the HUD needs this frame. */
  hudState(): HudState {
    const w = this.weapons.hud()
    const zoneInfo = this.zone.minimap()
    this.controller.eyePos(this.tmp)
    const near = this.phaseState.phase === 'live' ? this.loot.nearestInteractable(this.tmp) : null
    const heals = [
      { id: 'trickle', count: this.player.inv.heals.get('trickle') ?? 0 },
      { id: 'medloop', count: this.player.inv.heals.get('medloop') ?? 0 },
      { id: 'surge', count: this.player.inv.heals.get('surge') ?? 0 },
      { id: 'capbank', count: this.player.inv.heals.get('capbank') ?? 0 },
    ]
    const clock = this.cycle.finalDark
      ? 'PERMANENT'
      : `${Math.floor(this.cycle.stateTimeLeft / 60)}:${String(Math.floor(this.cycle.stateTimeLeft % 60)).padStart(2, '0')}`
    const spectated = this.spectateTarget ? this.bots.bots.get(this.spectateTarget) : null
    return {
      health: this.player.vitals.health,
      armor: this.player.vitals.armor,
      weaponName: w.name,
      mag: w.mag,
      reserve: w.reserve,
      reloading: w.reloading,
      spreadDeg: this.weapons.spreadDeg(),
      ads: this.weapons.adsFactor > 0.5,
      alive: this.bots.aliveCount() + (this.player.alive ? 1 : 0),
      kills: this.kills,
      dark: this.cycle.isDark,
      warn: this.cycle.state === 'warn',
      blackoutClock: clock,
      zoneSeconds: zoneInfo.secondsToShrink,
      zoneShrinking: zoneInfo.shrinking,
      interact: near ? { label: near.label, color: near.color } : null,
      channel: this.player.channel
        ? { label: this.player.channel.def.name, frac: 1 - this.player.channel.tLeft / this.player.channel.def.useTime }
        : null,
      heals,
      slots: [0, 1].map((i) => {
        const s = this.player.inv.slots[i]
        const def = s ? WEAPON_BY_ID.get(s.defId) : null
        return {
          name: def ? def.name : '—',
          rarityColor: s ? `var(--r-${s.rarity})` : '#444',
          active: this.player.inv.active === i,
        }
      }),
      yaw: this.phaseState.phase === 'spectate' && spectated ? spectated.yaw : this.controller.yaw,
      playerX: this.phaseState.phase === 'spectate' && spectated ? spectated.pos.x : this.controller.pos.x,
      playerZ: this.phaseState.phase === 'spectate' && spectated ? spectated.pos.z : this.controller.pos.z,
      phaseIdx: this.zone.phaseIdx,
      spectating: spectated?.name ?? null,
      matchTime: this.matchTime,
      emoteCooldown: this.emotes.cooldown,
      emoteSlots: this.emotes.equippedCount,
      emoteWheel: this.emotes.wheelOpen,
    }
  }

  zoneForMinimap(): ReturnType<ZoneController['minimap']> {
    return this.zone.minimap()
  }

  playerAlive(): boolean {
    return this.player.alive
  }

  /** heightAt for the deploy-map renderer. */
  static heightAt = heightAt
}
