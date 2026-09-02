import * as THREE from 'three'
import type { AccSpec } from '@blackout/shared'
import { Emitter, particleRecipe } from '../world/particles.ts'

// Builds any accessory from its AccSpec. Shapes are grouped into families
// with parameters so 100 shapes stay ~40 builders; motion and particles
// come from the vocabulary too.

export type AccSocket = 'head' | 'face' | 'back' | 'shoulderR' | 'wristR' | 'neck' | 'waist' | 'float' | 'aura' | 'pet'

export interface BuiltAccessory {
  obj: THREE.Object3D
  socket: AccSocket
  emitter: Emitter | null
  update: (t: number, dt: number) => void
}

function lam(color: string, emissive: boolean, opacity = 1): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color,
    emissive: emissive ? color : '#000000',
    emissiveIntensity: emissive ? 0.9 : 0,
    transparent: opacity < 1,
    opacity,
  })
}
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  b.position.set(x, y, z)
  return b
}
const cyl = (rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 10) => {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m)
  c.position.set(x, y, z)
  return c
}
const sph = (r: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), m)
  s.position.set(x, y, z)
  return s
}
const torus = (r: number, tube: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const t = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 18), m)
  t.position.set(x, y, z)
  return t
}
const cone = (r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 8) => {
  const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m)
  c.position.set(x, y, z)
  return c
}

