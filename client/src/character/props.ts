import * as THREE from 'three'
import type { PropId } from '@blackout/shared'

// Every PropId as a small primitive assembly, plus where it attaches.

export type PropSocket = 'handR' | 'handL' | 'feet' | 'back' | 'head' | 'float'

export interface BuiltProp {
  obj: THREE.Object3D
  socket: PropSocket
  /** Called per frame for props that move on their own. */
  update?: (t: number) => void
}

function mat(color: string, emissive = false): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, emissive: emissive ? color : '#000000', emissiveIntensity: emissive ? 0.8 : 0 })
}

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  b.position.set(x, y, z)
  return b
}
function cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 10): THREE.Mesh {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m)
  c.position.set(x, y, z)
  return c
}
function sph(r: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), m)
  s.position.set(x, y, z)
  return s
}

export function buildProp(id: PropId, palette: [string, string]): BuiltProp | null {
  const [a, b] = palette
  const g = new THREE.Group()
  const gold = mat('#ffc247')
  const dark = mat('#2a2a33')
  const A = mat(a, true)
  const B = mat(b)
  switch (id) {
    case 'none':
      return null
    case 'trophy':
      g.add(cyl(0.05, 0.08, 0.06, gold, 0, 0.03), cyl(0.02, 0.02, 0.12, gold, 0, 0.12), cyl(0.1, 0.04, 0.16, gold, 0, 0.26), box(0.22, 0.02, 0.02, gold, 0, 0.3))
      return { obj: g, socket: 'handR' }
    case 'flag': {
      g.add(cyl(0.012, 0.012, 0.9, dark, 0, 0.45))
      const cloth = box(0.42, 0.26, 0.01, A, 0.21, 0.72, 0)
      g.add(cloth)
      return { obj: g, socket: 'handR', update: (t) => { cloth.rotation.y = Math.sin(t * 5) * 0.25 } }
    }
    case 'mic':
      g.add(cyl(0.02, 0.025, 0.2, dark, 0, 0.1), sph(0.05, mat('#8a93a1'), 0, 0.23))
      return { obj: g, socket: 'handR' }
    case 'guitar':
      g.add(box(0.28, 0.4, 0.06, B, 0, 0.1), box(0.05, 0.6, 0.04, dark, 0, 0.55), box(0.14, 0.12, 0.05, dark, 0, 0.88))
      g.rotation.set(0.4, 0, 0.5)
      return { obj: g, socket: 'handL' }
    case 'drink':
      g.add(cyl(0.05, 0.04, 0.16, mat('#d9e4ef'), 0, 0.08), cyl(0.045, 0.045, 0.1, A, 0, 0.06))
      return { obj: g, socket: 'handR' }
    case 'chair':
      g.add(box(0.5, 0.05, 0.5, B, 0, 0.45), box(0.5, 0.5, 0.05, B, 0, 0.72, 0.23), ...[[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].map(([x, z]) => cyl(0.02, 0.02, 0.45, dark, x, 0.22, z)))
      return { obj: g, socket: 'feet' }
    case 'sign': {
      g.add(cyl(0.015, 0.015, 0.6, dark, 0, 0.3), box(0.5, 0.3, 0.02, A, 0, 0.72))
      return { obj: g, socket: 'handR' }
    }
    case 'umbrella': {
      g.add(cyl(0.012, 0.012, 0.8, dark, 0, 0.4))
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.2, 10, 1, true), new THREE.MeshLambertMaterial({ color: a, side: THREE.DoubleSide }))
      canopy.position.y = 0.85
      g.add(canopy)
      return { obj: g, socket: 'handR' }
    }
    case 'ball': {
      const ball = sph(0.14, A)
      g.add(ball)
      return { obj: g, socket: 'handR', update: (t) => { ball.position.y = Math.abs(Math.sin(t * 4)) * 0.5 } }
    }
    case 'crown': {
      g.add(cyl(0.2, 0.17, 0.1, gold, 0, 0.05, 0, 8))
      for (let i = 0; i < 6; i++) g.add(box(0.04, 0.12, 0.04, gold, Math.cos(i) * 0.18, 0.15, Math.sin(i) * 0.18))
      g.add(sph(0.035, A, 0, 0.11, -0.18))
      return { obj: g, socket: 'head' }
    }
    case 'sword':
      g.add(box(0.05, 0.7, 0.012, mat('#c8d2dc'), 0, 0.42), box(0.16, 0.03, 0.03, gold, 0, 0.05), cyl(0.02, 0.02, 0.14, dark, 0, -0.06))
      return { obj: g, socket: 'handR' }
    case 'hammer':
      g.add(cyl(0.02, 0.02, 0.6, dark, 0, 0.3), box(0.26, 0.14, 0.14, B, 0, 0.62))
      return { obj: g, socket: 'handR' }
    case 'banner':
      g.add(cyl(0.015, 0.015, 1.2, dark, 0, 0.6), box(0.36, 0.7, 0.01, A, 0.18, 0.85))
      return { obj: g, socket: 'handL' }
    case 'scepter':
      g.add(cyl(0.015, 0.02, 0.7, gold, 0, 0.35), sph(0.07, A, 0, 0.75))
      return { obj: g, socket: 'handR' }
    case 'lantern': {
      const light = sph(0.06, A, 0, 0.1)
      g.add(box(0.14, 0.2, 0.14, mat('#8a6a2a'), 0, 0.1), light, cyl(0.01, 0.01, 0.15, dark, 0, 0.27))
      return { obj: g, socket: 'handL', update: (t) => { (light.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.6 + Math.sin(t * 6) * 0.3 } }
    }
    case 'drone': {
      g.add(box(0.2, 0.06, 0.2, dark), sph(0.04, A, 0, 0.05))
      for (const [x, z] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) g.add(cyl(0.06, 0.06, 0.01, mat('#8a93a1'), x, 0.05, z))
      return { obj: g, socket: 'float', update: (t) => { g.position.set(Math.sin(t * 1.3) * 0.6, 2.1 + Math.sin(t * 2.1) * 0.15, Math.cos(t * 1.3) * 0.6) } }
    }
    case 'boombox': {
      g.add(box(0.5, 0.24, 0.16, dark), cyl(0.08, 0.08, 0.02, B, -0.15, 0, -0.08), cyl(0.08, 0.08, 0.02, B, 0.15, 0, -0.08))
      g.rotation.x = Math.PI / 2
      return { obj: g, socket: 'handR' }
    }
    case 'cape': {
      const cape = box(0.5, 0.8, 0.02, A, 0, -0.35, 0.05)
      g.add(cape)
      return { obj: g, socket: 'back', update: (t) => { cape.rotation.x = 0.15 + Math.sin(t * 3) * 0.12 } }
    }
    case 'wings': {
      const l = box(0.55, 0.3, 0.02, A, -0.35, 0.05, 0.05)
      const r = box(0.55, 0.3, 0.02, A, 0.35, 0.05, 0.05)
      g.add(l, r)
      return { obj: g, socket: 'back', update: (t) => { l.rotation.y = -0.4 + Math.sin(t * 5) * 0.4; r.rotation.y = 0.4 - Math.sin(t * 5) * 0.4 } }
    }
    case 'skateboard':
      g.add(box(0.7, 0.03, 0.2, B, 0, 0.06), ...[-0.22, 0.22].flatMap((x) => [cyl(0.04, 0.04, 0.04, dark, x, 0.03, -0.1), cyl(0.04, 0.04, 0.04, dark, x, 0.03, 0.1)]))
      return { obj: g, socket: 'feet' }
    case 'flare': {
      const tip = sph(0.05, mat('#ff4d2d', true), 0, 0.22)
      g.add(cyl(0.02, 0.02, 0.22, dark, 0, 0.11), tip)
      return { obj: g, socket: 'handR', update: (t) => { tip.scale.setScalar(1 + Math.sin(t * 20) * 0.25) } }
    }
    case 'book':
      g.add(box(0.22, 0.28, 0.05, A), box(0.2, 0.26, 0.02, mat('#f0ede0'), 0, 0, -0.03))
      return { obj: g, socket: 'handL' }
    case 'phone':
      g.add(box(0.08, 0.16, 0.012, dark), box(0.07, 0.14, 0.004, A, 0, 0, -0.008))
      return { obj: g, socket: 'handR' }
    case 'mirror':
      g.add(cyl(0.16, 0.16, 0.02, gold), cyl(0.13, 0.13, 0.01, mat('#dfe9ff'), 0, 0.012), cyl(0.015, 0.015, 0.2, gold, 0, -0.2))
      g.rotation.x = Math.PI / 2
      return { obj: g, socket: 'handL' }
    case 'throne':
      g.add(box(0.9, 0.12, 0.8, B, 0, 0.5), box(0.9, 1.4, 0.12, B, 0, 1.2, 0.35), box(0.12, 0.5, 0.8, B, -0.4, 0.75), box(0.12, 0.5, 0.8, B, 0.4, 0.75), box(1.0, 0.5, 1.0, dark, 0, 0.22), sph(0.08, A, 0, 1.95, 0.35))
      return { obj: g, socket: 'feet' }
    case 'podium':
      g.add(box(0.9, 0.3, 0.9, B, 0, 0.15))
      return { obj: g, socket: 'feet' }
    case 'pillow':
      g.add(box(0.5, 0.14, 0.4, A, 0, 0.07))
      return { obj: g, socket: 'feet' }
    case 'telescope':
      g.add(cyl(0.05, 0.035, 0.5, dark, 0, 0.25), cyl(0.06, 0.05, 0.05, gold, 0, 0.52))
      g.rotation.x = -1.1
      return { obj: g, socket: 'handR' }
    case 'paintbrush':
      g.add(cyl(0.012, 0.012, 0.35, mat('#a07a4a'), 0, 0.17), cyl(0.02, 0.012, 0.06, A, 0, 0.37))
      return { obj: g, socket: 'handR' }
    case 'wrench':
      g.add(box(0.04, 0.4, 0.02, mat('#8a93a1'), 0, 0.2), box(0.12, 0.08, 0.02, mat('#8a93a1'), 0, 0.42))
      return { obj: g, socket: 'handR' }
    case 'cable': {
      const c = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 6, 14), A)
      c.rotation.x = Math.PI / 2
      g.add(c)
      return { obj: g, socket: 'handL' }
    }
    case 'fusebox':
      g.add(box(0.3, 0.4, 0.14, mat('#4a5560'), 0, 0.2), box(0.06, 0.06, 0.02, A, -0.08, 0.28, -0.08), box(0.06, 0.06, 0.02, A, 0.08, 0.28, -0.08))
      return { obj: g, socket: 'feet' }
    case 'generator': {
      g.add(box(0.6, 0.45, 0.4, mat('#4a5560'), 0, 0.22), cyl(0.05, 0.05, 0.25, dark, 0.2, 0.55))
      const lamp = sph(0.05, A, -0.2, 0.5)
      g.add(lamp)
      return { obj: g, socket: 'feet', update: (t) => { g.position.x = 0.9; g.position.y = Math.sin(t * 30) * 0.005 } }
    }
    case 'pylon':
      g.add(cyl(0.05, 0.08, 1.6, dark, 0, 0.8), box(0.7, 0.05, 0.05, dark, 0, 1.4), sph(0.05, A, 0, 1.65))
      return { obj: g, socket: 'feet', update: () => { g.position.x = 1.1 } }
    case 'medal':
      g.add(cyl(0.08, 0.08, 0.02, gold), box(0.04, 0.16, 0.01, A, 0, 0.12))
      g.rotation.x = Math.PI / 2
      return { obj: g, socket: 'handR' }
    case 'belt':
      g.add(box(0.36, 0.14, 0.03, gold), box(0.22, 0.09, 0.04, A, 0, 0, -0.01))
      return { obj: g, socket: 'handR' }
    case 'crate':
      g.add(box(0.5, 0.35, 0.4, mat('#2e2c33'), 0, 0.18), box(0.52, 0.04, 0.42, A, 0, 0.36))
      return { obj: g, socket: 'feet', update: () => { g.position.x = 0.8 } }
    case 'balloon': {
      const bal = sph(0.18, A, 0, 0.6)
      g.add(cyl(0.004, 0.004, 0.5, mat('#ffffff'), 0, 0.25), bal)
      return { obj: g, socket: 'handL', update: (t) => { bal.position.x = Math.sin(t * 2) * 0.08 } }
    }
    case 'kite': {
      const k = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 4), A)
      k.position.set(0.3, 1.2, -0.2)
      g.add(k, cyl(0.004, 0.004, 1.3, mat('#ffffff'), 0.15, 0.6, -0.1))
      return { obj: g, socket: 'handR', update: (t) => { k.position.x = 0.3 + Math.sin(t * 1.7) * 0.15; k.rotation.z = Math.sin(t * 2.2) * 0.3 } }
    }
    case 'torch': {
      const flame = sph(0.07, mat('#ff8a1a', true), 0, 0.36)
      g.add(cyl(0.02, 0.025, 0.3, mat('#5a3f22'), 0, 0.15), flame)
      return { obj: g, socket: 'handR', update: (t) => { flame.scale.set(1 + Math.sin(t * 15) * 0.2, 1 + Math.cos(t * 13) * 0.3, 1) } }
    }
    case 'shield':
      g.add(cyl(0.22, 0.22, 0.04, B, 0, 0, 0, 8), cyl(0.06, 0.06, 0.06, A, 0, 0, 0))
      g.rotation.x = Math.PI / 2
      return { obj: g, socket: 'handL' }
    case 'staff': {
      const orb = sph(0.08, A, 0, 0.95)
      g.add(cyl(0.02, 0.025, 0.9, mat('#5a3f22'), 0, 0.45), orb)
      return { obj: g, socket: 'handL', update: (t) => { orb.rotation.y = t * 2 } }
    }
    case 'hourglass': {
      g.add(cyl(0.1, 0.1, 0.02, gold, 0, 0), cyl(0.1, 0.1, 0.02, gold, 0, 0.3), cyl(0.02, 0.09, 0.14, mat('#dfe9ff'), 0, 0.08), cyl(0.09, 0.02, 0.14, mat('#dfe9ff'), 0, 0.22))
      return { obj: g, socket: 'handR', update: (t) => { g.rotation.z = Math.sin(t * 1.5) > 0.9 ? Math.PI : 0 } }
    }
    case 'compass':
      g.add(cyl(0.1, 0.1, 0.03, gold), box(0.02, 0.14, 0.01, A, 0, 0.02))
      g.rotation.x = Math.PI / 2
      return { obj: g, socket: 'handL' }
    case 'globe': {
      const globe = sph(0.16, mat('#2a4a7a'))
      g.add(globe, cyl(0.03, 0.05, 0.08, gold, 0, -0.2))
      return { obj: g, socket: 'handL', update: (t) => { globe.rotation.y = t } }
    }
  }
  return { obj: g, socket: 'handR' }
}
