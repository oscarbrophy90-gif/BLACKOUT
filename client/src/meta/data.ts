import {
  DEFAULT_OWNED, addMetrics, dailyChallenges, emptyMetrics, findCosmetic,
  levelFromTotalXp, matchRewards, weeklyChallenges,
} from '@blackout/shared'
import type { ChallengeDef, MatchMetrics, MatchOutcome, MatchRewards } from '@blackout/shared'

// Persistent account data. localStorage today; the schema deliberately
// mirrors docs/DATABASE.md so Phase 3 can lift it to the server unchanged.
// The server will treat all of this as untrusted and recompute rewards.

const KEY = 'blackout_save_v1'

export interface Settings {
  volume: number
  sensitivity: number
  fov: number
  quality: 'high' | 'medium' | 'low'
  invertY: boolean
}

export interface Equipped {
  weaponSkin: string
  suit: string
  charm: string | null
  emote: string
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
    coins: 150,
    owned: [...DEFAULT_OWNED],
    equipped: { weaponSkin: 'ws_issue', suit: 'su_contract', charm: null, emote: 'em_wave' },
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
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SaveData>
        this.data = {
          ...defaults(),
          ...parsed,
          equipped: { ...defaults().equipped, ...parsed.equipped },
          stats: { ...defaults().stats, ...parsed.stats },
          settings: { ...defaults().settings, ...parsed.settings },
          daily: { ...defaults().daily, ...parsed.daily },
          weekly: { ...defaults().weekly, ...parsed.weekly },
        }
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

  /** Reset challenge progress when the day/week window moves on. */
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

  owns(id: string): boolean {
    return this.data.owned.includes(id)
  }

  buy(id: string): boolean {
    const entry = findCosmetic(id)
    if (!entry || this.owns(id) || this.data.coins < entry.price) return false
    this.data.coins -= entry.price
    this.data.owned.push(id)
    this.save()
    return true
  }

  equip(kind: keyof Equipped, id: string | null): boolean {
    if (id !== null && !this.owns(id)) return false
    if (kind === 'charm') this.data.equipped.charm = id
    else if (id === null) return false
    else this.data.equipped[kind] = id
    this.save()
    return true
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

  /**
   * Record a finished match: XP, coins, lifetime stats, challenge progress.
   * Returns the reward screen payload, including challenges completed by
   * this match's contribution.
   */
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
    for (const [id, k] of Object.entries(weaponKills)) {
      s.weaponKills[id] = (s.weaponKills[id] ?? 0) + k
    }

    this.save()
    return { rewards, completed, level: this.level }
  }
}
