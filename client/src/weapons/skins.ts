import * as THREE from 'three'
import type { SkinSpec, WeaponSkinItem } from '@blackout/shared'
import { WEAPON_SKINS_BY_ID } from '@blackout/shared'
import { Emitter, particleRecipe } from '../world/particles.ts'

// Weapon skins are procedural: a canvas texture drawn from the spec's
// pattern + palette, a finish that sets the PBR response, an emissive
// behaviour for the trim, and an optional particle emitter on the gun.

const texCache = new Map<string, THREE.CanvasTexture>()

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function rngFrom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function skinTexture(spec: SkinSpec): THREE.CanvasTexture {
  const key = `${spec.pattern}|${spec.palette.join('')}`
  const cached = texCache.get(key)
  if (cached) return cached
  const S = 256
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const g = c.getContext('2d')!
  const [body, accent, trim] = spec.palette
  const rnd = rngFrom(hashStr(key))
  g.fillStyle = body
  g.fillRect(0, 0, S, S)
  g.lineWidth = 2
  const stroke = (col: string, w = 2) => { g.strokeStyle = col; g.lineWidth = w }
  switch (spec.pattern) {
    case 'solid': break
    case 'camo':
      for (let i = 0; i < 60; i++) {
        g.fillStyle = i % 3 === 0 ? trim : accent
        g.beginPath()
        const x = rnd() * S, y = rnd() * S
        g.ellipse(x, y, 12 + rnd() * 30, 8 + rnd() * 20, rnd() * 3, 0, Math.PI * 2)
        g.fill()
      }
      break
    case 'stripes':
      g.fillStyle = accent
      for (let i = -S; i < S * 2; i += 28) { g.save(); g.translate(i, 0); g.rotate(0.6); g.fillRect(0, -S, 12, S * 3); g.restore() }
      break
    case 'hex':
      stroke(accent)
      for (let y = 0; y < S + 20; y += 18) for (let x = (y / 18) % 2 ? 10 : 0; x < S + 20; x += 20) {
        g.beginPath()
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; g.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9) }
        g.closePath(); g.stroke()
      }
      break
    case 'circuit':
      stroke(trim, 2)
      for (let i = 0; i < 40; i++) {
        let x = rnd() * S, y = rnd() * S
        g.beginPath(); g.moveTo(x, y)
        for (let k = 0; k < 4; k++) { if (rnd() < 0.5) x += (rnd() - 0.5) * 80; else y += (rnd() - 0.5) * 80; g.lineTo(x, y) }
        g.stroke(); g.fillStyle = trim; g.fillRect(x - 3, y - 3, 6, 6)
      }
      break
    case 'scales':
      stroke(accent, 2)
      for (let y = 0; y < S + 16; y += 12) for (let x = (y / 12) % 2 ? 8 : 0; x < S + 16; x += 16) { g.beginPath(); g.arc(x, y, 8, 0, Math.PI); g.stroke() }
      break
    case 'cracks':
      stroke(trim, 2)
      for (let i = 0; i < 18; i++) { let x = rnd() * S, y = rnd() * S; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; g.lineTo(x, y) } g.stroke() }
      break
    case 'waves':
      stroke(accent, 3)
      for (let y = 0; y < S; y += 14) { g.beginPath(); for (let x = 0; x <= S; x += 4) g.lineTo(x, y + Math.sin(x / 14) * 5); g.stroke() }
      break
    case 'stars':
      g.fillStyle = trim
      for (let i = 0; i < 90; i++) { const r = 1 + rnd() * 2.5; g.beginPath(); g.arc(rnd() * S, rnd() * S, r, 0, Math.PI * 2); g.fill() }
      break
    case 'digital':
      for (let y = 0; y < S; y += 16) for (let x = 0; x < S; x += 16) { const v = rnd(); g.fillStyle = v < 0.3 ? accent : v < 0.45 ? trim : body; g.fillRect(x, y, 16, 16) }
      break
    case 'marble':
      stroke(trim, 1.5)
      for (let i = 0; i < 12; i++) { let x = rnd() * S; g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= S; y += 8) { x += (rnd() - 0.5) * 12; g.lineTo(x, y) } g.stroke() }
      g.fillStyle = accent; g.globalAlpha = 0.3; for (let i = 0; i < 10; i++) { g.beginPath(); g.ellipse(rnd() * S, rnd() * S, 40, 14, rnd(), 0, Math.PI * 2); g.fill() } g.globalAlpha = 1
      break
    case 'carbon':
      for (let y = 0; y < S; y += 8) for (let x = 0; x < S; x += 8) { g.fillStyle = ((x + y) / 8) % 2 ? accent : body; g.fillRect(x, y, 8, 8) }
      g.fillStyle = trim; g.globalAlpha = 0.12; for (let y = 0; y < S; y += 8) g.fillRect(0, y, S, 2); g.globalAlpha = 1
      break
    case 'tiger':
      g.fillStyle = accent
      for (let i = 0; i < 14; i++) { g.beginPath(); const y = rnd() * S; g.moveTo(0, y); g.bezierCurveTo(S * 0.3, y + 30, S * 0.6, y - 30, S, y + (rnd() - 0.5) * 40); g.lineTo(S, y + 14); g.bezierCurveTo(S * 0.6, y - 16, S * 0.3, y + 44, 0, y + 14); g.fill() }
      break
    case 'splatter':
      for (let i = 0; i < 50; i++) { g.fillStyle = rnd() < 0.5 ? accent : trim; g.beginPath(); g.arc(rnd() * S, rnd() * S, 2 + rnd() * 14, 0, Math.PI * 2); g.fill() }
      break
    case 'grid':
      stroke(trim, 1)
      for (let i = 0; i <= S; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.moveTo(0, i); g.lineTo(S, i); g.stroke() }
      break
    case 'runes':
      stroke(trim, 3)
      for (let i = 0; i < 24; i++) { const x = 20 + (i % 6) * 40, y = 20 + Math.floor(i / 6) * 60; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10, y + 30); g.lineTo(x - 8, y + 18); g.lineTo(x + 12, y + 8); g.stroke() }
      break
    case 'flames':
      for (let i = 0; i < 30; i++) { g.fillStyle = i % 2 ? accent : trim; g.beginPath(); const x = rnd() * S; g.moveTo(x, S); g.quadraticCurveTo(x + 20, S - 60 - rnd() * 60, x + (rnd() - 0.5) * 30, S - 120 - rnd() * 100); g.quadraticCurveTo(x - 20, S - 60, x - 12, S); g.fill() }
      break
    case 'frost':
      stroke(trim, 1.5)
      for (let i = 0; i < 16; i++) { const x = rnd() * S, y = rnd() * S; for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 22, y + Math.sin(a) * 22); g.stroke() } }
      break
    case 'leaves':
      for (let i = 0; i < 40; i++) { g.fillStyle = i % 3 ? accent : trim; g.save(); g.translate(rnd() * S, rnd() * S); g.rotate(rnd() * 6); g.beginPath(); g.ellipse(0, 0, 16, 7, 0, 0, Math.PI * 2); g.fill(); g.restore() }
      break
    case 'ripples':
      stroke(accent, 2)
      for (let i = 0; i < 6; i++) { const x = rnd() * S, y = rnd() * S; for (let r = 6; r < 60; r += 10) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke() } }
      break
    case 'gears':
      stroke(trim, 3)
      for (let i = 0; i < 9; i++) { const x = 30 + (i % 3) * 90, y = 30 + Math.floor(i / 3) * 90, r = 18 + rnd() * 10; g.beginPath(); for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; const rr = k % 2 ? r : r + 7; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) } g.closePath(); g.stroke() }
      break
    case 'chevrons':
      stroke(accent, 8)
      for (let y = -20; y < S + 20; y += 28) { g.beginPath(); g.moveTo(0, y); g.lineTo(S / 2, y + 22); g.lineTo(S, y); g.stroke() }
      break
    case 'constellation': {
      g.fillStyle = trim; stroke(trim, 1)
      const pts: [number, number][] = []
      for (let i = 0; i < 26; i++) { const p: [number, number] = [rnd() * S, rnd() * S]; pts.push(p); g.beginPath(); g.arc(p[0], p[1], 2.5, 0, Math.PI * 2); g.fill() }
      for (let i = 1; i < pts.length; i++) if (rnd() < 0.6) { g.beginPath(); g.moveTo(...pts[i - 1]); g.lineTo(...pts[i]); g.stroke() }
      break
    }
    case 'veins':
      stroke(trim, 2)
      for (let i = 0; i < 10; i++) { let x = rnd() * S, y = 0; g.beginPath(); g.moveTo(x, y); while (y < S) { y += 10; x += (rnd() - 0.5) * 18; g.lineTo(x, y); if (rnd() < 0.2) { g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 40, y + 12); g.moveTo(x, y) } } g.stroke() }
      break
    case 'checker':
      for (let y = 0; y < S; y += 32) for (let x = 0; x < S; x += 32) { g.fillStyle = ((x + y) / 32) % 2 ? accent : body; g.fillRect(x, y, 32, 32) }
      break
    case 'dots':
      g.fillStyle = trim
      for (let y = 12; y < S; y += 24) for (let x = 12; x < S; x += 24) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill() }
      break
    case 'zigzag':
      stroke(accent, 6)
      for (let y = 0; y < S + 20; y += 24) { g.beginPath(); for (let x = 0; x <= S; x += 16) g.lineTo(x, y + ((x / 16) % 2 ? 10 : -10)); g.stroke() }
      break
    case 'tribal':
      stroke(trim, 4)
      for (let i = 0; i < 12; i++) { const x = rnd() * S, y = rnd() * S; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 40, y - 40, x + 60, y + 40, x + 20, y + 60); g.stroke() }
      break
    case 'lattice':
      stroke(accent, 2)
      for (let i = -S; i < S * 2; i += 20) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.moveTo(i, S); g.lineTo(i + S, 0); g.stroke() }
      break
    case 'topo':
      stroke(trim, 1.5)
      for (let r = 10; r < 200; r += 14) { g.beginPath(); for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.15) { const rr = r + Math.sin(a * 3) * 8 + Math.cos(a * 5) * 5; g.lineTo(S * 0.4 + Math.cos(a) * rr, S * 0.55 + Math.sin(a) * rr) } g.stroke() }
      break
    case 'static':
      for (let y = 0; y < S; y += 2) for (let x = 0; x < S; x += 2) { if (rnd() < 0.35) { g.fillStyle = rnd() < 0.5 ? accent : trim; g.fillRect(x, y, 2, 2) } }
      break
    case 'plaid':
      g.globalAlpha = 0.5
      g.fillStyle = accent; for (let i = 0; i < S; i += 32) { g.fillRect(i, 0, 12, S); g.fillRect(0, i, S, 12) }
      g.fillStyle = trim; for (let i = 16; i < S; i += 32) { g.fillRect(i, 0, 4, S); g.fillRect(0, i, S, 4) }
      g.globalAlpha = 1
      break
    case 'spiral':
      stroke(trim, 3)
      g.beginPath(); for (let a = 0; a < 40; a += 0.1) g.lineTo(S / 2 + Math.cos(a) * a * 3.2, S / 2 + Math.sin(a) * a * 3.2); g.stroke()
      break
    case 'eyes':
      for (let i = 0; i < 12; i++) { const x = rnd() * S, y = rnd() * S; g.fillStyle = trim; g.beginPath(); g.ellipse(x, y, 16, 9, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = accent; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill() }
      break
    case 'bones':
      stroke(trim, 5)
      for (let i = 0; i < 14; i++) { const x = rnd() * S, y = rnd() * S, a = rnd() * 3; g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(-18, 0); g.lineTo(18, 0); g.stroke(); g.fillStyle = trim; for (const [dx, dy] of [[-18, -4], [-18, 4], [18, -4], [18, 4]]) { g.beginPath(); g.arc(dx, dy, 4, 0, Math.PI * 2); g.fill() } g.restore() }
      break
    case 'clouds':
      g.fillStyle = trim; g.globalAlpha = 0.5
      for (let i = 0; i < 20; i++) { const x = rnd() * S, y = rnd() * S; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + k * 12, y + (k % 2) * 6, 10 + rnd() * 6, 0, Math.PI * 2); g.fill() } }
      g.globalAlpha = 1
      break
    case 'feathers':
      stroke(accent, 1.5)
      for (let i = 0; i < 16; i++) { const x = rnd() * S, y = rnd() * S, a = rnd() * 6; g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(0, -24); g.lineTo(0, 24); g.stroke(); for (let k = -20; k <= 20; k += 5) { g.beginPath(); g.moveTo(0, k); g.lineTo(k < 0 ? 10 : -10, k + 4); g.stroke() } g.restore() }
      break
    case 'scratches':
      stroke(trim, 1)
      for (let i = 0; i < 70; i++) { const x = rnd() * S, y = rnd() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 50, y + (rnd() - 0.5) * 12); g.stroke() }
      break
    case 'rivets':
      g.fillStyle = accent; for (let i = 0; i < S; i += 42) { g.fillRect(i, 0, 3, S); g.fillRect(0, i, S, 3) }
      g.fillStyle = trim; for (let y = 8; y < S; y += 42) for (let x = 8; x < S; x += 42) { g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill() }
      break
    case 'weave':
      for (let y = 0; y < S; y += 10) for (let x = 0; x < S; x += 10) { g.fillStyle = ((x + y) / 10) % 2 ? accent : body; g.fillRect(x, y, 10, 10); g.fillStyle = trim; g.globalAlpha = 0.15; g.fillRect(x, y + (((x + y) / 10) % 2 ? 0 : 5), 10, 1); g.globalAlpha = 1 }
      break
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  texCache.set(key, tex)
  return tex
}

