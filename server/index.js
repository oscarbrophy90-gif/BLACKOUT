// BLACKOUT server — Phase 3 skeleton.
//
// Today this serves the built game and exposes the health/matchmaking stubs
// the client will talk to. The authoritative match loop lands here in
// Phase 3 (docs/NETWORKING.md): it will import the SAME rules the client
// uses — @blackout/shared — so damage, loot, zone and XP are computed once,
// server-side, and the client becomes a renderer of snapshots.
//
// Design rules already honoured by this skeleton:
//  - the client is never trusted with damage, inventory, currency or results
//  - matches are seeded server-side so loot/zone can be replayed and audited
//  - player data persists behind a storage seam (see store.js)

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Store } from './store.js'

const here = dirname(fileURLToPath(import.meta.url))
const store = new Store(join(here, 'data', 'players.json'))

const PORT = Number(process.env.PORT ?? 3000)
const ROOTS = [join(here, 'public'), join(here, '..', 'dist-standalone'), join(here, '..', 'client', 'dist')]
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
}

async function findFile(rel) {
  for (const root of ROOTS) {
    const path = join(root, rel)
    try {
      const s = await stat(path)
      if (s.isFile()) return path
    } catch {
      // keep looking
    }
  }
  return null
}

export function createApp() {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    // ——— API stubs the Phase 3 client will use ———
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, name: 'blackout', matchCapacity: 100 }))
      return
    }
    if (url.pathname === '/api/profile' && req.method === 'GET') {
      const id = url.searchParams.get('id') ?? ''
      const profile = await store.get(id)
      res.writeHead(profile ? 200 : 404, { 'content-type': 'application/json' })
      res.end(JSON.stringify(profile ?? { error: 'unknown player' }))
      return
    }
    // ——— Static game ———
    const rel = url.pathname === '/' ? 'BLACKOUT.html' : url.pathname.slice(1).replaceAll('..', '')
    const file = (await findFile(rel)) ?? (await findFile('BLACKOUT.html')) ?? (await findFile('index.html'))
    if (!file) {
      res.writeHead(404)
      res.end('BLACKOUT: run `npm run build:standalone` first')
      return
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(await readFile(file))
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createApp().listen(PORT, '0.0.0.0', () => {
    console.log(`BLACKOUT serving on http://0.0.0.0:${PORT}`)
  })
}
