import {
  CATEGORY_LABEL, RARITY_COLOR, SHOP_CATEGORIES, SHOP_SLOTS, WEAPON_CLASSES, WEAPON_CLASS_LABEL,
  formatCountdown, msUntilRotation, priceOf, rotationKey, shopRotation,
} from '@blackout/shared'
import type { CatalogItem, Category, WeaponClass } from '@blackout/shared'
import { audio } from '../core/audio.ts'
import type { Profile } from '../meta/data.ts'
import { esc, formatPrice, itemCardHtml, rarityLine } from './cards.ts'
import type { Preview3D } from './preview.ts'

// The live shop: four categories, SHOP_SLOTS items each, a fresh
// rarity-weighted draw every 15 minutes with a real-time countdown in
// the top-left, a 3D preview of whatever is selected, and BUY.

const REFRESH_HOLD_MS = 1400

export class ShopPanel {
  private root: HTMLElement
  private profile: Profile
  private preview: Preview3D
  private onBack: () => void
  private coinsHtml: () => string
  private category: Category = 'celebration'
  private key = rotationKey(Date.now())
  private rotation = shopRotation(this.key)
  private selected: CatalogItem | null = null
  private previewClass: WeaponClass = 'ar'
  private timer = 0
  private refreshing = false
  private grid: HTMLElement | null = null

  constructor(root: HTMLElement, profile: Profile, preview: Preview3D, onBack: () => void, coinsHtml: () => string) {
    this.root = root
    this.profile = profile
    this.preview = preview
    this.onBack = onBack
    this.coinsHtml = coinsHtml
  }

  private items(): CatalogItem[] {
    return this.rotation.perCategory[this.category].slice(0, SHOP_SLOTS)
  }

