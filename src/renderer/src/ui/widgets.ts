import { Container, Graphics, Text, type TextStyleOptions } from 'pixi.js'
import { C, FONT } from '../theme'

export interface ButtonOptions {
  width?: number
  height?: number
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger'
  fontSize?: number
  onClick?: () => void
}

/** A rounded, warm button with hover/press states. */
export class Button extends Container {
  private bg = new Graphics()
  private labelText: Text
  private w: number
  private h: number
  private kind: NonNullable<ButtonOptions['kind']>
  private enabled = true
  private hovered = false
  private pressed = false
  onClick: (() => void) | undefined

  constructor(label: string, opts: ButtonOptions = {}) {
    super()
    this.w = opts.width ?? 180
    this.h = opts.height ?? 48
    this.kind = opts.kind ?? 'primary'
    this.onClick = opts.onClick
    this.labelText = new Text({
      text: label,
      style: { fontFamily: FONT.body, fontSize: opts.fontSize ?? 18, fontWeight: '600', fill: this.textColor() }
    })
    this.labelText.anchor.set(0.5)
    this.labelText.position.set(this.w / 2, this.h / 2)
    this.addChild(this.bg, this.labelText)
    this.eventMode = 'static'
    this.cursor = 'pointer'
    this.on('pointerover', () => {
      this.hovered = true
      this.draw()
    })
    this.on('pointerout', () => {
      this.hovered = false
      this.pressed = false
      this.draw()
    })
    this.on('pointerdown', () => {
      this.pressed = true
      this.draw()
    })
    this.on('pointerup', () => {
      this.pressed = false
      this.draw()
    })
    this.on('pointertap', () => {
      if (this.enabled) this.onClick?.()
    })
    this.draw()
  }

  private textColor(): number {
    switch (this.kind) {
      case 'primary':
      case 'danger':
        return C.creamLight
      case 'secondary':
        return C.cocoa
      case 'ghost':
        return C.cocoaSoft
    }
  }

  setLabel(text: string): void {
    this.labelText.text = text
  }

  setEnabled(v: boolean): void {
    this.enabled = v
    this.eventMode = v ? 'static' : 'none'
    this.cursor = v ? 'pointer' : 'default'
    this.draw()
  }

  private draw(): void {
    const g = this.bg
    g.clear()
    let fill: number
    let stroke: number
    switch (this.kind) {
      case 'primary':
        fill = this.pressed ? C.paprikaDark : this.hovered ? 0xd5623c : C.paprika
        stroke = C.paprikaDark
        break
      case 'danger':
        fill = this.pressed ? 0x6e2a1a : this.hovered ? 0xa6462f : 0x8f3a25
        stroke = 0x6e2a1a
        break
      case 'secondary':
        fill = this.pressed ? C.sand : this.hovered ? 0xf7ead4 : C.creamLight
        stroke = C.cardEdge
        break
      case 'ghost':
        fill = this.hovered ? 0xf7ead4 : C.cream
        stroke = C.sand
        break
    }
    const y = this.pressed ? 2 : 0
    if (!this.pressed) g.roundRect(0, 3, this.w, this.h, 12).fill({ color: C.shadow, alpha: 0.18 })
    g.roundRect(0, y, this.w, this.h, 12).fill(fill).stroke({ width: 1.5, color: stroke, alpha: 0.7 })
    this.labelText.y = this.h / 2 + y
    this.alpha = this.enabled ? 1 : 0.45
  }
}

/** A soft panel with a parchment fill. */
export function panel(w: number, h: number, opts: { fill?: number; radius?: number; alpha?: number; shadow?: boolean; stroke?: number } = {}): Graphics {
  const g = new Graphics()
  const r = opts.radius ?? 16
  if (opts.shadow !== false) g.roundRect(0, 6, w, h, r).fill({ color: C.shadow, alpha: 0.16 })
  g.roundRect(0, 0, w, h, r).fill({ color: opts.fill ?? C.creamLight, alpha: opts.alpha ?? 1 })
  if (opts.stroke !== undefined) g.roundRect(0, 0, w, h, r).stroke({ width: 1.5, color: opts.stroke, alpha: 0.6 })
  return g
}

export function label(text: string, style: Partial<TextStyleOptions> = {}): Text {
  const t = new Text({
    text,
    style: {
      fontFamily: FONT.body,
      fontSize: 16,
      fill: C.cocoa,
      ...style
    }
  })
  return t
}

export function heading(text: string, size = 28): Text {
  const t = new Text({
    text,
    style: { fontFamily: FONT.display, fontSize: size, fill: C.cocoa, fontWeight: 'bold' }
  })
  return t
}

/** A pill-shaped toggle switch. */
export class Toggle extends Container {
  private g = new Graphics()
  value: boolean
  onChange: ((v: boolean) => void) | undefined

