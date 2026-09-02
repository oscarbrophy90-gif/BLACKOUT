import { RARITY_COLOR, priceOf } from '@blackout/shared'
import type { CatalogItem, Rarity } from '@blackout/shared'

// Shared item-card markup for the shop and the loadout. The card is
// NAME / ★ RARITY / PRICE / [action]; rarity classes drive the CSS
// effects (Legendary sweep, Mythic pulse, Exotic prism).

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'COMMON',
  uncommon: 'UNCOMMON',
  rare: 'RARE',
  epic: 'EPIC',
  legendary: 'LEGENDARY',
  mythic: 'MYTHIC',
  exotic: 'EXOTIC',
}

export function formatPrice(n: number): string {
  return n.toLocaleString('en-US')
}

export function rarityLine(r: Rarity): string {
  return `★ ${RARITY_LABEL[r]}`
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

const SLOT_GLYPH: Record<string, string> = {
  head: '⛑', face: '👓', back: '🎒', shoulder: '🛡', wrist: '⌚', neck: '📿', waist: '🔗', float: '🔮', aura: '✨', pet: '🐾',
}

/** A cheap 2D thumbnail: palette + a category glyph. The real look is the 3D preview. */
export function thumbHtml(item: CatalogItem): string {
  switch (item.category) {
    case 'weaponSkin': {
      const [a, b, c] = item.skin.palette
      return `<div class="thumb thumb-skin" style="background:linear-gradient(120deg,${a} 0 45%,${b} 45% 75%,${c} 75%)"><i style="background:${c};box-shadow:0 0 10px ${c}"></i><span>${esc(item.skin.pattern)}</span></div>`
    }
    case 'accessory': {
      const [a, b, c] = item.acc.palette
      return `<div class="thumb thumb-acc" style="background:linear-gradient(160deg,${a},${b})"><b style="color:${c};text-shadow:0 0 12px ${c}">${SLOT_GLYPH[item.acc.slot] ?? '◆'}</b><span>${esc(item.acc.slot)}</span></div>`
    }
    default: {
      const [a, b] = item.anim.palette
      const glyph = item.category === 'celebration' ? '🏆' : '🕺'
      return `<div class="thumb thumb-anim" style="background:radial-gradient(circle at 30% 30%,${a}55,transparent 60%),radial-gradient(circle at 70% 70%,${b}55,transparent 60%)"><b>${glyph}</b><span>${item.anim.moves.length} move${item.anim.moves.length === 1 ? '' : 's'}</span></div>`
    }
  }
}

export interface CardState {
  owned: boolean
  equipped: boolean
  afford: boolean
  /** Button label, or null for no button. */
  cta: string | null
  selected?: boolean
}

export function itemCardHtml(item: CatalogItem, st: CardState): string {
  const color = RARITY_COLOR[item.rarity]
  const cls = [
    'item-card',
    `r-${item.rarity}`,
    st.owned ? 'owned' : '',
    st.equipped ? 'equipped' : '',
    st.afford || st.owned ? '' : 'poor',
    st.selected ? 'selected' : '',
  ].filter(Boolean).join(' ')
  return `
    <div class="${cls}" data-id="${item.id}" style="--rc:${color}">
      <div class="card-fx"></div>
      ${thumbHtml(item)}
      <div class="card-name" title="${esc(item.name)}">${esc(item.name)}</div>
      <div class="card-rarity">${rarityLine(item.rarity)}</div>
      <div class="card-price">${st.owned ? 'OWNED' : `⬡ ${formatPrice(priceOf(item))}`}</div>
      ${st.cta ? `<button class="btn card-cta" data-id="${item.id}">${st.cta}</button>` : ''}
    </div>`
}
