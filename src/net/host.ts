import { Bot } from '@ai/bot'
import { Game, type Action, type BotLevel, type GameEvent, type PlayerInfo, type Seat } from '@engine/game'
import { legalPlays } from '@engine/moves'
import { DEFAULT_RULES, type Rules } from '@engine/rules'
import { HOST_CLIENT_ID, type ClientMessage, type LobbySeat, type LobbyState, type ServerMessage } from './protocol'
import type { HostTransport } from './transport'

export interface HostOptions {
  rules?: Rules
  /** Milliseconds a bot "thinks" before acting, so play is watchable. */
  botDelayMs?: number
  /** Milliseconds between the end of a hand and the automatic next deal (0 = wait for host). */
  nextHandDelayMs?: number
  joinCode?: string
  seed?: number
  /** Strength given to bot seats when the lobby is created. */
  defaultBotLevel?: BotLevel
  onLog?: (line: string) => void
}

const BOT_NAMES = ['Minh', 'Chị Lan', 'Bác Tư', 'Ngọc', 'Tuấn', 'Cô Hoa']

/**
 * The authoritative game host. Owns the lobby and the Game, drives bots, and
 * talks to every seat through a HostTransport — it does not know or care
 * whether a seat is in-process, on the LAN, or on Steam.
 */
export class GameHost {
  lobby: LobbyState
  game: Game | null = null
  private bots = new Map<Seat, Bot>()
  private clientSeats = new Map<string, Seat>()
  private clientNames = new Map<string, string>()
  private botTimer: ReturnType<typeof setTimeout> | null = null
  private turnTimer: ReturnType<typeof setTimeout> | null = null
  private closed = false
  private opts: Required<Omit<HostOptions, 'onLog' | 'seed' | 'defaultBotLevel'>> & { onLog?: (l: string) => void; seed?: number }

  constructor(
    private transport: HostTransport,
    opts: HostOptions = {}
  ) {
    this.opts = {
      rules: opts.rules ?? DEFAULT_RULES,
      botDelayMs: opts.botDelayMs ?? 900,
      nextHandDelayMs: opts.nextHandDelayMs ?? 0,
      joinCode: opts.joinCode ?? '',
      onLog: opts.onLog,
      seed: opts.seed
    }
    this.lobby = {
      rules: this.opts.rules,
      seats: Array.from({ length: this.opts.rules.playerCount }, (_, i) => ({
        seat: i as Seat,
        name: BOT_NAMES[i % BOT_NAMES.length],
        isBot: true,
        botLevel: opts.defaultBotLevel ?? 'normal',
        clientId: '',
        isHost: false
      })),
      hostClientId: HOST_CLIENT_ID,
      joinCode: this.opts.joinCode,
      started: false
    }
    transport.onConnect((id) => this.log(`client ${id} connected`))
    transport.onDisconnect((id) => this.onDisconnect(id))
    transport.onMessage((id, msg) => this.onMessage(id, msg))
  }

  private log(line: string): void {
    this.opts.onLog?.(line)
  }

  setJoinCode(code: string): void {
    this.lobby.joinCode = code
    this.broadcastLobby()
  }

  close(): void {
    this.closed = true
    if (this.botTimer) clearTimeout(this.botTimer)
    if (this.turnTimer) clearTimeout(this.turnTimer)
    this.transport.close()
  }

  // ------------------------------------------------------------ messages

  private onMessage(clientId: string, msg: ClientMessage): void {
    if (this.closed) return
    switch (msg.t) {
      case 'hello':
        return this.hello(clientId, msg.name)
      case 'setRules':
        if (!this.isHost(clientId)) return this.error(clientId, 'only the host can change rules')
        if (this.lobby.started) return this.error(clientId, 'rules are locked once the game starts')
        this.lobby.rules = msg.rules
        this.resizeSeats(msg.rules.playerCount)
        return this.broadcastLobby()
      case 'setSeat': {
        if (!this.isHost(clientId)) return this.error(clientId, 'only the host can edit seats')
        const seat = this.lobby.seats[msg.seat]
        if (!seat) return
        if (msg.patch.isBot !== undefined) {
          if (msg.patch.isBot && seat.clientId) {
            // Kick the human in that seat back to spectating.
            this.send(seat.clientId, { t: 'kicked', reason: 'seat given to a bot' })
            this.clientSeats.delete(seat.clientId)
            seat.clientId = ''
          }
          seat.isBot = msg.patch.isBot
          if (seat.isBot) seat.name = BOT_NAMES[(msg.seat + this.lobby.seats.length) % BOT_NAMES.length]
        }
        if (msg.patch.botLevel) seat.botLevel = msg.patch.botLevel
        if (msg.patch.name) seat.name = msg.patch.name
        if (this.lobby.started && this.game) {
          this.game.state.players[msg.seat].isBot = seat.isBot
          this.game.state.players[msg.seat].botLevel = seat.botLevel
          this.game.state.players[msg.seat].name = seat.name
          this.syncBots()
          this.pump()
        }
        return this.broadcastLobby()
      }
      case 'takeSeat': {
        if (this.lobby.started) return this.error(clientId, 'the game has started')
        const target = this.lobby.seats[msg.seat]
        if (!target || (target.clientId && target.clientId !== clientId)) return this.error(clientId, 'seat taken')
        const current = this.clientSeats.get(clientId)
        if (current !== undefined) {
          const old = this.lobby.seats[current]
          old.clientId = ''
          old.isBot = true
          old.isHost = false
          old.name = BOT_NAMES[current]
        }
        target.clientId = clientId
        target.isBot = false
        target.isHost = this.isHost(clientId)
        target.name = this.clientNames.get(clientId) ?? 'Player'
        this.clientSeats.set(clientId, msg.seat)
        return this.broadcastLobby()
      }
      case 'start':
        if (!this.isHost(clientId)) return this.error(clientId, 'only the host can start')
        return this.startGame()
      case 'action':
        return this.onAction(clientId, msg.action)
      case 'chat': {
        const from = this.clientNames.get(clientId) ?? clientId
        return this.broadcast({ t: 'chat', from, text: msg.text.slice(0, 300) })
      }
      case 'leave':
        return this.onDisconnect(clientId)
    }
  }

