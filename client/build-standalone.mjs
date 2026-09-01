// Builds dist-standalone/BLACKOUT.html — the whole game in one self-contained
// file that opens from disk in any browser. Run `npm run build:standalone`.
//
// Vite has already produced client/dist (one JS bundle, one CSS file at most,
// one HTML shell). This script inlines every asset reference back into the
// HTML so nothing needs a server or a network connection.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, 'dist')
const outDir = join(here, '..', 'dist-standalone')

let html = readFileSync(join(dist, 'index.html'), 'utf8')
const assets = join(dist, 'assets')

for (const file of readdirSync(assets)) {
  const content = readFileSync(join(assets, file), 'utf8')
  if (file.endsWith('.js')) {
    const tag = new RegExp(
      `<script type="module"[^>]*src="[^"]*${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*></script>`,
    )
    if (!tag.test(html)) throw new Error(`No script tag found for ${file}`)
    // </script> inside string literals would terminate the inline tag early.
    const safe = content.replace(/<\/script>/g, '<\\/script>')
    html = html.replace(tag, () => `<script type="module">${safe}</script>`)
  } else if (file.endsWith('.css')) {
    const tag = new RegExp(
      `<link rel="stylesheet"[^>]*href="[^"]*${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`,
    )
    if (!tag.test(html)) throw new Error(`No link tag found for ${file}`)
    html = html.replace(tag, () => `<style>${content}</style>`)
  }
}

if (/(src|href)="\.?\/assets\//.test(html)) {
  throw new Error('Standalone build still references external assets')
}

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'BLACKOUT.html'), html)
console.log(`Wrote ${join(outDir, 'BLACKOUT.html')} (${(html.length / 1024 / 1024).toFixed(2)} MB)`)
