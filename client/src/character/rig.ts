import * as THREE from 'three'

// A procedural low-poly Linewalker: eleven joints, primitive limbs, suit
// colours. The same rig stands in the lobby, on the podium, in shop
// previews and in-match for emotes; accessories attach to named sockets.

export type JointName = 'hips' | 'torso' | 'head' | 'shL' | 'shR' | 'elL' | 'elR' | 'hipL' | 'hipR' | 'kneeL' | 'kneeR'
export const JOINTS: JointName[] = ['hips', 'torso', 'head', 'shL', 'shR', 'elL', 'elR', 'hipL', 'hipR', 'kneeL', 'kneeR']

export type Vec3 = [number, number, number]

export interface Pose {
  hips: Vec3
  torso: Vec3
  head: Vec3
  shL: Vec3
  shR: Vec3
  elL: Vec3
  elR: Vec3
  hipL: Vec3
  hipR: Vec3
  kneeL: Vec3
  kneeR: Vec3
  /** Root offsets: vertical (jump), yaw (spin), forward/lateral steps, scale. */
  rootY: number
  rootYaw: number
  rootX: number
  rootZ: number
  scale: number
}

export const REST: Pose = {
  hips: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0],
  shL: [0, 0, 0.08], shR: [0, 0, -0.08], elL: [0.15, 0, 0], elR: [0.15, 0, 0],
  hipL: [0, 0, 0.03], hipR: [0, 0, -0.03], kneeL: [0, 0, 0], kneeR: [0, 0, 0],
  rootY: 0, rootYaw: 0, rootX: 0, rootZ: 0, scale: 1,
}

export function P(over: Partial<Pose>): Pose {
  return { ...REST, ...over }
}

export function lerpPose(a: Pose, b: Pose, t: number, out: Pose): Pose {
  for (const j of JOINTS) {
    const va = a[j]
    const vb = b[j]
    const vo = out[j]
    vo[0] = va[0] + (vb[0] - va[0]) * t
    vo[1] = va[1] + (vb[1] - va[1]) * t
    vo[2] = va[2] + (vb[2] - va[2]) * t
  }
  out.rootY = a.rootY + (b.rootY - a.rootY) * t
  out.rootYaw = a.rootYaw + (b.rootYaw - a.rootYaw) * t
  out.rootX = a.rootX + (b.rootX - a.rootX) * t
  out.rootZ = a.rootZ + (b.rootZ - a.rootZ) * t
  out.scale = a.scale + (b.scale - a.scale) * t
  return out
}

export function clonePose(p: Pose): Pose {
  const o = { ...p }
  for (const j of JOINTS) o[j] = [...p[j]] as Vec3
  return o
}

export interface SuitColors {
  body: string
  trim: string
  visor: string
}

export class CharacterRig {
  readonly root = new THREE.Group()
  readonly joints: Record<JointName, THREE.Group>
  /** Attachment sockets for props and accessories. */
  readonly sockets: Record<'head' | 'face' | 'back' | 'shoulderL' | 'shoulderR' | 'handL' | 'handR' | 'wristL' | 'wristR' | 'neck' | 'waist' | 'feet' | 'chest', THREE.Group>
  readonly bodyMat: THREE.MeshLambertMaterial
  readonly trimMat: THREE.MeshLambertMaterial
  readonly visorMat: THREE.MeshLambertMaterial
  private meshes: THREE.Mesh[] = []
  private baseY = 0

