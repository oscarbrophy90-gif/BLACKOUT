import type { ChallengeDef, MatchRewards } from '@blackout/shared'
import { audio } from '../core/audio.ts'
import type { MatchResult } from '../game/match.ts'
import type { Profile } from '../meta/data.ts'
import { ISLAND_RADIUS } from '../config.ts'
import { heightAt } from '../world/terrain.ts'
import { mapToWorld, renderIslandBase, worldToMap } from './map.ts'

// Full-screen overlays around the match: deploy map, results, pause.

function overlay(cls: string, parent: HTMLElement): HTMLElement {
  const e = document.createElement('div')
  e.className = `screen ${cls}`
  parent.appendChild(e)
  return e
}

/** The deploy map: click a drop point, confirm or let the clock run out. */
export function deployScreen(parent: HTMLElement, onDrop: (x: number, z: number) => void): () => void {
  const root = overlay('deploy', parent)
  root.innerHTML = `
    <div class="deploy-head">
      <h1>CHOOSE YOUR INSERTION</h1>
      <p>Vantera's grid dies tonight. 100 salvage contracts. One gets paid.</p>
    </div>
    <div class="deploy-map-wrap"></div>
    <div class="deploy-foot">
      <div class="deploy-timer">AUTO-DROP <b>12</b></div>
      <button class="btn primary drop-btn" disabled>DROP</button>
    </div>`
  const wrap = root.querySelector('.deploy-map-wrap')!
  const size = Math.min(560, window.innerHeight - 240, window.innerWidth - 80)
  const base = renderIslandBase(size, true)
  base.className = 'deploy-map'
  wrap.appendChild(base)
  const marker = document.createElement('div')
  marker.className = 'drop-marker'
  marker.style.display = 'none'
  wrap.appendChild(marker)

  let chosen: { x: number; z: number } | null = null
  const btn = root.querySelector('.drop-btn') as HTMLButtonElement
  const timerEl = root.querySelector('.deploy-timer b')!

  base.addEventListener('click', (e) => {
    const rect = base.getBoundingClientRect()
    const mx = ((e.clientX - rect.left) / rect.width) * size
    const my = ((e.clientY - rect.top) / rect.height) * size
    let { x, z } = mapToWorld(mx, my, size)
    // Clamp into the island and off the water.
    const r = Math.hypot(x, z)
    if (r > ISLAND_RADIUS * 0.86) {
      x *= (ISLAND_RADIUS * 0.86) / r
      z *= (ISLAND_RADIUS * 0.86) / r
    }
    for (let i = 0; i < 30 && heightAt(x, z) < 1; i++) {
      x *= 0.94
      z *= 0.94
    }
    chosen = { x, z }
    const m = worldToMap(x, z, size)
    marker.style.display = 'block'
    marker.style.left = `${(m.mx / size) * 100}%`
    marker.style.top = `${(m.my / size) * 100}%`
    btn.disabled = false
    audio.ui('click')
  })

  let tLeft = 12
  const tick = window.setInterval(() => {
    tLeft--
    timerEl.textContent = String(tLeft)
    if (tLeft <= 0) go()
  }, 1000)

  const go = () => {
    window.clearInterval(tick)
    const p = chosen ?? randomDrop()
    root.remove()
    onDrop(p.x, p.z)
  }
  btn.addEventListener('click', () => {
    audio.ui('click')
    go()
  })
  return () => {
    window.clearInterval(tick)
    root.remove()
  }
}

function randomDrop(): { x: number; z: number } {
  for (let i = 0; i < 40; i++) {
    const ang = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * ISLAND_RADIUS * 0.8
    const x = Math.cos(ang) * r
    const z = Math.sin(ang) * r
    if (heightAt(x, z) > 1) return { x, z }
  }
  return { x: 0, z: 0 }
}

/** Death interstitial: spectate or bail to the results. */
export function deathScreen(
  parent: HTMLElement,
  info: { placement: number; killedBy: string | null; kills: number },
  onSpectate: () => void,
  onLeave: () => void,
): () => void {
  const root = overlay('death', parent)
  root.innerHTML = `
    <div class="death-card">
      <h2>SIGNAL LOST</h2>
      <div class="death-place">#${info.placement} <span>of 100</span></div>
      <p>${info.killedBy ? `Taken off the grid by <b>${info.killedBy}</b>` : 'Your light went out'} · ${info.kills} elimination${info.kills === 1 ? '' : 's'}</p>
      <div class="row">
        <button class="btn ghost spec-btn">SPECTATE</button>
        <button class="btn primary leave-btn">CONTRACT REPORT</button>
      </div>
    </div>`
  root.querySelector('.spec-btn')!.addEventListener('click', () => {
    audio.ui('click')
    root.remove()
    onSpectate()
  })
  root.querySelector('.leave-btn')!.addEventListener('click', () => {
    audio.ui('click')
    root.remove()
    onLeave()
  })
  return () => root.remove()
}