export function buildAccessory(spec: AccSpec): BuiltAccessory {
  const [c0, c1, c2] = spec.palette
  const e = spec.emissive
  const M0 = lam(c0, false)
  const M1 = lam(c1, false)
  const M2 = lam(c2, e)
  const g = new THREE.Group()
  const s = spec.scale
  let socket: AccSocket = 'head'
  const movers: THREE.Object3D[] = []
  let wingL: THREE.Object3D | null = null
  let wingR: THREE.Object3D | null = null

  switch (spec.shape) {
    // ——— head ———
    case 'cap': g.add(cyl(0.24, 0.24, 0.12, M0, 0, -0.06), box(0.22, 0.02, 0.2, M1, 0, -0.1, -0.22)); break
    case 'beanie': g.add(sph(0.26, M0, 0, -0.08), torus(0.24, 0.05, M1, 0, -0.14)); g.children[0].scale.y = 0.75; break
    case 'helmet': g.add(sph(0.27, M0, 0, -0.1), box(0.3, 0.06, 0.1, M2, 0, -0.05, -0.24)); break
    case 'crown': {
      g.add(cyl(0.22, 0.2, 0.1, M0, 0, -0.02, 0, 8))
      for (let i = 0; i < 6; i++) g.add(box(0.045, 0.14, 0.045, M0, Math.cos((i / 6) * Math.PI * 2) * 0.2, 0.09, Math.sin((i / 6) * Math.PI * 2) * 0.2))
      g.add(sph(0.04, M2, 0, 0.06, -0.2))
      break
    }
    case 'halo': { const h = torus(0.24, 0.025, M2, 0, 0.16); h.rotation.x = Math.PI / 2; g.add(h); movers.push(h); break }
    case 'horns': { const l = cone(0.05, 0.22, M0, -0.16, 0.06); l.rotation.z = 0.5; const r = cone(0.05, 0.22, M0, 0.16, 0.06); r.rotation.z = -0.5; g.add(l, r); break }
    case 'antenna': { const a = cyl(0.01, 0.01, 0.35, M1, 0, 0.12); const tip = sph(0.04, M2, 0, 0.3); g.add(a, tip); movers.push(tip); break }
    case 'hood': { const h = sph(0.3, M0, 0, -0.1, 0.06); h.scale.set(1, 1.05, 1); g.add(h, box(0.5, 0.2, 0.06, M0, 0, -0.35, 0.16)); break }
    case 'bandana': g.add(torus(0.23, 0.04, M0, 0, -0.06), box(0.08, 0.2, 0.02, M0, 0.1, -0.2, 0.22)); g.children[0].rotation.x = Math.PI / 2; break
    case 'headphones': { const band = torus(0.25, 0.025, M0, 0, -0.06); band.rotation.y = Math.PI / 2; g.add(band, cyl(0.07, 0.07, 0.05, M1, -0.25, -0.12), cyl(0.07, 0.07, 0.05, M1, 0.25, -0.12)); g.children[1].rotation.z = Math.PI / 2; g.children[2].rotation.z = Math.PI / 2; break }
    case 'mohawk': for (let i = 0; i < 6; i++) g.add(box(0.06, 0.18 + (i === 2 || i === 3 ? 0.06 : 0), 0.06, M2, 0, 0.06, -0.18 + i * 0.07)); break
    case 'tiara': g.add(torus(0.22, 0.02, M0, 0, -0.04), sph(0.04, M2, 0, 0.04, -0.2), sph(0.025, M2, -0.1, 0.0, -0.18), sph(0.025, M2, 0.1, 0.0, -0.18)); g.children[0].rotation.x = Math.PI / 2; break
    case 'tophat': g.add(cyl(0.2, 0.2, 0.32, M0, 0, 0.1), cyl(0.3, 0.3, 0.02, M0, 0, -0.06), torus(0.2, 0.025, M1, 0, -0.02)); g.children[2].rotation.x = Math.PI / 2; break
    case 'cowboyhat': g.add(cyl(0.18, 0.2, 0.16, M0, 0, 0.02), cyl(0.36, 0.36, 0.02, M0, 0, -0.06), torus(0.19, 0.02, M1, 0, -0.03)); g.children[2].rotation.x = Math.PI / 2; break
    case 'beret': { const b = sph(0.27, M0, 0.06, -0.06); b.scale.y = 0.45; g.add(b, sph(0.03, M1, 0, 0.06)); break }
    case 'headband': g.add(torus(0.23, 0.03, M2, 0, -0.05)); g.children[0].rotation.x = Math.PI / 2; break
    case 'flame_crown': { for (let i = 0; i < 7; i++) { const fl = cone(0.05, 0.16 + (i % 2) * 0.08, M2, Math.cos((i / 7) * Math.PI * 2) * 0.2, 0.08, Math.sin((i / 7) * Math.PI * 2) * 0.2); g.add(fl); movers.push(fl) } break }
    case 'bucket': g.add(cyl(0.22, 0.27, 0.16, M0, 0, -0.06), cyl(0.31, 0.31, 0.02, M0, 0, -0.14)); break
    case 'wizardhat': g.add(cone(0.22, 0.5, M0, 0, 0.16), cyl(0.34, 0.34, 0.02, M0, 0, -0.08), torus(0.22, 0.02, M2, 0, -0.05)); g.children[2].rotation.x = Math.PI / 2; break
    case 'crownspikes': { g.add(cyl(0.22, 0.22, 0.08, M1, 0, -0.02, 0, 6)); for (let i = 0; i < 8; i++) g.add(cone(0.03, 0.2, M2, Math.cos((i / 8) * Math.PI * 2) * 0.21, 0.1, Math.sin((i / 8) * Math.PI * 2) * 0.21)); break }

    // ——— face ———
    case 'glasses': socket = 'face'; g.add(box(0.11, 0.07, 0.02, M0, -0.075, 0.02), box(0.11, 0.07, 0.02, M0, 0.075, 0.02), box(0.04, 0.015, 0.015, M0, 0, 0.03)); break
    case 'visor': socket = 'face'; g.add(box(0.3, 0.08, 0.03, M2, 0, 0.02)); break
    case 'mask': socket = 'face'; g.add(box(0.28, 0.18, 0.04, M0, 0, -0.06), box(0.06, 0.04, 0.01, M2, -0.07, -0.03, -0.02), box(0.06, 0.04, 0.01, M2, 0.07, -0.03, -0.02)); break
    case 'goggles': socket = 'face'; g.add(cyl(0.06, 0.06, 0.04, M0, -0.08, 0.02), cyl(0.06, 0.06, 0.04, M0, 0.08, 0.02), cyl(0.045, 0.045, 0.045, M2, -0.08, 0.02), cyl(0.045, 0.045, 0.045, M2, 0.08, 0.02)); g.children.forEach((c) => (c.rotation.x = Math.PI / 2)); break
    case 'monocle': socket = 'face'; { const m = torus(0.05, 0.012, M0, 0.08, 0.02); g.add(m, cyl(0.004, 0.004, 0.14, M0, 0.13, -0.06)); break }
    case 'respirator': socket = 'face'; g.add(box(0.22, 0.14, 0.08, M0, 0, -0.08, 0.01), cyl(0.05, 0.05, 0.05, M1, -0.1, -0.1, -0.03), cyl(0.05, 0.05, 0.05, M1, 0.1, -0.1, -0.03)); g.children[1].rotation.x = Math.PI / 2; g.children[2].rotation.x = Math.PI / 2; break
    case 'facepaint': socket = 'face'; g.add(box(0.26, 0.05, 0.005, M2, 0, 0.02, 0.005), box(0.05, 0.16, 0.005, M2, -0.09, -0.04, 0.005), box(0.05, 0.16, 0.005, M2, 0.09, -0.04, 0.005)); break
    case 'eyepatch': socket = 'face'; g.add(box(0.09, 0.08, 0.02, M0, 0.07, 0.02), box(0.3, 0.012, 0.012, M0, 0, 0.05, 0.1)); break
    case 'muzzle': socket = 'face'; g.add(box(0.18, 0.12, 0.08, M0, 0, -0.08, 0.02), box(0.16, 0.02, 0.02, M2, 0, -0.06, -0.02), box(0.16, 0.02, 0.02, M2, 0, -0.1, -0.02)); break
    case 'blindfold': socket = 'face'; g.add(box(0.3, 0.07, 0.03, M0, 0, 0.02), box(0.06, 0.16, 0.02, M0, 0.12, -0.04, 0.2)); break

    // ——— back ———
    case 'wings': { socket = 'back'; wingL = box(0.6, 0.34, 0.02, M2, -0.4, 0.05, 0.05); wingR = box(0.6, 0.34, 0.02, M2, 0.4, 0.05, 0.05); g.add(wingL, wingR); break }
    case 'backpack': socket = 'back'; g.add(box(0.4, 0.5, 0.22, M0, 0, -0.1, 0.12), box(0.3, 0.16, 0.08, M1, 0, 0.1, 0.27)); break
    case 'jetpack': socket = 'back'; g.add(cyl(0.09, 0.09, 0.5, M0, -0.13, -0.1, 0.15), cyl(0.09, 0.09, 0.5, M0, 0.13, -0.1, 0.15), cone(0.06, 0.1, M2, -0.13, -0.4, 0.15), cone(0.06, 0.1, M2, 0.13, -0.4, 0.15)); g.children[2].rotation.x = Math.PI; g.children[3].rotation.x = Math.PI; break
    case 'quiver': socket = 'back'; { const q = cyl(0.07, 0.07, 0.5, M0, 0.12, 0.0, 0.14); q.rotation.z = 0.35; g.add(q); for (let i = 0; i < 4; i++) g.add(cyl(0.008, 0.008, 0.2, M1, 0.22 + i * 0.02 - 0.03, 0.34, 0.14)); break }
    case 'sword_back': socket = 'back'; { const sw = box(0.05, 0.8, 0.012, M1, 0, 0.05, 0.14); sw.rotation.z = 0.6; g.add(sw, box(0.16, 0.03, 0.03, M2, -0.2, 0.3, 0.14)); break }
    case 'shield': socket = 'back'; g.add(cyl(0.3, 0.3, 0.04, M0, 0, -0.05, 0.15, 8), cyl(0.08, 0.08, 0.06, M2, 0, -0.05, 0.15)); g.children.forEach((c) => (c.rotation.x = Math.PI / 2)); break
    case 'cape': { socket = 'back'; const cp = box(0.55, 0.85, 0.02, M0, 0, -0.35, 0.14); g.add(cp); movers.push(cp); break }
    case 'banner_back': socket = 'back'; g.add(cyl(0.012, 0.012, 1.3, M1, 0, 0.3, 0.14), box(0.36, 0.5, 0.01, M2, 0.18, 0.7, 0.14)); break
    case 'tank': socket = 'back'; g.add(cyl(0.11, 0.11, 0.55, M0, 0, -0.08, 0.16), sph(0.11, M0, 0, 0.2, 0.16), box(0.05, 0.15, 0.05, M2, 0, 0.35, 0.16)); break
    case 'rocket': socket = 'back'; g.add(cyl(0.12, 0.12, 0.6, M0, 0, -0.05, 0.18), cone(0.12, 0.25, M2, 0, 0.37, 0.18), box(0.02, 0.15, 0.2, M1, 0, -0.35, 0.18)); break
    case 'surfboard': socket = 'back'; { const sb = box(0.32, 1.2, 0.05, M2, 0, -0.1, 0.15); sb.rotation.z = 0.25; g.add(sb); break }
    case 'scroll': socket = 'back'; { const sc = cyl(0.06, 0.06, 0.6, M0, 0, -0.05, 0.15); sc.rotation.z = Math.PI / 2; g.add(sc, torus(0.06, 0.01, M2, -0.3, -0.05, 0.15), torus(0.06, 0.01, M2, 0.3, -0.05, 0.15)); g.children[1].rotation.y = Math.PI / 2; g.children[2].rotation.y = Math.PI / 2; break }
    case 'coffin': socket = 'back'; g.add(box(0.36, 0.9, 0.16, M0, 0, -0.15, 0.18), box(0.3, 0.6, 0.02, M2, 0, -0.15, 0.27)); break
    case 'turbine': { socket = 'back'; const t = cyl(0.2, 0.2, 0.1, M0, 0, -0.05, 0.18); t.rotation.x = Math.PI / 2; const blades = new THREE.Group(); for (let i = 0; i < 4; i++) { const b = box(0.04, 0.34, 0.02, M2); b.rotation.z = (i / 4) * Math.PI; blades.add(b) } blades.position.set(0, -0.05, 0.25); g.add(t, blades); movers.push(blades); break }

    // ——— shoulder ———
    case 'pauldron': socket = 'shoulderR'; { const p = sph(0.16, M0); p.scale.y = 0.6; g.add(p, torus(0.14, 0.015, M2, 0, -0.02)); g.children[1].rotation.x = Math.PI / 2; break }
    case 'spikes': socket = 'shoulderR'; for (let i = 0; i < 3; i++) g.add(cone(0.04, 0.2, M2, (i - 1) * 0.08, 0.1)); break
    case 'parrot': { socket = 'shoulderR'; const p = new THREE.Group(); p.add(sph(0.08, M0, 0, 0.1), sph(0.05, M2, 0, 0.2, -0.03), cone(0.02, 0.06, M1, 0, 0.2, -0.09), box(0.02, 0.15, 0.04, M1, 0, 0.02, 0.06)); p.children[2].rotation.x = -Math.PI / 2; g.add(p); movers.push(p); break }
    case 'epaulette': socket = 'shoulderR'; g.add(box(0.2, 0.04, 0.16, M2), ...[0, 1, 2, 3].map((i) => cyl(0.006, 0.006, 0.12, M1, -0.06 + i * 0.04, -0.07, 0.02))); break
    case 'lantern_shoulder': { socket = 'shoulderR'; const l = sph(0.05, M2, 0.06, 0.12); g.add(box(0.1, 0.16, 0.1, M0, 0.06, 0.12), l); movers.push(l); break }
    case 'cannon': socket = 'shoulderR'; { const c = cyl(0.06, 0.07, 0.4, M0, 0.02, 0.1, -0.05); c.rotation.x = Math.PI / 2; g.add(c, sph(0.05, M2, 0.02, 0.1, -0.27)); break }

    // ——— wrist ———
    case 'bracelet': socket = 'wristR'; g.add(torus(0.09, 0.02, M2)); g.children[0].rotation.x = Math.PI / 2; break
    case 'watch': socket = 'wristR'; g.add(torus(0.09, 0.02, M0), box(0.06, 0.02, 0.06, M2, 0, 0, -0.09)); g.children[0].rotation.x = Math.PI / 2; break
    case 'gauntlet': socket = 'wristR'; g.add(cyl(0.1, 0.09, 0.2, M0, 0, -0.05), box(0.2, 0.04, 0.04, M2, 0, 0.05, -0.08)); break
    case 'wristband': socket = 'wristR'; g.add(cyl(0.085, 0.085, 0.06, M2)); break
    case 'cuff': socket = 'wristR'; g.add(cyl(0.1, 0.11, 0.1, M0, 0, -0.03), torus(0.11, 0.01, M2, 0, -0.08)); g.children[1].rotation.x = Math.PI / 2; break
    case 'hologram_wrist': { socket = 'wristR'; const h = box(0.16, 0.1, 0.005, lam(c2, true, 0.55), 0.02, 0.12, -0.08); g.add(torus(0.09, 0.015, M0), h); g.children[0].rotation.x = Math.PI / 2; movers.push(h); break }

    // ——— neck ———
    case 'chain': socket = 'neck'; g.add(torus(0.2, 0.02, M2, 0, -0.06)); g.children[0].rotation.x = Math.PI / 2 - 0.4; g.add(sph(0.04, M0, 0, -0.22, -0.14)); break
    case 'scarf': { socket = 'neck'; const sc = box(0.12, 0.5, 0.05, M0, 0.1, -0.28, -0.12); g.add(torus(0.19, 0.05, M0, 0, -0.03), sc); g.children[0].rotation.x = Math.PI / 2; movers.push(sc); break }
    case 'collar': socket = 'neck'; g.add(torus(0.2, 0.035, M0, 0, -0.03)); g.children[0].rotation.x = Math.PI / 2; for (let i = 0; i < 6; i++) g.add(cone(0.02, 0.06, M2, Math.cos((i / 6) * Math.PI * 2) * 0.2, -0.03, Math.sin((i / 6) * Math.PI * 2) * 0.2)); break
    case 'bowtie': socket = 'neck'; g.add(box(0.1, 0.07, 0.03, M2, -0.06, -0.05, -0.15), box(0.1, 0.07, 0.03, M2, 0.06, -0.05, -0.15), box(0.03, 0.04, 0.035, M0, 0, -0.05, -0.15)); break
    case 'tie': socket = 'neck'; g.add(box(0.08, 0.4, 0.02, M2, 0, -0.25, -0.16), box(0.1, 0.06, 0.03, M2, 0, -0.06, -0.16)); break
    case 'medallion': socket = 'neck'; g.add(torus(0.19, 0.012, M1, 0, -0.04), cyl(0.07, 0.07, 0.02, M2, 0, -0.26, -0.15)); g.children[0].rotation.x = Math.PI / 2 - 0.4; g.children[1].rotation.x = Math.PI / 2; break
    case 'ruff': socket = 'neck'; for (let i = 0; i < 12; i++) g.add(box(0.06, 0.03, 0.1, M0, Math.cos((i / 12) * Math.PI * 2) * 0.22, -0.03, Math.sin((i / 12) * Math.PI * 2) * 0.22)); break

    // ——— waist ———
    case 'belt': socket = 'waist'; g.add(box(0.46, 0.06, 0.28, M0), box(0.1, 0.07, 0.02, M2, 0, 0, -0.15)); break
    case 'pouch': socket = 'waist'; g.add(box(0.12, 0.14, 0.08, M0, 0.2, -0.06, -0.08), box(0.12, 0.04, 0.09, M1, 0.2, 0.0, -0.08)); break
    case 'holster': socket = 'waist'; g.add(box(0.08, 0.2, 0.12, M0, 0.24, -0.1, 0.02), box(0.05, 0.08, 0.04, M1, 0.24, 0.02, 0.02)); break
    case 'sash': { socket = 'waist'; const sa = box(0.14, 0.5, 0.03, M2, 0, -0.2, -0.14); sa.rotation.z = 0.2; g.add(sa); break }
    case 'tail': { socket = 'waist'; const t = new THREE.Group(); t.add(cyl(0.03, 0.05, 0.6, M0, 0, -0.3, 0), sph(0.06, M2, 0, -0.62)); t.position.set(0, 0, 0.14); t.rotation.x = -0.9; g.add(t); movers.push(t); break }
    case 'keyring': socket = 'waist'; g.add(torus(0.05, 0.008, M1, 0.22, -0.08, -0.05), box(0.02, 0.07, 0.01, M2, 0.22, -0.15, -0.05), box(0.02, 0.07, 0.01, M2, 0.25, -0.14, -0.04)); break

    // ——— float ———
    case 'orb': socket = 'float'; g.add(sph(0.12, M2)); break
    case 'drone': socket = 'float'; g.add(box(0.2, 0.06, 0.2, M0), sph(0.04, M2, 0, 0.05), ...[[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]].map(([x, z]) => cyl(0.06, 0.06, 0.01, M1, x, 0.05, z))); break
    case 'satellite': socket = 'float'; g.add(box(0.14, 0.14, 0.14, M0), box(0.4, 0.01, 0.14, M2, 0, 0, 0), cone(0.06, 0.06, M1, 0, 0.1)); break
    case 'cube_orbit': socket = 'float'; { const c = box(0.12, 0.12, 0.12, M2); g.add(c); movers.push(c); break }
    case 'ring_orbit': socket = 'float'; { const r = torus(0.2, 0.02, M2); g.add(r); movers.push(r); break }
    case 'balloon': socket = 'float'; g.add(sph(0.18, M2, 0, 0.3), cyl(0.004, 0.004, 0.5, M1, 0, 0.0)); break
    case 'umbrella_float': socket = 'float'; { const can = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.18, 10, 1, true), new THREE.MeshLambertMaterial({ color: c2, side: THREE.DoubleSide, emissive: e ? c2 : '#000', emissiveIntensity: e ? 0.6 : 0 })); g.add(can, cyl(0.01, 0.01, 0.5, M0, 0, -0.25)); break }
    case 'book_float': socket = 'float'; { const b = box(0.22, 0.28, 0.05, M0); b.rotation.x = -0.4; g.add(b, box(0.2, 0.26, 0.02, M2, 0, 0, -0.03)); movers.push(b); break }
    case 'lantern_float': socket = 'float'; { const l = sph(0.06, M2, 0, 0.0); g.add(box(0.14, 0.2, 0.14, M0), l); movers.push(l); break }
    case 'crystal': socket = 'float'; { const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), M2); cr.scale.y = 1.6; g.add(cr); movers.push(cr); break }
    case 'eye': socket = 'float'; { const ey = sph(0.14, lam('#f4f4f8', false)); const pupil = sph(0.06, M2, 0, 0, -0.1); g.add(ey, pupil); movers.push(pupil); break }
    case 'planet': socket = 'float'; { const p = sph(0.16, M0); const ring = torus(0.26, 0.015, M2); ring.rotation.x = 1.2; g.add(p, ring); movers.push(ring); break }

    // ——— aura ———
    case 'aura_ring': socket = 'aura'; { const r = torus(0.7, 0.03, lam(c2, true, 0.7), 0, 0.05); r.rotation.x = Math.PI / 2; g.add(r); movers.push(r); break }
    case 'aura_particles': socket = 'aura'; break
    case 'aura_shadow': socket = 'aura'; { const d = cyl(0.8, 0.8, 0.02, lam('#050508', false, 0.75), 0, 0.02, 0, 20); g.add(d); movers.push(d); break }
    case 'aura_flame': socket = 'aura'; for (let i = 0; i < 8; i++) { const fl = cone(0.08, 0.35, lam(c2, true, 0.8), Math.cos((i / 8) * Math.PI * 2) * 0.55, 0.15, Math.sin((i / 8) * Math.PI * 2) * 0.55); g.add(fl); movers.push(fl) } break
    case 'aura_frost': socket = 'aura'; for (let i = 0; i < 8; i++) { const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), lam(c2, true, 0.85)); cr.position.set(Math.cos((i / 8) * Math.PI * 2) * 0.6, 0.12 + (i % 2) * 0.2, Math.sin((i / 8) * Math.PI * 2) * 0.6); cr.scale.y = 1.8; g.add(cr); movers.push(cr) } break
    case 'aura_lightning': socket = 'aura'; for (let i = 0; i < 4; i++) { const b = torus(0.55 + i * 0.1, 0.012, lam(c2, true, 0.7), 0, 0.3 + i * 0.35); b.rotation.x = Math.PI / 2 + (i % 2) * 0.3; g.add(b); movers.push(b) } break
    case 'aura_void': socket = 'aura'; { const v = sph(0.9, lam('#05000c', false, 0.35)); v.position.y = 0.9; const rim = torus(0.9, 0.02, lam(c2, true, 0.9), 0, 0.9); g.add(v, rim); movers.push(rim); break }
    case 'aura_stars': socket = 'aura'; for (let i = 0; i < 10; i++) { const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.04), lam(c2, true)); st.position.set(Math.cos(i) * 0.7, 0.2 + (i * 0.17) % 1.6, Math.sin(i) * 0.7); g.add(st); movers.push(st) } break

    // ——— pets ———
    case 'ghost': socket = 'pet'; { const gh = sph(0.16, lam(c2, true, 0.7), 0, 0.5); const tail = cone(0.16, 0.3, lam(c2, true, 0.5), 0, 0.28); tail.rotation.x = Math.PI; g.add(gh, tail, sph(0.03, lam('#111', false), -0.06, 0.53, -0.14), sph(0.03, lam('#111', false), 0.06, 0.53, -0.14)); movers.push(g); break }
    case 'cat': socket = 'pet'; g.add(box(0.26, 0.14, 0.14, M0, 0, 0.12), sph(0.09, M0, 0, 0.25, -0.12), cone(0.03, 0.06, M1, -0.05, 0.34, -0.12), cone(0.03, 0.06, M1, 0.05, 0.34, -0.12), cyl(0.015, 0.02, 0.25, M0, 0, 0.2, 0.15)); g.children[4].rotation.x = 0.7; break
    case 'bird': socket = 'pet'; { const b = new THREE.Group(); b.add(sph(0.08, M0, 0, 0), sph(0.05, M1, 0, 0.08, -0.05), cone(0.015, 0.05, M2, 0, 0.08, -0.11), box(0.16, 0.01, 0.06, M2, -0.1, 0.02), box(0.16, 0.01, 0.06, M2, 0.1, 0.02)); b.children[2].rotation.x = -Math.PI / 2; b.position.y = 1.4; g.add(b); movers.push(b); break }
    case 'skull': socket = 'pet'; { const sk = new THREE.Group(); sk.add(sph(0.13, lam('#e6e6ee', e), 0, 0), box(0.14, 0.08, 0.1, lam('#e6e6ee', e), 0, -0.1, -0.03), sph(0.03, lam('#111', false), -0.05, 0.02, -0.11), sph(0.03, lam('#111', false), 0.05, 0.02, -0.11)); sk.position.y = 1.3; g.add(sk); movers.push(sk); break }
    case 'bot': socket = 'pet'; { const b = new THREE.Group(); b.add(box(0.2, 0.2, 0.2, M0, 0, 0.3), sph(0.04, M2, 0, 0.32, -0.11), box(0.06, 0.16, 0.06, M1, -0.14, 0.24), box(0.06, 0.16, 0.06, M1, 0.14, 0.24), cyl(0.12, 0.12, 0.08, M1, 0, 0.14)); g.add(b); movers.push(b); break }
    case 'slime': socket = 'pet'; { const s1 = sph(0.18, lam(c2, e, 0.8), 0, 0.14); s1.scale.y = 0.7; g.add(s1, sph(0.03, lam('#111', false), -0.06, 0.18, -0.15), sph(0.03, lam('#111', false), 0.06, 0.18, -0.15)); movers.push(s1); break }
    case 'moth': socket = 'pet'; { const m = new THREE.Group(); m.add(box(0.05, 0.14, 0.05, M0), box(0.2, 0.14, 0.01, lam(c2, e, 0.85), -0.12, 0.02), box(0.2, 0.14, 0.01, lam(c2, e, 0.85), 0.12, 0.02)); m.position.y = 1.5; g.add(m); movers.push(m); break }
    case 'fox': socket = 'pet'; g.add(box(0.3, 0.14, 0.14, M0, 0, 0.14), sph(0.09, M0, 0, 0.26, -0.16), cone(0.03, 0.07, M0, -0.05, 0.36, -0.16), cone(0.03, 0.07, M0, 0.05, 0.36, -0.16), cyl(0.03, 0.05, 0.28, M2, 0, 0.18, 0.2)); g.children[4].rotation.x = 1.0; break
    case 'owl': socket = 'pet'; { const o = new THREE.Group(); o.add(sph(0.12, M0, 0, 0.12), sph(0.09, M0, 0, 0.28), sph(0.03, lam('#ffd24a', true), -0.04, 0.3, -0.08), sph(0.03, lam('#ffd24a', true), 0.04, 0.3, -0.08), cone(0.02, 0.04, M2, 0, 0.26, -0.1)); o.children[4].rotation.x = -Math.PI / 2; o.position.y = 1.2; g.add(o); movers.push(o); break }
    case 'dragon': socket = 'pet'; { const d = new THREE.Group(); d.add(box(0.36, 0.14, 0.14, M0, 0, 0), sph(0.1, M0, 0.2, 0.06, -0.06), box(0.28, 0.01, 0.16, lam(c2, e, 0.85), -0.05, 0.1, -0.16), box(0.28, 0.01, 0.16, lam(c2, e, 0.85), -0.05, 0.1, 0.16), cyl(0.02, 0.04, 0.3, M0, -0.3, 0, 0)); d.children[4].rotation.z = Math.PI / 2; d.position.y = 1.5; g.add(d); movers.push(d); break }
    case 'jelly': socket = 'pet'; { const j = new THREE.Group(); const bell = sph(0.16, lam(c2, true, 0.6), 0, 0); bell.scale.y = 0.6; j.add(bell); for (let i = 0; i < 5; i++) j.add(cyl(0.01, 0.01, 0.3, lam(c2, true, 0.5), Math.cos(i) * 0.08, -0.18, Math.sin(i) * 0.08)); j.position.y = 1.3; g.add(j); movers.push(j); break }
    case 'crab': socket = 'pet'; g.add(box(0.3, 0.1, 0.22, M0, 0, 0.08), box(0.08, 0.06, 0.1, M2, -0.2, 0.08, -0.1), box(0.08, 0.06, 0.1, M2, 0.2, 0.08, -0.1), sph(0.02, lam('#111', false), -0.05, 0.16, -0.1), sph(0.02, lam('#111', false), 0.05, 0.16, -0.1)); break
  }

  g.scale.setScalar(s)
  if (socket === 'float') g.position.set(0.6, 2.0, 0)
  if (socket === 'pet') g.position.set(0.9, 0, 0.3)

  const recipe = spec.particles !== 'none' ? particleRecipe(spec.particles, c2, socket === 'aura' ? 3 : 1.2) : null
  let emitter: Emitter | null = null
  if (recipe) {
    emitter = new Emitter({ ...recipe, count: Math.min(recipe.count, 40) })
    emitter.points.position.y = socket === 'aura' ? 0.3 : 0
    g.add(emitter.points)
  }

  const origin = g.position.clone()
  const update = (t: number, dt: number): void => {
    emitter?.update(dt)
    switch (spec.motion) {
      case 'bob': g.position.y = origin.y + Math.sin(t * 2.2) * 0.08; break
      case 'spin': g.rotation.y = t * 1.6; break
      case 'orbit':
        if (socket === 'float' || socket === 'pet') g.position.set(Math.cos(t * 1.1) * 0.8, origin.y + Math.sin(t * 2) * 0.1, Math.sin(t * 1.1) * 0.8)
        else g.rotation.y = t * 1.6
        break
      case 'pulse': { const k = 1 + Math.sin(t * 4) * 0.08; g.scale.setScalar(s * k); break }
      case 'flap': if (wingL && wingR) { wingL.rotation.y = -0.4 + Math.sin(t * 6) * 0.5; wingR.rotation.y = 0.4 - Math.sin(t * 6) * 0.5 } else for (const m of movers) m.rotation.z = Math.sin(t * 6) * 0.3; break
      case 'hover': g.position.y = origin.y + 0.1 + Math.sin(t * 1.5) * 0.12; g.rotation.y = Math.sin(t * 0.8) * 0.4; break
      case 'sway': for (const m of movers) m.rotation.x = Math.sin(t * 2.5) * 0.25; if (!movers.length) g.rotation.z = Math.sin(t * 2.5) * 0.12; break
      case 'wobble': g.rotation.z = Math.sin(t * 5) * 0.12; g.rotation.x = Math.cos(t * 4) * 0.08; break
      case 'blink': { const k = Math.sin(t * 6) > 0.6 ? 1.4 : 0.9; for (const m of movers) m.scale.setScalar(k); break }
      default:
        if (spec.shape === 'halo' || spec.shape === 'ring_orbit') for (const m of movers) m.rotation.z = t * 0.8
        break
    }
    if (spec.shape.startsWith('aura_')) for (const m of movers) { m.rotation.y = t * 0.6; if (spec.shape === 'aura_flame') m.scale.y = 1 + Math.sin(t * 9 + m.position.x) * 0.3 }
    if (socket === 'pet' && spec.motion === 'none') g.position.y = origin.y + Math.abs(Math.sin(t * 3)) * 0.04
  }
  return { obj: g, socket, emitter, update }
}
