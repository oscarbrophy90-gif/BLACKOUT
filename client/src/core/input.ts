// Keyboard + pointer-lock mouse. Systems read intents from here; nothing
// else touches DOM input events.

export class Input {
  private down = new Set<string>()
  private pressedThisFrame = new Set<string>()
  private mouseButtons = new Set<number>()
  private mousePressedThisFrame = new Set<number>()
  private dx = 0
  private dy = 0
  locked = false
  /** Set false while a full-screen UI owns the mouse. */
  enabled = true

  private keydown = (e: KeyboardEvent) => {
    if (e.repeat) return
    this.down.add(e.code)
    this.pressedThisFrame.add(e.code)
    if (this.locked && ['Space', 'Tab', 'KeyE', 'KeyR'].includes(e.code)) e.preventDefault()
  }
  private keyup = (e: KeyboardEvent) => this.down.delete(e.code)
  private mousemove = (e: MouseEvent) => {
    if (!this.locked) return
    this.dx += e.movementX
    this.dy += e.movementY
  }
  private mousedown = (e: MouseEvent) => {
    if (!this.locked) return
    this.mouseButtons.add(e.button)
    this.mousePressedThisFrame.add(e.button)
  }
  private mouseup = (e: MouseEvent) => this.mouseButtons.delete(e.button)
  private lockchange = () => {
    this.locked = document.pointerLockElement != null
    if (!this.locked) {
      this.down.clear()
      this.mouseButtons.clear()
    }
    this.onLockChange?.(this.locked)
  }
  private contextmenu = (e: Event) => {
    if (this.locked) e.preventDefault()
  }

  onLockChange: ((locked: boolean) => void) | null = null

  attach(): void {
    window.addEventListener('keydown', this.keydown)
    window.addEventListener('keyup', this.keyup)
    window.addEventListener('mousemove', this.mousemove)
    window.addEventListener('mousedown', this.mousedown)
    window.addEventListener('mouseup', this.mouseup)
    window.addEventListener('contextmenu', this.contextmenu)
    document.addEventListener('pointerlockchange', this.lockchange)
  }

  detach(): void {
    window.removeEventListener('keydown', this.keydown)
    window.removeEventListener('keyup', this.keyup)
    window.removeEventListener('mousemove', this.mousemove)
    window.removeEventListener('mousedown', this.mousedown)
    window.removeEventListener('mouseup', this.mouseup)
    window.removeEventListener('contextmenu', this.contextmenu)
    document.removeEventListener('pointerlockchange', this.lockchange)
  }

  /** Resolves false when the browser refused (no user activation, or the
   *  user just hit Esc) so the caller can show a "click to play" prompt. */
  async requestLock(el: HTMLElement): Promise<boolean> {
    try {
      await el.requestPointerLock()
      return true
    } catch {
      return false
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock()
  }

  isDown(code: string): boolean {
    return this.enabled && this.down.has(code)
  }

  justPressed(code: string): boolean {
    return this.enabled && this.pressedThisFrame.has(code)
  }

  mouseDown(button: number): boolean {
    return this.enabled && this.mouseButtons.has(button)
  }

  mouseJustPressed(button: number): boolean {
    return this.enabled && this.mousePressedThisFrame.has(button)
  }

  /** Mouse delta since last call, consumed. */
  consumeMouse(): { dx: number; dy: number } {
    const out = { dx: this.dx, dy: this.dy }
    this.dx = 0
    this.dy = 0
    return out
  }

  /** Call once per frame after all systems have read input. */
  endFrame(): void {
    this.pressedThisFrame.clear()
    this.mousePressedThisFrame.clear()
  }
}
