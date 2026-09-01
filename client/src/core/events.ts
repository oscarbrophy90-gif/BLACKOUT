// One tiny event bus decouples gameplay systems from the HUD and audio.

export interface GameEvents {
  kill: { killerName: string; victimName: string; weaponName: string; inBlackout: boolean; victimIsPlayer: boolean; killerIsPlayer: boolean }
  hitmarker: { killed: boolean; headshot: boolean }
  playerDamaged: { angle: number; amount: number }
  pickup: { label: string; rarityColor: string }
  toast: { text: string; strong?: boolean }
  crateOpened: { tier: string }
  blackoutWarn: Record<string, never>
  blackoutStart: Record<string, never>
  blackoutEnd: Record<string, never>
  phase: { index: number; label: string }
  supplyDrop: { x: number; z: number }
  aliveChanged: { alive: number }
}

type Handler<T> = (detail: T) => void

const handlers = new Map<string, Set<Handler<unknown>>>()

export function on<K extends keyof GameEvents>(name: K, fn: Handler<GameEvents[K]>): () => void {
  let set = handlers.get(name)
  if (!set) {
    set = new Set()
    handlers.set(name, set)
  }
  set.add(fn as Handler<unknown>)
  return () => set!.delete(fn as Handler<unknown>)
}

export function emit<K extends keyof GameEvents>(name: K, detail: GameEvents[K]): void {
  const set = handlers.get(name)
  if (!set) return
  for (const fn of [...set]) fn(detail)
}

/** Match teardown: drop every listener so the next match starts clean. */
export function clearAllHandlers(): void {
  handlers.clear()
}
