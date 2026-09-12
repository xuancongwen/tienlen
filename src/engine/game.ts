import { TWO, buildDeck, cardLabel, isRed, sortHand, value, type Card } from './cards'
import { beats, describeCombo, detect, isChopOf, type Combo } from './combos'
import { Rng, randomSeed } from './rng'
import { DEFAULT_RULES, type Rules } from './rules'

export type Seat = 0 | 1 | 2 | 3
export type BotLevel = 'easy' | 'normal' | 'hard'

export interface PlayerInfo {
  seat: Seat
  name: string
  isBot: boolean
  botLevel?: BotLevel
  netId?: string
}

export type InstantWinKind = 'fourTwos' | 'sixPairs' | 'fivePairSeq' | 'dragon' | 'threeQuads'

export const INSTANT_WIN_NAMES: Record<InstantWinKind, string> = {
  fourTwos: 'four 2s (tứ quý heo)',
  sixPairs: 'six pairs (lục phé bôn)',
  fivePairSeq: 'five consecutive pairs',
  dragon: 'a dragon straight (sảnh rồng)',
  threeQuads: 'three four-of-a-kinds'
}

export interface ChopRecord {
  chopper: Seat
  victim: Seat
  points: number
  what: string
}

export interface RoundResult {
  round: number
  /** Finishing order; players still holding cards come last, sorted by cards left. */
  order: Seat[]
  winner: Seat
  instantWin: InstantWinKind | null
  /** Score change per seat this round (chops included). */
  delta: number[]
  cardsLeft: number[]
  cong: Seat[]
  chops: ChopRecord[]
}

export type Phase = 'lobby' | 'playing' | 'roundOver' | 'matchOver'

export interface GameState {
  rules: Rules
  seed: number
  players: PlayerInfo[]
  hands: Card[][]
  phase: Phase
  round: number
  turn: Seat
  trick: {
    leader: Seat
    plays: { seat: Seat; combo: Combo | null }[]
    current: Combo | null
    lastPlayer: Seat | null
    passed: Seat[]
    /** Points riding on the current chop chain. */
    chopPoints: number
  }
  finished: Seat[]
  /** Card that must be part of the opening play (3♠ rule), or null. */
  mustPlayCardId: number | null
  playedAny: boolean[]
  scores: number[]
  roundChops: ChopRecord[]
  lastResult: RoundResult | null
  history: RoundResult[]
  log: string[]
  matchWinner: Seat | null
  lastPlay: { seat: Seat; combo: Combo } | null
  playedCardIds: number[]
}

export type Action = { type: 'play'; seat: Seat; cardIds: number[] } | { type: 'pass'; seat: Seat } | { type: 'nextRound' }

export type GameEvent =
  | { type: 'dealt'; round: number }
  | { type: 'played'; seat: Seat; combo: Combo }
  | { type: 'passed'; seat: Seat }
  | { type: 'chop'; record: ChopRecord }
  | { type: 'trickWon'; seat: Seat; leader: Seat }
  | { type: 'finished'; seat: Seat; place: number }
  | { type: 'instantWin'; seat: Seat; kind: InstantWinKind }
  | { type: 'roundOver'; result: RoundResult }
  | { type: 'matchOver'; winner: Seat }

export interface ApplyResult {
  ok: boolean
  error?: string
  events: GameEvent[]
}

export interface GameView extends Omit<GameState, 'hands' | 'seed'> {
  seat: Seat
  hand: Card[]
  handCounts: number[]
}

export function nextSeat(seat: Seat, n: number): Seat {
  return ((seat + 1) % n) as Seat
}

export class Game {
  state: GameState

  constructor(players: PlayerInfo[], rules: Rules = DEFAULT_RULES, seed: number = randomSeed()) {
    if (players.length < 2 || players.length > 4) throw new Error('Tiến lên needs two to four players')
    const n = players.length
    this.state = {
      rules: { ...rules, playerCount: n as Rules['playerCount'] },
      seed,
      players: players.map((p, i) => ({ ...p, seat: i as Seat })),
      hands: players.map(() => []),
      phase: 'lobby',
      round: 0,
      turn: 0,
      trick: { leader: 0, plays: [], current: null, lastPlayer: null, passed: [], chopPoints: 0 },
      finished: [],
      mustPlayCardId: null,
      playedAny: players.map(() => false),
      scores: players.map(() => 0),
      roundChops: [],
      lastResult: null,
      history: [],
      log: [],
      matchWinner: null,
      lastPlay: null,
      playedCardIds: []
    }
  }

  get n(): number {
    return this.state.players.length
  }

  get rules(): Rules {
    return this.state.rules
  }

  name(seat: Seat): string {
    return this.state.players[seat].name
  }

