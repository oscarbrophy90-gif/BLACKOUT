import {
  ACCESSORIES_BY_ID, CATALOG, CELEBRATIONS_BY_ID, EMOTES_BY_ID, EMOTE_SLOTS, STARTER_EMOTES, STARTER_ITEMS, SUITS,
  WEAPON_SKINS_BY_ID, addMetrics, dailyChallenges, emptyMetrics, levelFromTotalXp, matchRewards, priceOf, weeklyChallenges,
} from '@blackout/shared'
import type {
  AccessoryItem, CatalogItem, CelebrationItem, ChallengeDef, EmoteItem, MatchMetrics, MatchOutcome,
  MatchRewards, SuitDef, WeaponSkinItem,
} from '@blackout/shared'

// Persistent account data. localStorage today; the schema mirrors
// docs/DATABASE.md so Phase 3 lifts it to the server unchanged.
// Cosmetics reference the 2,000-item catalogue by id.

const KEY = 'blackout_save_v2'
const LEGACY_KEY = 'blackout_save_v1'

export interface Settings {
  volume: number
  sensitivity: number
  fov: number
  quality: 'high' | 'medium' | 'low'
  invertY: boolean
}

export interface Equipped {
  suit: string
  celebration: string
  /** The emote wheel: EMOTE_SLOTS slots, null = empty. Only these appear in the wheel. */
  emotes: (string | null)[]
  weaponSkin: string
  /** One accessory per slot, by catalogue id. */
  accessories: string[]
}

export interface LifetimeStats {
  matches: number
  wins: number
  kills: number
  top10s: number
  bestPlacement: number
  totalXp: number
  weaponKills: Record<string, number>
  blackoutKills: number
  cratesOpened: number
  distance: number
}

interface SaveData {
  name: string
  xp: number
  coins: number
  owned: string[]
  equipped: Equipped
  stats: LifetimeStats
  settings: Settings
  daily: { dayKey: number; progress: MatchMetrics; claimed: string[] }
  weekly: { weekKey: number; progress: MatchMetrics; claimed: string[] }
}

function defaults(): SaveData {
  return {
    name: 'Linewalker',
    xp: 0,
    coins: 600,
    owned: [STARTER_ITEMS.celebration, ...STARTER_EMOTES, STARTER_ITEMS.weaponSkin],
    equipped: {
      suit: SUITS[0].id,
      celebration: STARTER_ITEMS.celebration,
      emotes: Array.from({ length: EMOTE_SLOTS }, (_, i) => STARTER_EMOTES[i] ?? null),
      weaponSkin: STARTER_ITEMS.weaponSkin,
      accessories: [],
    },
    stats: {
      matches: 0, wins: 0, kills: 0, top10s: 0, bestPlacement: 0, totalXp: 0,
      weaponKills: {}, blackoutKills: 0, cratesOpened: 0, distance: 0,
    },
    settings: { volume: 0.7, sensitivity: 1, fov: 75, quality: 'high', invertY: false },
    daily: { dayKey: 0, progress: emptyMetrics(), claimed: [] },
    weekly: { weekKey: 0, progress: emptyMetrics(), claimed: [] },
  }
}

export interface ChallengeState {
  def: ChallengeDef
  progress: number
  done: boolean
  claimed: boolean
}

export class Profile {
  private data: SaveData