  constructor(value: boolean, onChange?: (v: boolean) => void) {
    super()
    this.value = value
    this.onChange = onChange
    this.addChild(this.g)
    this.eventMode = 'static'
    this.cursor = 'pointer'
    this.on('pointertap', () => {
      this.value = !this.value
      this.draw()
      this.onChange?.(this.value)
    })
    this.draw()
  }

  set(v: boolean): void {
    this.value = v
    this.draw()
  }

  private draw(): void {
    const g = this.g
    g.clear()
    g.roundRect(0, 0, 52, 28, 14).fill(this.value ? C.sageDark : C.sand)
    g.circle(this.value ? 38 : 14, 14, 10).fill(C.creamLight)
  }
}

/** Left/right arrows around a value label — a compact "select" control. */
export class Cycler<T extends string | number> extends Container {
  private valueText: Text
  private index: number
  onChange: ((v: T) => void) | undefined

  constructor(
    private choices: { value: T; label: string }[],
    value: T,
    width = 260,
    onChange?: (v: T) => void
  ) {
    super()
    this.onChange = onChange
    this.index = Math.max(
      0,
      choices.findIndex((c) => c.value === value)
    )
    const bg = new Graphics().roundRect(0, 0, width, 34, 10).fill(C.creamLight).stroke({ width: 1, color: C.cardEdge })
    const left = new Text({ text: '‹', style: { fontFamily: FONT.display, fontSize: 26, fill: C.paprika } })
    left.anchor.set(0.5)
    left.position.set(18, 16)
    const right = new Text({ text: '›', style: { fontFamily: FONT.display, fontSize: 26, fill: C.paprika } })
    right.anchor.set(0.5)
    right.position.set(width - 18, 16)
    this.valueText = new Text({ text: '', style: { fontFamily: FONT.body, fontSize: 15, fill: C.cocoa } })
    this.valueText.anchor.set(0.5)
    this.valueText.position.set(width / 2, 17)
    this.addChild(bg, left, right, this.valueText)
    const hit = (t: Text, dir: number): void => {
      t.eventMode = 'static'
      t.cursor = 'pointer'
      t.hitArea = { contains: (x: number, y: number) => Math.abs(x) < 18 && Math.abs(y) < 18 }
      t.on('pointertap', () => this.step(dir))
    }
    hit(left, -1)
    hit(right, 1)
    this.refresh()
  }

  private step(dir: number): void {
    this.index = (this.index + dir + this.choices.length) % this.choices.length
    this.refresh()
    this.onChange?.(this.choices[this.index].value)
  }

  set(value: T): void {
    const i = this.choices.findIndex((c) => c.value === value)
    if (i >= 0) this.index = i
    this.refresh()
  }

  private refresh(): void {
    this.valueText.text = this.choices[this.index]?.label ?? ''
  }
}

/** Transient message in the corner. */
export class Toast extends Container {
  private bg = new Graphics()
  private text: Text
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    super()
    this.text = new Text({ text: '', style: { fontFamily: FONT.body, fontSize: 15, fill: C.creamLight, wordWrap: true, wordWrapWidth: 360 } })
    this.text.position.set(14, 10)
    this.addChild(this.bg, this.text)
    this.visible = false
  }

  show(msg: string, ms = 2600, color: number = C.cocoa): void {
    this.text.text = msg
    const w = this.text.width + 28
    const h = this.text.height + 20
    this.bg.clear().roundRect(0, 0, w, h, 10).fill({ color, alpha: 0.92 })
    this.visible = true
    this.alpha = 1
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.visible = false
    }, ms)
  }
}

/** Simple vertical scroll container with wheel support and a mask. */
export class ScrollBox extends Container {
  readonly content = new Container()
  private maskG = new Graphics()
  private viewH: number
  private viewW: number

  constructor(w: number, h: number) {
    super()
    this.viewW = w
    this.viewH = h
    this.maskG.rect(0, 0, w, h).fill(0xffffff)
    this.addChild(this.maskG, this.content)
    this.content.mask = this.maskG
    this.eventMode = 'static'
    this.hitArea = { contains: (x: number, y: number) => x >= 0 && y >= 0 && x <= this.viewW && y <= this.viewH }
    this.on('wheel', (e) => {
      this.scrollBy(e.deltaY)
    })
  }

  resize(w: number, h: number): void {
    this.viewW = w
    this.viewH = h
    this.maskG.clear().rect(0, 0, w, h).fill(0xffffff)
    this.scrollBy(0)
  }

  scrollBy(dy: number): void {
    const maxScroll = Math.max(0, this.content.height - this.viewH + 20)
    this.content.y = Math.max(-maxScroll, Math.min(0, this.content.y - dy))
  }
}
