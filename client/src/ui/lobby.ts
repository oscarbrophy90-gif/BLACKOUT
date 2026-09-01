import {
  CHARMS, EMOTES, RARITY_CERT, RARITY_COLOR, SUITS, WEAPON_BY_ID,
  WEAPON_SKINS, shopForDay,
} from '@blackout/shared'
import type { Rarity } from '@blackout/shared'
import { audio } from '../core/audio.ts'
import type { Profile } from '../meta/data.ts'

// The depot between contracts: play, loadout, shop, contracts (challenges),
// profile, settings. Plain DOM; every panel rerenders from Profile state.

type Panel = 'main' | 'loadout' | 'shop' | 'contracts' | 'profile' | 'settings'

export class Lobby {
  private root: HTMLElement
  private profile: Profile
  private onPlay: () => void
  private panel: Panel = 'main'

  constructor(parent: HTMLElement, profile: Profile, onPlay: () => void) {
    this.profile = profile
    this.onPlay = onPlay
    this.root = document.createElement('div')
    this.root.className = 'screen lobby'
    parent.appendChild(this.root)
    this.render()
  }

  show(): void {
    this.root.style.display = ''
    this.panel = 'main'
    this.render()
  }

  hide(): void {
    this.root.style.display = 'none'
  }

  dispose(): void {
    this.root.remove()
  }

  private nav(to: Panel): void {
    audio.ui('click')
    this.panel = to
    this.render()
  }

  private rarityBadge(r: Rarity): string {
    return `<span class="badge" style="background:${RARITY_COLOR[r]}22;color:${RARITY_COLOR[r]};border-color:${RARITY_COLOR[r]}55">${RARITY_CERT[r].toUpperCase()}</span>`
  }

  private characterPreview(): string {
    const suit = SUITS.find((s) => s.id === this.profile.equipped.suit) ?? SUITS[0]
    const [body, trim, visor] = suit.colors
    return `
      <div class="char-preview">
        <div class="char">
          <div class="char-head" style="background:${trim}"><div class="char-visor" style="background:${visor};box-shadow:0 0 12px ${visor}"></div></div>
          <div class="char-torso" style="background:${body};border-color:${trim}"></div>
          <div class="char-arm l" style="background:${body}"></div>
          <div class="char-arm r" style="background:${body}"></div>
          <div class="char-leg l" style="background:${trim}"></div>
          <div class="char-leg r" style="background:${trim}"></div>
        </div>
        <div class="char-name">${this.profile.name}</div>
        <div class="char-suit">${suit.name}</div>
      </div>`
  }

  private header(): string {
    const lvl = this.profile.level
    return `
      <div class="lobby-head">
        <div class="logo">BLACK<span>OUT</span></div>
        <div class="head-right">
          <div class="level-chip">LVL ${lvl.level}<div class="level-mini"><div style="width:${(lvl.into / lvl.needed) * 100}%"></div></div></div>
          <div class="coin-chip">⬡ ${this.profile.coins}</div>
        </div>
      </div>`
  }

