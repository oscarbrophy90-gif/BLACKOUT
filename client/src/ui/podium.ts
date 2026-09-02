import * as THREE from 'three'
import { ACCESSORIES_BY_ID, CELEBRATIONS_BY_ID, RARITY_COLOR, STARTER_ITEMS, SUITS } from '@blackout/shared'
import type { AccSpec, CameraId, ChallengeDef, MatchRewards, Rarity } from '@blackout/shared'
import { CharacterAnimator } from '../character/animator.ts'
import { CharacterRig } from '../character/rig.ts'
import { audio } from '../core/audio.ts'
import type { Engine } from '../core/engine.ts'
import type { FinisherInfo, MatchResult } from '../game/match.ts'
import type { Profile } from '../meta/data.ts'
import { Emitter } from '../world/particles.ts'
import { esc } from './cards.ts'

// The ending. A win runs: VICTORY card (camera sweep, fanfare, confetti)
// → podium, the player's Linewalker performing their equipped celebration
// on 1st → NEXT → match summary → RETURN TO MAIN MENU. Finishing 2nd or
// 3rd runs the same podium with the winner's own celebration on 1st and a
// SKIP button. Anything lower goes straight to the summary.

const PODIUM_X = [0, -2.1, 2.1]
const PODIUM_H = [1.05, 0.72, 0.5]
const PODIUM_COLORS = ['#ffc247', '#c8d2dc', '#c97a3a']
const PLACE_LABEL = ['1st Place', '2nd Place', '3rd Place']

