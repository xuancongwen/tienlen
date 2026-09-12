import type { Action, GameEvent, GameView, Seat } from '@engine/game'
import type { Rules } from '@engine/rules'
import type { LobbySeat, LobbyState, ServerMessage } from './protocol'
import { Emitter, type ClientTransport } from './transport'

export interface ChatLine {
  from: string
  text: string
}

/**
 * Renderer-side model of one player's connection to a host. It holds the
 * latest lobby + view and notifies the UI whenever anything changes.
 */
export class GameClient {
  clientId = ''
  seat: Seat | null = null
  lobby: LobbyState | null = null
  view: GameView | null = null
  chat: ChatLine[] = []
  lastError = ''
  connected = true
  closeReason = ''

  readonly changed = new Emitter<[]>()
  readonly events = new Emitter<[GameEvent[], GameView]>()
  readonly errors = new Emitter<[string]>()
  readonly kicked = new Emitter<[string]>()

  constructor(
    private transport: ClientTransport,
    public readonly name: string
  ) {
    transport.onMessage((m) => this.onMessage(m))
    transport.onClose((reason) => {
      this.connected = false
      this.closeReason = reason
      this.changed.emit()
    })
    transport.send({ t: 'hello', name })
  }

  private onMessage(m: ServerMessage): void {
    switch (m.t) {
      case 'welcome':
        this.clientId = m.clientId
        this.seat = m.seat
        this.lobby = m.lobby
        break
      case 'lobby':
        this.lobby = m.lobby
        if (this.clientId) {
          const mine = m.lobby.seats.find((s) => s.clientId === this.clientId)
          this.seat = mine ? mine.seat : null
        }
        break
      case 'state':
        this.view = m.view
        this.seat = m.view.seat
        this.events.emit(m.events, m.view)
        break
      case 'chat':
        this.chat.push({ from: m.from, text: m.text })
        if (this.chat.length > 100) this.chat.shift()
        break
      case 'error':
        this.lastError = m.message
        this.errors.emit(m.message)
        break
      case 'kicked':
        this.seat = null
        this.kicked.emit(m.reason)
        break
    }
    this.changed.emit()
  }

  get isHost(): boolean {
    return !!this.lobby && this.lobby.hostClientId === this.clientId
  }

  get mySeat(): LobbySeat | null {
    if (!this.lobby || this.seat === null) return null
    return this.lobby.seats[this.seat]
  }

  act(action: Action): void {
    this.transport.send({ t: 'action', action })
  }
  play(cardIds: number[]): void {
    if (this.seat === null) return
    this.act({ type: 'play', seat: this.seat, cardIds })
  }
  pass(): void {
    if (this.seat === null) return
    this.act({ type: 'pass', seat: this.seat })
  }
  nextRound(): void {
    this.act({ type: 'nextRound' })
  }
  setRules(rules: Rules): void {
    this.transport.send({ t: 'setRules', rules })
  }
  setSeat(seat: Seat, patch: Partial<Pick<LobbySeat, 'isBot' | 'botLevel' | 'name'>>): void {
    this.transport.send({ t: 'setSeat', seat, patch })
  }
  takeSeat(seat: Seat): void {
    this.transport.send({ t: 'takeSeat', seat })
  }
  start(): void {
    this.transport.send({ t: 'start' })
  }
  sendChat(text: string): void {
    this.transport.send({ t: 'chat', text })
  }
  leave(): void {
    this.transport.send({ t: 'leave' })
    this.transport.close()
  }
}