  /** Grow or shrink the table to match the player count in the rules. */
  private resizeSeats(count: number): void {
    const seats = this.lobby.seats
    while (seats.length > count) {
      const dropped = seats.pop()!
      if (dropped.clientId) {
        // Move the person into the first bot seat that remains, or spectate.
        const free = seats.find((s) => s.isBot && !s.clientId)
        if (free) {
          free.clientId = dropped.clientId
          free.isBot = false
          free.isHost = dropped.isHost
          free.name = dropped.name
          this.clientSeats.set(dropped.clientId, free.seat)
        } else {
          this.clientSeats.delete(dropped.clientId)
          this.send(dropped.clientId, { t: 'kicked', reason: 'the table got smaller' })
        }
      }
    }
    while (seats.length < count) {
      const i = seats.length
      seats.push({ seat: i as Seat, name: BOT_NAMES[i % BOT_NAMES.length], isBot: true, botLevel: 'normal', clientId: '', isHost: false })
    }
  }

  private isHost(clientId: string): boolean {
    return clientId === this.lobby.hostClientId
  }

  private hello(clientId: string, name: string): void {
    name = (name || 'Player').slice(0, 24)
    this.clientNames.set(clientId, name)
    let seat: Seat | null = this.clientSeats.get(clientId) ?? null
    if (seat === null) {
      // Host takes seat 0; others take the first bot seat.
      const free = this.isHost(clientId) ? this.lobby.seats[0] : this.lobby.seats.find((s) => s.isBot && !s.clientId && s.seat !== 0)
      if (free && !this.lobby.started) {
        free.clientId = clientId
        free.isBot = false
        free.isHost = this.isHost(clientId)
        free.name = name
        this.clientSeats.set(clientId, free.seat)
        seat = free.seat
      } else if (free && this.lobby.started && this.game) {
        // Late joiner into a running game: take over a bot seat.
        free.clientId = clientId
        free.isBot = false
        free.name = name
        this.clientSeats.set(clientId, free.seat)
        this.game.state.players[free.seat].isBot = false
        this.game.state.players[free.seat].name = name
        this.syncBots()
        seat = free.seat
      }
    }
    this.send(clientId, { t: 'welcome', clientId, seat, lobby: this.lobby })
    this.broadcastLobby()
    if (this.game && seat !== null) this.sendState(clientId, seat, [])
    this.log(`${name} joined as ${seat === null ? 'spectator' : `seat ${seat}`}`)
  }

  private onDisconnect(clientId: string): void {
    const seat = this.clientSeats.get(clientId)
    this.clientSeats.delete(clientId)
    this.clientNames.delete(clientId)
    if (seat === undefined) return
    const s = this.lobby.seats[seat]
    s.clientId = ''
    s.isHost = false
    s.isBot = true
    s.name = `${s.name} (bot)`
    if (this.game) {
      this.game.state.players[seat].isBot = true
      this.game.state.players[seat].name = s.name
      this.syncBots()
      this.pump()
    }
    this.broadcastLobby()
    this.log(`seat ${seat} disconnected; a bot takes over`)
  }

  private error(clientId: string, message: string): void {
    this.send(clientId, { t: 'error', message })
  }

  // ---------------------------------------------------------------- game

  startGame(): void {
    if (this.lobby.started && this.game && this.game.state.phase !== 'matchOver') return
    const players: PlayerInfo[] = this.lobby.seats.map((s) => ({
      seat: s.seat,
      name: s.name,
      isBot: s.isBot,
      botLevel: s.botLevel,
      netId: s.clientId
    }))
    this.game = new Game(players, this.lobby.rules, this.opts.seed)
    this.lobby.started = true
    this.syncBots()
    const events = this.game.start()
    this.broadcastLobby()
    this.broadcastState(events)
    this.pump()
  }

