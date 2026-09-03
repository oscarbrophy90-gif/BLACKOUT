import './styles.css'
import { audio } from './core/audio.ts'
import { Engine } from './core/engine.ts'
import { emit } from './core/events.ts'
import { Input } from './core/input.ts'
import { Match } from './game/match.ts'
import type { MatchResult } from './game/match.ts'
import { Profile } from './meta/data.ts'
import { Hud } from './ui/hud.ts'
import { Lobby } from './ui/lobby.ts'
import { runEnding } from './ui/podium.ts'
import { deathScreen, deployScreen, pauseScreen } from './ui/screens.ts'

// Boot + the state machine: DEPOT (lobby) → deploy → match → results → DEPOT.

const canvas = document.getElementById('game') as HTMLCanvasElement
const ui = document.getElementById('ui') as HTMLElement

const engine = new Engine(canvas)
const input = new Input()
input.attach()
const profile = new Profile()
audio.volume = profile.settings.volume

let match: Match | null = null
let hud: Hud | null = null
let closePause: (() => void) | null = null
let closeDeath: (() => void) | null = null
let deathOverlayOpen = false

const lobby = new Lobby(ui, profile, startMatchFlow)
document.body.classList.add('in-lobby')

function applyQuality(): void {
  const q = profile.settings.quality
  engine.setPixelRatioCap(q === 'high' ? 2 : q === 'medium' ? 1.5 : 1)
}

function startMatchFlow(): void {
  lobby.hide()
  document.body.classList.remove('in-lobby')
  deployScreen(ui, (x, z) => {
    applyQuality()
    beginMatch(x, z)
  }, { preview: lobby.preview, profile })
}

function beginMatch(dropX: number, dropZ: number): void {
  match = new Match(engine, input, profile, ui, dropX, dropZ)
  hud = new Hud(ui)
  deathOverlayOpen = false

  match.onPlayerDied = (info) => {
    deathOverlayOpen = true
    input.releaseLock()
    closeDeath = deathScreen(
      ui,
      info,
      () => {
        deathOverlayOpen = false
        closeDeath = null
        void input.requestLock(canvas)
      },
      () => {
        deathOverlayOpen = false
        closeDeath = null
        match?.finishNow()
      },
    )
  }

  match.onEnded = (result) => endMatch(result)

  engine.start((dt) => {
    if (match) {
      match.update(dt, engine.time)
      if (hud && match.phaseState.phase !== 'ended') {
        hud.update(match.hudState(), match.zoneForMinimap(), dt)
      }
    }
    input.endFrame()
  })
  // The auto-drop path arrives here without user activation, where the
  // browser refuses pointer lock — tell the player what to do about it.
  void input.requestLock(canvas).then((ok) => {
    if (!ok) emit('toast', { text: 'CLICK TO TAKE CONTROL', strong: true })
  })
}

function endMatch(result: MatchResult): void {
  if (!match) return
  input.releaseLock()
  closePause?.()
  closePause = null
  closeDeath?.()
  closeDeath = null
  deathOverlayOpen = false
  const { rewards, completed } = profile.recordMatch(result.outcome, result.metrics, result.weaponKills)
  engine.stop()
  hud?.dispose()
  hud = null
  const m = match
  match = null
  m.dispose()
  // Victory card → podium → summary (or straight to the summary), then the depot.
  runEnding(engine, ui, result, rewards, completed, profile, () => {
    document.body.classList.add('in-lobby')
    lobby.show()
  })
}

// `?debug` exposes a tiny QA surface for automated checks (never in normal play).
if (new URLSearchParams(location.search).has('debug')) {
  ;(window as unknown as { __blackout: unknown }).__blackout = {
    profile,
    info: () => match?.debugInfo() ?? null,
    finish: (place: number) => match?.debugFinish(place),
    gotoLoot: () => match?.debugGotoLoot() ?? null,
    gotoBot: () => match?.debugGotoBot() ?? null,
    setCoins: (n: number) => profile.debugSetCoins(n),
  }
}

// Click to (re)capture the mouse during a match.
canvas.addEventListener('click', () => {
  if (match && !input.locked && !deathOverlayOpen && !closePause && match.phaseState.phase !== 'ended') {
    audio.ensure()
    void input.requestLock(canvas)
  }
})

// Losing pointer lock mid-match (Esc) opens the pause screen.
input.onLockChange = (locked) => {
  if (locked || !match || deathOverlayOpen || match.phaseState.phase === 'ended') return
  match.pause()
  closePause = pauseScreen(
    ui,
    profile,
    () => {
      closePause = null
      if (match) {
        match.paused = false
        match.applySettings()
        void input.requestLock(canvas)
      }
    },
    () => {
      closePause = null
      match?.finishNow()
    },
  )
}
