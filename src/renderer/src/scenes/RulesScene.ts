import { Container, Text } from 'pixi.js'
import type { BotLevel } from '@engine/game'
import { DEFAULT_RULES, RULE_OPTIONS, getRuleValue, setRuleValue, type Rules } from '@engine/rules'
import type { App, Scene } from '../app'
import { Backdrop } from '../gfx/backdrop'
import { C } from '../theme'
import { createInput, type DomInput } from '../ui/dom'
import { Button, Cycler, ScrollBox, Toggle, heading, label, panel } from '../ui/widgets'
import { MenuScene } from './MenuScene'

/**
 * House rules + player preferences. When opened from a lobby, changes are
 * pushed to the host live; from the main menu they become the defaults.
 */
export class RulesScene implements Scene {
  readonly view = new Container()
  private backdrop = new Backdrop()
  private card = new Container()
  private scroll: ScrollBox
  private rules: Rules
  private nameInput: DomInput | null = null
  private title: Text
  private controls: { key: string; set: (v: string | number | boolean) => void }[] = []
  private footer = new Container()
  private panelBg: Container | null = null
  private w = 0
  private h = 0

  constructor(
    private app: App,
    private opts: { live?: (rules: Rules) => void; onBack?: () => void; initial?: Rules; readOnly?: boolean } = {}
  ) {
    this.rules = { ...(opts.initial ?? app.settings.rules) }
    this.view.addChild(this.backdrop, this.card)
    this.title = heading('House rules', 34)
    this.scroll = new ScrollBox(700, 400)
    this.card.addChild(this.title, this.scroll, this.footer)
    this.buildList()

    const back = new Button('Back', { kind: 'secondary', width: 130, onClick: () => this.back() })
    const reset = new Button('Reset to standard', { kind: 'ghost', width: 190, onClick: () => this.reset() })
    back.position.set(0, 0)
    reset.position.set(150, 0)
    this.footer.addChild(back)
    if (!opts.readOnly) this.footer.addChild(reset)
  }

  private buildList(): void {
    const c = this.scroll.content
    c.removeChildren()
    this.controls = []
    let y = 0
    const readOnly = !!this.opts.readOnly

    if (!this.opts.live) {
      c.addChild(label('Your name', { fontSize: 17, fontWeight: '600' })).position.set(0, y + 6)
      y += 44
      c.addChild(label('Default bot strength', { fontSize: 17, fontWeight: '600' })).position.set(0, y + 6)
      const bot = new Cycler<BotLevel>(
        [
          { value: 'easy', label: 'Easy — plays loosely' },
          { value: 'normal', label: 'Normal — sensible player' },
          { value: 'hard', label: 'Hard — hoards 2s, chops hard' }
        ],
        this.app.settings.botLevel,
        300,
        (v) => {
          this.app.settings.botLevel = v
          void this.app.persist()
        }
      )
      bot.position.set(380, y)
      c.addChild(bot)
      y += 44
      c.addChild(label('Table pace', { fontSize: 17, fontWeight: '600' })).position.set(0, y + 6)
      const pace = new Cycler<number>(
        [
          { value: 400, label: 'Brisk' },
          { value: 900, label: 'Relaxed' },
          { value: 1600, label: 'Leisurely' }
        ],
        this.app.settings.botDelayMs,
        300,
        (v) => {
          this.app.settings.botDelayMs = v
          void this.app.persist()
        }
      )
      pace.position.set(380, y)
      c.addChild(pace)
      y += 60
      const divider = heading('Rules of the table', 22)
      divider.position.set(0, y)
      c.addChild(divider)
      y += 44
    }

    for (const opt of RULE_OPTIONS) {
      const l = label(opt.label, { fontSize: 16, fontWeight: '600' })
      l.position.set(0, y + 6)
      c.addChild(l)
      if (opt.help) {
        const h = label(opt.help, { fontSize: 13, fill: C.muted, wordWrap: true, wordWrapWidth: 360 })
        h.position.set(0, y + 30)
        c.addChild(h)
      }
      const current = getRuleValue(this.rules, opt.key)
      const apply = (v: string | number | boolean): void => {
        this.rules = setRuleValue(this.rules, opt.key, v)
        this.changed()
      }
      if (opt.kind === 'toggle') {
        const t = new Toggle(!!current, apply)
        t.position.set(380, y + 4)
        if (readOnly) t.eventMode = 'none'
        c.addChild(t)
        this.controls.push({ key: opt.key, set: (v) => t.set(!!v) })
      } else {
        const cy = new Cycler<string | number>(opt.choices!, current as string | number, 300, apply)
        cy.position.set(380, y)
        if (readOnly) cy.eventMode = 'none'
        c.addChild(cy)
        this.controls.push({ key: opt.key, set: (v) => cy.set(v as string | number) })
      }
      y += opt.help ? 66 : 48
    }
  }

  private changed(): void {
    if (this.opts.live) this.opts.live(this.rules)
    else {
      this.app.settings.rules = this.rules
      void this.app.persist()
    }
  }

  private reset(): void {
    this.rules = { ...DEFAULT_RULES }
    for (const ctl of this.controls) ctl.set(getRuleValue(this.rules, ctl.key as keyof Rules))
    this.changed()
  }

  private back(): void {
    if (this.opts.onBack) this.opts.onBack()
    else this.app.go(new MenuScene(this.app))
  }

  resize(w: number, h: number): void {
    this.w = w
    this.h = h
    this.backdrop.resize(w, h)
    const pw = Math.min(760, w - 40)
    const ph = h - 60
    this.panelBg?.destroy()
    this.panelBg = panel(pw, ph)
    this.card.addChildAt(this.panelBg, 0)
    this.card.position.set((w - pw) / 2, 30)
    this.title.position.set(30, 22)
    this.scroll.position.set(30, 80)
    this.scroll.resize(pw - 60, ph - 160)
    this.footer.position.set(30, ph - 64)

    if (!this.opts.live) {
      if (!this.nameInput) {
        this.nameInput = createInput({
          value: this.app.settings.name,
          placeholder: 'Your name',
          onChange: (v) => {
            this.app.settings.name = v.trim() || 'Player'
            void this.app.persist()
          }
        })
      }
      this.nameInput.setPosition(this.card.x + 30 + 380, this.card.y + 80 + 0, 300)
    }
  }

  update(): void {
    // Keep the DOM input glued to the scrolled content.
    if (this.nameInput) {
      const y = this.card.y + 80 + this.scroll.content.y
      const visible = y >= this.card.y + 70 && y <= this.card.y + this.h - 200
      this.nameInput.el.style.display = visible ? '' : 'none'
      this.nameInput.setPosition(this.card.x + 30 + 380, y, 300)
    }
  }

  destroy(): void {
    this.nameInput?.destroy()
    this.view.destroy({ children: true })
    void this.w
  }
}
