import { Container, Graphics, Text } from 'pixi.js'
import { cardLabel, type Card } from '@engine/cards'
import { beats, detect, describeCombo, isChop, isChopOf, type Combo } from '@engine/combos'
import { INSTANT_WIN_NAMES, placeName, type GameEvent, type GameView, type Seat } from '@engine/game'
import { legalPlays } from '@engine/moves'
import type { App, Scene } from '../app'
import { Backdrop, drawTable } from '../gfx/backdrop'
import { CardSprite } from '../gfx/cards'
import { Plaque } from '../gfx/plaque'
import { C, CARD, FONT, SEAT_COLORS } from '../theme'
import { ease } from '../ui/tween'
import { Button, heading, label, panel } from '../ui/widgets'
import type { Session } from '../session'
import { LobbyScene } from './LobbyScene'
import { MenuScene } from './MenuScene'

type Rel = 0 | 1 | 2 | 3 // 0 = me (bottom), then clockwise around the table

export class GameScene implements Scene {
  readonly view = new Container()
  private backdrop = new Backdrop()
  private tableG = new Graphics()
  private plaques: Plaque[] = []
  private plaqueLayer = new Container()
  private tableLayer = new Container()
  private handLayer = new Container()
  private hudLayer = new Container()
  private overlayLayer = new Container()
  private handSprites = new Map<number, CardSprite>()
  private selected = new Set<number>()
  private hoverId: number | null = null
  private w = 0
  private h = 0
  private mySeat: Seat
  private n: number
  private unsub: (() => void)[] = []

  // HUD
  private roundPanel = new Container()
  private roundBig!: Text
  private roundSub!: Text
  private logText!: Text
  private logPanel!: Container
  private banner = new Container()
  private bannerText!: Text
  private comboLabel!: Text
  private playBtn!: Button
  private passBtn!: Button
  private hintBtn!: Button
  private clearBtn!: Button
  private menuBtn!: Button
  private overlay: Container | null = null
  private tablePlays = new Map<number, Container>()
  private lastTrickKey = ''
  private timerText!: Text
  private turnStartedAt = 0
  private lastTurnKey = ''
  private chopFlash: Text | null = null

  constructor(
    private app: App,
    private session: Session
  ) {
    const client = session.client
    this.mySeat = client.seat ?? 0
    this.n = client.view?.players.length ?? client.lobby?.seats.length ?? 4
    this.view.addChild(this.backdrop, this.tableG, this.tableLayer, this.plaqueLayer, this.handLayer, this.hudLayer, this.overlayLayer)
    this.buildHud()
    this.buildPlaques()
    this.unsub.push(
      client.changed.add(() => this.render()),
      client.events.add((events, view) => this.onEvents(events, view)),
      client.errors.add((m) => this.app.notify(m, C.paprikaDark))
    )
    window.addEventListener('keydown', this.onKey)
    this.render()

    // Table settles in first, then the HUD and seat plaques ease in on top of it.
    this.plaqueLayer.alpha = 0
    this.hudLayer.alpha = 0
    void this.app.tweens.to(this.plaqueLayer, { alpha: 1 }, 320, { delay: 120, ease: ease.outCubic })
    void this.app.tweens.to(this.hudLayer, { alpha: 1 }, 320, { delay: 200, ease: ease.outCubic })
  }

  private get client() {
    return this.session.client
  }

  private rel(seat: Seat): Rel {
    return ((seat - this.mySeat + this.n) % this.n) as Rel
  }

  // ------------------------------------------------------------------ build

  private buildPlaques(): void {
    const view = this.client.view
    const names = view ? view.players.map((p) => p.name) : (this.client.lobby?.seats.map((s) => s.name) ?? [])
    for (let s = 0; s < this.n; s++) {
      const p = new Plaque(names[s] || `Seat ${s + 1}`, SEAT_COLORS[s], s === this.mySeat)
      this.plaques.push(p)
      this.plaqueLayer.addChild(p)
    }
  }

