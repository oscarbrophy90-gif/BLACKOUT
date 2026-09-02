import { CATEGORY_LABEL, RARITY_COLOR, SUITS, WEAPON_CLASSES, WEAPON_CLASS_LABEL } from '@blackout/shared'
import type { CatalogItem, Category, SuitDef, WeaponClass } from '@blackout/shared'
import { audio } from '../core/audio.ts'
import type { Profile } from '../meta/data.ts'
import { esc, itemCardHtml, rarityLine } from './cards.ts'
import type { Preview3D } from './preview.ts'

// The loadout: everything the account owns, by category, with the same
// 3D preview as the shop and EQUIP / UNEQUIP.

type Tab = 'suit' | Category

const TABS: { id: Tab; label: string }[] = [
  { id: 'suit', label: 'SUITS' },
  { id: 'celebration', label: 'WIN CELEBRATIONS' },
  { id: 'emote', label: 'EMOTES' },
  { id: 'weaponSkin', label: 'WEAPON SKINS' },
  { id: 'accessory', label: 'ACCESSORIES' },
]

export class LoadoutPanel {
  private root: HTMLElement
  private profile: Profile
  private preview: Preview3D
  private onBack: () => void
  private header: () => string
  private tab: Tab = 'suit'
  private selectedId: string | null = null
  private previewClass: WeaponClass = 'ar'

  constructor(root: HTMLElement, profile: Profile, preview: Preview3D, onBack: () => void, header: () => string) {
    this.root = root
    this.profile = profile
    this.preview = preview
    this.onBack = onBack
    this.header = header
  }

  private ownedItems(cat: Category): CatalogItem[] {
    return this.profile.ownedItems().filter((i) => i.category === cat)
  }

