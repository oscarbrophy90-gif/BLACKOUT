import { on } from '../core/events.ts'
import type { HudState } from '../game/match.ts'
import type { ZoneController } from '../game/zone.ts'
import { renderIslandBase, worldToMap } from './map.ts'

// The in-match HUD. Built once per match from plain DOM; text nodes update
// only when values change, the minimap redraws at 8 Hz.

function el(tag: string, cls: string, parent: HTMLElement, text = ''): HTMLElement {
  const e = document.createElement(tag)
  e.className = cls
  if (text) e.textContent = text
  parent.appendChild(e)
  return e
}

export class Hud {
  private root: HTMLElement
  private els: Record<string, HTMLElement> = {}
  private minimapCtx: CanvasRenderingContext2D
  private minimapBase: HTMLCanvasElement
  private compassCtx: CanvasRenderingContext2D
  private minimapT = 0
  private lastText: Record<string, string> = {}
  private unsubs: (() => void)[] = []
  private supplyDrops: { x: number; z: number }[] = []

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud', parent)
    const r = this.root

    // Center: crosshair + hitmarker + prompts.
    const cross = el('div', 'crosshair', r)
    for (const d of ['t', 'b', 'l', 'r']) el('div', `xh xh-${d}`, cross)
    el('div', 'xh-dot', cross)
    this.els.cross = cross
    this.els.hitmarker = el('div', 'hitmarker', r)
    this.els.interact = el('div', 'interact', r)
    this.els.channel = el('div', 'channel', r)
    this.els.channelFill = el('div', 'channel-fill', this.els.channel)
    this.els.channelLabel = el('div', 'channel-label', this.els.channel)
    this.els.pickupToast = el('div', 'pickup-toast', r)
    this.els.damageRing = el('div', 'damage-ring', r)
    this.els.vignette = el('div', 'vignette', r)
    this.els.darkVeil = el('div', 'dark-veil', r)
    this.els.warnBanner = el('div', 'warn-banner', r, 'GRID FAILURE IMMINENT')
    this.els.toast = el('div', 'big-toast', r)
    this.els.spectate = el('div', 'spectate-banner', r)

    // Top-center: alive / kills / blackout clock.
    const top = el('div', 'top-bar', r)
    const aliveBox = el('div', 'stat-box', top)
    this.els.alive = el('div', 'stat-num', aliveBox)
    el('div', 'stat-label', aliveBox, 'ALIVE')
    const clockBox = el('div', 'stat-box clock-box', top)
    this.els.clock = el('div', 'stat-num clock', clockBox)
    this.els.clockLabel = el('div', 'stat-label', clockBox, 'NEXT BLACKOUT')
    const killBox = el('div', 'stat-box', top)
    this.els.kills = el('div', 'stat-num', killBox)
    el('div', 'stat-label', killBox, 'ELIMS')

    // Compass.
    const compass = document.createElement('canvas')
    compass.className = 'compass'
    compass.width = 460
    compass.height = 26
    r.appendChild(compass)
    this.compassCtx = compass.getContext('2d')!

    // Top-right: minimap + killfeed.
    const mapWrap = el('div', 'minimap-wrap', r)
    const minimap = document.createElement('canvas')
    minimap.width = 200
    minimap.height = 200
    minimap.className = 'minimap'
    mapWrap.appendChild(minimap)
    this.minimapCtx = minimap.getContext('2d')!
    this.minimapBase = renderIslandBase(200, false)
    this.els.zoneTimer = el('div', 'zone-timer', mapWrap)
    this.els.killfeed = el('div', 'killfeed', r)

    // Bottom-left: vitals.
    const vitals = el('div', 'vitals', r)
    const hpRow = el('div', 'bar-row', vitals)
    this.els.hpBar = el('div', 'bar hp', hpRow)
    this.els.hpFill = el('div', 'bar-fill hp-fill', this.els.hpBar)
    this.els.hpNum = el('div', 'bar-num', hpRow)
    const arRow = el('div', 'bar-row', vitals)
    this.els.arBar = el('div', 'bar armor', arRow)
    this.els.arFill = el('div', 'bar-fill armor-fill', this.els.arBar)
    this.els.arNum = el('div', 'bar-num', arRow)
    this.els.healChips = el('div', 'heal-chips', vitals)

    // Bottom-right: weapon.
    const wep = el('div', 'weapon-box', r)
    this.els.weaponName = el('div', 'weapon-name', wep)
    const ammoRow = el('div', 'ammo-row', wep)
    this.els.mag = el('span', 'ammo-mag', ammoRow)
    this.els.reserve = el('span', 'ammo-reserve', ammoRow)
    this.els.slots = el('div', 'slots', wep)

