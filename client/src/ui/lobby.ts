import { WEAPON_BY_ID } from '@blackout/shared'
import { audio } from '../core/audio.ts'
import type { Profile } from '../meta/data.ts'
import { esc } from './cards.ts'
import { LoadoutPanel } from './loadout.ts'
import { Preview3D } from './preview.ts'
import { ShopPanel } from './shop.ts'

// The depot between contracts: play, loadout, shop, contracts (challenges),
// profile, settings. Plain DOM; every panel rerenders from Profile state.

type Panel = 'main' | 'loadout' | 'shop' | 'contracts' | 'profile' | 'settings'

export class Lobby {
  private root: HTMLElement
  private profile: Profile
  private onPlay: () => void
  private panel: Panel = 'main'
  /** One 3D viewport shared by the depot, the loadout and the shop. */
  private preview = new Preview3D()
  private shop: ShopPanel
  private loadout: LoadoutPanel

  constructor(parent: HTMLElement, profile: Profile, onPlay: () => void) {
    this.profile = profile
    this.onPlay = onPlay
    this.root = document.createElement('div')
    this.root.className = 'screen lobby'
    parent.appendChild(this.root)
    this.shop = new ShopPanel(this.root, profile, this.preview, () => this.nav('main'), () => this.coinChips())
    this.loadout = new LoadoutPanel(this.root, profile, this.preview, () => this.nav('main'), () => this.header())
    this.render()
  }

  show(): void {
    this.root.style.display = ''
    this.panel = 'main'
    this.render()
  }

  hide(): void {
    this.shop.dispose()
    this.preview.unmount()
    this.root.style.display = 'none'
  }

  dispose(): void {
    this.shop.dispose()
    this.preview.dispose()
    this.root.remove()
  }

  private nav(to: Panel): void {
    audio.ui('click')
    if (this.panel === 'shop') this.shop.dispose()
    this.panel = to
    this.render()
  }

  private characterPreview(): string {
    const suit = this.profile.suit()
    const worn = this.profile.accessories()
    return `
      <div class="char-preview">
        <div class="preview-host depot-preview"></div>
        <div class="char-name">${esc(this.profile.name)}</div>
        <div class="char-suit">${suit.name}${worn.length ? ` · ${worn.map((a) => a.name).join(', ')}` : ''}</div>
        <div class="char-suit">Celebration: ${this.profile.celebration().name} · Emote: ${this.profile.emote().name}</div>
      </div>`
  }

  private coinChips(): string {
    const lvl = this.profile.level
    return `
      <div class="level-chip">LVL ${lvl.level}<div class="level-mini"><div style="width:${(lvl.into / lvl.needed) * 100}%"></div></div></div>
      <div class="coin-chip">⬡ ${this.profile.coins.toLocaleString('en-US')}</div>`
  }

  private header(): string {
    return `
      <div class="lobby-head">
        <div class="logo">BLACK<span>OUT</span></div>
        <div class="head-right">${this.coinChips()}</div>
      </div>`
  }

  private render(): void {
    switch (this.panel) {
      case 'main':
        this.renderMain()
        break
      case 'loadout':
        this.loadout.render()
        break
      case 'shop':
        this.shop.render()
        break
      case 'contracts':
        this.renderContracts()
        break
      case 'profile':
        this.renderProfile()
        break
      case 'settings':
        this.renderSettings()
        break
    }
  }

  private backBtn(): void {
    this.root.querySelector('.back-btn')?.addEventListener('click', () => this.nav('main'))
  }

  private renderMain(): void {
    this.root.innerHTML = `
      ${this.header()}
      <div class="lobby-body">
        ${this.characterPreview()}
        <div class="menu">
          <button class="btn primary play-btn">PLAY<span>Last Standing — Solo · 100 Linewalkers</span></button>
          <button class="btn menu-btn" data-p="loadout">LOADOUT</button>
          <button class="btn menu-btn" data-p="shop">SHOP</button>
          <button class="btn menu-btn" data-p="contracts">CONTRACTS</button>
          <button class="btn menu-btn" data-p="profile">PROFILE</button>
          <button class="btn menu-btn" data-p="settings">SETTINGS</button>
        </div>
      </div>
      <div class="lobby-foot">Vantera's grid dies tonight. Be the last light. · WASD move · SHIFT sprint · C slide · E loot · 4/5 heal · B emote</div>`
    this.preview.mount(this.root.querySelector('.depot-preview') as HTMLElement)
    this.preview.setAccent('#39f0e0')
    this.preview.showCharacter({ suit: this.profile.suit(), accessories: this.profile.accessories().map((a) => a.acc), anim: null })
    this.root.querySelector('.play-btn')!.addEventListener('click', () => {
      audio.ensure()
      audio.ui('click')
      this.onPlay()
    })
    this.root.querySelectorAll('.menu-btn').forEach((b) =>
      b.addEventListener('click', () => this.nav((b as HTMLElement).dataset.p as Panel)),
    )
  }