  render(): void {
    this.root.innerHTML = `
      ${this.header()}
      <div class="panel shop-panel">
        <div class="panel-head"><button class="btn ghost back-btn">← DEPOT</button><h2>LOADOUT</h2><span class="rotate-note">Cosmetics only — every gun on Vantera is found, never brought.</span></div>
        <div class="shop-tabs">
          ${TABS.map((t) => `<button class="tab ${t.id === this.tab ? 'on' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
        </div>
        <div class="shop-body">
          <div class="shop-grid-wrap"><div class="shop-grid enter"></div></div>
          <aside class="shop-side">
            <div class="preview-host"></div>
            <div class="shop-detail"></div>
          </aside>
        </div>
      </div>`
    this.root.querySelector('.back-btn')!.addEventListener('click', () => this.onBack())
    this.root.querySelectorAll('.tab').forEach((t) =>
      t.addEventListener('click', () => {
        const tab = (t as HTMLElement).dataset.tab as Tab
        if (tab === this.tab) return
        audio.ui('click')
        this.tab = tab
        this.selectedId = null
        this.root.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t))
        this.renderGrid()
      }),
    )
    this.preview.mount(this.root.querySelector('.preview-host') as HTMLElement)
    this.renderGrid()
  }

  private suitCard(s: SuitDef): string {
    const equipped = this.profile.equipped.suit === s.id
    const [a, b, c] = s.colors
    return `
      <div class="item-card r-${s.rarity} owned ${equipped ? 'equipped' : ''} ${this.selectedId === s.id ? 'selected' : ''}" data-id="${s.id}" style="--rc:${RARITY_COLOR[s.rarity]}">
        <div class="card-fx"></div>
        <div class="thumb thumb-skin" style="background:linear-gradient(120deg,${a} 0 55%,${b} 55% 85%,${c} 85%)"><i style="background:${c};box-shadow:0 0 10px ${c}"></i><span>suit</span></div>
        <div class="card-name">${esc(s.name)}</div>
        <div class="card-rarity">${rarityLine(s.rarity)}</div>
        <div class="card-price">${equipped ? 'EQUIPPED' : 'OWNED'}</div>
      </div>`
  }

  private renderGrid(): void {
    const g = this.root.querySelector('.shop-grid') as HTMLElement
    g.classList.remove('enter')
    void g.offsetWidth
    if (this.tab === 'suit') {
      g.innerHTML = SUITS.map((s) => this.suitCard(s)).join('')
      if (!this.selectedId) this.selectedId = this.profile.equipped.suit
    } else {
      const items = this.ownedItems(this.tab)
      g.innerHTML = items.length
        ? items.map((it) => itemCardHtml(it, {
          owned: true,
          equipped: this.profile.isEquipped(it.id),
          afford: true,
          cta: null,
          selected: this.selectedId === it.id,
        })).join('')
        : `<p class="panel-note empty-note">Nothing owned in ${CATEGORY_LABEL[this.tab]} yet — the shop rotates every 15 minutes.</p>`
      if (!this.selectedId) this.selectedId = items.find((i) => this.profile.isEquipped(i.id))?.id ?? items[0]?.id ?? null
    }
    g.classList.add('enter')
    g.querySelectorAll('.item-card').forEach((c) =>
      c.addEventListener('click', () => {
        audio.ui('click')
        this.selectedId = (c as HTMLElement).dataset.id!
        g.querySelectorAll('.item-card').forEach((x) => x.classList.toggle('selected', x === c))
        this.renderDetail()
        this.showPreview()
      }),
    )
    g.querySelectorAll('.item-card').forEach((c) => c.classList.toggle('selected', (c as HTMLElement).dataset.id === this.selectedId))
    this.renderDetail()
    this.showPreview()
  }

  private showPreview(): void {
    const suit = this.profile.suit()
    const worn = this.profile.accessories().map((a) => a.acc)
    if (this.tab === 'suit') {
      const s = SUITS.find((x) => x.id === this.selectedId) ?? suit
      this.preview.setAccent(RARITY_COLOR[s.rarity])
      this.preview.showCharacter({ suit: s, accessories: worn, anim: null })
      return
    }
    const it = this.ownedItems(this.tab).find((i) => i.id === this.selectedId)
    if (!it) {
      this.preview.setAccent('#39f0e0')
      this.preview.showCharacter({ suit, accessories: worn, anim: null })
      return
    }
    this.preview.setAccent(RARITY_COLOR[it.rarity])
    switch (it.category) {
      case 'celebration': this.preview.showCharacter({ suit, accessories: worn, anim: it.anim, loop: false }); break
      case 'emote': this.preview.showCharacter({ suit, accessories: worn, anim: it.anim, loop: true }); break
      case 'weaponSkin': this.preview.showWeapon(this.previewClass, it.skin); break
      case 'accessory': {
        const others = worn.filter((a) => a.slot !== it.acc.slot)
        this.preview.showCharacter({ suit, accessories: [...others, it.acc], anim: null, focus: it.acc.slot })
      }
    }
  }

  private renderDetail(): void {
    const d = this.root.querySelector('.shop-detail') as HTMLElement
    if (this.tab === 'suit') {
      const s = SUITS.find((x) => x.id === this.selectedId)
      if (!s) return
      const equipped = this.profile.equipped.suit === s.id
      d.innerHTML = `
        <div class="detail-kind">SUIT</div>
        <div class="detail-name" style="--rc:${RARITY_COLOR[s.rarity]}">${esc(s.name)}</div>
        <div class="detail-rarity" style="color:${RARITY_COLOR[s.rarity]}">${rarityLine(s.rarity)}</div>
        <p class="detail-desc">Suit colours for the Linewalker: body, trim and visor.</p>
        <div class="detail-row"><button class="btn primary detail-cta equip-btn" ${equipped ? 'disabled' : ''}>${equipped ? 'EQUIPPED' : 'EQUIP'}</button></div>`
      d.querySelector('.equip-btn')?.addEventListener('click', () => {
        this.profile.equipSuit(s.id)
        audio.ui('equip')
        this.renderGrid()
      })
      return
    }
    const it = this.ownedItems(this.tab).find((i) => i.id === this.selectedId)
    if (!it) {
      d.innerHTML = ''
      return
    }
    const equipped = this.profile.isEquipped(it.id)
    const color = RARITY_COLOR[it.rarity]
    const classes = it.category === 'weaponSkin'
      ? `<div class="class-row">${WEAPON_CLASSES.map((c) => `<button class="mini ${c === this.previewClass ? 'on' : ''}" data-cls="${c}">${WEAPON_CLASS_LABEL[c]}</button>`).join('')}</div>`
      : ''
    const cta = it.category === 'accessory' && equipped
      ? '<button class="btn detail-cta unequip-btn">UNEQUIP</button>'
      : `<button class="btn primary detail-cta equip-btn" ${equipped ? 'disabled' : ''}>${equipped ? 'EQUIPPED' : 'EQUIP'}</button>`
    d.innerHTML = `
      <div class="detail-kind">${CATEGORY_LABEL[it.category].toUpperCase()}</div>
      <div class="detail-name r-${it.rarity}" style="--rc:${color}">${esc(it.name)}</div>
      <div class="detail-rarity" style="color:${color}">${rarityLine(it.rarity)}</div>
      <p class="detail-desc">${esc(it.description)}</p>
      ${classes}
      <div class="detail-row">${cta}</div>`
    d.querySelectorAll('.mini').forEach((b) =>
      b.addEventListener('click', () => {
        this.previewClass = (b as HTMLElement).dataset.cls as WeaponClass
        audio.ui('click')
        this.renderDetail()
        this.showPreview()
      }),
    )
    d.querySelector('.equip-btn')?.addEventListener('click', () => {
      if (this.profile.equip(it.id)) {
        audio.ui('equip')
        this.renderGrid()
      }
    })
    d.querySelector('.unequip-btn')?.addEventListener('click', () => {
      this.profile.unequipAccessory(it.id)
      audio.ui('equip')
      this.renderGrid()
    })
  }
}
