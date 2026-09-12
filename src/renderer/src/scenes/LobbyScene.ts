import { Container, Graphics, Text } from 'pixi.js'
import type { BotLevel, Seat } from '@engine/game'
import type { App, Scene } from '../app'
import { Backdrop } from '../gfx/backdrop'
import { C, FONT, SEAT_COLORS } from '../theme'
import { Button, Cycler, Toggle, heading, label, panel } from '../ui/widgets'
import type { Session } from '../session'
import { GameScene } from './GameScene'
import { MenuScene } from './MenuScene'
import { RulesScene } from './RulesScene'

const BOT_CHOICES: { value: BotLevel; label: string }[] = [
  { value: 'easy', label: 'Easy bot' },
  { value: 'normal', label: 'Normal bot' },
  { value: 'hard', label: 'Hard bot' }
]

export class LobbyScene implements Scene {
  readonly view = new Container()
  private backdrop = new Backdrop()
  private card = new Container()
  private bg: Container | null = null
  private title: Text
  private seatsC = new Container()
  private info: Text
  private rulesSummary: Text
  private startBtn: Button
  private leaveBtn: Button
  private rulesBtn: Button
  private inviteBtn: Button | null = null
  private copyBtn: Button | null = null
  private unsub: (() => void)[] = []
  private started = false

  constructor(
    private app: App,
    private session: Session
  ) {
    this.view.addChild(this.backdrop, this.card)
    this.title = heading(this.titleFor(), 34)
    this.info = label('', { fontSize: 14, fill: C.muted, wordWrap: true, wordWrapWidth: 640 })
    this.rulesSummary = label('', { fontSize: 14, fill: C.cocoaSoft, wordWrap: true, wordWrapWidth: 640 })
    this.startBtn = new Button('Deal the cards', { kind: 'primary', width: 220, onClick: () => session.client.start() })
    this.leaveBtn = new Button('Leave', { kind: 'secondary', width: 130, onClick: () => void this.leave() })
    this.rulesBtn = new Button('House rules', { kind: 'secondary', width: 160, onClick: () => this.openRules() })
    this.card.addChild(this.title, this.seatsC, this.info, this.rulesSummary, this.startBtn, this.leaveBtn, this.rulesBtn)

    if (session.mode === 'steam-host' && window.gd) {
      this.inviteBtn = new Button('Invite friends', { kind: 'secondary', width: 160, onClick: () => void window.gd?.steam.inviteDialog() })
      this.card.addChild(this.inviteBtn)
    }
    if (session.joinCode) {
      this.copyBtn = new Button('Copy join code', {
        kind: 'ghost',
        width: 160,
        onClick: () => {
          void navigator.clipboard?.writeText(session.joinCode)
          this.app.notify('Copied to clipboard')
        }
      })
      this.card.addChild(this.copyBtn)
    }

    const client = session.client
    const onChange = (): void => this.refresh()
    this.unsub.push(
      client.changed.add(onChange),
      client.errors.add((m) => this.app.notify(m, C.paprikaDark)),
      client.kicked.add((r) => this.app.notify(`You were moved to spectating: ${r}`, C.paprikaDark)),
      // The game starts when the first state view arrives.
      client.events.add(() => {
        if (!this.started) {
          this.started = true
          this.app.go(new GameScene(this.app, this.session))
        }
      })
    )
    // Already mid-game (e.g. returning from the rules screen)? Jump straight to the table.
    if (client.view && client.view.phase !== 'matchOver') {
      this.started = true
      queueMicrotask(() => this.app.go(new GameScene(this.app, this.session)))
    }
    this.refresh()
  }

  private titleFor(): string {
    switch (this.session.mode) {
      case 'solo':
        return 'Set up the table'
      case 'lan-host':
      case 'steam-host':
        return 'Your table'
      default:
        return 'Joining a table'
    }
  }

  private openRules(): void {
    const client = this.session.client
    const lobby = client.lobby
    if (!lobby) return
    const isHost = client.isHost
    this.app.go(
      new RulesScene(this.app, {
        initial: lobby.rules,
        readOnly: !isHost,
        live: (rules) => {
          if (isHost) {
            client.setRules(rules)
            this.app.settings.rules = rules
            void this.app.persist()
          }
        },
        onBack: () => this.app.go(new LobbyScene(this.app, this.session))
      })
    )
  }

  private async leave(): Promise<void> {
    await this.app.endSession()
    this.app.go(new MenuScene(this.app))
  }

