// XP, levels and coin payouts. Pure math so the server owns it later and
// the tests can assert the whole reward surface.

export interface MatchOutcome {
  placement: number // 1 = winner, out of `players`
  players: number
  kills: number
  survivalSeconds: number
  cratesOpened: number
  headshotKills: number
}

export interface MatchRewards {
  xp: number
  coins: number
  breakdown: { label: string; xp: number }[]
}

export function placementXp(placement: number, players: number): number {
  if (placement === 1) return 500
  if (placement <= 3) return 300
  if (placement <= 5) return 250
  if (placement <= 10) return 150
  if (placement <= 25) return 75
  if (placement <= Math.ceil(players / 2)) return 40
  return 15
}

export function matchRewards(o: MatchOutcome): MatchRewards {
  const breakdown: { label: string; xp: number }[] = []
  const place = placementXp(o.placement, o.players)
  breakdown.push({ label: `Placement #${o.placement}`, xp: place })
  if (o.kills > 0) breakdown.push({ label: `${o.kills} elimination${o.kills > 1 ? 's' : ''}`, xp: o.kills * 60 })
  if (o.headshotKills > 0) breakdown.push({ label: `${o.headshotKills} headshot finisher${o.headshotKills > 1 ? 's' : ''}`, xp: o.headshotKills * 25 })
  const survival = Math.floor(o.survivalSeconds / 60) * 12
  if (survival > 0) breakdown.push({ label: `Survived ${Math.floor(o.survivalSeconds / 60)}m`, xp: survival })
  if (o.cratesOpened > 0) breakdown.push({ label: `${o.cratesOpened} crate${o.cratesOpened > 1 ? 's' : ''} opened`, xp: o.cratesOpened * 10 })
  if (o.placement === 1) breakdown.push({ label: 'LAST ONE STANDING', xp: 250 })

  const xp = breakdown.reduce((s, b) => s + b.xp, 0)

  let coins = o.kills * 12 + Math.floor(o.survivalSeconds / 60) * 3
  if (o.placement === 1) coins += 300
  else if (o.placement <= 5) coins += 120
  else if (o.placement <= 10) coins += 60
  else if (o.placement <= 25) coins += 25

  return { xp, coins, breakdown }
}

/** XP needed to go from `level` to `level + 1`. Level 1 is the floor. */
export function xpForNextLevel(level: number): number {
  return 400 + (level - 1) * 120
}

export function levelFromTotalXp(totalXp: number): { level: number; into: number; needed: number } {
  let level = 1
  let rest = Math.max(0, totalXp)
  for (;;) {
    const need = xpForNextLevel(level)
    if (rest < need || level >= 200) return { level, into: rest, needed: need }
    rest -= need
    level++
  }
}