  private render(): void {
    switch (this.panel) {
      case 'main':
        this.renderMain()
        break
      case 'loadout':
        this.renderLoadout()
        break
      case 'shop':
        this.renderShop()
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
      <div class="lobby-foot">Vantera's grid dies tonight. Be the last light. · WASD move · SHIFT sprint · C slide · E loot · 4/5 heal</div>`
    this.root.querySelector('.play-btn')!.addEventListener('click', () => {
      audio.ensure()
      audio.ui('click')
      this.onPlay()
    })
    this.root.querySelectorAll('.menu-btn').forEach((b) =>
      b.addEventListener('click', () => this.nav((b as HTMLElement).dataset.p as Panel)),
    )
  }

  private grid<T extends { id: string; name: string; rarity: Rarity }>(
    items: readonly T[],
    equippedId: string | null,
    kind: 'weaponSkin' | 'suit' | 'charm' | 'emote',
    swatch: (item: T) => string,
  ): string {
    return items
      .map((item) => {
        const owned = this.profile.owns(item.id)
        const equipped = equippedId === item.id
        return `
        <div class="card ${owned ? '' : 'locked'} ${equipped ? 'equipped' : ''}" data-kind="${kind}" data-id="${item.id}">
          ${swatch(item)}
          <div class="card-name">${item.name}</div>
          ${this.rarityBadge(item.rarity)}
          <div class="card-state">${equipped ? 'EQUIPPED' : owned ? 'TAP TO EQUIP' : 'IN SHOP ROTATION'}</div>
        </div>`
      })
      .join('')
  }

  private renderLoadout(): void {
    const eq = this.profile.equipped
    this.root.innerHTML = `
      ${this.header()}
      <div class="panel">
        <div class="panel-head"><button class="btn ghost back-btn">← DEPOT</button><h2>LOADOUT</h2></div>
        <p class="panel-note">Cosmetics only — every gun on Vantera is found, never brought.</p>
        <h3>WEAPON SKIN</h3><div class="cards">${this.grid(WEAPON_SKINS, eq.weaponSkin, 'weaponSkin', (s) => `<div class="swatch"><i style="background:${s.colors[0]}"></i><i style="background:${s.colors[1]}"></i><i style="background:${s.colors[2]};box-shadow:0 0 10px ${s.colors[2]}"></i></div>`)}</div>
        <h3>SUIT</h3><div class="cards">${this.grid(SUITS, eq.suit, 'suit', (s) => `<div class="swatch"><i style="background:${s.colors[0]}"></i><i style="background:${s.colors[1]}"></i><i style="background:${s.colors[2]};box-shadow:0 0 10px ${s.colors[2]}"></i></div>`)}</div>
        <h3>CHARM</h3><div class="cards">${this.grid(CHARMS, eq.charm, 'charm', (c) => `<div class="swatch"><i style="background:${c.color};box-shadow:0 0 10px ${c.color}"></i></div>`)}</div>
        <h3>EMOTE</h3><div class="cards">${this.grid(EMOTES, eq.emote, 'emote', () => `<div class="swatch"><i style="background:#7d6bff"></i></div>`)}</div>
      </div>`
    this.backBtn()
    this.root.querySelectorAll('.card:not(.locked)').forEach((c) =>
      c.addEventListener('click', () => {
        const kindStr = (c as HTMLElement).dataset.kind!
        const id = (c as HTMLElement).dataset.id!
        const kind = kindStr as 'weaponSkin' | 'suit' | 'charm' | 'emote'
        if (kind === 'charm' && this.profile.equipped.charm === id) this.profile.equip('charm', null)
        else this.profile.equip(kind, id)
        audio.ui('equip')
        this.render()
      }),
    )
  }

  private renderShop(): void {
    const day = Math.floor(Date.now() / 86_400_000)
    const entries = shopForDay(day)
    const hoursLeft = 24 - new Date().getUTCHours()
    this.root.innerHTML = `
      ${this.header()}
      <div class="panel">
        <div class="panel-head"><button class="btn ghost back-btn">← DEPOT</button><h2>SHOP</h2><span class="rotate-note">rotates in ~${hoursLeft}h</span></div>
        <p class="panel-note">Salvage (⬡) is earned by playing. Cosmetics never touch gameplay.</p>
        <div class="cards shop-cards">
          ${entries
            .map((e) => {
              const owned = this.profile.owns(e.id)
              const afford = this.profile.coins >= e.price
              return `
              <div class="card shop-card ${owned ? 'owned' : afford ? '' : 'poor'}" data-id="${e.id}">
                <div class="card-kind">${e.kind === 'weaponSkin' ? 'WEAPON SKIN' : e.kind.toUpperCase()}</div>
                <div class="card-name">${e.name}</div>
                ${this.rarityBadge(e.rarity)}
                <div class="price">${owned ? 'OWNED' : `⬡ ${e.price}`}</div>
              </div>`
            })
            .join('')}
        </div>
      </div>`
    this.backBtn()
    this.root.querySelectorAll('.shop-card:not(.owned)').forEach((c) =>
      c.addEventListener('click', () => {
        const id = (c as HTMLElement).dataset.id!
        if (this.profile.buy(id)) {
          audio.ui('buy')
        } else {
          audio.ui('deny')
        }
        this.render()
      }),
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
        <label class="name-edit">Callsign <input maxlength="20" class="name-input" value="${this.profile.name}"></label>
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