  private buildHud(): void {
    const bg = panel(220, 78, { alpha: 0.95 })
    this.roundBig = new Text({ text: '', style: { fontFamily: FONT.display, fontSize: 26, fill: C.paprika, fontWeight: 'bold' } })
    this.roundBig.position.set(16, 8)
    this.roundSub = label('', { fontSize: 13, fill: C.muted })
    this.roundSub.position.set(16, 46)
    this.roundPanel.addChild(bg, this.roundBig, this.roundSub)
    this.hudLayer.addChild(this.roundPanel)

    this.logPanel = panel(266, 150, { alpha: 0.85, radius: 12 })
    this.logText = label('', { fontSize: 13, fill: C.cocoaSoft, wordWrap: true, wordWrapWidth: 238, lineHeight: 19 })
    this.hudLayer.addChild(this.logPanel, this.logText)

    const bbg = new Graphics()
    this.bannerText = new Text({ text: '', style: { fontFamily: FONT.body, fontSize: 16, fill: C.creamLight, fontWeight: '600', align: 'center' } })
    this.bannerText.anchor.set(0.5)
    this.banner.addChild(bbg, this.bannerText)
    this.hudLayer.addChild(this.banner)

    this.comboLabel = label('', { fontSize: 15, fill: C.cocoaSoft, fontWeight: '600' })
    this.comboLabel.anchor.set(0.5)
    this.hudLayer.addChild(this.comboLabel)

    this.playBtn = new Button('Play', { width: 130, height: 46, onClick: () => this.play() })
    this.passBtn = new Button('Pass', { width: 110, height: 46, kind: 'secondary', onClick: () => this.pass() })
    this.hintBtn = new Button('Hint', { width: 90, height: 40, kind: 'ghost', fontSize: 15, onClick: () => this.hint() })
    this.clearBtn = new Button('Clear', { width: 90, height: 40, kind: 'ghost', fontSize: 15, onClick: () => this.clearSelection() })
    this.menuBtn = new Button('Leave table', { width: 130, height: 36, kind: 'ghost', fontSize: 14, onClick: () => void this.leave() })
    this.timerText = label('', { fontSize: 14, fill: C.paprikaDark, fontWeight: '600' })
    this.hudLayer.addChild(this.playBtn, this.passBtn, this.hintBtn, this.clearBtn, this.menuBtn, this.timerText)
  }

  // ----------------------------------------------------------------- layout

  resize(w: number, h: number): void {
    this.w = w
    this.h = h
    this.backdrop.resize(w, h)
    drawTable(this.tableG, w, h)
    for (let s = 0; s < this.n; s++) {
      const p = this.plaques[s]
      const pos = this.plaquePosition(this.rel(s as Seat))
      p.position.set(pos.x - p.W / 2, pos.y - p.H / 2)
    }
    this.roundPanel.position.set(20, 20)
    this.logPanel.position.set(w - 286, 20)
    this.logText.position.set(w - 270, 30)
    this.menuBtn.position.set(w - 150, h - 56)
    this.layoutHand()
    this.layoutButtons()
    this.layoutTable()
    this.banner.position.set(w / 2, h / 2 - 30)
    if (this.overlay) this.overlay.position.set((w - 520) / 2, (h - 400) / 2)
  }

  /** Seat positions around the table for 2, 3 and 4 players. */
  private plaquePosition(rel: Rel): { x: number; y: number } {
    const { w, h, n } = this
    if (rel === 0) return { x: 130, y: h - 205 }
    if (n === 2) return { x: w / 2, y: 62 }
    if (n === 3) return rel === 1 ? { x: w - 170, y: 150 } : { x: 170, y: 150 }
    switch (rel) {
      case 1:
        return { x: w - 130, y: h / 2 - 30 }
      case 2:
        return { x: w / 2, y: 62 }
      default:
        return { x: 130, y: h / 2 - 30 }
    }
  }

