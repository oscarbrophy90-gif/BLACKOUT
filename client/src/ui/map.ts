import { DISTRICTS, heightAt } from '../world/terrain.ts'
import { WATER_LEVEL } from '../config.ts'

// Top-down island rendering shared by the minimap and the deploy screen.
// World extent drawn: -1000..1000 on both axes.

export const MAP_EXTENT = 1000

export function worldToMap(x: number, z: number, size: number): { mx: number; my: number } {
  return {
    mx: ((x + MAP_EXTENT) / (MAP_EXTENT * 2)) * size,
    my: ((z + MAP_EXTENT) / (MAP_EXTENT * 2)) * size,
  }
}

export function mapToWorld(mx: number, my: number, size: number): { x: number; z: number } {
  return {
    x: (mx / size) * MAP_EXTENT * 2 - MAP_EXTENT,
    z: (my / size) * MAP_EXTENT * 2 - MAP_EXTENT,
  }
}

/** Renders the island base once; callers stamp dynamic layers over it. */
export function renderIslandBase(size: number, labels: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d')!
  const cell = Math.max(2, Math.floor(size / 150))
  for (let py = 0; py < size; py += cell) {
    for (let px = 0; px < size; px += cell) {
      const { x, z } = mapToWorld(px + cell / 2, py + cell / 2, size)
      const h = heightAt(x, z)
      let c: string
      if (h <= WATER_LEVEL + 0.4) c = '#0d1622'
      else if (h < 1.2) c = '#4a4438'
      else if (h > 34) c = '#4e4b56'
      else if (h > 20) c = '#43414a'
      else c = '#2e3a2c'
      g.fillStyle = c
      g.fillRect(px, py, cell, cell)
    }
  }
  // District tint + labels.
  for (const d of DISTRICTS) {
    const { mx, my } = worldToMap(d.cx, d.cz, size)
    const r = (d.r / (MAP_EXTENT * 2)) * size
    g.beginPath()
    g.arc(mx, my, r, 0, Math.PI * 2)
    g.strokeStyle = 'rgba(57,240,224,0.18)'
    g.lineWidth = 1
    g.stroke()
    if (labels) {
      g.fillStyle = 'rgba(230,235,245,0.82)'
      g.font = `600 ${Math.max(10, size / 46)}px system-ui, sans-serif`
      g.textAlign = 'center'
      g.fillText(d.name.toUpperCase(), mx, my - r - 4)
    }
  }
  return canvas
}
