import { Container, Text } from 'pixi.js'
import type { App, Scene } from '../app'
import { Backdrop } from '../gfx/backdrop'
import { parseCard } from '@engine/cards'
import { CardSprite } from '../gfx/cards'
import { C, FONT } from '../theme'
import { ease } from '../ui/tween'
import { Button, label } from '../ui/widgets'
import { createSolo } from '../session'
import { LobbyScene } from './LobbyScene'
import { MultiplayerScene } from './MultiplayerScene'
import { RulesScene } from './RulesScene'

export class MenuScene implements Scene {
  readonly view = new Container()
  private backdrop = new Backdrop()
  private panelC = new Container()
  private title: Text
  private subtitle: Text
  private buttons: Button[] = []
  private cards = new Container()
  private tag: Text
  private t = 0
  private entered = false

  constructor(private app: App) {
    this.view.addChild(this.backdrop, this.cards, this.panelC)
    this.title = new Text({
      text: 'Tiến lên',
      style: { fontFamily: FONT.display, fontSize: 84, fill: C.paprika, fontWeight: 'bold', dropShadow: { alpha: 0.18, blur: 6, distance: 4, color: C.shadow, angle: Math.PI / 3 } }
    })
    this.title.anchor.set(0.5)
    this.subtitle = new Text({ text: 'THIRTEEN', style: { fontFamily: FONT.display, fontSize: 28, fill: C.cocoaSoft, letterSpacing: 10 } })
    this.subtitle.anchor.set(0.5)
    this.panelC.addChild(this.title, this.subtitle)

    const mk = (text: string, kind: 'primary' | 'secondary', fn: () => void): Button => {
      const b = new Button(text, { width: 260, height: 54, kind, fontSize: 19, onClick: fn })
      this.buttons.push(b)
      this.panelC.addChild(b)
      return b
    }
    mk('Play solo', 'primary', () => this.playSolo())
    mk('Multiplayer', 'secondary', () => this.app.go(new MultiplayerScene(this.app)))
    mk('House rules', 'secondary', () => this.app.go(new RulesScene(this.app)))
    if (window.gd) mk('Quit', 'secondary', () => void window.gd?.quit())

    this.tag = label('The Vietnamese shedding game. Get rid of your thirteen cards first — and mind the 2s.', { fill: C.muted, fontSize: 15 })
    this.tag.anchor.set(0.5)
    this.panelC.addChild(this.tag)

    // Decorative fanned cards.
    const deco: [string, number][] = [
      ['3S', -0.35],
      ['4S', -0.18],
      ['5S', 0],
      ['2H', 0.18],
      ['2D', 0.35]
    ]
    deco.forEach(([code, rot], i) => {
      const card = new CardSprite(parseDeco(code, i))
      card.rotation = rot
      card.scale.set(1.15)
      this.cards.addChild(card)
    })
  }

  private playSolo(): void {
    const session = createSolo(this.app.settings)
    this.app.session = session
    this.app.go(new LobbyScene(this.app, session))
  }

  resize(w: number, h: number): void {
    this.backdrop.resize(w, h)
    const cx = w / 2
    this.title.position.set(cx, h * 0.2)
    this.subtitle.position.set(cx, h * 0.2 + 70)
    let y = h * 0.2 + 130
    for (const b of this.buttons) {
      b.position.set(cx - 130, y)
      y += 66
    }
    this.tag.position.set(cx, h - 40)
    // cards fan bottom-right
    this.cards.position.set(w - 200, h - 120)
    this.cards.children.forEach((c, i) => {
      c.position.set((i - 2) * 46, Math.abs(i - 2) * 10)
    })
    if (!this.entered) {
      this.entered = true
      this.playEntrance()
    }
  }

  /** First-impression flourish: title drops in, buttons stagger up, the fan of cards slides in from off-screen. */
  private playEntrance(): void {
    const tw = this.app.tweens
    const titleY = this.title.y
    this.title.y = titleY - 26
    this.title.alpha = 0
    void tw.to(this.title, { y: titleY, alpha: 1 }, 460, { ease: ease.outCubic })

    this.subtitle.alpha = 0
    void tw.to(this.subtitle, { alpha: 1 }, 420, { delay: 120 })

    this.buttons.forEach((b, i) => {
      const by = b.y
      b.y = by + 22
      b.alpha = 0
      void tw.to(b, { y: by, alpha: 1 }, 380, { delay: 160 + i * 70, ease: ease.outCubic })
    })

    this.tag.alpha = 0
    void tw.to(this.tag, { alpha: 1 }, 400, { delay: 160 + this.buttons.length * 70 + 80 })

    const cx = this.cards.x
    this.cards.x = cx + 160
    this.cards.alpha = 0
    void tw.to(this.cards, { x: cx, alpha: 1 }, 520, { delay: 140, ease: ease.outBack })
  }

  update(dt: number): void {
    this.t += dt
    this.cards.y = this.app.height - 120 + Math.sin(this.t / 900) * 4
  }

  destroy(): void {
    this.view.destroy({ children: true })
  }
}

function parseDeco(code: string, id: number): CardSprite['card'] {
  return { ...parseCard(code), id }
}
