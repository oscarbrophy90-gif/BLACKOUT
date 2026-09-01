import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../index.js'
import { Store } from '../store.js'

test('health endpoint answers', async () => {
  const app = createApp()
  app.listen(0)
  await once(app, 'listening')
  const port = app.address().port
  const res = await fetch(`http://127.0.0.1:${port}/api/health`)
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.matchCapacity, 100)
  app.close()
})

test('store round-trips a profile', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'blackout-'))
  const store = new Store(join(dir, 'players.json'))
  assert.equal(await store.get('p1'), null)
  await store.put('p1', { name: 'Voltwalker', xp: 1200 })
  const fresh = new Store(join(dir, 'players.json'))
  const got = await fresh.get('p1')
  assert.equal(got.name, 'Voltwalker')
  assert.equal(got.xp, 1200)
  await rm(dir, { recursive: true, force: true })
})

test('unknown profiles 404', async () => {
  const app = createApp()
  app.listen(0)
  await once(app, 'listening')
  const port = app.address().port
  const res = await fetch(`http://127.0.0.1:${port}/api/profile?id=nobody`)
  assert.equal(res.status, 404)
  app.close()
})
