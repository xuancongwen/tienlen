import { Application, Container } from 'pixi.js'
import { C } from './theme'
import { Toast } from './ui/widgets'
import { Tweens } from './ui/tween'
import type { Settings } from './settings'
import { saveSettings } from './settings'
import type { Session } from './session'

export interface Scene {
  readonly view: Container
  resize(w: number, h: number): void
  update?(dtMs: number): void
  destroy(): void
}

/**
 * Owns the Pixi Application, the active scene, shared tweens, the toast and
 * the persisted settings. Scenes get a reference to this to switch around.
 */
export class App {
  readonly pixi: Application
  readonly tweens: Tweens
  readonly toast = new Toast()
  private scene: Scene | null = null
  private root = new Container()
  private overlay = new Container()
  session: Session | null = null

  constructor(
    pixi: Application,
    public settings: Settings
  ) {
    this.pixi = pixi
    this.tweens = new Tweens(pixi.ticker)
    pixi.stage.addChild(this.root, this.overlay)
    this.overlay.addChild(this.toast)
    // The ResizePlugin applies window resizes on the next frame; listen to the renderer so
    // layout always reads the post-resize screen size.
    pixi.renderer.on('resize', () => this.layout())
    pixi.ticker.add((t) => this.scene?.update?.(t.deltaMS))
    this.layout()
  }

  get width(): number {
    return this.pixi.screen.width
  }
  get height(): number {
    return this.pixi.screen.height
  }

  go(scene: Scene): void {
    if (this.scene) {
      this.tweens.killAll()
      this.root.removeChild(this.scene.view)
      this.scene.destroy()
    }
    this.scene = scene
    this.root.addChild(scene.view)
    scene.resize(this.width, this.height)
  }

  layout(): void {
    this.scene?.resize(this.width, this.height)
    this.toast.position.set(20, this.height - 20)
    this.toast.pivot.set(0, this.toast.height)
  }

  notify(msg: string, color: number = C.cocoa): void {
    this.toast.show(msg, 2600, color)
    this.toast.pivot.set(0, this.toast.height)
  }

  async persist(): Promise<void> {
    await saveSettings(this.settings)
  }

  async endSession(): Promise<void> {
    if (this.session) {
      const s = this.session
      this.session = null
      await s.leave()
    }
  }
}