  private tablePosition(rel: Rel): { x: number; y: number } {
    const cx = this.w / 2
    const cy = this.h / 2 - 30
    const dx = Math.min(this.w * 0.2, 250)
    if (rel === 0) return { x: cx, y: cy + 90 }
    if (this.n === 2) return { x: cx, y: cy - 100 }
    if (this.n === 3) return rel === 1 ? { x: cx + dx * 0.7, y: cy - 80 } : { x: cx - dx * 0.7, y: cy - 80 }
    switch (rel) {
      case 1:
        return { x: cx + dx, y: cy - 10 }
      case 2:
        return { x: cx, y: cy - 105 }
      default:
        return { x: cx - dx, y: cy - 10 }
    }
  }

  private layoutButtons(): void {
    const y = this.h - 228
    const x = this.w - 470
    this.hintBtn.position.set(x, y + 3)
    this.clearBtn.position.set(x + 100, y + 3)
    this.passBtn.position.set(x + 200, y)
    this.playBtn.position.set(x + 320, y)
    this.timerText.position.set(x + 200, y - 26)
    this.comboLabel.position.set(this.w / 2, this.h - CARD.h * this.handScale() - 62)
  }

  private handScale(): number {
    return this.h < 700 ? 0.85 : 1
  }

  private layoutHand(animate = true): void {
    const view = this.client.view
    if (!view) return
    const cards = view.hand
    const n = cards.length
    const scale = this.handScale()
    const cw = CARD.w * scale
    const avail = Math.min(this.w - 360, 900)
    const spacing = n > 1 ? Math.min(cw * 0.7, (avail - cw) / (n - 1)) : 0
    const total = cw + spacing * (n - 1)
    const x0 = this.w / 2 - total / 2 + cw / 2
    const baseY = this.h - CARD.h * scale * 0.5 - 20
    cards.forEach((c, i) => {
      const s = this.handSprites.get(c.id)
      if (!s) return
      const selected = this.selected.has(c.id)
      const hovered = this.hoverId === c.id
      const lift = selected ? 26 : hovered ? 14 : 0
      const tx = x0 + i * spacing
      const ty = baseY - lift
      s.scale.set(scale)
      s.zIndex = i + (hovered ? 1000 : 0)
      if (animate) {
        this.app.tweens.kill(s)
        void this.app.tweens.to(s, { x: tx, y: ty }, hovered || selected ? 140 : 220, { ease: ease.outCubic })
      } else s.position.set(tx, ty)
    })
    this.handLayer.sortableChildren = true
  }

  // ----------------------------------------------------------------- render

  private render(): void {
    const view = this.client.view
    if (!view) return
    this.mySeat = view.seat
    this.renderHand(view)
    this.renderPlaques(view)
    this.renderHud(view)
    this.renderTable(view)
    this.renderBanner(view)
    this.updateButtons(view)
    this.renderOverlay(view)
  }

  private renderHand(view: GameView): void {
    const ids = new Set(view.hand.map((c) => c.id))
    for (const [id, s] of this.handSprites) {
      if (!ids.has(id)) {
        this.handSprites.delete(id)
        this.app.tweens.kill(s)
        void this.app.tweens.to(s, { y: s.y - 60, alpha: 0 }, 260).then(() => s.destroy())
        this.selected.delete(id)
      }
    }
    let added = 0
    for (const c of view.hand) {
      if (this.handSprites.has(c.id)) continue
      const s = new CardSprite(c)
      s.eventMode = 'static'
      s.cursor = 'pointer'
      s.on('pointertap', () => this.toggleCard(c))
      s.on('pointerover', () => {
        this.hoverId = c.id
        this.layoutHand()
      })
      s.on('pointerout', () => {
        if (this.hoverId === c.id) this.hoverId = null
        this.layoutHand()
      })
      // Dealt cards slide up from below the table edge (layoutHand animates them into place).
      s.position.set(this.w / 2 + added * 6, this.h + 120)
      this.handSprites.set(c.id, s)
      this.handLayer.addChild(s)
      added++
    }
    for (const c of view.hand) {
      const s = this.handSprites.get(c.id)!
      const sel = this.selected.has(c.id)
      const must = view.mustPlayCardId === c.id
      s.setHighlight(sel || must, sel ? C.gold : C.paprika)
    }
    this.layoutHand()
    this.updateComboLabel(view)
  }

