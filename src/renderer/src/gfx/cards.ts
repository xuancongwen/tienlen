import { Container, Graphics, Text } from 'pixi.js'
import { rankLabel, suitSymbol, type Card } from '@engine/cards'
import { C, CARD, FONT } from '../theme'

/**
 * A playing card drawn with vector graphics: cream face, warm red or
 * cocoa-black pips, rounded corners, a light shadow. Native size CARD.w × CARD.h.
 */
export class CardSprite extends Container {
  readonly card: Card
  private face = new Graphics()
  private glow = new Graphics()
  private selectedFlag = false
  private dimFlag = false

  constructor(card: Card, faceUp = true) {
    super()
    this.card = card
    this.addChild(this.glow, this.face)
    if (faceUp) this.drawFace()
    else this.drawBack()
    this.pivot.set(CARD.w / 2, CARD.h / 2)
  }

  get selected(): boolean {
    return this.selectedFlag
  }

  setSelected(v: boolean): void {
    this.selectedFlag = v
  }

  setDimmed(v: boolean): void {
    this.dimFlag = v
    this.alpha = v ? 0.45 : 1
  }

  get dimmed(): boolean {
    return this.dimFlag
  }

  setHighlight(on: boolean, color: number = C.gold): void {
    this.glow.clear()
    if (!on) return
    this.glow.roundRect(-4, -4, CARD.w + 8, CARD.h + 8, CARD.radius + 4).fill({ color, alpha: 0.55 })
  }

  private drawFace(): void {
    const g = this.face
    const c = this.card
    const red = c.suit === 'H' || c.suit === 'D'
    const ink = red ? C.cardRed : C.cardBlack
    g.roundRect(2, 4, CARD.w, CARD.h, CARD.radius).fill({ color: C.shadow, alpha: 0.18 })
    g.roundRect(0, 0, CARD.w, CARD.h, CARD.radius).fill(C.cardFace).stroke({ width: 1.2, color: C.cardEdge })
    const rank = new Text({ text: rankLabel(c.rank), style: { fontFamily: FONT.card, fontSize: 21, fill: ink, fontWeight: 'bold' } })
    rank.position.set(6, 4)
    const suitSmall = new Text({ text: suitSymbol(c.suit), style: { fontFamily: FONT.card, fontSize: 16, fill: ink } })
    suitSmall.position.set(7, 27)
    const suitBig = new Text({ text: suitSymbol(c.suit), style: { fontFamily: FONT.card, fontSize: 42, fill: ink } })
    suitBig.anchor.set(0.5)
    suitBig.position.set(CARD.w / 2 + 6, CARD.h / 2 + 12)
    this.addChild(rank, suitSmall, suitBig)
  }

  private drawBack(): void {
    const g = this.face
    g.roundRect(2, 4, CARD.w, CARD.h, CARD.radius).fill({ color: C.shadow, alpha: 0.18 })
    g.roundRect(0, 0, CARD.w, CARD.h, CARD.radius).fill(C.cardFace).stroke({ width: 1.2, color: C.cardEdge })
    g.roundRect(6, 6, CARD.w - 12, CARD.h - 12, CARD.radius - 3).fill(C.cardBack)
    for (let y = 14; y < CARD.h - 8; y += 9) {
      for (let x = 14 + ((y / 9) % 2) * 4.5; x < CARD.w - 8; x += 9) {
        g.circle(x, y, 1.2).fill({ color: C.cardBackInk, alpha: 0.35 })
      }
    }
    g.circle(CARD.w / 2, CARD.h / 2, 16).fill(C.cardBackInk)
    const t = new Text({ text: '✿', style: { fontFamily: FONT.display, fontSize: 20, fill: C.cardBack, fontWeight: 'bold' } })
    t.anchor.set(0.5)
    t.position.set(CARD.w / 2, CARD.h / 2)
    this.addChild(t)
  }
}