    this.wireEvents()
  }

  private wireEvents(): void {
    this.unsubs.push(on('kill', (k) => {
      const row = document.createElement('div')
      row.className = 'kf-row' + (k.killerIsPlayer ? ' kf-me' : '') + (k.inBlackout ? ' kf-dark' : '')
      row.textContent = `${k.killerName} ⚡ ${k.victimName}`
      this.els.killfeed.prepend(row)
      window.setTimeout(() => row.remove(), 6000)
      while (this.els.killfeed.children.length > 6) this.els.killfeed.lastChild?.remove()
    }))
    this.unsubs.push(on('hitmarker', ({ killed, headshot }) => {
      const h = this.els.hitmarker
      h.className = 'hitmarker show' + (killed ? ' kill' : '') + (headshot ? ' head' : '')
      window.setTimeout(() => h.classList.remove('show'), 120)
    }))
    this.unsubs.push(on('playerDamaged', ({ angle }) => {
      const arc = document.createElement('div')
      arc.className = 'dmg-arc'
      arc.style.transform = `rotate(${(-angle * 180) / Math.PI}deg)`
      this.els.damageRing.appendChild(arc)
      window.setTimeout(() => arc.remove(), 900)
    }))
    this.unsubs.push(on('pickup', ({ label, rarityColor }) => {
      const t = this.els.pickupToast
      t.textContent = label
      t.style.color = rarityColor
      t.classList.add('show')
      window.setTimeout(() => t.classList.remove('show'), 1400)
    }))
    this.unsubs.push(on('toast', ({ text, strong }) => {
      const t = this.els.toast
      t.textContent = text
      t.className = 'big-toast show' + (strong ? ' strong' : '')
      window.setTimeout(() => t.classList.remove('show'), 3200)
    }))
    this.unsubs.push(on('supplyDrop', ({ x, z }) => {
      this.supplyDrops.push({ x, z })
    }))
    this.unsubs.push(on('crateOpened', () => undefined))
  }

  private setText(key: string, elem: HTMLElement, text: string): void {
    if (this.lastText[key] !== text) {
      this.lastText[key] = text
      elem.textContent = text
    }
  }

  update(s: HudState, zone: ReturnType<ZoneController['minimap']>, dt: number): void {
    // Vitals.
    this.els.hpFill.style.width = `${s.health}%`
    this.els.arFill.style.width = `${s.armor}%`
    this.setText('hp', this.els.hpNum, String(Math.ceil(s.health)))
    this.setText('ar', this.els.arNum, String(Math.ceil(s.armor)))
    this.els.vignette.style.opacity = s.health < 35 ? String(0.75 - (s.health / 35) * 0.6) : '0'

    // Weapon.
    this.setText('wn', this.els.weaponName, s.weaponName)
    this.setText('mag', this.els.mag, s.mag === null ? '—' : String(s.mag))
    this.setText('res', this.els.reserve, s.reserve === null ? '' : ` / ${s.reserve}`)
    this.els.weaponName.style.opacity = s.reloading > 0 ? '0.5' : '1'
    const slotsHtml = s.slots
      .map((sl, i) => `<span class="slot${sl.active ? ' on' : ''}" style="border-color:${sl.rarityColor}">${i + 1} ${sl.name}</span>`)
      .join('') + `<span class="slot${s.mag === null ? ' on' : ''}">3 MAUL</span>`
    if (this.lastText.slots !== slotsHtml) {
      this.lastText.slots = slotsHtml
      this.els.slots.innerHTML = slotsHtml
    }
    const healsHtml = `<span class="chip">4 ⊕ ${s.heals[0].count + s.heals[1].count}</span><span class="chip chip-armor">5 ⛨ ${s.heals[2].count + s.heals[3].count}</span>`
    if (this.lastText.heals !== healsHtml) {
      this.lastText.heals = healsHtml
      this.els.healChips.innerHTML = healsHtml
    }

    // Top bar.
    this.setText('alive', this.els.alive, String(s.alive))
    this.setText('kills', this.els.kills, String(s.kills))
    this.setText('clock', this.els.clock, s.blackoutClock)
    this.setText('clockL', this.els.clockLabel, s.dark ? 'BLACKOUT' : s.warn ? 'GRID FAILING' : 'NEXT BLACKOUT')
    this.els.clock.classList.toggle('dark', s.dark)
    this.els.warnBanner.classList.toggle('show', s.warn)
    this.els.darkVeil.classList.toggle('show', s.dark)

    // Crosshair spread.
    const gap = 6 + s.spreadDeg * 9
    this.els.cross.style.setProperty('--gap', `${gap}px`)
    this.els.cross.style.opacity = s.ads ? '0.35' : '1'

    // Interact + channel.
    if (s.interact) {
      this.els.interact.innerHTML = `<b>E</b> ${s.interact.label}`
      this.els.interact.style.borderColor = s.interact.color
      this.els.interact.classList.add('show')
    } else this.els.interact.classList.remove('show')
    if (s.channel) {
      this.els.channel.classList.add('show')
      this.els.channelFill.style.width = `${s.channel.frac * 100}%`
      this.setText('chl', this.els.channelLabel, s.channel.label)
    } else this.els.channel.classList.remove('show')

    // Spectate.
    if (s.spectating !== null) {
      this.els.spectate.innerHTML = `SPECTATING <b>${s.spectating}</b> — click to switch`
      this.els.spectate.classList.add('show')
    } else this.els.spectate.classList.remove('show')

    // Zone timer text.
    if (zone.next && s.zoneSeconds > 0) {
      this.setText('zt', this.els.zoneTimer, `COLLAPSE ${Math.floor(s.zoneSeconds / 60)}:${String(Math.floor(s.zoneSeconds % 60)).padStart(2, '0')}`)
      this.els.zoneTimer.classList.remove('closing')
    } else if (s.zoneShrinking) {
      this.setText('zt', this.els.zoneTimer, 'DEADGRID ADVANCING')
      this.els.zoneTimer.classList.add('closing')
    } else {
      this.setText('zt', this.els.zoneTimer, '')
    }

    // Compass.
    this.drawCompass(s.yaw)

    // Minimap at 8 Hz.
    this.minimapT -= dt
    if (this.minimapT <= 0) {
      this.minimapT = 0.125
      this.drawMinimap(s, zone)
    }
  }

  private drawCompass(yaw: number): void {
    const g = this.compassCtx
    const w = g.canvas.width
    const h = g.canvas.height
    g.clearRect(0, 0, w, h)
    g.fillStyle = 'rgba(10,12,20,0.45)'
    g.fillRect(0, 0, w, h)
    const heading = ((-yaw * 180) / Math.PI + 360) % 360
    g.font = '600 12px system-ui, sans-serif'
    g.textAlign = 'center'
    const pxPerDeg = 3.2
    // Walk the fixed marks and place each relative to the (float) heading.
    const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    for (let mark = 0; mark < 360; mark += 15) {
      let d = mark - heading
      if (d > 180) d -= 360
      if (d < -180) d += 360
      if (Math.abs(d) > 80) continue
      const x = w / 2 + d * pxPerDeg
      if (mark % 45 === 0) {
        g.fillStyle = mark % 90 === 0 ? '#ffc247' : '#9aa3ad'
        g.fillText(names[mark / 45], x, 17)
      } else {
        g.fillStyle = 'rgba(154,163,173,0.5)'
        g.fillRect(x, 8, 1, 8)
      }
    }
    g.fillStyle = '#39f0e0'
    g.fillRect(w / 2 - 1, 2, 2, 8)
  }

  private drawMinimap(s: HudState, zone: ReturnType<ZoneController['minimap']>): void {
    const g = this.minimapCtx
    const size = 200
    g.clearRect(0, 0, size, size)
    g.globalAlpha = s.dark ? 0.55 : 1
    g.drawImage(this.minimapBase, 0, 0)
    g.globalAlpha = 1

    // Zone circles.
    const cur = worldToMap(zone.cur.center.x, zone.cur.center.z, size)
    g.beginPath()
    g.arc(cur.mx, cur.my, (zone.cur.radius / 2000) * size, 0, Math.PI * 2)
    g.strokeStyle = 'rgba(255,255,255,0.75)'
    g.lineWidth = 1.5
    g.stroke()
    if (zone.next) {
      const nx = worldToMap(zone.next.center.x, zone.next.center.z, size)
      g.beginPath()
      g.arc(nx.mx, nx.my, (zone.next.radius / 2000) * size, 0, Math.PI * 2)
      g.strokeStyle = 'rgba(57,240,224,0.9)'
      g.lineWidth = 1.2
      g.stroke()
    }
    // Supply drops.
    g.fillStyle = '#ffc247'
    for (const d of this.supplyDrops) {
      const p = worldToMap(d.x, d.z, size)
      g.fillRect(p.mx - 3, p.my - 3, 6, 6)
    }
    // Player arrow.
    const p = worldToMap(s.playerX, s.playerZ, size)
    g.save()
    g.translate(p.mx, p.my)
    g.rotate(-s.yaw)
    g.beginPath()
    g.moveTo(0, -6)
    g.lineTo(4, 5)
    g.lineTo(-4, 5)
    g.closePath()
    g.fillStyle = '#ffffff'
    g.fill()
    g.restore()
  }

  dispose(): void {
    for (const u of this.unsubs) u()
    this.root.remove()
  }
}