  /** Full render: header, tabs, grid, side panel. */
  render(): void {
    const luck: string[] = []
    if (this.rotation.exoticIn) luck.push(`<span class="luck exotic">EXOTIC DROP · ${CATEGORY_LABEL[this.rotation.exoticIn].toUpperCase()}</span>`)
    if (this.rotation.mythicIn) luck.push(`<span class="luck mythic">MYTHIC DROP · ${CATEGORY_LABEL[this.rotation.mythicIn].toUpperCase()}</span>`)
    this.root.innerHTML = `
      <div class="shop-head">
        <div class="shop-timer">SHOP REFRESHES IN <b class="shop-clock">${formatCountdown(msUntilRotation(Date.now()))}</b></div>
        <div class="shop-luck">${luck.join('')}</div>
        <div class="head-right shop-coins">${this.coinsHtml()}</div>
      </div>
      <div class="panel shop-panel">
        <div class="panel-head"><button class="btn ghost back-btn">← DEPOT</button><h2>SHOP</h2><span class="rotate-note">${SHOP_SLOTS} per category · new selection every 15 minutes</span></div>
        <div class="shop-tabs">
          ${SHOP_CATEGORIES.map((c) => `<button class="tab ${c === this.category ? 'on' : ''}" data-cat="${c}">${CATEGORY_LABEL[c].toUpperCase()}</button>`).join('')}
        </div>
        <div class="shop-body">
          <div class="shop-grid-wrap">
            <div class="shop-grid"></div>
            <div class="shop-refreshing ${this.refreshing ? 'show' : ''}"><span>REFRESHING SHOP...</span></div>
          </div>
          <aside class="shop-side">
            <div class="preview-host"></div>
            <div class="shop-detail"></div>
          </aside>
        </div>
      </div>`
    this.root.querySelector('.back-btn')!.addEventListener('click', () => this.onBack())
    this.root.querySelectorAll('.tab').forEach((t) =>
      t.addEventListener('click', () => {
        const cat = (t as HTMLElement).dataset.cat as Category
        if (cat === this.category) return
        audio.ui('click')
        this.category = cat
        this.root.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t))
        this.renderGrid(true)
        this.select(this.items()[0] ?? null)
      }),
    )
    this.grid = this.root.querySelector('.shop-grid') as HTMLElement
    this.preview.mount(this.root.querySelector('.preview-host') as HTMLElement)
    this.renderGrid(false)
    this.select(this.selected && this.items().some((i) => i.id === this.selected!.id) ? this.selected : this.items()[0] ?? null)
    this.startClock()
  }

  private renderGrid(animate: boolean): void {
    const g = this.grid
    if (!g) return
    const draw = () => {
      g.innerHTML = this.items()
        .map((it) => itemCardHtml(it, {
          owned: this.profile.owns(it.id),
          equipped: this.profile.isEquipped(it.id),
          afford: this.profile.coins >= priceOf(it),
          cta: this.profile.owns(it.id) ? null : 'BUY',
          selected: this.selected?.id === it.id,
        }))
        .join('')
      g.querySelectorAll('.item-card').forEach((c, i) => {
        const el = c as HTMLElement
        el.style.animationDelay = `${i * 28}ms`
        el.addEventListener('click', () => {
          const it = this.items().find((x) => x.id === el.dataset.id)
          if (it) {
            audio.ui('click')
            this.select(it)
          }
        })
      })
      g.querySelectorAll('.card-cta').forEach((b) =>
        b.addEventListener('click', (e) => {
          e.stopPropagation()
          const id = (b as HTMLElement).dataset.id!
          const it = this.items().find((x) => x.id === id)
          if (it) this.buy(it, b.closest('.item-card') as HTMLElement)
        }),
      )
      g.classList.remove('leave')
      g.classList.add('enter')
    }
    if (animate) {
      g.classList.add('leave')
      window.setTimeout(draw, 160)
    } else draw()
  }

  private select(item: CatalogItem | null): void {
    this.selected = item
    this.grid?.querySelectorAll('.item-card').forEach((c) => c.classList.toggle('selected', (c as HTMLElement).dataset.id === item?.id))
    this.renderDetail()
    this.showPreview()
  }

  private showPreview(): void {
    const it = this.selected
    if (!it) return
    this.preview.setAccent(RARITY_COLOR[it.rarity])
    const suit = this.profile.suit()
    const worn = this.profile.accessories().map((a) => a.acc)
    switch (it.category) {
      case 'celebration':
        this.preview.showCharacter({ suit, accessories: worn, anim: it.anim, loop: false })
        break
      case 'emote':
        this.preview.showCharacter({ suit, accessories: worn, anim: it.anim, loop: true })
        break
      case 'weaponSkin':
        this.preview.showWeapon(this.previewClass, it.skin)
        break
      case 'accessory': {
        const others = worn.filter((a) => a.slot !== it.acc.slot)
        this.preview.showCharacter({ suit, accessories: [...others, it.acc], anim: null, focus: it.acc.slot })
        break
      }
    }
  }

  private renderDetail(): void {
    const d = this.root.querySelector('.shop-detail') as HTMLElement | null
    if (!d) return
    const it = this.selected
    if (!it) {
      d.innerHTML = '<p class="panel-note">Nothing in this rotation.</p>'
      return
    }
    const owned = this.profile.owns(it.id)
    const equipped = this.profile.isEquipped(it.id)
    const price = priceOf(it)
    const afford = this.profile.coins >= price
    const color = RARITY_COLOR[it.rarity]
    const classes = it.category === 'weaponSkin'
      ? `<div class="class-row">${WEAPON_CLASSES.map((c) => `<button class="mini ${c === this.previewClass ? 'on' : ''}" data-cls="${c}">${WEAPON_CLASS_LABEL[c]}</button>`).join('')}</div>`
      : ''
    d.innerHTML = `
      <div class="detail-kind">${CATEGORY_LABEL[it.category].toUpperCase()}</div>
      <div class="detail-name r-${it.rarity}" style="--rc:${color}">${esc(it.name)}</div>
      <div class="detail-rarity" style="color:${color}">${rarityLine(it.rarity)}</div>
      <p class="detail-desc">${esc(it.description)}</p>
      ${classes}
      <div class="detail-row">
        <div class="detail-price ${owned ? 'owned' : afford ? '' : 'poor'}">${owned ? 'OWNED' : `⬡ ${formatPrice(price)}`}</div>
        ${owned
          ? `<button class="btn primary detail-cta equip-btn" ${equipped ? 'disabled' : ''}>${equipped ? 'EQUIPPED' : 'EQUIP'}</button>`
          : `<button class="btn primary detail-cta buy-btn">BUY</button>`}
      </div>`
    d.querySelectorAll('.mini').forEach((b) =>
      b.addEventListener('click', () => {
        this.previewClass = (b as HTMLElement).dataset.cls as WeaponClass
        audio.ui('click')
        this.renderDetail()
        this.showPreview()
      }),
    )
    d.querySelector('.buy-btn')?.addEventListener('click', () => {
      const card = this.grid?.querySelector(`.item-card[data-id="${it.id}"]`) as HTMLElement | null
      this.buy(it, card)
    })
    d.querySelector('.equip-btn')?.addEventListener('click', () => {
      if (this.profile.equip(it.id)) {
        audio.ui('equip')
        this.renderDetail()
        this.renderGrid(false)
      }
    })
  }

  private buy(it: CatalogItem, card: HTMLElement | null): void {
    if (this.profile.buy(it.id)) {
      audio.ui('buy')
      // Purchase flourish: the card pops and stamps OWNED, the salvage chip drops.
      if (card) {
        card.classList.add('bought')
        card.querySelector('.card-cta')?.remove()
        const price = card.querySelector('.card-price')
        if (price) price.textContent = 'OWNED'
        card.classList.add('owned')
      }
      const coins = this.root.querySelector('.shop-coins')
      if (coins) {
        coins.innerHTML = this.coinsHtml()
        coins.classList.remove('bump')
        void (coins as HTMLElement).offsetWidth
        coins.classList.add('bump')
      }
      // Auto-equip the first of a kind so the purchase is felt immediately.
      if (it.category !== 'accessory' || this.profile.accessories().every((a) => a.acc.slot !== it.acc.slot)) this.profile.equip(it.id)
      this.renderDetail()
      window.setTimeout(() => this.renderGrid(false), 650)
    } else {
      audio.ui('deny')
      if (card) {
        card.classList.remove('shake')
        void card.offsetWidth
        card.classList.add('shake')
      }
      const price = this.root.querySelector('.detail-price')
      if (price) {
        price.classList.remove('shake')
        void (price as HTMLElement).offsetWidth
        price.classList.add('shake')
      }
    }
  }

  private startClock(): void {
    this.stopClock()
    const tick = () => {
      if (this.refreshing) return
      const now = Date.now()
      const key = rotationKey(now)
      if (key !== this.key) {
        this.refresh(key)
        return
      }
      const clock = this.root.querySelector('.shop-clock')
      if (clock) clock.textContent = formatCountdown(msUntilRotation(now))
    }
    tick()
    this.timer = window.setInterval(tick, 250)
  }

  private stopClock(): void {
    if (this.timer) window.clearInterval(this.timer)
    this.timer = 0
  }

  /** The clock hit zero: hold on "REFRESHING SHOP..." then deal a brand-new selection. */
  private refresh(key: number): void {
    this.refreshing = true
    audio.refresh()
    this.root.querySelector('.shop-refreshing')?.classList.add('show')
    const timerEl = this.root.querySelector('.shop-timer') as HTMLElement | null
    if (timerEl) timerEl.innerHTML = '<b class="shop-clock refreshing">REFRESHING SHOP...</b>'
    this.grid?.classList.add('leave')
    window.setTimeout(() => {
      this.key = key
      this.rotation = shopRotation(key)
      this.selected = null
      this.refreshing = false
      this.render()
    }, REFRESH_HOLD_MS)
  }

  dispose(): void {
    this.stopClock()
  }
}
