import * as THREE from 'three'
import { ACCESSORIES_BY_ID, SUITS } from '@blackout/shared'
import type { AccSpec, SuitDef } from '@blackout/shared'
import { CharacterAnimator } from './animator.ts'
import { CharacterRig } from './rig.ts'

// ONE character model everywhere. An Appearance is the full look — suit
// colours plus every equipped accessory — and buildCharacter() turns it
// into the same rig + animator whether it stands in the depot, the shop,
// the deploy screen, the podium, an in-match emote, or on a bot.

export interface Appearance {
  suit: SuitDef
  accessories: AccSpec[]
}

/** Anything that can report a look: the Profile, or a bot's cosmetic picks. */
export interface Dressed {
  suit(): SuitDef
  accessories(): { acc: AccSpec }[]
}

export function appearanceOf(d: Dressed): Appearance {
  return { suit: d.suit(), accessories: d.accessories().map((a) => a.acc) }
}

export function appearanceFromIds(suitId: string, accessoryIds: readonly (string | null)[]): Appearance {
  const suit = SUITS.find((s) => s.id === suitId) ?? SUITS[0]
  const accessories: AccSpec[] = []
  for (const id of accessoryIds) {
    const it = id ? ACCESSORIES_BY_ID.get(id) : undefined
    if (it) accessories.push(it.acc)
  }
  return { suit, accessories }
}

export interface Character {
  /** Place this in the world; the rig animates relative to it. */
  holder: THREE.Group
  rig: CharacterRig
  anim: CharacterAnimator
  /**
   * Scale every emissive on the body and its cosmetics (visor, glowing
   * accessories). 1 = cosmetic brightness; in a Blackout a bot passes its
   * emission scalar so nothing it wears reveals more than the contract allows.
   */
  setGlow(k: number): void
  dispose(): void
}

type Glowing = THREE.Material & { emissive?: THREE.Color; emissiveIntensity?: number; userData: Record<string, unknown> }

function scaleGlow(root: THREE.Object3D, k: number): void {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as Glowing | Glowing[] | undefined
    if (!m) return
    for (const mat of Array.isArray(m) ? m : [m]) {
      if (!mat.emissive || mat.emissiveIntensity === undefined) continue
      if (mat.userData.baseEmissive === undefined) mat.userData.baseEmissive = mat.emissiveIntensity
      mat.emissiveIntensity = (mat.userData.baseEmissive as number) * k
    }
  })
}

export function buildCharacter(app: Appearance): Character {
  const [body, trim, visor] = app.suit.colors
  const rig = new CharacterRig({ body, trim, visor })
  const holder = new THREE.Group()
  holder.add(rig.root)
  const anim = new CharacterAnimator(holder, rig)
  anim.setAccessories(app.accessories)
  return {
    holder,
    rig,
    anim,
    setGlow(k) {
      scaleGlow(holder, k)
    },
    dispose() {
      anim.dispose()
      holder.parent?.remove(holder)
      rig.dispose()
    },
  }
}