  private say(msg: string): void {
    this.state.log.push(msg)
    if (this.state.log.length > 200) this.state.log.shift()
  }

  private rng(): Rng {
    return new Rng((this.state.seed ^ (this.state.round * 0x9e3779b9)) >>> 0)
  }

  // ------------------------------------------------------------ lifecycle

  start(): GameEvent[] {
    if (this.state.phase !== 'lobby') throw new Error('game already started')
    return this.deal()
  }

  private deal(): GameEvent[] {
    const s = this.state
    const n = this.n
    const events: GameEvent[] = []
    const rng = this.rng()
    const deck = rng.shuffle(buildDeck())
    s.hands = s.players.map((_, i) => sortHand(deck.slice(i * 13, i * 13 + 13)))
    s.finished = []
    s.trick = { leader: 0, plays: [], current: null, lastPlayer: null, passed: [], chopPoints: 0 }
    s.playedAny = s.players.map(() => false)
    s.roundChops = []
    s.lastPlay = null
    s.playedCardIds = []
    s.mustPlayCardId = null
    s.phase = 'playing'
    events.push({ type: 'dealt', round: s.round })
    this.say(`Round ${s.round + 1}`)

    // Who opens?
    let leader: Seat
    const lowestHolder = (): Seat => {
      let best: Seat = 0
      let bestV = Infinity
      for (let i = 0; i < n; i++) {
        const v = value(s.hands[i][0])
        if (v < bestV) {
          bestV = v
          best = i as Seat
        }
      }
      return best
    }
    if (s.round > 0 && s.rules.winnerLeadsNext && s.lastResult) {
      leader = s.lastResult.winner
    } else if (s.rules.firstLead === 'random') {
      leader = rng.int(n) as Seat
    } else {
      leader = lowestHolder()
      if (s.rules.firstLead === 'lowestMustPlay' && s.round === 0) s.mustPlayCardId = s.hands[leader][0].id
    }

    // Instant wins, checked from the leader clockwise so ties go to the opener.
    if (s.rules.instantWins) {
      for (let k = 0; k < n; k++) {
        const seat = ((leader + k) % n) as Seat
        const kind = instantWin(s.hands[seat], s.rules)
        if (kind) {
          events.push({ type: 'instantWin', seat, kind })
          this.say(`${this.name(seat)} wins instantly with ${INSTANT_WIN_NAMES[kind]}!`)
          this.endRound(seat, kind, events)
          return events
        }
      }
    }

    s.trick.leader = leader
    s.turn = leader
    this.say(`${this.name(leader)} leads${s.mustPlayCardId !== null ? ` and must play the ${cardLabel(s.hands[leader][0])}` : ''}`)
    return events
  }

  // ---------------------------------------------------------------- apply

  apply(action: Action): ApplyResult {
    try {
      return { ok: true, events: this.applyInner(action) }
    } catch (e) {
      return { ok: false, error: (e as Error).message, events: [] }
    }
  }