  private syncBots(): void {
    if (!this.game) return
    for (const p of this.game.state.players) {
      if (p.isBot && !this.bots.has(p.seat)) this.bots.set(p.seat, new Bot(p.botLevel ?? 'normal', (this.opts.seed ?? Date.now()) + p.seat))
      if (!p.isBot) this.bots.delete(p.seat)
      const b = this.bots.get(p.seat)
      if (b && b.level !== (p.botLevel ?? 'normal')) this.bots.set(p.seat, new Bot(p.botLevel ?? 'normal', Date.now() + p.seat))
    }
  }

  private onAction(clientId: string, action: Action): void {
    if (!this.game) return this.error(clientId, 'no game running')
    if (action.type === 'nextRound') {
      if (!this.isHost(clientId)) return this.error(clientId, 'waiting for the host to deal')
    } else {
      const seat = this.clientSeats.get(clientId)
      if (seat === undefined || seat !== action.seat) return this.error(clientId, 'that is not your seat')
    }
    this.applyAndBroadcast(action)
  }

  private applyAndBroadcast(action: Action): void {
    if (!this.game) return
    const r = this.game.apply(action)
    if (!r.ok) {
      const seat = 'seat' in action ? action.seat : null
      const client = seat === null ? this.lobby.hostClientId : this.lobby.seats[seat].clientId
      if (client) this.error(client, r.error ?? 'illegal move')
      return
    }
    this.broadcastState(r.events)
    this.pump()
  }

  /** Schedule whatever automatic step is due: a bot move, a turn-timer, or the next deal. */
  private pump(): void {
    if (!this.game || this.closed) return
    if (this.botTimer) {
      clearTimeout(this.botTimer)
      this.botTimer = null
    }
    if (this.turnTimer) {
      clearTimeout(this.turnTimer)
      this.turnTimer = null
    }
    const s = this.game.state
    if (s.phase === 'matchOver') {
      this.lobby.started = false
      this.broadcastLobby()
      return
    }
    if (s.phase === 'roundOver') {
      if (this.opts.nextHandDelayMs > 0) {
        this.botTimer = setTimeout(() => this.applyAndBroadcast({ type: 'nextRound' }), this.opts.nextHandDelayMs)
      }
      return
    }
    const seat = this.game.waitingOn()
    if (seat === null) return
    const bot = this.bots.get(seat)
    if (bot) {
      const delay = s.phase === 'playing' && !s.trick.current ? this.opts.botDelayMs * 1.3 : this.opts.botDelayMs
      this.botTimer = setTimeout(() => {
        if (!this.game) return
        const action = bot.decide(this.game.view(seat))
        if (action) this.applyAndBroadcast(action)
      }, delay)
      return
    }
    const limit = s.rules.turnTimeSeconds
    if (limit > 0) {
      this.turnTimer = setTimeout(() => this.autoAct(seat), limit * 1000)
    }
  }

  /** A human ran out of time: pass if allowed, otherwise let a bot pick for them. */
  private autoAct(seat: Seat): void {
    if (!this.game) return
    const s = this.game.state
    if (this.game.waitingOn() !== seat) return
    if (s.phase === 'playing' && s.trick.current) {
      this.applyAndBroadcast({ type: 'pass', seat })
      return
    }
    const stand = new Bot('normal', Date.now())
    const action = stand.decide(this.game.view(seat))
    if (action) this.applyAndBroadcast(action)
  }

  /** For the UI: can `seat` legally pass right now? */
  static canPass(game: Game, seat: Seat): boolean {
    const s = game.state
    return s.phase === 'playing' && s.turn === seat && !!s.trick.current
  }

  /** For the UI: does this seat have any legal play? */
  static hasLegalPlay(game: Game, seat: Seat): boolean {
    const s = game.state
    return legalPlays(s.hands[seat], s.rules, s.trick.current, s.mustPlayCardId).length > 0
  }

  // ------------------------------------------------------------ sending

  private send(clientId: string, msg: ServerMessage): void {
    this.transport.send(clientId, msg)
  }

  private broadcast(msg: ServerMessage): void {
    for (const id of this.clientSeats.keys()) this.send(id, msg)
    for (const id of this.clientNames.keys()) if (!this.clientSeats.has(id)) this.send(id, msg)
  }

  private broadcastLobby(): void {
    this.broadcast({ t: 'lobby', lobby: this.lobby })
  }

  private sendState(clientId: string, seat: Seat, events: GameEvent[]): void {
    if (!this.game) return
    this.send(clientId, { t: 'state', view: this.game.view(seat), events })
  }

  private broadcastState(events: GameEvent[]): void {
    for (const [id, seat] of this.clientSeats) this.sendState(id, seat, events)
  }
}

export type { BotLevel, LobbySeat }
