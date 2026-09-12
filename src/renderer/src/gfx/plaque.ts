import { Container, Graphics, Text } from 'pixi.js'
import { C, FONT } from '../theme'

/**
 * A player's name plate: avatar disc, name, card count, running score,
 * turn ring and a transient status ("Pass", "1st", "thinking…").
 */
export class Plaque extends Container {
  private ring = new Graphics()
  private disc = new Graphics()
  private initial: Text
  private nameT: Text
  private countT: Text
  private countBg = new Graphics()
  private scoreT: Text
  private statusT: Text
  private statusBg = new Graphics()
  private turnOn = false
  private phase = 0
  readonly W = 200
  readonly H = 64

  constructor(name: string, color: number, isMe: boolean) {
    super()
    const bg = new Graphics()
    bg.roundRect(0, 4, this.W, this.H, 14).fill({ color: C.shadow, alpha: 0.15 })
    bg.roundRect(0, 0, this.W, this.H, 14).fill(isMe ? 0xfbeedb : C.creamLight).stroke({ width: 1.5, color, alpha: 0.8 })
    this.addChild(bg, this.ring, this.disc)
    this.disc.circle(32, 32, 22).fill(color)
    this.initial = new Text({ text: (name[0] ?? '?').toUpperCase(), style: { fontFamily: FONT.display, fontSize: 22, fill: C.creamLight, fontWeight: 'bold' } })
    this.initial.anchor.set(0.5)
    this.initial.position.set(32, 32)
    this.nameT = new Text({ text: name, style: { fontFamily: FONT.body, fontSize: 16, fill: C.cocoa, fontWeight: '600' } })
    this.nameT.position.set(64, 10)
    this.countT = new Text({ text: '13', style: { fontFamily: FONT.body, fontSize: 13, fill: C.creamLight, fontWeight: 'bold' } })
    this.countT.anchor.set(0.5)
    this.countBg.roundRect(64, 36, 62, 20, 10).fill(C.cocoaSoft)
    this.countT.position.set(95, 46)
    this.scoreT = new Text({ text: '0', style: { fontFamily: FONT.body, fontSize: 14, fill: C.cocoaSoft, fontWeight: '600' } })
    this.scoreT.anchor.set(1, 0.5)
    this.scoreT.position.set(this.W - 12, 46)
    this.statusT = new Text({ text: '', style: { fontFamily: FONT.body, fontSize: 14, fill: C.creamLight, fontWeight: 'bold' } })
    this.statusT.anchor.set(0.5)
    this.addChild(this.initial, this.nameT, this.countBg, this.countT, this.scoreT, this.statusBg, this.statusT)
    this.statusBg.visible = false
  }

  setName(name: string): void {
    this.nameT.text = name
    this.initial.text = (name[0] ?? '?').toUpperCase()
  }

  setCount(n: number): void {
    this.countT.text = n === 0 ? 'out' : `${n} card${n === 1 ? '' : 's'}`
  }

  setScore(n: number): void {
    this.scoreT.text = `${n > 0 ? '+' : ''}${n} pts`
    this.scoreT.style.fill = n > 0 ? C.sageDark : n < 0 ? C.paprikaDark : C.cocoaSoft
  }

  setTurn(on: boolean): void {
    this.turnOn = on
    if (!on) this.ring.clear()
  }

  setStatus(text: string, color: number = C.cocoaSoft): void {
    this.statusT.text = text
    if (!text) {
      this.statusBg.visible = false
      this.statusT.visible = false
      return
    }
    const w = this.statusT.width + 20
    this.statusBg.clear().roundRect(this.W / 2 - w / 2, this.H + 6, w, 22, 11).fill(color)
    this.statusT.position.set(this.W / 2, this.H + 17)
    this.statusBg.visible = true
    this.statusT.visible = true
  }

  update(dt: number): void {
    if (!this.turnOn) return
    this.phase += dt / 500
    const a = 0.55 + Math.sin(this.phase) * 0.35
    this.ring.clear().roundRect(-4, -4, this.W + 8, this.H + 8, 18).stroke({ width: 4, color: C.gold, alpha: a })
  }
}
