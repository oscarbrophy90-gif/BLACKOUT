import { EMOTE_SLOTS, RARITY_COLOR } from '@blackout/shared'
import type { EmoteItem } from '@blackout/shared'
import { esc } from './cards.ts'

// The emote wheel: six wedges around the screen centre, shown while B is
// held. The pointer-locked mouse drives a virtual cursor; the wedge under
// it lights up; releasing B (or clicking) fires it. On cooldown the whole
// wheel greys out and the hub counts down.

const OUTER = 176
const INNER = 64
const GAP_DEG = 3
const SIZE = OUTER * 2 + 16

function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180
  return [SIZE / 2 + Math.cos(a) * r, SIZE / 2 + Math.sin(a) * r]
}

function wedgePath(i: number): string {
  const span = 360 / EMOTE_SLOTS
  const a0 = i * span - span / 2 + GAP_DEG / 2
  const a1 = i * span + span / 2 - GAP_DEG / 2
  const [ox0, oy0] = polar(OUTER, a0)
  const [ox1, oy1] = polar(OUTER, a1)
  const [ix0, iy0] = polar(INNER, a0)
  const [ix1, iy1] = polar(INNER, a1)
  return `M ${ox0} ${oy0} A ${OUTER} ${OUTER} 0 0 1 ${ox1} ${oy1} L ${ix1} ${iy1} A ${INNER} ${INNER} 0 0 0 ${ix0} ${iy0} Z`
}

export class EmoteWheel {
  private root: HTMLElement
  private wedges: SVGPathElement[] = []
  private labels: HTMLElement[] = []
  private hub: HTMLElement
  private hubSub: HTMLElement
  private cursor: HTMLElement
  private ring: SVGCircleElement
  private open = false
  private lastHighlight = -2
  private lastCool = -1

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'emote-wheel'
    this.root.innerHTML = `
      <svg viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
        <defs>
          <filter id="ew-glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <circle class="ew-bg" cx="${SIZE / 2}" cy="${SIZE / 2}" r="${OUTER + 6}"/>
        ${Array.from({ length: EMOTE_SLOTS }, (_, i) => `<path class="ew-wedge" data-i="${i}" d="${wedgePath(i)}"/>`).join('')}
        <circle class="ew-hub-bg" cx="${SIZE / 2}" cy="${SIZE / 2}" r="${INNER - 8}"/>
        <circle class="ew-ring" cx="${SIZE / 2}" cy="${SIZE / 2}" r="${INNER - 4}" pathLength="100"/>
      </svg>
      <div class="ew-labels">${Array.from({ length: EMOTE_SLOTS }, (_, i) => {
        const [x, y] = polar((OUTER + INNER) / 2, (i * 360) / EMOTE_SLOTS)
        return `<div class="ew-label" data-i="${i}" style="left:${x}px;top:${y}px"><b>${i + 1}</b><span class="ew-name"></span><span class="ew-rarity"></span></div>`
      }).join('')}</div>
      <div class="ew-hub"><div class="ew-hub-main">EMOTE</div><div class="ew-hub-sub">release B</div></div>
      <div class="ew-cursor"></div>`
    parent.appendChild(this.root)
    this.wedges = [...this.root.querySelectorAll<SVGPathElement>('.ew-wedge')]
    this.labels = [...this.root.querySelectorAll<HTMLElement>('.ew-label')]
    this.hub = this.root.querySelector('.ew-hub-main') as HTMLElement
    this.hubSub = this.root.querySelector('.ew-hub-sub') as HTMLElement
    this.cursor = this.root.querySelector('.ew-cursor') as HTMLElement
    this.ring = this.root.querySelector('.ew-ring') as SVGCircleElement
  }

  get isOpen(): boolean {
    return this.open
  }

  /** Populate from the wheel slots and show. */
  show(slots: (EmoteItem | null)[]): void {
    for (let i = 0; i < EMOTE_SLOTS; i++) {
      const it = slots[i] ?? null
      const w = this.wedges[i]
      const l = this.labels[i]
      w.classList.toggle('empty', !it)
      w.style.setProperty('--rc', it ? RARITY_COLOR[it.rarity] : '#3a3f4a')
      l.classList.toggle('empty', !it)
      l.querySelector('.ew-name')!.innerHTML = it ? esc(it.name) : 'EMPTY'
      l.querySelector('.ew-rarity')!.innerHTML = it ? `★ ${it.rarity.toUpperCase()}` : 'equip in loadout'
      ;(l.querySelector('.ew-rarity') as HTMLElement).style.color = it ? RARITY_COLOR[it.rarity] : ''
    }
    this.lastHighlight = -2
    this.lastCool = -1
    this.open = true
    this.root.classList.add('show')
  }

  hide(): void {
    if (!this.open) return
    this.open = false
    this.root.classList.remove('show')
    this.root.classList.remove('cooling')
  }

  /** Per-frame: virtual cursor position (px from centre), highlighted slot, cooldown left. */
  update(cx: number, cy: number, highlighted: number, cooldown: number, cooldownTotal: number): void {
    if (!this.open) return
    this.cursor.style.transform = `translate(${cx}px, ${cy}px)`
    if (highlighted !== this.lastHighlight) {
      this.lastHighlight = highlighted
      this.wedges.forEach((w, i) => w.classList.toggle('on', i === highlighted))
      this.labels.forEach((l, i) => l.classList.toggle('on', i === highlighted))
    }
    const cooling = cooldown > 0
    this.root.classList.toggle('cooling', cooling)
    const shown = cooling ? Math.ceil(cooldown * 10) / 10 : 0
    if (shown !== this.lastCool) {
      this.lastCool = shown
      this.hub.textContent = cooling ? `${shown.toFixed(1)}s` : 'EMOTE'
      this.hubSub.textContent = cooling ? 'cooling down' : 'release B'
      this.ring.style.strokeDashoffset = String(cooling ? 100 - (cooldown / cooldownTotal) * 100 : 100)
    }
  }

  dispose(): void {
    this.root.remove()
  }
}