  private renderContracts(): void {
    const { daily, weekly } = this.profile.challenges()
    const row = (c: (typeof daily)[number]) => `
      <div class="contract ${c.done ? 'done' : ''}">
        <div class="contract-label">${c.def.label}</div>
        <div class="contract-bar"><div style="width:${(c.progress / c.def.target) * 100}%"></div></div>
        <div class="contract-nums">${Math.floor(c.progress)}/${c.def.target} · +${c.def.xp} XP · +${c.def.coins} ⬡</div>
      </div>`
    this.root.innerHTML = `
      ${this.header()}
      <div class="panel">
        <div class="panel-head"><button class="btn ghost back-btn">← DEPOT</button><h2>CONTRACTS</h2></div>
        <h3>TODAY</h3>${daily.map(row).join('')}
        <h3>THIS WEEK</h3>${weekly.map(row).join('')}
      </div>`
    this.backBtn()
  }

  private renderProfile(): void {
    const s = this.profile.stats
    const fav = this.profile.favoriteWeapon()
    const favName = fav ? WEAPON_BY_ID.get(fav)?.name ?? '—' : '—'
    const winRate = s.matches > 0 ? Math.round((s.wins / s.matches) * 100) : 0
    this.root.innerHTML = `
      ${this.header()}
      <div class="panel">
        <div class="panel-head"><button class="btn ghost back-btn">← DEPOT</button><h2>PROFILE</h2></div>
        <label class="name-edit">Callsign <input maxlength="20" class="name-input" value="${esc(this.profile.name)}"></label>
        <div class="stat-grid">
          <div class="stat"><b>${s.matches}</b>contracts</div>
          <div class="stat"><b>${s.wins}</b>wins</div>
          <div class="stat"><b>${winRate}%</b>win rate</div>
          <div class="stat"><b>${s.kills}</b>eliminations</div>
          <div class="stat"><b>${s.top10s}</b>top 10s</div>
          <div class="stat"><b>${s.bestPlacement === 0 ? '—' : `#${s.bestPlacement}`}</b>best finish</div>
          <div class="stat"><b>${s.blackoutKills}</b>blackout elims</div>
          <div class="stat"><b>${s.cratesOpened}</b>crates opened</div>
          <div class="stat"><b>${(s.distance / 1000).toFixed(1)}km</b>travelled</div>
          <div class="stat"><b>${favName}</b>favourite weapon</div>
          <div class="stat"><b>${s.totalXp}</b>total XP</div>
        </div>
      </div>`
    this.backBtn()
    const input = this.root.querySelector('.name-input') as HTMLInputElement
    input.addEventListener('change', () => {
      this.profile.setName(input.value)
      audio.ui('equip')
    })
  }

  private renderSettings(): void {
    const s = this.profile.settings
    this.root.innerHTML = `
      ${this.header()}
      <div class="panel">
        <div class="panel-head"><button class="btn ghost back-btn">← DEPOT</button><h2>SETTINGS</h2></div>
        <label>Sensitivity <input type="range" min="0.3" max="2.5" step="0.05" value="${s.sensitivity}" data-k="sensitivity"><span>${s.sensitivity.toFixed(2)}</span></label>
        <label>Field of view <input type="range" min="60" max="110" step="1" value="${s.fov}" data-k="fov"><span>${s.fov}</span></label>
        <label>Volume <input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-k="volume"><span>${Math.round(s.volume * 100)}%</span></label>
        <label>Invert Y <input type="checkbox" ${s.invertY ? 'checked' : ''} data-k="invertY"></label>
        <label>Quality
          <select data-k="quality">
            <option value="high" ${s.quality === 'high' ? 'selected' : ''}>High</option>
            <option value="medium" ${s.quality === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="low" ${s.quality === 'low' ? 'selected' : ''}>Low</option>
          </select>
        </label>
      </div>`
    this.backBtn()
    this.root.querySelectorAll('[data-k]').forEach((elm) => {
      elm.addEventListener('input', () => {
        const k = (elm as HTMLElement).dataset.k!
        const input = elm as HTMLInputElement
        if (k === 'invertY') this.profile.updateSettings({ invertY: input.checked })
        else if (k === 'quality') this.profile.updateSettings({ quality: input.value as 'high' | 'medium' | 'low' })
        else this.profile.updateSettings({ [k]: Number(input.value) })
        if (k === 'volume') audio.setVolume(Number(input.value))
        const span = elm.parentElement?.querySelector('span')
        if (span && k !== 'invertY' && k !== 'quality') {
          span.textContent = k === 'volume' ? `${Math.round(Number(input.value) * 100)}%` : k === 'fov' ? input.value : Number(input.value).toFixed(2)
        }
      })
    })
  }
}