export interface SkinMaterials {
  body: THREE.MeshStandardMaterial
  accent: THREE.MeshStandardMaterial
  trim: THREE.MeshBasicMaterial
}

export function makeSkinMaterials(): SkinMaterials {
  return {
    body: new THREE.MeshStandardMaterial({ color: '#3c4450', roughness: 0.8, metalness: 0.2 }),
    accent: new THREE.MeshStandardMaterial({ color: '#2a2f38', roughness: 0.7, metalness: 0.4 }),
    trim: new THREE.MeshBasicMaterial({ color: '#8899aa' }),
  }
}

/** Point the materials at a skin. Returns the emissive animation state. */
export function applySkin(mats: SkinMaterials, spec: SkinSpec, scale = 1): { update: (t: number) => void; particles: Emitter | null } {
  const tex = skinTexture(spec)
  tex.repeat.set(3 * scale, 3 * scale)
  mats.body.map = tex
  mats.body.color.set('#ffffff')
  mats.accent.color.set(spec.palette[1])
  mats.accent.map = null
  const finish: Record<SkinSpec['finish'], [number, number, number]> = {
    matte: [0.92, 0.05, 1], gloss: [0.28, 0.15, 1], metal: [0.38, 0.9, 1], holo: [0.2, 0.7, 1],
    chrome: [0.08, 1, 1], satin: [0.55, 0.35, 1], rough: [1, 0, 1], glass: [0.05, 0.25, 0.82],
  }
  const [rough, metal, opacity] = finish[spec.finish]
  for (const m of [mats.body, mats.accent]) {
    m.roughness = rough
    m.metalness = metal
    m.transparent = opacity < 1
    m.opacity = opacity
    m.needsUpdate = true
  }
  if (spec.finish === 'holo') mats.body.emissive.set(spec.palette[2]).multiplyScalar(0.25)
  else mats.body.emissive.set('#000000')
  const trimBase = new THREE.Color(spec.palette[2])
  mats.trim.color.copy(trimBase)
  const recipe = spec.particles !== 'none' ? particleRecipe(spec.particles, spec.palette[2], 0.6 * scale) : null
  const particles = recipe ? new Emitter({ ...recipe, count: 30 }) : null
  const update = (t: number): void => {
    let k = 1
    switch (spec.emissive) {
      case 'pulse': k = 0.55 + 0.45 * Math.sin(t * 3); break
      case 'scroll': tex.offset.y = (t * 0.15) % 1; k = 1; break
      case 'flicker': k = Math.random() < 0.08 ? 0.2 : 1; break
      case 'rainbow': mats.trim.color.setHSL((t * 0.15) % 1, 0.9, 0.6); return
      case 'breathe': k = 0.7 + 0.3 * Math.sin(t * 1.4); break
      case 'strobe': k = Math.sin(t * 12) > 0 ? 1.2 : 0.15; break
      case 'wave': k = 0.6 + 0.4 * Math.sin(t * 5); tex.offset.x = Math.sin(t) * 0.05; break
      case 'heartbeat': { const p = t % 1.2; k = p < 0.15 ? 1.3 : p < 0.3 ? 0.6 : p < 0.45 ? 1.1 : 0.45; break }
      default: k = 1
    }
    mats.trim.color.copy(trimBase).multiplyScalar(k)
  }
  return { update, particles }
}

export function skinById(id: string): WeaponSkinItem | undefined {
  return WEAPON_SKINS_BY_ID.get(id)
}
