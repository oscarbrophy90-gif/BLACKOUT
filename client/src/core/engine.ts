import * as THREE from 'three'

// The render loop and nothing else. One Engine lives for the whole session;
// each match fills `scene` and tears its content down afterwards.

export class Engine {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  private rafId = 0
  private last = 0
  private update: ((dt: number, time: number) => void) | null = null
  time = 0
  baseFov = 75

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(this.baseFov, window.innerWidth / window.innerHeight, 0.08, 3200)
    window.addEventListener('resize', this.onResize)
  }

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  setPixelRatioCap(cap: number): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap))
  }

  start(update: (dt: number, time: number) => void): void {
    this.update = update
    this.last = performance.now()
    const tick = (now: number) => {
      this.rafId = requestAnimationFrame(tick)
      // Clamp so a background tab doesn't integrate a 30-second step.
      const dt = Math.min(0.05, (now - this.last) / 1000)
      this.last = now
      this.time += dt
      this.update?.(dt, this.time)
      this.renderer.render(this.scene, this.camera)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  stop(): void {
    cancelAnimationFrame(this.rafId)
    this.update = null
  }

  /** Remove and dispose everything a match added to the scene. */
  clearScene(): void {
    const doomed = [...this.scene.children]
    for (const obj of doomed) {
      this.scene.remove(obj)
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else if (mat) mat.dispose()
      })
    }
    this.scene.fog = null
    this.scene.background = null
  }
}