function numberTexture(n: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#0d0b22'
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = color
  g.font = '900 96px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(n, 64, 70)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

interface Stand {
  info: FinisherInfo
  holder: THREE.Group
  rig: CharacterRig
  anim: CharacterAnimator
  label: HTMLElement
  top: number
  x: number
}

class PodiumScene {
  private engine: Engine
  private overlay: HTMLElement
  private stands: Stand[] = []
  private emitters: Emitter[] = []
  private time = 0
  private phase: 'victory' | 'podium' = 'podium'
  private phaseT = 0
  private camMode: CameraId = 'static'
  private winnerReplayAt = -1
  private winnerSpec = CELEBRATIONS_BY_ID.get(STARTER_ITEMS.celebration)!.anim
  private tmp = new THREE.Vector3()
  private textures: THREE.Texture[] = []
  private baseFov: number
  private disposed = false

  constructor(engine: Engine, ui: HTMLElement, podium: FinisherInfo[], playerWon: boolean) {
    this.engine = engine
    this.baseFov = engine.camera.fov
    engine.camera.fov = 42
    engine.camera.updateProjectionMatrix()
    const scene = engine.scene
    scene.background = new THREE.Color('#06051a')
    scene.fog = new THREE.Fog('#06051a', 14, 40)

    // Lights: cool fill, a warm key, and a spot over each step.
    scene.add(new THREE.HemisphereLight('#aab4ff', '#0a0818', 0.9))
    const key = new THREE.DirectionalLight('#fff0d0', 1.3)
    key.position.set(3, 6, 4)
    scene.add(key)

    // Floor and grid.
    const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 48), new THREE.MeshStandardMaterial({ color: '#0d0b22', roughness: 0.9 }))
    floor.rotation.x = -Math.PI / 2
    scene.add(floor)
    const grid = new THREE.PolarGridHelper(15, 16, 8, 64, '#173f3d', '#173f3d')
    grid.position.y = 0.01
    scene.add(grid)

    // Stars.
    const starGeo = new THREE.BufferGeometry()
    const stars = new Float32Array(600 * 3)
    for (let i = 0; i < 600; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 18 + Math.random() * 14
      stars[i * 3] = Math.cos(a) * r
      stars[i * 3 + 1] = 2 + Math.random() * 16
      stars[i * 3 + 2] = Math.sin(a) * r
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(stars, 3))
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#8fb0ff', size: 0.08, transparent: true, opacity: 0.8 })))

    this.overlay = document.createElement('div')
    this.overlay.className = 'screen podium-overlay'
    ui.appendChild(this.overlay)

    for (let i = 0; i < 3; i++) {
      const x = PODIUM_X[i]
      const h = PODIUM_H[i]
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, h, 1.7),
        new THREE.MeshStandardMaterial({ color: '#171335', roughness: 0.5, metalness: 0.4 }),
      )
      block.position.set(x, h / 2, 0)
      scene.add(block)
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(block.geometry), new THREE.LineBasicMaterial({ color: PODIUM_COLORS[i] }))
      edges.position.copy(block.position)
      scene.add(edges)
      const numTex = numberTexture(String(i + 1), PODIUM_COLORS[i])
      this.textures.push(numTex)
      const num = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 0.7 * Math.min(1, h / 0.8)),
        new THREE.MeshBasicMaterial({ map: numTex }),
      )
      num.position.set(x, h / 2, -0.86)
      num.rotation.y = Math.PI
      scene.add(num)
      const spot = new THREE.SpotLight(PODIUM_COLORS[i], i === 0 ? 40 : 18, 12, 0.5, 0.6, 1.2)
      spot.position.set(x, 6.5, -1.2)
      spot.target.position.set(x, h, 0)
      scene.add(spot, spot.target)
      // A visible light cone so the spot reads even against black.
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(1.4, 6, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: PODIUM_COLORS[i], transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
      )
      cone.position.set(x, h + 3, -0.6)
      scene.add(cone)

      const info = podium[i]
      if (!info) continue
      const suit = SUITS.find((s) => s.id === info.suitId) ?? SUITS[0]
      const rig = new CharacterRig({ body: suit.colors[0], trim: suit.colors[1], visor: suit.colors[2] })
      const holder = new THREE.Group()
      holder.position.set(x, h, 0)
      holder.add(rig.root)
      scene.add(holder)
      const anim = new CharacterAnimator(holder, rig)
      anim.setAccessories(info.accessoryIds.map((id) => ACCESSORIES_BY_ID.get(id)?.acc).filter((a): a is AccSpec => !!a))
      const label = document.createElement('div')
      label.className = `podium-label p${i + 1} ${info.isPlayer ? 'me' : ''}`
      label.innerHTML = `<b>${i === 0 ? '🏆 ' : ''}${PLACE_LABEL[i]}</b><span>${esc(info.name)}${info.isPlayer ? ' · YOU' : ''}</span>`
      this.overlay.appendChild(label)
      this.stands.push({ info, holder, rig, anim, label, top: h, x })
    }

    const winner = this.stands[0]
    if (winner) {
      this.winnerSpec = (CELEBRATIONS_BY_ID.get(winner.info.celebrationId) ?? CELEBRATIONS_BY_ID.get(STARTER_ITEMS.celebration)!).anim
      this.camMode = this.winnerSpec.camera
    }
    if (playerWon) {
      this.phase = 'victory'
      this.overlay.classList.add('intro')
      this.confetti()
    }
    if (winner && !playerWon) this.playWinner()
  }

  private confetti(): void {
    const colours: [string, string][] = [['#ffc247', '#39f0e0'], ['#ff4d6a', '#ffffff'], ['#7d6bff', '#7fe08a']]
    for (const c of colours) {
      const e = new Emitter({
        count: 160, color: c, size: 0.09, life: 5.5, shape: 'ceiling', radius: 5, height: 7,
        speed: [0.2, 1.2], dir: 'down', gravity: 0.9, rate: 28, drag: 1.4, spin: 3, fade: true, additive: false, sprite: 'square',
      })
      e.points.position.y = 0.5
      this.engine.scene.add(e.points)
      this.emitters.push(e)
    }
  }

  private playWinner(): void {
    const w = this.stands[0]
    if (!w) return
    w.anim.play(this.winnerSpec, { loop: false, withEffects: true })
    this.winnerReplayAt = -1
    audio.stinger(true)
  }

  get winnerFinished(): boolean {
    return this.stands[0]?.anim.finished ?? true
  }

  /** Leave the VICTORY card for the podium proper. */
  toPodium(): void {
    if (this.phase === 'podium') return
    this.phase = 'podium'
    this.phaseT = 0
    this.overlay.classList.remove('intro')
    audio.whoosh()
    this.playWinner()
  }

  update(dt: number): void {
    if (this.disposed) return
    this.time += dt
    this.phaseT += dt
    for (const e of this.emitters) e.update(dt)
    for (const s of this.stands) s.anim.update(dt)
    const w = this.stands[0]
    if (w && this.phase === 'podium' && w.anim.finished) {
      if (this.winnerReplayAt < 0) this.winnerReplayAt = this.time + 2
      else if (this.time > this.winnerReplayAt) this.playWinner()
    }

    const cam = this.engine.camera
    if (this.phase === 'victory') {
      // Crane down from high orbit onto the winner's step.
      const k = Math.min(1, this.phaseT / 4.5)
      const e = 1 - Math.pow(1 - k, 3)
      const yaw = 0.9 - e * 0.55
      const dist = 11 - e * 6.2
      const y = 7.5 - e * 5.4
      const jitter = (1 - e) * 0.05
      cam.position.set(-Math.sin(yaw) * dist + (Math.random() - 0.5) * jitter, y, -Math.cos(yaw) * dist)
      cam.lookAt(0, 1.6 - e * 0.3, 0)
    } else {
      const wx = w?.x ?? 0
      const wy = (w?.top ?? 1) + 1.0
      const p = w?.anim.progress ?? 0
      let yaw = 0.25
      let dist = 6.2
      let camY = wy + 0.9
      let shake = 0
      switch (this.camMode) {
        case 'orbit': yaw += this.time * 0.35; break
        case 'zoom': dist *= 1 - 0.3 * Math.sin(p * Math.PI); break
        case 'dramatic': camY = wy - 0.6; yaw += this.time * 0.2; break
        case 'lowangle': camY = wy - 0.9; dist = 5; break
        case 'crane': camY = wy + 3.4 - 2.6 * Math.min(1, p * 1.5); break
        case 'shake': shake = 0.05; break
        case 'dolly': dist = 9.5 - 4 * Math.min(1, p * 1.3); break
        default: yaw += Math.sin(this.time * 0.25) * 0.25
      }
      // Ease in from wherever the victory sweep left the camera.
      const blend = Math.min(1, this.phaseT / 1.2)
      const tx = wx * 0.35 - Math.sin(yaw) * dist + (Math.random() - 0.5) * shake
      const tz = -Math.cos(yaw) * dist
      cam.position.lerp(this.tmp.set(tx, camY, tz), blend < 1 ? Math.min(1, dt * 3) : 1)
      cam.lookAt(wx * 0.5, wy - 0.3, 0)
    }
    this.projectLabels()
  }

  private projectLabels(): void {
    const cam = this.engine.camera
    const W = window.innerWidth
    const H = window.innerHeight
    for (const s of this.stands) {
      this.tmp.set(s.x, s.top + 2.35, 0).project(cam)
      const visible = this.tmp.z < 1
      s.label.style.display = visible ? '' : 'none'
      if (!visible) continue
      s.label.style.left = `${((this.tmp.x + 1) / 2) * W}px`
      s.label.style.top = `${((1 - this.tmp.y) / 2) * H}px`
    }
  }

  dispose(): void {
    this.disposed = true
    for (const s of this.stands) {
      s.anim.dispose()
      s.rig.dispose()
    }
    for (const e of this.emitters) e.dispose()
    for (const t of this.textures) t.dispose()
    this.overlay.remove()
    this.engine.camera.fov = this.baseFov
    this.engine.camera.updateProjectionMatrix()
  }
}

