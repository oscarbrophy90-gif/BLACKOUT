// Usage: node --experimental-strip-types shared/scripts/check-catalog.mjs <celebration|emote|weaponSkin|accessory>
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
const category = process.argv[2]
const files = {
  celebration: ['celebrations.ts', 'CELEBRATIONS'],
  emote: ['emotes.ts', 'EMOTES'],
  weaponSkin: ['weaponskins.ts', 'WEAPON_SKINS_CATALOG'],
  accessory: ['accessories.ts', 'ACCESSORIES'],
}
if (!files[category]) {
  console.error('unknown category')
  process.exit(2)
}
const [file, exportName] = files[category]
const mod = await import(pathToFileURL(resolve('shared/src/catalog', file)).href)
const validate = await import(pathToFileURL(resolve('shared/src/catalog/validate.ts')).href)
const items = mod[exportName]
const errors = validate.validateCategory(items, category)
if (errors.length) {
  console.log(`${errors.length} problems:`)
  for (const e of errors.slice(0, 40)) console.log(' -', e)
  process.exit(1)
}
console.log(`OK: ${items.length} ${category} items valid`)