  private renderPlaques(view: GameView): void {
    const waiting = view.phase === 'playing' ? view.turn : null
    for (let s = 0; s < this.n; s++) {
      const p = this.plaques[s]
      p.setName(view.players[s].name)
      p.setCount(view.handCounts[s])
      p.setScore(view.scores[s])
      p.setTurn(waiting === s)
      const place = view.finished.indexOf(s as Seat)
      if (place >= 0) p.setStatus(placeName(place + 1), place === 0 ? C.gold : C.sageDark)
      else if (view.phase === 'playing' && view.trick.passed.includes(s as Seat)) p.setStatus('Pass', C.muted)
      else if (waiting === s && view.players[s].isBot) p.setStatus('thinking…', C.cocoaSoft)
      else p.setStatus('')
    }
  }

  private renderHud(view: GameView): void {
    const r = view.rules
    this.roundBig.text = r.rounds ? `Round ${view.round + 1} of ${r.rounds}` : `Round ${view.round + 1}`
    const lead = view.players.reduce((a, b) => (view.scores[b.seat] > view.scores[a.seat] ? b : a))
    this.roundSub.text = view.scores.every((x) => x === 0) ? 'Fresh table' : `${lead.name} leads with ${view.scores[lead.seat]}`
    this.logText.text = view.log.slice(-7).join('\n')
  }

  private renderTable(view: GameView): void {
    const key = view.trick.plays.map((p) => `${p.seat}:${p.combo ? p.combo.cards.map((c) => c.id).join('.') : 'pass'}`).join('|') + `#${view.round}`
    if (key === this.lastTrickKey) return
    this.lastTrickKey = key
    if (view.trick.plays.length === 0 && this.tablePlays.size > 0 && view.phase === 'playing') {
      for (const c of this.tablePlays.values()) {
        this.app.tweens.kill(c)
        void this.app.tweens.to(c, { alpha: 0.35 }, 400)
      }
      return
    }
    for (const c of this.tablePlays.values()) c.destroy({ children: true })
    this.tablePlays.clear()
    this.tableLayer.removeChildren()

    const latest = new Map<number, Combo | null>()
    for (const p of view.trick.plays) latest.set(p.seat, p.combo)
    for (const [seat, combo] of latest) {
      const c = new Container()
      if (combo) {
        const isCurrent = view.trick.lastPlayer === seat
        const scale = isCurrent ? 0.62 : 0.5
        const cw = CARD.w * scale
        const sp = cw * 0.5
        const total = cw + sp * (combo.cards.length - 1)
        combo.cards.forEach((card, i) => {
          const s = new CardSprite(card)
          s.scale.set(scale)
          s.position.set(-total / 2 + cw / 2 + i * sp, 0)
          c.addChild(s)
        })
        const chop = isChop(combo) && isCurrent
        const name = new Text({
          text: describeCombo(combo) + (chop ? ' — chặt!' : ''),
          style: { fontFamily: FONT.body, fontSize: 12, fill: chop ? C.gold : isCurrent ? C.creamLight : C.parchment, fontWeight: '600' }
        })
        name.anchor.set(0.5)
        name.position.set(0, -CARD.h * scale * 0.5 - 12)
        c.addChild(name)
        c.alpha = isCurrent ? 1 : 0.7
      } else {
        const t = new Text({ text: 'Pass', style: { fontFamily: FONT.display, fontSize: 18, fill: C.parchment, fontStyle: 'italic' } })
        t.anchor.set(0.5)
        c.addChild(t)
      }
      this.tablePlays.set(seat, c)
      this.tableLayer.addChild(c)
    }
    this.layoutTable()
  }

  private layoutTable(): void {
    for (const [seat, c] of this.tablePlays) {
      const p = this.tablePosition(this.rel(seat as Seat))
      c.position.set(p.x, p.y)
    }
  }