  constructor(colors: SuitColors) {
    this.bodyMat = new THREE.MeshLambertMaterial({ color: colors.body })
    this.trimMat = new THREE.MeshLambertMaterial({ color: colors.trim })
    this.visorMat = new THREE.MeshLambertMaterial({ color: colors.visor, emissive: colors.visor, emissiveIntensity: 0.6 })

    const g = (parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group => {
      const grp = new THREE.Group()
      grp.position.set(x, y, z)
      parent.add(grp)
      return grp
    }
    const box = (parent: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
      m.position.set(x, y, z)
      parent.add(m)
      this.meshes.push(m)
      return m
    }

    const hips = g(this.root, 0, 0.95, 0)
    const torso = g(hips, 0, 0, 0)
    box(torso, 0.5, 0.62, 0.28, this.bodyMat, 0, 0.31, 0)
    box(torso, 0.52, 0.12, 0.3, this.trimMat, 0, 0.56, 0) // chest strap
    box(hips, 0.44, 0.16, 0.26, this.trimMat, 0, -0.02, 0) // belt
    const head = g(torso, 0, 0.66, 0)
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), this.trimMat)
    headMesh.position.y = 0.2
    head.add(headMesh)
    this.meshes.push(headMesh)
    box(head, 0.28, 0.08, 0.08, this.visorMat, 0, 0.22, -0.18)

    const arm = (side: -1 | 1) => {
      const sh = g(torso, side * 0.34, 0.52, 0)
      box(sh, 0.16, 0.36, 0.16, this.bodyMat, 0, -0.18, 0)
      const el = g(sh, 0, -0.36, 0)
      box(el, 0.14, 0.34, 0.14, this.trimMat, 0, -0.17, 0)
      box(el, 0.15, 0.1, 0.15, this.bodyMat, 0, -0.38, 0) // hand
      return { sh, el }
    }
    const L = arm(-1)
    const R = arm(1)

    const leg = (side: -1 | 1) => {
      const hip = g(hips, side * 0.15, -0.05, 0)
      box(hip, 0.2, 0.46, 0.2, this.trimMat, 0, -0.23, 0)
      const knee = g(hip, 0, -0.46, 0)
      box(knee, 0.18, 0.44, 0.18, this.bodyMat, 0, -0.22, 0)
      box(knee, 0.2, 0.1, 0.3, this.trimMat, 0, -0.47, -0.05) // boot
      return { hip, knee }
    }
    const LL = leg(-1)
    const RL = leg(1)

    this.joints = {
      hips, torso, head, shL: L.sh, shR: R.sh, elL: L.el, elR: R.el,
      hipL: LL.hip, hipR: RL.hip, kneeL: LL.knee, kneeR: RL.knee,
    }
    this.sockets = {
      head: g(head, 0, 0.42, 0),
      face: g(head, 0, 0.2, -0.22),
      back: g(torso, 0, 0.35, 0.2),
      shoulderL: g(L.sh, -0.1, 0.02, 0),
      shoulderR: g(R.sh, 0.1, 0.02, 0),
      handL: g(L.el, 0, -0.4, 0),
      handR: g(R.el, 0, -0.4, 0),
      wristL: g(L.el, 0, -0.3, 0),
      wristR: g(R.el, 0, -0.3, 0),
      neck: g(torso, 0, 0.6, 0),
      waist: g(hips, 0, -0.02, 0),
      feet: g(this.root, 0, 0, 0),
      chest: g(torso, 0, 0.35, -0.16),
    }
  }

  setColors(c: SuitColors): void {
    this.bodyMat.color.set(c.body)
    this.trimMat.color.set(c.trim)
    this.visorMat.color.set(c.visor)
    this.visorMat.emissive.set(c.visor)
  }

  apply(p: Pose): void {
    for (const j of JOINTS) {
      const r = p[j]
      this.joints[j].rotation.set(r[0], r[1], r[2])
    }
    this.root.position.y = this.baseY + p.rootY
    this.root.position.x = p.rootX
    this.root.position.z = p.rootZ
    this.root.rotation.y = p.rootYaw
    this.root.scale.setScalar(p.scale)
  }

  setBaseY(y: number): void {
    this.baseY = y
  }

  /** Every mesh, for effects that tint or clone the body. */
  allMeshes(): THREE.Mesh[] {
    return this.meshes
  }

  dispose(): void {
    for (const m of this.meshes) m.geometry.dispose()
    this.bodyMat.dispose()
    this.trimMat.dispose()
    this.visorMat.dispose()
  }
}
