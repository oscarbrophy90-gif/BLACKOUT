import { AMMO_CAP, HEAL_BY_ID, WEAPON_BY_ID, scaledMag } from '@blackout/shared'
import type { AmmoType, ItemKind, Rarity } from '@blackout/shared'

// Two weapon slots, a melee that is always there, heals, ammo. Fast to
// reason about mid-fight; the HUD mirrors this exactly.

export interface CarriedWeapon {
  defId: string
  rarity: Rarity
  mag: number
}

export class Inventory {
  slots: [CarriedWeapon | null, CarriedWeapon | null] = [null, null]
  /** 0/1 = weapon slots, 2 = melee. */
  active: 0 | 1 | 2 = 2
  heals = new Map<string, number>()
  ammo: Record<AmmoType, number> = { light: 0, medium: 0, heavy: 0, shell: 0 }

  activeWeapon(): CarriedWeapon | null {
    return this.active === 2 ? null : this.slots[this.active]
  }

  /**
   * Pick a weapon up. Fills an empty slot, otherwise swaps the active slot.
   * Returns the weapon that got displaced (to drop on the ground), and which
   * slot the new weapon landed in.
   */
  pickupWeapon(defId: string, rarity: Rarity): { dropped: CarriedWeapon | null; slot: 0 | 1 } {
    const def = WEAPON_BY_ID.get(defId)!
    const carried: CarriedWeapon = { defId, rarity, mag: scaledMag(def, rarity) }
    if (this.slots[0] === null) {
      this.slots[0] = carried
      return { dropped: null, slot: 0 }
    }
    if (this.slots[1] === null) {
      this.slots[1] = carried
      return { dropped: null, slot: 1 }
    }
    const slot = this.active === 2 ? 0 : this.active
    const dropped = this.slots[slot]
    this.slots[slot] = carried
    return { dropped, slot }
  }

  addAmmo(type: AmmoType, amount: number): number {
    const space = AMMO_CAP[type] - this.ammo[type]
    const taken = Math.max(0, Math.min(space, amount))
    this.ammo[type] += taken
    return taken
  }

  addHeal(healId: string, amount: number): number {
    const def = HEAL_BY_ID.get(healId)
    if (!def) return 0
    const have = this.heals.get(healId) ?? 0
    const taken = Math.max(0, Math.min(def.stack - have, amount))
    if (taken > 0) this.heals.set(healId, have + taken)
    return taken
  }

  useHeal(healId: string): boolean {
    const have = this.heals.get(healId) ?? 0
    if (have <= 0) return false
    this.heals.set(healId, have - 1)
    return true
  }

  /** Can this pickup do anything for us? (Prevents E eating a full stack.) */
  canTake(item: ItemKind): boolean {
    switch (item.type) {
      case 'weapon':
        return true
      case 'ammo':
        return this.ammo[item.ammo] < AMMO_CAP[item.ammo]
      case 'heal': {
        const def = HEAL_BY_ID.get(item.healId)
        return def !== undefined && (this.heals.get(item.healId) ?? 0) < def.stack
      }
      case 'armor':
        return true
    }
  }
}