  private renderBanner(view: GameView): void {
    let text = ''
    const me = view.seat
    if (view.phase === 'playing' && view.turn === me && !view.trick.current) {
      if (view.mustPlayCardId !== null) {
        const c = view.hand.find((k) => k.id === view.mustPlayCardId)
        text = `You open the match. Your play must include the ${c ? cardLabel(c) : 'lowest card'}.`
      } else if (view.playedCardIds.length === 0) text = 'You lead. Play anything.'
    }
    this.bannerText.text = text
    this.banner.visible = !!text
    if (text) {
      const bg = this.banner.children[0] as Graphics
      const w = this.bannerText.width + 48
      const h = this.bannerText.height + 28
      bg.clear().roundRect(-w / 2, -h / 2, w, h, 14).fill({ color: C.clothDark, alpha: 0.9 })
      this.bannerText.position.set(0, 0)
    }
  }

  private updateButtons(view: GameView): void {
    const me = view.seat
    const myTurn = view.phase === 'playing' && view.turn === me
    const sel = this.selectedCards(view)
    const combo = sel.length ? detect(sel, view.rules) : null
    const ok =
      !!combo &&
      (view.trick.current ? beats(combo, view.trick.current, view.rules) : view.mustPlayCardId === null || sel.some((c) => c.id === view.mustPlayCardId))
    this.playBtn.setEnabled(myTurn && ok)
    this.passBtn.setEnabled(myTurn && !!view.trick.current)
    this.hintBtn.setEnabled(myTurn)
    this.clearBtn.setEnabled(this.selected.size > 0)
    const turnKey = `${view.round}:${view.trick.plays.length}:${view.turn}:${view.phase}`
    if (myTurn && turnKey !== this.lastTurnKey) this.turnStartedAt = performance.now()
    this.lastTurnKey = turnKey
    this.timerText.visible = myTurn && view.rules.turnTimeSeconds > 0
  }

  private renderOverlay(view: GameView): void {
    const want = view.phase === 'roundOver' || view.phase === 'matchOver'
    if (!want) {
      if (this.overlay) {
        this.overlay.destroy({ children: true })
        this.overlay = null
      }
      return
    }
    if (this.overlay) return
    const r = view.lastResult
    if (!r) return
    const o = new Container()
    o.addChild(panel(520, 400))
    const matchOver = view.phase === 'matchOver'
    const title = heading(matchOver ? `${view.players[view.matchWinner!].name} wins the match!` : `Round ${r.round + 1}`, 28)
    title.position.set(28, 22)
    o.addChild(title)
    const won = r.winner === view.seat
    const subText = r.instantWin
      ? `${view.players[r.winner].name} went out instantly with ${INSTANT_WIN_NAMES[r.instantWin]}!`
      : won
        ? 'You went out first!'
        : `${view.players[r.winner].name} went out first.`
    const sub = label(subText, { fontSize: 15, fill: won ? C.sageDark : C.paprikaDark, fontWeight: '600', wordWrap: true, wordWrapWidth: 460 })
    sub.position.set(28, 60)
    o.addChild(sub)
    let y = 104
    r.order.forEach((seat, i) => {
      const d = r.delta[seat]
      const extras: string[] = []
      if (i > 0 && !r.instantWin) extras.push(`${r.cardsLeft[seat]} left`)
      if (r.cong.includes(seat)) extras.push('cóng')
      const line = label(`${placeName(i + 1)}   ${view.players[seat].name}${seat === view.seat ? ' (you)' : ''}`, { fontSize: 16, fill: i === 0 ? C.cocoa : C.muted })
      line.position.set(28, y)
      const pts = label(`${d >= 0 ? '+' : ''}${d}`, { fontSize: 16, fill: d >= 0 ? C.sageDark : C.paprikaDark, fontWeight: '600' })
      pts.anchor.set(1, 0)
      pts.position.set(400, y)
      const ex = label(extras.join(' · '), { fontSize: 13, fill: C.muted })
      ex.position.set(410, y + 2)
      o.addChild(line, pts, ex)
      y += 28
    })
    if (r.chops.length) {
      y += 6
      for (const ch of r.chops.slice(0, 3)) {
        o.addChild(label(`${view.players[ch.chopper].name} ${ch.what} (+${ch.points} from ${view.players[ch.victim].name})`, { fontSize: 13, fill: C.goldDark, wordWrap: true, wordWrapWidth: 460 })).position.set(28, y)
        y += 20
      }
    }
    y += 10
    o.addChild(label(`Totals: ${view.players.map((p) => `${p.name} ${view.scores[p.seat]}`).join('  ·  ')}`, { fontSize: 14, fontWeight: '600', wordWrap: true, wordWrapWidth: 460 })).position.set(28, y)

    const isHost = this.client.isHost
    if (matchOver) {
      const again = new Button('Back to the lobby', { width: 200, onClick: () => this.app.go(new LobbyScene(this.app, this.session)) })
      again.position.set(28, 330)
      const menu = new Button('Main menu', { kind: 'secondary', width: 160, onClick: () => void this.leave() })
      menu.position.set(248, 330)
      o.addChild(again, menu)
    } else if (isHost) {
      const next = new Button('Deal the next round', { width: 220, onClick: () => this.client.nextRound() })
      next.position.set(28, 330)
      o.addChild(next)
    } else {
      o.addChild(label('Waiting for the host to deal…', { fontSize: 14, fill: C.muted })).position.set(28, 342)
    }
    o.position.set((this.w - 520) / 2, (this.h - 400) / 2)
    o.alpha = 0
    void this.app.tweens.to(o, { alpha: 1 }, 300, { delay: 600 })
    this.overlay = o
    this.overlayLayer.addChild(o)
  }