  private applyInner(action: Action): GameEvent[] {
    const s = this.state
    switch (action.type) {
      case 'nextRound': {
        if (s.phase !== 'roundOver') throw new Error('not between rounds')
        s.round++
        return this.deal()
      }
      case 'pass': {
        if (s.phase !== 'playing') throw new Error('not playing')
        if (action.seat !== s.turn) throw new Error('not your turn')
        if (!s.trick.current) throw new Error('you must lead')
        s.trick.plays.push({ seat: action.seat, combo: null })
        s.trick.passed.push(action.seat)
        this.say(`${this.name(action.seat)} passes`)
        const events: GameEvent[] = [{ type: 'passed', seat: action.seat }]
        this.advance(events)
        return events
      }
      case 'play': {
        if (s.phase !== 'playing') throw new Error('not playing')
        if (action.seat !== s.turn) throw new Error('not your turn')
        const hand = s.hands[action.seat]
        const ids = new Set(action.cardIds)
        if (ids.size === 0 || ids.size !== action.cardIds.length) throw new Error('bad selection')
        const cards = hand.filter((c) => ids.has(c.id))
        if (cards.length !== ids.size) throw new Error('card not in hand')
        const combo = detect(cards, s.rules)
        if (!combo) throw new Error('not a valid combination')
        if (s.trick.current) {
          if (!beats(combo, s.trick.current, s.rules)) throw new Error('that does not beat the table')
        } else if (s.mustPlayCardId !== null && !ids.has(s.mustPlayCardId)) {
          throw new Error('the opening play must include the lowest card')
        }
        const events: GameEvent[] = []
        // Chop bookkeeping.
        if (s.trick.current && isChopOf(combo, s.trick.current)) {
          const victim = s.trick.lastPlayer!
          let points: number
          let what: string
          if (s.trick.chopPoints > 0) {
            points = s.trick.chopPoints
            what = `chopped the chop (${describeCombo(s.trick.current)})`
          } else if (s.trick.current.type === 'quad') {
            points = s.rules.penaltyFourKind
            what = 'chopped a four of a kind'
          } else if (s.trick.current.type === 'pairseq') {
            points = s.rules.penaltyPairSequence * (s.trick.current.length - 2)
            what = `chopped ${s.trick.current.length} consecutive pairs`
          } else {
            points = s.trick.current.cards.reduce((sum, c) => sum + (isRed(c.suit) ? s.rules.penaltyRedTwo : s.rules.penaltyBlackTwo), 0)
            if (points === 0) points = s.trick.current.cards.length
            what = `chopped ${s.trick.current.cards.map(cardLabel).join(' ')}`
          }
          if (s.rules.reopenAfterChop) s.trick.passed = []
          s.scores[action.seat] += points
          s.scores[victim] -= points
          s.trick.chopPoints = points
          const record: ChopRecord = { chopper: action.seat, victim, points, what }
          s.roundChops.push(record)
          events.push({ type: 'chop', record })
          this.say(`${this.name(action.seat)} ${what} — ${this.name(victim)} pays ${points}`)
        }
        s.hands[action.seat] = hand.filter((c) => !ids.has(c.id))
        s.mustPlayCardId = null
        s.playedAny[action.seat] = true
        s.trick.plays.push({ seat: action.seat, combo })
        s.trick.current = combo
        s.trick.lastPlayer = action.seat
        s.lastPlay = { seat: action.seat, combo }
        s.playedCardIds.push(...action.cardIds)
        this.say(`${this.name(action.seat)} plays ${describeCombo(combo).toLowerCase()} (${combo.cards.map(cardLabel).join(' ')})`)
        events.push({ type: 'played', seat: action.seat, combo })
        if (s.hands[action.seat].length === 0) {
          s.finished.push(action.seat)
          events.push({ type: 'finished', seat: action.seat, place: s.finished.length })
          this.say(`${this.name(action.seat)} goes out ${placeName(s.finished.length)}`)
          if (s.finished.length >= this.n - 1) {
            this.endRound(s.finished[0], null, events)
            return events
          }
        }
        this.advance(events)
        return events
      }
    }
  }

  private active(seat: Seat): boolean {
    return !this.state.finished.includes(seat)
  }

  /** Next seat still holding cards and still in the trick. */
  private nextEligible(from: Seat): Seat | null {
    const s = this.state
    for (let k = 1; k <= this.n; k++) {
      const seat = ((from + k) % this.n) as Seat
      if (!this.active(seat) || s.trick.passed.includes(seat)) continue
      if (seat === s.trick.lastPlayer) continue
      return seat
    }
    return null
  }

  private nextActive(from: Seat): Seat {
    let seat = from
    for (let k = 0; k < this.n; k++) {
      seat = nextSeat(seat, this.n)
      if (this.active(seat)) return seat
    }
    return from
  }

  private advance(events: GameEvent[]): void {
    const s = this.state
    const next = this.nextEligible(s.turn)
    if (next !== null) {
      s.turn = next
      return
    }
    // Nobody left to respond: the last player wins the trick.
    const last = s.trick.lastPlayer!
    const leader = this.active(last) ? last : this.nextActive(last)
    events.push({ type: 'trickWon', seat: last, leader })
    s.trick = { leader, plays: [], current: null, lastPlayer: null, passed: [], chopPoints: 0 }
    s.turn = leader
    this.say(`${this.name(leader)} leads`)
  }

