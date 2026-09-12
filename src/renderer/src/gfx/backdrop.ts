import { Container, Graphics } from 'pixi.js'
import { C } from '../theme'

/** Warm, slightly textured background used behind every scene. */
export class Backdrop extends Container {
  private g = new Graphics()
  private dots = new Graphics()

  constructor() {
    super()
    this.addChild(this.g, this.dots)
  }

  resize(w: number, h: number): void {
    const g = this.g
    g.clear()
    g.rect(0, 0, w, h).fill(C.cream)
    // Lamplight: layered translucent discs, brightest at the centre-top.
    const cx = w / 2
    const cy = h * 0.42
    const r = Math.max(w, h) * 0.75
    for (let i = 6; i >= 1; i--) {
      g.circle(cx, cy, (r * i) / 6).fill({ color: C.creamLight, alpha: 0.08 })
    }
    // Faint dot texture.
    const d = this.dots
    d.clear()
    for (let y = 10; y < h; y += 28) {
      for (let x = 10 + ((y / 28) % 2) * 14; x < w; x += 28) {
        d.circle(x, y, 1).fill({ color: C.woodDark, alpha: 0.05 })
      }
    }
  }
}

/** The cloth table for the game scene: wood rim + warm cloth. */
export function drawTable(g: Graphics, w: number, h: number): void {
  g.clear()
  const cx = w / 2
  const cy = h / 2 - 30
  const rx = Math.min(w * 0.3, 440)
  const ry = Math.min(h * 0.25, 215)
  g.ellipse(cx, cy + 10, rx + 16, ry + 16).fill({ color: C.shadow, alpha: 0.2 })
  g.ellipse(cx, cy, rx + 14, ry + 14).fill(C.wood)
  g.ellipse(cx, cy, rx + 8, ry + 8).fill(C.woodDark)
  g.ellipse(cx, cy, rx, ry).fill(C.cloth)
  g.ellipse(cx, cy - 8, rx * 0.92, ry * 0.86).fill({ color: C.clothLight, alpha: 0.35 })
  g.ellipse(cx, cy, rx, ry).stroke({ width: 2, color: C.clothDark, alpha: 0.5 })
}