  private refresh(): void {
    const client = this.session.client
    const lobby = client.lobby
    this.seatsC.removeChildren()
    if (!lobby) {
      this.info.text = client.connected ? 'Connecting…' : `Disconnected: ${client.closeReason}`
      return
    }
    const isHost = client.isHost
    const r = lobby.rules
    const north = [r.pairsSameColor, r.straightsSameSuit, r.followSuitSingles].filter(Boolean).length
    this.rulesSummary.text =
      `${r.playerCount} players · ${r.rounds ? `${r.rounds} rounds` : 'endless'} · instant wins ${r.instantWins ? 'on' : 'off'}` +
      ` · chops ${r.chopChains ? 'chain' : 'don’t chain'} · red 2 left costs ${r.penaltyRedTwo}` +
      (north ? ` · ${north} Northern rule${north > 1 ? 's' : ''}` : '') +
      (r.turnTimeSeconds ? ` · ${r.turnTimeSeconds}s timer` : '')
    const code = this.session.joinCode
    this.info.text =
      this.session.mode === 'solo'
        ? 'Bots fill every empty seat. Change the number of seats under House rules.'
        : code
          ? `Join code: ${code}   —   friends who join take over a bot seat.`
          : client.connected
            ? 'Waiting for the host to deal…'
            : `Disconnected: ${client.closeReason}`

    lobby.seats.forEach((s, i) => {
      const row = new Container()
      const isMe = s.clientId === client.clientId && !!client.clientId
      const g = new Graphics().roundRect(0, 0, 640, 64, 12).fill(isMe ? 0xfbeedb : C.cream).stroke({ width: 1, color: C.cardEdge })
      row.addChild(g)
      const badge = new Text({ text: `${i + 1}`, style: { fontFamily: FONT.display, fontSize: 24, fill: C.creamLight, fontWeight: 'bold' } })
      badge.anchor.set(0.5)
      const circle = new Graphics().circle(32, 32, 20).fill(SEAT_COLORS[i])
      badge.position.set(32, 32)
      row.addChild(circle, badge)
      const name = label(`${s.name}${isMe ? ' (you)' : ''}${s.isHost ? ' · host' : ''}`, { fontSize: 17, fontWeight: '600' })
      name.position.set(64, 12)
      const sub = label(s.isBot ? 'computer' : 'human', { fontSize: 13, fill: C.muted })
      sub.position.set(64, 38)
      row.addChild(name, sub)

      if (isHost && !isMe) {
        const t = new Toggle(s.isBot, (v) => client.setSeat(s.seat, { isBot: v }))
        t.position.set(360, 18)
        row.addChild(t)
        const tl = label('bot', { fontSize: 13, fill: C.muted })
        tl.position.set(418, 24)
        row.addChild(tl)
        if (s.isBot) {
          const cy = new Cycler<BotLevel>(BOT_CHOICES, s.botLevel, 170, (v) => client.setSeat(s.seat, { botLevel: v }))
          cy.position.set(460, 15)
          row.addChild(cy)
        }
      } else if (!isHost && !isMe && s.isBot && !lobby.started) {
        const b = new Button('Sit here', { kind: 'ghost', width: 120, height: 36, fontSize: 14, onClick: () => client.takeSeat(s.seat as Seat) })
        b.position.set(500, 14)
        row.addChild(b)
      } else if (isHost && isMe && this.session.mode === 'solo') {
        const tl = label('That’s you.', { fontSize: 13, fill: C.muted })
        tl.position.set(360, 24)
        row.addChild(tl)
      }
      row.position.set(0, i * 74)
      this.seatsC.addChild(row)
    })

    this.startBtn.visible = isHost
    this.startBtn.setEnabled(isHost && client.connected)
    this.rulesBtn.setLabel(isHost ? 'House rules' : 'View rules')
  }

  resize(w: number, h: number): void {
    this.backdrop.resize(w, h)
    const pw = Math.min(720, w - 40)
    const ph = Math.min(640, h - 40)
    this.bg?.destroy()
    this.bg = panel(pw, ph)
    this.card.addChildAt(this.bg, 0)
    this.card.position.set((w - pw) / 2, (h - ph) / 2)
    this.title.position.set(30, 22)
    this.info.position.set(30, 66)
    this.seatsC.position.set(30, 120)
    this.rulesSummary.position.set(30, 420)
    const by = ph - 64
    this.leaveBtn.position.set(30, by)
    this.rulesBtn.position.set(170, by)
    let x = 340
    if (this.inviteBtn) {
      this.inviteBtn.position.set(x, by)
      x += 170
    }
    if (this.copyBtn) {
      this.copyBtn.position.set(x, by - 50)
    }
    this.startBtn.position.set(pw - 250, by)
  }

  destroy(): void {
    for (const u of this.unsub) u()
    this.view.destroy({ children: true })
  }
}
