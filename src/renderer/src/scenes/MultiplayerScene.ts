import { Container, Text } from 'pixi.js'
import type { App, Scene } from '../app'
import { Backdrop } from '../gfx/backdrop'
import { C } from '../theme'
import { createInput, type DomInput } from '../ui/dom'
import { Button, heading, label, panel } from '../ui/widgets'
import { createLanHost, createSteamHost, joinLan, joinSteam, type Session } from '../session'
import { LobbyScene } from './LobbyScene'
import { MenuScene } from './MenuScene'

export class MultiplayerScene implements Scene {
  readonly view = new Container()
  private backdrop = new Backdrop()
  private card = new Container()
  private bg: Container | null = null
  private title: Text
  private steamStatus: Text
  private lanInput: DomInput
  private lobbyInput: DomInput
  private lobbyList = new Container()
  private buttons: Record<string, Button> = {}
  private busy = false
  private steamOk = false
  private unsubJoin: (() => void) | null = null

  constructor(private app: App) {
    this.view.addChild(this.backdrop, this.card)
    this.title = heading('Multiplayer', 34)
    this.steamStatus = label('Checking Steam…', { fill: C.muted, fontSize: 14 })
    this.card.addChild(this.title, this.steamStatus, this.lobbyList)

    const mk = (key: string, text: string, kind: 'primary' | 'secondary', fn: () => void, width = 240): void => {
      const b = new Button(text, { width, kind, onClick: () => void this.guard(fn) })
      this.buttons[key] = b
      this.card.addChild(b)
    }
    mk('steamHost', 'Host a Steam lobby', 'primary', () => this.steamHost())
    mk('steamList', 'Refresh friend lobbies', 'secondary', () => this.refreshLobbies())
    mk('steamJoin', 'Join lobby by id', 'secondary', () => this.steamJoin())
    mk('lanHost', 'Host on this network', 'primary', () => this.lanHost())
    mk('lanJoin', 'Join by address', 'secondary', () => this.lanJoin())
    mk('back', 'Back', 'secondary', () => Promise.resolve(this.app.go(new MenuScene(this.app))), 130)

    this.card.addChild(heading('Steam', 22)).position.set(30, 84)
    this.card.addChild(heading('Local network', 22)).position.set(400, 84)
    this.card.addChild(label('Play with friends anywhere. Invites go through the Steam overlay (Shift+Tab).', { fontSize: 13, fill: C.muted, wordWrap: true, wordWrapWidth: 320 })).position.set(30, 116)
    this.card.addChild(label('Same Wi-Fi, no Steam needed. Share the address shown in the lobby.', { fontSize: 13, fill: C.muted, wordWrap: true, wordWrapWidth: 320 })).position.set(400, 116)

    this.lanInput = createInput({ value: app.settings.lastLanAddress, placeholder: '192.168.1.20:7777', onEnter: () => void this.guard(() => this.lanJoin()) })
    this.lobbyInput = createInput({ placeholder: 'Steam lobby id', onEnter: () => void this.guard(() => this.steamJoin()) })

    void this.checkSteam()
  }

  private async guard(fn: () => Promise<void> | void): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      await fn()
    } catch (e) {
      this.app.notify((e as Error).message || 'Something went wrong', C.paprikaDark)
    } finally {
      this.busy = false
    }
  }

  private async checkSteam(): Promise<void> {
    if (!window.gd) {
      this.steamStatus.text = 'Networking is available in the desktop app only.'
      for (const k of ['steamHost', 'steamList', 'steamJoin', 'lanHost', 'lanJoin']) this.buttons[k].setEnabled(false)
      return
    }
    this.steamOk = await window.gd.steam.available()
    if (this.steamOk) {
      const me = await window.gd.steam.me()
      this.steamStatus.text = `Signed in to Steam as ${me?.name ?? 'unknown'}`
      this.unsubJoin = window.gd.steam.on('joinRequested', (lobbyId) => void this.guard(() => this.steamJoin(String(lobbyId))))
      void this.refreshLobbies()
    } else {
      this.steamStatus.text = 'Steam is not running (or no steam_appid.txt) — Steam play is disabled.'
      for (const k of ['steamHost', 'steamList', 'steamJoin']) this.buttons[k].setEnabled(false)
    }
  }

  private open(session: Session): void {
    this.app.session = session
    this.app.go(new LobbyScene(this.app, session))
  }

  private async steamHost(): Promise<void> {
    this.open(await createSteamHost(this.app.settings, 'friends'))
  }

  private async steamJoin(id?: string): Promise<void> {
    const lobbyId = (id ?? this.lobbyInput.el.value).trim()
    if (!lobbyId) throw new Error('Enter a lobby id or pick one from the list')
    this.open(await joinSteam(this.app.settings, lobbyId))
  }

  private async refreshLobbies(): Promise<void> {
    if (!window.gd || !this.steamOk) return
    const lobbies = await window.gd.steam.listLobbies()
    this.lobbyList.removeChildren()
    if (lobbies.length === 0) {
      this.lobbyList.addChild(label('No open Tiến lên lobbies among your friends right now.', { fontSize: 13, fill: C.muted }))
      return
    }
    lobbies.slice(0, 5).forEach((l, i) => {
      const b = new Button(`${l.name}  (${l.members}/${l.limit})`, {
        kind: 'ghost',
        width: 320,
        height: 36,
        fontSize: 14,
        onClick: () => void this.guard(() => this.steamJoin(l.lobbyId))
      })
      b.position.set(0, i * 42)
      this.lobbyList.addChild(b)
    })
  }

  private async lanHost(): Promise<void> {
    this.open(await createLanHost(this.app.settings, 7777))
  }

  private async lanJoin(): Promise<void> {
    const addr = this.lanInput.el.value.trim()
    if (!addr) throw new Error('Enter the host address, e.g. 192.168.1.20:7777')
    this.app.settings.lastLanAddress = addr
    void this.app.persist()
    this.open(await joinLan(this.app.settings, addr))
  }

  resize(w: number, h: number): void {
    this.backdrop.resize(w, h)
    const pw = Math.min(760, w - 40)
    const ph = Math.min(560, h - 60)
    this.bg?.destroy()
    this.bg = panel(pw, ph)
    this.card.addChildAt(this.bg, 0)
    this.card.position.set((w - pw) / 2, (h - ph) / 2)
    this.title.position.set(30, 22)
    this.steamStatus.position.set(30, 62)
    const b = this.buttons
    b.steamHost.position.set(30, 170)
    b.steamList.position.set(30, 228)
    this.lobbyList.position.set(30, 290)
    b.steamJoin.position.set(30, ph - 130)
    this.lobbyInput.setPosition(this.card.x + 30, this.card.y + ph - 172, 240)
    b.lanHost.position.set(400, 170)
    b.lanJoin.position.set(400, ph - 130)
    this.lanInput.setPosition(this.card.x + 400, this.card.y + ph - 172, 240)
    b.back.position.set(pw - 160, ph - 64)
  }

  destroy(): void {
    this.lanInput.destroy()
    this.lobbyInput.destroy()
    this.unsubJoin?.()
    this.view.destroy({ children: true })
  }
}