/** The end-of-match report: placement, rewards, XP bar, contracts. */
export function resultsScreen(
  parent: HTMLElement,
  result: MatchResult,
  rewards: MatchRewards,
  completed: ChallengeDef[],
  profile: Profile,
  onContinue: () => void,
): void {
  const root = overlay('results', parent)
  const won = result.won
  const lvl = profile.level
  const breakdown = rewards.breakdown
    .map((b) => `<div class="xp-row"><span>${b.label}</span><b>+${b.xp} XP</b></div>`)
    .join('')
  const contracts = completed.length
    ? `<div class="contracts"><h3>CONTRACTS COMPLETE</h3>${completed.map((c) => `<div class="xp-row"><span>${c.label}</span><b>+${c.coins} ⬡</b></div>`).join('')}</div>`
    : ''
  root.innerHTML = `
    <div class="results-card ${won ? 'won' : ''}">
      <h1>${won ? 'LAST LIGHT ON VANTERA' : 'CONTRACT TERMINATED'}</h1>
      <div class="place-line">${won ? 'VICTORY' : `#${result.outcome.placement} of ${result.outcome.players}`}</div>
      <div class="stats-line">
        <span><b>${result.outcome.kills}</b> elims</span>
        <span><b>${Math.floor(result.outcome.survivalSeconds / 60)}:${String(Math.floor(result.outcome.survivalSeconds % 60)).padStart(2, '0')}</b> survived</span>
        <span><b>${result.metrics.blackoutKills}</b> blackout elims</span>
        <span><b>${result.outcome.cratesOpened}</b> crates</span>
      </div>
      ${won ? '' : result.winnerName ? `<p class="winner-line">Winner: <b>${result.winnerName}</b></p>` : '<p class="winner-line">Contract abandoned — the grid never chose a last light.</p>'}
      <div class="xp-block">${breakdown}</div>
      <div class="coin-line">+${rewards.coins} ⬡ SALVAGE</div>
      ${contracts}
      <div class="level-block">
        <div class="level-label">LEVEL ${lvl.level}</div>
        <div class="level-bar"><div class="level-fill" style="width:${(lvl.into / lvl.needed) * 100}%"></div></div>
      </div>
      <button class="btn primary continue-btn">RETURN TO THE DEPOT</button>
    </div>`
  root.querySelector('.continue-btn')!.addEventListener('click', () => {
    audio.ui('click')
    root.remove()
    onContinue()
  })
}

/** Esc pause. Returns a closer; callbacks fire at most once. */
export function pauseScreen(
  parent: HTMLElement,
  profile: Profile,
  onResume: () => void,
  onAbandon: () => void,
): () => void {
  const root = overlay('pause', parent)
  const s = profile.settings
  root.innerHTML = `
    <div class="pause-card">
      <h2>PAUSED — GRID HOLDS FOR NOBODY</h2>
      <label>Sensitivity <input type="range" min="0.3" max="2.5" step="0.05" value="${s.sensitivity}" class="sens"><span class="sens-v">${s.sensitivity.toFixed(2)}</span></label>
      <label>Field of view <input type="range" min="60" max="110" step="1" value="${s.fov}" class="fov"><span class="fov-v">${s.fov}</span></label>
      <label>Volume <input type="range" min="0" max="1" step="0.05" value="${s.volume}" class="vol"><span class="vol-v">${Math.round(s.volume * 100)}%</span></label>
      <div class="row">
        <button class="btn primary resume-btn">RESUME</button>
        <button class="btn danger abandon-btn">ABANDON CONTRACT</button>
      </div>
    </div>`
  const sens = root.querySelector('.sens') as HTMLInputElement
  sens.addEventListener('input', () => {
    profile.updateSettings({ sensitivity: Number(sens.value) })
    root.querySelector('.sens-v')!.textContent = Number(sens.value).toFixed(2)
  })
  const fov = root.querySelector('.fov') as HTMLInputElement
  fov.addEventListener('input', () => {
    profile.updateSettings({ fov: Number(fov.value) })
    root.querySelector('.fov-v')!.textContent = fov.value
  })
  const vol = root.querySelector('.vol') as HTMLInputElement
  vol.addEventListener('input', () => {
    profile.updateSettings({ volume: Number(vol.value) })
    audio.setVolume(Number(vol.value))
    root.querySelector('.vol-v')!.textContent = `${Math.round(Number(vol.value) * 100)}%`
  })
  let done = false
  root.querySelector('.resume-btn')!.addEventListener('click', () => {
    if (done) return
    done = true
    root.remove()
    onResume()
  })
  root.querySelector('.abandon-btn')!.addEventListener('click', () => {
    if (done) return
    done = true
    root.remove()
    onAbandon()
  })
  return () => {
    if (!done) {
      done = true
      root.remove()
    }
  }
}
