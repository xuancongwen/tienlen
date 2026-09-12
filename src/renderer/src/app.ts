import { Application, Container } from 'pixi.js'
import { C } from './theme'
import { Toast } from './ui/widgets'
import { ease, Tweens } from './ui/tween'
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

  /** The scene currently navigated to — lets an outgoing scene tell it's mid-fade-out and ignore stray input (e.g. a global keydown listener) until its deferred destroy() runs. */
  get current(): Scene | null {
    return this.scene
  }

  /** Swaps the active scene with a soft cross-fade instead of a hard cut. */
  go(scene: Scene): void {
    const prev = this.scene
    this.scene = scene
    scene.view.alpha = 0
    this.root.addChild(scene.view)
    scene.resize(this.width, this.height)
    void this.tweens.to(scene.view, { alpha: 1 }, 220, { ease: ease.outCubic })
    if (prev) {
      // Interactivity is cut immediately so the outgoing scene can't absorb clicks while it fades;
      // the Pixi teardown (destroy) waits for the fade so it doesn't just vanish mid-transition.
      prev.view.eventMode = 'none'
      void this.tweens.to(prev.view, { alpha: 0 }, 140, { ease: ease.outCubic }).then(() => {
        this.root.removeChild(prev.view)
        prev.destroy()
      })
    }
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