function fmtTime(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

/** The match summary: placement, eliminations, XP, salvage, what was collected, stats. */
export function summaryScreen(
  ui: HTMLElement,
  result: MatchResult,
  rewards: MatchRewards,
  completed: ChallengeDef[],
  profile: Profile,
  onDone: () => void,
): void {
  const root = document.createElement('div')
  root.className = 'screen results'
  ui.appendChild(root)
  const won = result.won
  const lvl = profile.level
  const place = result.outcome.placement
  const breakdown = rewards.breakdown.map((b) => `<div class="xp-row"><span>${esc(b.label)}</span><b>+${b.xp} XP</b></div>`).join('')
  const contracts = completed.length
    ? `<div class="contracts"><h3>CONTRACTS COMPLETE</h3>${completed.map((c) => `<div class="xp-row"><span>${esc(c.label)}</span><b>+${c.coins} ⬡</b></div>`).join('')}</div>`
    : ''
  const weapons = result.collected.weapons.length
    ? result.collected.weapons.map((w) => `<span class="loot-chip" style="--rc:${RARITY_COLOR[w.rarity as Rarity] ?? '#9aa3ad'}">${esc(w.name)}</span>`).join('')
    : '<span class="loot-chip none">No weapons found</span>'
  root.innerHTML = `
    <div class="results-card summary-card ${won ? 'won' : ''}">
      <div class="summary-kicker">MATCH SUMMARY</div>
      <h1>${won ? 'LAST LIGHT ON VANTERA' : place <= 3 ? 'ON THE PODIUM' : 'CONTRACT TERMINATED'}</h1>
      <div class="place-line">${won ? '🏆 VICTORY' : `#${place} <span>of ${result.outcome.players}</span>`}</div>
      ${won ? '' : result.winnerName ? `<p class="winner-line">Winner: <b>${esc(result.winnerName)}</b></p>` : '<p class="winner-line">Contract abandoned — the grid never chose a last light.</p>'}
      <div class="summary-grid">
        <div class="sum"><b>${result.outcome.kills}</b>eliminations</div>
        <div class="sum"><b>${Math.round(result.metrics.damageDealt)}</b>damage dealt</div>
        <div class="sum"><b>${fmtTime(result.outcome.survivalSeconds)}</b>survived</div>
        <div class="sum"><b>${result.metrics.blackoutKills}</b>blackout elims</div>
        <div class="sum"><b>${result.outcome.headshotKills}</b>headshots</div>
        <div class="sum"><b>${result.outcome.cratesOpened}</b>crates opened</div>
        <div class="sum"><b>${(result.metrics.distance / 1000).toFixed(2)}km</b>travelled</div>
        <div class="sum"><b>${result.collected.weapons.length}</b>weapons found</div>
        <div class="sum"><b>${result.collected.items}</b>supplies looted</div>
      </div>
      <div class="collected"><h3>WEAPONS COLLECTED</h3><div class="loot-chips">${weapons}</div></div>
      <div class="xp-block">${breakdown}<div class="xp-row total"><span>TOTAL</span><b>+${rewards.xp} XP</b></div></div>
      <div class="coin-line">+${rewards.coins} ⬡ SALVAGE</div>
      ${contracts}
      <div class="level-block">
        <div class="level-label">LEVEL ${lvl.level}</div>
        <div class="level-bar"><div class="level-fill" style="width:${(lvl.into / lvl.needed) * 100}%"></div></div>
      </div>
      <button class="btn primary continue-btn">RETURN TO MAIN MENU</button>
    </div>`
  root.querySelector('.continue-btn')!.addEventListener('click', () => {
    audio.ui('click')
    root.remove()
    onDone()
  })
}

/**
 * Run the whole ending for a finished match. Owns the engine loop until
 * the summary's RETURN TO MAIN MENU; `onDone` fires after the scene is torn down.
 */
export function runEnding(
  engine: Engine,
  ui: HTMLElement,
  result: MatchResult,
  rewards: MatchRewards,
  completed: ChallengeDef[],
  profile: Profile,
  onDone: () => void,
): void {
  const place = result.outcome.placement
  const showPodium = result.podium.length > 0 && place <= 3
  const finish = () => {
    engine.stop()
    engine.clearScene()
    onDone()
  }
  if (!showPodium) {
    engine.stop()
    engine.clearScene()
    summaryScreen(ui, result, rewards, completed, profile, onDone)
    return
  }

  engine.clearScene()
  const scene = new PodiumScene(engine, ui, result.podium, result.won)
  const hud = document.createElement('div')
  hud.className = 'screen podium-hud'
  ui.appendChild(hud)

  let t = 0
  let advanced = false
  const toSummary = () => {
    if (advanced) return
    advanced = true
    hud.remove()
    scene.dispose()
    engine.stop()
    engine.clearScene()
    summaryScreen(ui, result, rewards, completed, profile, finish)
  }

  if (result.won) {
    audio.fanfare()
    hud.innerHTML = `
      <div class="victory-flash"></div>
      <div class="victory-card">
        <div class="victory-title">VICTORY</div>
        <div class="victory-name">${esc(profile.name)}</div>
        <div class="victory-sub">LAST LIGHT ON VANTERA · ${result.outcome.kills} ELIMINATION${result.outcome.kills === 1 ? '' : 'S'}</div>
      </div>`
  } else {
    const winner = result.podium[0]
    hud.innerHTML = `
      <div class="podium-banner">
        <div class="banner-place">${place === 2 ? '2ND' : '3RD'} PLACE</div>
        <div class="banner-sub"><b>${esc(winner?.name ?? result.winnerName)}</b> takes the last light</div>
      </div>
      <button class="btn ghost podium-btn skip-btn">SKIP</button>`
    hud.querySelector('.skip-btn')!.addEventListener('click', () => {
      audio.ui('click')
      toSummary()
    })
  }

  engine.start((dt) => {
    t += dt
    scene.update(dt)
    if (result.won) {
      if (t > 4.8 && !hud.querySelector('.podium-banner')) {
        // Victory card out, podium chrome in.
        hud.querySelector('.victory-card')?.classList.add('out')
        scene.toPodium()
        const banner = document.createElement('div')
        banner.className = 'podium-banner mine'
        banner.innerHTML = `<div class="banner-place">🏆 1ST PLACE</div><div class="banner-sub"><b>${esc(profile.name)}</b> · ${esc(profile.celebration().name)}</div>`
        hud.appendChild(banner)
        const next = document.createElement('button')
        next.className = 'btn primary podium-btn next-btn'
        next.textContent = 'NEXT →'
        next.addEventListener('click', () => {
          audio.ui('click')
          toSummary()
        })
        hud.appendChild(next)
        window.setTimeout(() => next.classList.add('show'), 1800)
      }
    } else if (scene.winnerFinished && t > 2) {
      const btn = hud.querySelector('.skip-btn')
      if (btn && btn.textContent !== 'NEXT →') {
        btn.textContent = 'NEXT →'
        btn.classList.add('primary')
      }
    }
  })
}