  private endRound(winner: Seat, instant: InstantWinKind | null, events: GameEvent[]): void {
    const s = this.state
    const n = this.n
    const remaining = (Array.from({ length: n }, (_, i) => i as Seat) as Seat[])
      .filter((x) => !s.finished.includes(x) && x !== winner)
      .sort((a, b) => s.hands[a].length - s.hands[b].length)
    const order: Seat[] = instant ? [winner, ...remaining] : [...s.finished, ...remaining]
    const delta = s.players.map(() => 0)
    const cardsLeft = s.hands.map((h) => h.length)
    const cong: Seat[] = []
    for (const seat of order.slice(1)) {
      let pay: number
      if (instant) pay = s.rules.instantWinPoints
      else {
        const hand = s.hands[seat]
        pay = hand.length * s.rules.pointsPerCard
        for (const c of hand) if (c.rank === TWO) pay += isRed(c.suit) ? s.rules.penaltyRedTwo : s.rules.penaltyBlackTwo
        pay += leftoverPenalties(hand, s.rules)
        if (!s.playedAny[seat] && hand.length === 13) {
          pay *= s.rules.congMultiplier
          cong.push(seat)
        }
      }
      delta[seat] -= pay
      delta[winner] += pay
    }
    for (let i = 0; i < n; i++) s.scores[i] += delta[i]
    // Chops already moved points during play; report them in the delta too.
    for (const ch of s.roundChops) {
      delta[ch.chopper] += ch.points
      delta[ch.victim] -= ch.points
    }
    const result: RoundResult = { round: s.round, order, winner, instantWin: instant, delta, cardsLeft, cong, chops: [...s.roundChops] }
    s.lastResult = result
    s.history.push(result)
    s.lastPlay = null
    this.say(`Round ${s.round + 1}: ${this.name(winner)} wins (${delta.map((d, i) => `${this.name(i as Seat)} ${d >= 0 ? '+' : ''}${d}`).join(', ')})`)
    events.push({ type: 'roundOver', result })
    if (s.rules.rounds > 0 && s.round + 1 >= s.rules.rounds) {
      let best: Seat = 0
      for (let i = 1; i < n; i++) if (s.scores[i] > s.scores[best]) best = i as Seat
      s.matchWinner = best
      s.phase = 'matchOver'
      events.push({ type: 'matchOver', winner: best })
      this.say(`Match over — ${this.name(best)} wins with ${s.scores[best]} points`)
    } else {
      s.phase = 'roundOver'
    }
  }

  // ---------------------------------------------------------------- views

  view(seat: Seat): GameView {
    const s = this.state
    const { hands, seed, ...rest } = s
    void seed
    return {
      ...(JSON.parse(JSON.stringify(rest)) as Omit<GameState, 'hands' | 'seed'>),
      seat,
      hand: hands[seat].map((c) => ({ ...c })),
      handCounts: hands.map((h) => h.length)
    }
  }

  waitingOn(): Seat | null {
    return this.state.phase === 'playing' ? this.state.turn : null
  }
}

/** Penalties for unplayable-looking leftovers (four of a kind, three consecutive pairs). */
function leftoverPenalties(hand: Card[], rules: Rules): number {
  let pen = 0
  const byRank = new Map<number, number>()
  for (const c of hand) byRank.set(c.rank, (byRank.get(c.rank) ?? 0) + 1)
  for (const [, cnt] of byRank) if (cnt === 4) pen += rules.penaltyFourKind
  // 3 consecutive pairs left
  const pairRanks = [...byRank.entries()]
    .filter(([r, c]) => c >= 2 && r !== TWO)
    .map(([r]) => r)
    .sort((a, b) => a - b)
  let run = 1
  for (let i = 1; i < pairRanks.length; i++) {
    run = pairRanks[i] === pairRanks[i - 1] + 1 ? run + 1 : 1
    if (run === 3) {
      pen += rules.penaltyPairSequence
      break
    }
  }
  return pen
}

/** Detect an instant win (tới trắng) in a freshly dealt 13-card hand. */
export function instantWin(hand: Card[], rules: Rules): InstantWinKind | null {
  const byRank = new Map<number, Card[]>()
  for (const c of hand) byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c])
  if ((byRank.get(TWO)?.length ?? 0) === 4) return 'fourTwos'
  const quads = [...byRank.values()].filter((v) => v.length === 4).length
  if (quads >= 3) return 'threeQuads'
  const pairsOf = (v: Card[]): number =>
    rules.pairsSameColor
      ? Math.floor(v.filter((c) => isRed(c.suit)).length / 2) + Math.floor(v.filter((c) => !isRed(c.suit)).length / 2)
      : Math.floor(v.length / 2)
  const pairs = [...byRank.values()].reduce((n, v) => n + pairsOf(v), 0)
  if (pairs >= 6) return 'sixPairs'
  // Dragon: 3→A all present (the 13th card can be anything).
  let dragon = true
  for (let r = 3; r <= 14; r++) if (!byRank.has(r)) dragon = false
  if (dragon) {
    if (!rules.straightsSameSuit) return 'dragon'
    for (const suit of ['S', 'C', 'D', 'H'] as const) {
      let all = true
      for (let r = 3; r <= 14; r++) if (!byRank.get(r)!.some((c) => c.suit === suit)) all = false
      if (all) return 'dragon'
    }
  }
  // Five consecutive pairs.
  const pairRanks = [...byRank.entries()]
    .filter(([r, v]) => v.length >= 2 && r !== TWO)
    .map(([r]) => r)
    .sort((a, b) => a - b)
  let run = 1
  for (let i = 1; i < pairRanks.length; i++) {
    run = pairRanks[i] === pairRanks[i - 1] + 1 ? run + 1 : 1
    if (run >= 5) return 'fivePairSeq'
  }
  return null
}

export function placeName(place: number): string {
  return ['', '1st', '2nd', '3rd', '4th'][place] ?? `${place}th`
}
