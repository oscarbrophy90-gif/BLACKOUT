import * as THREE from 'three'
import { COLORS, MAP_SIZE } from '../config.ts'

// The perpetual amber dusk over Vantera, and the hard switch to ink when a
// Blackout hits. The rule from the design bible: darkness is NEVER dimmed
// lighting — it is lights-off plus emissive-only, so turning a monitor's
// brightness up buys nothing.

export class Sky {
  private hemi: THREE.HemisphereLight
  private sun: THREE.DirectionalLight
  private dome: THREE.Mesh
  private stars: THREE.Points
  private clouds: THREE.Group
  private duskFog: THREE.Fog
  private darkFog: THREE.Fog
  private scene: THREE.Scene
  dark = false

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.hemi = new THREE.HemisphereLight('#6f639f', '#4a4038', 1.35)
    this.sun = new THREE.DirectionalLight('#ffb35c', 1.3)
    this.sun.position.set(-0.6, 0.22, -0.35).multiplyScalar(1000)
    scene.add(this.hemi, this.sun)

    // Gradient dusk dome.
    const domeGeo = new THREE.SphereGeometry(2600, 24, 12)
    const domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color('#191433') },
        mid: { value: new THREE.Color('#4a3160') },
        horizon: { value: new THREE.Color('#c96f3a') },
        sunDir: { value: new THREE.Vector3(-0.6, 0.1, -0.35).normalize() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 c = mix(horizon, mix(mid, top, smoothstep(0.12, 0.55, h)), smoothstep(0.0, 0.16, h));
          float s = pow(max(dot(normalize(vDir), sunDir), 0.0), 24.0);
          c += vec3(1.0, 0.62, 0.3) * s * 0.55;
          if (vDir.y < 0.0) c = mix(c, vec3(0.05, 0.06, 0.1), clamp(-vDir.y * 4.0, 0.0, 1.0));
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    })
    this.dome = new THREE.Mesh(domeGeo, domeMat)
    this.dome.name = 'skydome'
    scene.add(this.dome)

    // Stars: only the Blackout sky shows them.
    const starPos = new Float32Array(900 * 3)
    for (let i = 0; i < 900; i++) {
      const v = new THREE.Vector3().randomDirection()
      v.y = Math.abs(v.y) * 0.9 + 0.08
      v.normalize().multiplyScalar(2400)
      starPos[i * 3] = v.x
      starPos[i * 3 + 1] = v.y
      starPos[i * 3 + 2] = v.z
    }
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: '#cdd6ff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.8 }),
    )
    this.stars.visible = false
    scene.add(this.stars)

    // A few slow slabs of cloud crossing the dusk.
    this.clouds = new THREE.Group()
    const cloudMat = new THREE.MeshBasicMaterial({ color: '#241c3d', transparent: true, opacity: 0.75 })
    for (let i = 0; i < 10; i++) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 5), cloudMat)
      c.scale.set(120 + Math.random() * 160, 10 + Math.random() * 8, 50 + Math.random() * 40)
      c.position.set((Math.random() - 0.5) * MAP_SIZE * 1.6, 220 + Math.random() * 120, (Math.random() - 0.5) * MAP_SIZE * 1.6)
      this.clouds.add(c)
    }
    scene.add(this.clouds)

    this.duskFog = new THREE.Fog('#3a2c4a', 90, 1150)
    this.darkFog = new THREE.Fog('#000000', 30, 700)
    scene.fog = this.duskFog
    scene.background = new THREE.Color('#191433')
  }

  update(dt: number): void {
    for (const c of this.clouds.children) {
      c.position.x += dt * 2.2
      if (c.position.x > MAP_SIZE) c.position.x = -MAP_SIZE
    }
  }

  /** The hard render switch. Everything else reacts through events. */
  setBlackout(dark: boolean): void {
    if (this.dark === dark) return
    this.dark = dark
    this.hemi.intensity = dark ? 0 : 1.35
    this.sun.intensity = dark ? 0 : 1.3
    this.dome.visible = !dark
    this.clouds.visible = !dark
    this.stars.visible = dark
    this.scene.fog = dark ? this.darkFog : this.duskFog
    ;(this.scene.background as THREE.Color).set(dark ? '#000000' : '#191433')
  }

  /** Follow the camera so the dome never clips. */
  track(camPos: THREE.Vector3): void {
    this.dome.position.copy(camPos)
    this.stars.position.copy(camPos)
  }
}

export const SHIMMER_COLORS = {
  live: new THREE.Color(COLORS.cyan),
  dying: new THREE.Color(COLORS.danger),
}
