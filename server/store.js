// Player-data storage seam. A JSON file today; docs/DATABASE.md describes
// the real schema. Everything above this class only knows these four
// methods, so swapping in a database later touches one file.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export class Store {
  constructor(path) {
    this.path = path
    this.cache = null
  }

  async load() {
    if (this.cache) return this.cache
    try {
      this.cache = JSON.parse(await readFile(this.path, 'utf8'))
    } catch {
      this.cache = { players: {} }
    }
    return this.cache
  }

  async get(id) {
    const data = await this.load()
    return data.players[id] ?? null
  }

  async put(id, profile) {
    const data = await this.load()
    data.players[id] = profile
    await mkdir(dirname(this.path), { recursive: true })
    await writeFile(this.path, JSON.stringify(data, null, 2))
  }

  async all() {
    const data = await this.load()
    return Object.values(data.players)
  }
}