  // ---------------------------------------------------------------- events

  private onEvents(events: GameEvent[], view: GameView): void {
    for (const e of events) {
      switch (e.type) {
        case 'dealt':
          this.selected.clear()
          this.lastTrickKey = ''
          break
        case 'trickWon':
          if (e.leader !== view.seat) this.app.notify(`${view.players[e.leader].name} leads`)
          break
        case 'finished':
          if (e.seat === view.seat) this.app.notify(`You're out ${placeName(e.place)}!`, e.place === 1 ? C.goldDark : C.sageDark)
          else this.app.notify(`${view.players[e.seat].name} is out ${placeName(e.place)}`)
          break
        case 'chop':
          this.flashChop(`Chặt! ${view.players[e.record.chopper].name} +${e.record.points}`)
          break
        case 'instantWin':
          this.app.notify(`${view.players[e.seat].name}: ${INSTANT_WIN_NAMES[e.kind]}!`, C.goldDark)
          break
        default:
          break
      }
    }
  }

  private flashChop(text: string): void {
    this.chopFlash?.destroy()
    const t = new Text({
      text,
      style: { fontFamily: FONT.display, fontSize: 44, fill: C.gold, fontWeight: 'bold', dropShadow: { alpha: 0.4, blur: 4, distance: 3, color: C.shadow, angle: Math.PI / 3 } }
    })
    t.anchor.set(0.5)
    t.position.set(this.w / 2, this.h / 2 - 30)
    t.scale.set(0.4)
    this.overlayLayer.addChild(t)
    this.chopFlash = t
    void this.app.tweens.to(t.scale, { x: 1, y: 1 }, 350, { ease: ease.outBack }).then(() =>
      this.app.tweens.to(t, { alpha: 0, y: t.y - 40 }, 700, { delay: 900 }).then(() => {
        if (this.chopFlash === t) this.chopFlash = null
        t.destroy()
      })
    )
  }

  // ------------------------------------------------------------- interaction

  private selectedCards(view: GameView): Card[] {
    return view.hand.filter((c) => this.selected.has(c.id))
  }

  private toggleCard(c: Card): void {
    const view = this.client.view
    if (!view) return
    if (this.selected.has(c.id)) this.selected.delete(c.id)
    else this.selected.add(c.id)
    this.renderHand(view)
    this.updateButtons(view)
  }

  private clearSelection(): void {
    this.selected.clear()
    const view = this.client.view
    if (view) {
      this.renderHand(view)
      this.updateButtons(view)
    }
  }

