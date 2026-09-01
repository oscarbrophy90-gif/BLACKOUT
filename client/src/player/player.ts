import { ARMOR_BY_ID, HEAL_BY_ID, MAX_ARMOR, MAX_HEALTH, applyHit } from '@blackout/shared'
import type { HealDef, Vitals } from '@blackout/shared'
import { audio } from '../core/audio.ts'
import { emit } from '../core/events.ts'
import { Inventory } from './inventory.ts'

// The local player's body: vitals, inventory, heal channelling. Movement
// lives in controller.ts; guns live in weapons/.

export class LocalPlayer {
  vitals: Vitals = { health: MAX_HEALTH, armor: 0 }
  inv = new Inventory()
  alive = true
  channel: { def: HealDef; tLeft: number } | null = null
  /** Who hurt us last, for kill credit and the death screen. */
  lastHitBy: string | null = null
  lastHitAt = 0
  onDeath: (() => void) | null = null

  takeDamage(raw: number, headshotMult: number, sourceAngle: number, attackerName: string, time: number): void {
    if (!this.alive) return
    const res = applyHit(this.vitals, raw, headshotMult)
    this.vitals = res.vitals
    this.lastHitBy = attackerName
    this.lastHitAt = time
    this.cancelChannel()
    audio.hurt()
    emit('playerDamaged', { angle: sourceAngle, amount: res.healthDamage + res.armorDamage })
    if (res.killed) {
      this.alive = false
      this.onDeath?.()
    }
  }

  /** Deadgrid / fall damage: unblockable by armor, no direction. */
  takeEnvironmentalDamage(amount: number, source: string): void {
    if (!this.alive) return
    this.vitals.health = Math.max(0, this.vitals.health - amount)
    if (this.vitals.health <= 0) {
      this.lastHitBy = source
      this.alive = false
      this.cancelChannel()
      this.onDeath?.()
    }
  }

  startHeal(healId: string): boolean {
    if (this.channel) return false
    const def = HEAL_BY_ID.get(healId)
    if (!def) return false
    const have = this.inv.heals.get(healId) ?? 0
    if (have <= 0) return false
    if (def.restoresArmor ? this.vitals.armor >= MAX_ARMOR : this.vitals.health >= MAX_HEALTH) return false
    this.channel = { def, tLeft: def.useTime }
    audio.heal()
    return true
  }

  cancelChannel(): void {
    this.channel = null
  }

  applyArmorPickup(armorId: string): boolean {
    const def = ARMOR_BY_ID.get(armorId)
    if (!def) return false
    if (this.vitals.armor >= def.armor) return false
    this.vitals.armor = def.armor
    return true
  }

  /** Returns true while channelling (HUD progress bar). */
  update(dt: number): boolean {
    if (!this.channel) return false
    this.channel.tLeft -= dt
    if (this.channel.tLeft <= 0) {
      const def = this.channel.def
      if (this.inv.useHeal(def.id)) {
        if (def.restoresArmor) this.vitals.armor = Math.min(MAX_ARMOR, this.vitals.armor + def.heals)
        else this.vitals.health = Math.min(MAX_HEALTH, this.vitals.health + def.heals)
      }
      this.channel = null
      audio.pickup()
    }
    return this.channel !== null
  }
}