  constructor() {
    this.data = defaults()
    try {
      const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SaveData> & { equipped?: Partial<Equipped> & { charm?: string; emote?: string } }
        const d = defaults()
        this.data = {
          ...d,
          ...parsed,
          equipped: { ...d.equipped, ...(parsed.equipped ?? {}) },
          stats: { ...d.stats, ...parsed.stats },
          settings: { ...d.settings, ...parsed.settings },
          daily: { ...d.daily, ...parsed.daily },
          weekly: { ...d.weekly, ...parsed.weekly },
        }
        // Legacy saves referenced the old 36-item cosmetic set: keep what
        // still resolves, fall back to starters for the rest.
        this.data.owned = [...new Set([...d.owned, ...(parsed.owned ?? []).filter((id) => CATALOG.has(id))])]
        const eq = this.data.equipped
        if (!CELEBRATIONS_BY_ID.has(eq.celebration) || !this.owns(eq.celebration)) eq.celebration = STARTER_ITEMS.celebration
        // Older saves had one equipped emote: it takes wheel slot 1.
        const legacy = parsed.equipped?.emote
        const slots = Array.isArray(parsed.equipped?.emotes) ? parsed.equipped.emotes : [legacy ?? null]
        eq.emotes = Array.from({ length: EMOTE_SLOTS }, (_, i) => {
          const id = slots[i] ?? null
          return id && EMOTES_BY_ID.has(id) && this.owns(id) ? id : null
        })
        // Nothing survived: fill from the starters so the wheel is never blank.
        if (eq.emotes.every((e) => e === null)) eq.emotes = Array.from({ length: EMOTE_SLOTS }, (_, i) => STARTER_EMOTES[i] ?? null)
        if (!WEAPON_SKINS_BY_ID.has(eq.weaponSkin) || !this.owns(eq.weaponSkin)) eq.weaponSkin = STARTER_ITEMS.weaponSkin
        if (!SUITS.some((s) => s.id === eq.suit)) eq.suit = SUITS[0].id
        eq.accessories = (eq.accessories ?? []).filter((id) => ACCESSORIES_BY_ID.has(id) && this.owns(id))
      }
    } catch {
      // Corrupt or blocked storage: play with a fresh profile.
    }
    this.rollWindows()
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data))
    } catch {
      // Private windows: the session still works, it just won't persist.
    }
  }

  private dayKey(): number {
    return Math.floor(Date.now() / 86_400_000)
  }

  private weekKey(): number {
    return Math.floor(this.dayKey() / 7)
  }

  private rollWindows(): void {
    const day = this.dayKey()
    const week = this.weekKey()
    if (this.data.daily.dayKey !== day) this.data.daily = { dayKey: day, progress: emptyMetrics(), claimed: [] }
    if (this.data.weekly.weekKey !== week) this.data.weekly = { weekKey: week, progress: emptyMetrics(), claimed: [] }
    this.save()
  }

  get name(): string {
    return this.data.name
  }

  setName(name: string): void {
    this.data.name = name.slice(0, 20) || 'Linewalker'
    this.save()
  }

  get coins(): number {
    return this.data.coins
  }

  get xp(): number {
    return this.data.xp
  }

  get level(): { level: number; into: number; needed: number } {
    return levelFromTotalXp(this.data.xp)
  }

  get stats(): LifetimeStats {
    return this.data.stats
  }

  get settings(): Settings {
    return this.data.settings
  }

  updateSettings(patch: Partial<Settings>): void {
    Object.assign(this.data.settings, patch)
    this.save()
  }

  get equipped(): Equipped {
    return this.data.equipped
  }

  get ownedCount(): number {
    return this.data.owned.length
  }

  owns(id: string): boolean {
    return this.data.owned.includes(id) || SUITS.some((s) => s.id === id)
  }

  /** QA hook only (main.ts `?debug`). */
  debugSetCoins(n: number): void {
    this.data.coins = Math.max(0, Math.floor(n))
    this.save()
  }

  /** Buy a catalogue item with salvage. */
  buy(id: string): boolean {
    const item = CATALOG.get(id)
    if (!item || this.owns(id)) return false
    const price = priceOf(item)
    if (this.data.coins < price) return false
    this.data.coins -= price
    this.data.owned.push(id)
    this.save()
    return true
  }

  /** Equip any owned catalogue item; accessories replace the same slot. */
  equip(id: string): boolean {
    const item = CATALOG.get(id)
    if (!item || !this.owns(id)) return false
    const eq = this.data.equipped
    switch (item.category) {
      case 'celebration': eq.celebration = id; break
      case 'emote': {
        // Already on the wheel: keep it; else the first empty slot, else slot 1.
        if (eq.emotes.includes(id)) break
        const empty = eq.emotes.indexOf(null)
        eq.emotes[empty >= 0 ? empty : 0] = id
        break
      }
      case 'weaponSkin': eq.weaponSkin = id; break
      case 'accessory': {
        const slot = item.acc.slot
        eq.accessories = eq.accessories.filter((a) => ACCESSORIES_BY_ID.get(a)?.acc.slot !== slot)
        eq.accessories.push(id)
        break
      }
    }
    this.save()
    return true
  }

  /** Put an owned emote in a specific wheel slot (removing it from any other). */
  equipEmote(id: string, slot: number): boolean {
    if (!EMOTES_BY_ID.has(id) || !this.owns(id) || slot < 0 || slot >= EMOTE_SLOTS) return false
    const eq = this.data.equipped
    for (let i = 0; i < eq.emotes.length; i++) if (eq.emotes[i] === id) eq.emotes[i] = null
    eq.emotes[slot] = id
    this.save()
    return true
  }

  unequipEmoteSlot(slot: number): void {
    if (slot < 0 || slot >= EMOTE_SLOTS) return
    this.data.equipped.emotes[slot] = null
    this.save()
  }

  /** Which wheel slot an emote sits in, or -1. */
  emoteSlotOf(id: string): number {
    return this.data.equipped.emotes.indexOf(id)
  }

  /** The wheel, slot by slot. */
  emoteSlots(): (EmoteItem | null)[] {
    return this.data.equipped.emotes.map((id) => (id ? EMOTES_BY_ID.get(id) ?? null : null))
  }

  unequipAccessory(id: string): void {
    this.data.equipped.accessories = this.data.equipped.accessories.filter((a) => a !== id)
    this.save()
  }

  equipSuit(id: string): void {
    if (SUITS.some((s) => s.id === id)) {
      this.data.equipped.suit = id
      this.save()
    }
  }

  isEquipped(id: string): boolean {
    const eq = this.data.equipped
    return eq.celebration === id || eq.emotes.includes(id) || eq.weaponSkin === id || eq.accessories.includes(id) || eq.suit === id
  }

  celebration(): CelebrationItem {
    return CELEBRATIONS_BY_ID.get(this.data.equipped.celebration) ?? CELEBRATIONS_BY_ID.get(STARTER_ITEMS.celebration)!
  }

  /** The first emote on the wheel (labels, previews). */
  emote(): EmoteItem {
    const first = this.data.equipped.emotes.find((e) => e !== null)
    return (first ? EMOTES_BY_ID.get(first) : undefined) ?? EMOTES_BY_ID.get(STARTER_ITEMS.emote)!
  }

  weaponSkin(): WeaponSkinItem {
    return WEAPON_SKINS_BY_ID.get(this.data.equipped.weaponSkin) ?? WEAPON_SKINS_BY_ID.get(STARTER_ITEMS.weaponSkin)!
  }

  accessories(): AccessoryItem[] {
    return this.data.equipped.accessories.map((id) => ACCESSORIES_BY_ID.get(id)).filter((a): a is AccessoryItem => !!a)
  }

  suit(): SuitDef {
    return SUITS.find((s) => s.id === this.data.equipped.suit) ?? SUITS[0]
  }

  ownedItems(): CatalogItem[] {
    return this.data.owned.map((id) => CATALOG.get(id)).filter((i): i is CatalogItem => !!i)
  }

  favoriteWeapon(): string | null {
    let best: string | null = null
    let n = 0
    for (const [id, k] of Object.entries(this.data.stats.weaponKills)) {
      if (k > n) {
        n = k
        best = id
      }
    }
    return best
  }

  challenges(): { daily: ChallengeState[]; weekly: ChallengeState[] } {
    this.rollWindows()
    const wrap = (defs: ChallengeDef[], progress: MatchMetrics, claimed: string[]): ChallengeState[] =>
      defs.map((def) => {
        const p = Math.min(progress[def.metric], def.target)
        return { def, progress: p, done: p >= def.target, claimed: claimed.includes(def.id) }
      })
    return {
      daily: wrap(dailyChallenges(this.data.daily.dayKey), this.data.daily.progress, this.data.daily.claimed),
      weekly: wrap(weeklyChallenges(this.data.weekly.weekKey), this.data.weekly.progress, this.data.weekly.claimed),
    }
  }

  recordMatch(outcome: MatchOutcome, metrics: MatchMetrics, weaponKills: Record<string, number>): {
    rewards: MatchRewards
    completed: ChallengeDef[]
    level: { level: number; into: number; needed: number }
  } {
    this.rollWindows()
    const before = this.challenges()
    this.data.daily.progress = addMetrics(this.data.daily.progress, metrics)
    this.data.weekly.progress = addMetrics(this.data.weekly.progress, metrics)
    const after = this.challenges()

    const completed: ChallengeDef[] = []
    let challengeXp = 0
    for (const list of [after.daily, after.weekly]) {
      for (const c of list) {
        const wasDone = [...before.daily, ...before.weekly].find((b) => b.def.id === c.def.id)?.done ?? false
        if (c.done && !wasDone && !c.claimed) {
          completed.push(c.def)
          challengeXp += c.def.xp
          this.data.coins += c.def.coins
          ;(c.def.id.startsWith('w_') ? this.data.weekly : this.data.daily).claimed.push(c.def.id)
        }
      }
    }

    const rewards = matchRewards(outcome)
    if (challengeXp > 0) rewards.breakdown.push({ label: 'Contracts completed', xp: challengeXp })
    rewards.xp += challengeXp
    this.data.xp += rewards.xp
    this.data.coins += rewards.coins

    const s = this.data.stats
    s.matches++
    s.totalXp = this.data.xp
    s.kills += outcome.kills
    s.blackoutKills += metrics.blackoutKills
    s.cratesOpened += metrics.cratesOpened
    s.distance += metrics.distance
    if (outcome.placement === 1) s.wins++
    if (outcome.placement <= 10) s.top10s++
    if (s.bestPlacement === 0 || outcome.placement < s.bestPlacement) s.bestPlacement = outcome.placement
    for (const [id, k] of Object.entries(weaponKills)) s.weaponKills[id] = (s.weaponKills[id] ?? 0) + k

    this.save()
    return { rewards, completed, level: this.level }
  }
}