  private updateComboLabel(view: GameView): void {
    const sel = this.selectedCards(view)
    const myTurn = view.phase === 'playing' && view.turn === view.seat
    if (sel.length === 0) {
      if (myTurn && view.trick.current) {
        const legal = legalPlays(view.hand, view.rules, view.trick.current)
        const d = describeCombo(view.trick.current)
        this.comboLabel.text = legal.length ? `Your turn — beat the ${d[0].toLowerCase()}${d.slice(1)}` : 'Nothing beats that — pass'
      } else this.comboLabel.text = ''
      this.comboLabel.style.fill = C.cocoaSoft
      return
    }
    const combo = detect(sel, view.rules)
    if (!combo) {
      this.comboLabel.text = 'Not a valid combination'
      this.comboLabel.style.fill = C.paprikaDark
    } else if (view.trick.current && !beats(combo, view.trick.current, view.rules)) {
      this.comboLabel.text = `${describeCombo(combo)} — doesn't beat the table`
      this.comboLabel.style.fill = C.paprikaDark
    } else if (!view.trick.current && view.mustPlayCardId !== null && !sel.some((c) => c.id === view.mustPlayCardId)) {
      this.comboLabel.text = `${describeCombo(combo)} — must include the lowest card`
      this.comboLabel.style.fill = C.paprikaDark
    } else {
      const chop = view.trick.current && isChopOf(combo, view.trick.current)
      this.comboLabel.text = describeCombo(combo) + (chop ? ' — chặt!' : '')
      this.comboLabel.style.fill = chop ? C.goldDark : C.sageDark
    }
  }

  private play(): void {
    const view = this.client.view
    if (!view) return
    const sel = this.selectedCards(view)
    if (sel.length === 0) return
    this.client.play(sel.map((c) => c.id))
    this.selected.clear()
  }

  private pass(): void {
    const view = this.client.view
    if (!view || view.phase !== 'playing' || view.turn !== view.seat || !view.trick.current) return
    this.client.pass()
    this.selected.clear()
  }

  private hint(): void {
    const view = this.client.view
    if (!view || view.phase !== 'playing' || view.turn !== view.seat) return
    const legal = legalPlays(view.hand, view.rules, view.trick.current, view.mustPlayCardId)
    if (legal.length === 0) {
      this.app.notify('Nothing beats that — pass')
      return
    }
    legal.sort((a, b) => {
      const ca = view.trick.current && isChopOf(a, view.trick.current) ? 1 : 0
      const cb = view.trick.current && isChopOf(b, view.trick.current) ? 1 : 0
      if (ca !== cb) return ca - cb
      if (!view.trick.current && a.cards.length !== b.cards.length) return b.cards.length - a.cards.length
      return a.top - b.top
    })
    const current = [...this.selected].sort().join(',')
    let idx = legal.findIndex((c) => c.cards.map((k) => k.id).sort().join(',') === current)
    idx = (idx + 1) % legal.length
    this.selected = new Set(legal[idx].cards.map((c) => c.id))
    this.renderHand(view)
    this.updateButtons(view)
  }

  private onKey = (e: KeyboardEvent): void => {
    // Scene teardown is deferred to let the outgoing scene fade out (see App.go); until then,
    // ignore shortcuts so a keypress during the crossfade can't act on a scene that's on its way out.
    if (this.app.current !== this) return
    if (e.key === 'Enter') this.play()
    else if (e.key === ' ') {
      e.preventDefault()
      this.pass()
    } else if (e.key.toLowerCase() === 'h') this.hint()
    else if (e.key === 'Escape') this.clearSelection()
  }

  private async leave(): Promise<void> {
    await this.app.endSession()
    this.app.go(new MenuScene(this.app))
  }

  update(dt: number): void {
    for (const p of this.plaques) p.update(dt)
    const view = this.client.view
    if (view && this.timerText.visible) {
      const left = Math.max(0, view.rules.turnTimeSeconds - (performance.now() - this.turnStartedAt) / 1000)
      this.timerText.text = `${Math.ceil(left)}s`
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey)
    for (const u of this.unsub) u()
    this.view.destroy({ children: true })
  }
}
