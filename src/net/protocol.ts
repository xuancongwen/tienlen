import type { Action, BotLevel, GameEvent, GameView, Seat } from '@engine/game'
import type { Rules } from '@engine/rules'

/**
 * Wire protocol between a game host and its clients.
 *
 * The host is authoritative: clients only ever send intents (actions, lobby
 * requests) and receive per-seat views. The same messages flow over every
 * transport (in-process, LAN WebSocket, Steam P2P).
 */

export interface LobbySeat {
  seat: Seat
  name: string
  isBot: boolean
  botLevel: BotLevel
  /** Client id occupying this seat; '' for bots and unfilled seats. */
  clientId: string
  isHost: boolean
}

export interface LobbyState {
  rules: Rules
  seats: LobbySeat[]
  hostClientId: string
  /** Human-readable join info (LAN address, Steam lobby id). */
  joinCode: string
  started: boolean
}

export type ClientMessage =
  | { t: 'hello'; name: string }
  | { t: 'action'; action: Action }
  | { t: 'setRules'; rules: Rules }
  | { t: 'setSeat'; seat: Seat; patch: Partial<Pick<LobbySeat, 'isBot' | 'botLevel' | 'name'>> }
  | { t: 'takeSeat'; seat: Seat }
  | { t: 'start' }
  | { t: 'chat'; text: string }
  | { t: 'leave' }

export type ServerMessage =
  | { t: 'welcome'; clientId: string; seat: Seat | null; lobby: LobbyState }
  | { t: 'lobby'; lobby: LobbyState }
  | { t: 'state'; view: GameView; events: GameEvent[] }
  | { t: 'chat'; from: string; text: string }
  | { t: 'error'; message: string }
  | { t: 'kicked'; reason: string }

export const HOST_CLIENT_ID = 'host'

export function encode(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg)
}

export function decode<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}
