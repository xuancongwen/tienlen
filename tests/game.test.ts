import { describe, expect, it } from 'vitest'
import { parseCards, type Card } from '@engine/cards'
import { Game, instantWin, type PlayerInfo, type Seat } from '@engine/game'
import { DEFAULT_RULES, withRules } from '@engine/rules'

const players = (n = 4): PlayerInfo[] => Array.from({ length: n }, (_, i) => ({ seat: i as Seat, name: 'ABCD'[i], isBot: i > 0 }))

function setHands(g: Game, hands: string[]): void {
  g.state.hands = hands.map((h) => parseCards(h))
}

function play(g: Game, seat: Seat, s: string) {
  const want = parseCards(s)
  const hand = g.state.hands[seat]
  const ids = want.map((w) => {
    const c = hand.find((h) => h.rank === w.rank && h.suit === w.suit)
    if (!c) throw new Error(`seat ${seat} lacks ${s}`)
    return c.id
  })
  return g.apply({ type: 'play', seat, cardIds: ids })
}

function stage(g: Game, hands: string[], leader: Seat): void {
  g.start()
  setHands(g, hands)
  g.state.phase = 'playing'
  g.state.finished = []
  g.state.trick = { leader, plays: [], current: null, lastPlayer: null, passed: [], chopPoints: 0 }
  g.state.turn = leader
  g.state.mustPlayCardId = null
  g.state.playedAny = hands.map(() => false)
}

describe('dealing and opening', () => {
  it('deals 13 cards to each player and the 3♠ holder opens with it', () => {
    const g = new Game(players(), withRules({ instantWins: false }), 5)
    g.start()
    expect(g.state.hands.every((h) => h.length === 13)).toBe(true)
    const holder = g.state.hands.findIndex((h) => h.some((c) => c.rank === 3 && c.suit === 'S')) as Seat
    expect(g.state.turn).toBe(holder)
    expect(g.state.mustPlayCardId).toBe(g.state.hands[holder][0].id)
    // playing something without the 3♠ is refused
    const other = g.state.hands[holder].find((c) => !(c.rank === 3 && c.suit === 'S'))!
    expect(g.apply({ type: 'play', seat: holder, cardIds: [other.id] }).ok).toBe(false)
    expect(g.apply({ type: 'play', seat: holder, cardIds: [g.state.mustPlayCardId!] }).ok).toBe(true)
  })

  it('three players get 13 each, the rest stays in the box', () => {
    const g = new Game(players(3), withRules({ instantWins: false }), 2)
    g.start()
    expect(g.state.hands.length).toBe(3)
    const all = new Set(g.state.hands.flat().map((c) => c.id))
    expect(all.size).toBe(39)
  })
})

describe('trick flow', () => {
  it('passing locks you out until the trick is cleared; last player leads again', () => {
    const g = new Game(players(), DEFAULT_RULES, 1)
    stage(g, ['3S 9S', '5S 5D', '7S 8S', 'KS KD'], 0)
    expect(g.apply({ type: 'pass', seat: 0 }).ok).toBe(false) // leader can't pass
    expect(play(g, 0, '3S').ok).toBe(true)
    expect(play(g, 1, '5S 5D').ok).toBe(false) // wrong shape
    expect(g.apply({ type: 'pass', seat: 1 }).ok).toBe(true)
    expect(play(g, 2, '7S').ok).toBe(true)
    expect(play(g, 3, 'KS').ok).toBe(true)
    expect(play(g, 0, '9S').ok).toBe(false) // 9 < K
    g.apply({ type: 'pass', seat: 0 })
    // seat 1 already passed: skipped; seat 2 can still respond
    expect(g.state.turn).toBe(2)
    const r = g.apply({ type: 'pass', seat: 2 })
    expect(r.events.some((e) => e.type === 'trickWon' && e.leader === 3)).toBe(true)
    expect(g.state.turn).toBe(3)
    expect(g.state.trick.current).toBeNull()
  })

  it('when the trick winner is out, the next player clockwise leads', () => {
    const g = new Game(players(), DEFAULT_RULES, 1)
    stage(g, ['AS', '5S 5D', '7S 8S', 'KS KD'], 0)
    const r = play(g, 0, 'AS')
    expect(r.events.some((e) => e.type === 'finished' && e.seat === 0)).toBe(true)
    g.apply({ type: 'pass', seat: 1 })
    g.apply({ type: 'pass', seat: 2 })
    const r2 = g.apply({ type: 'pass', seat: 3 })
    expect(r2.events.some((e) => e.type === 'trickWon' && e.leader === 1)).toBe(true)
    expect(g.state.turn).toBe(1)
  })

  it('the round ends when all but one player are out, with scores by cards left', () => {
    const g = new Game(players(), withRules({ rounds: 0 }), 1)
    stage(g, ['AS', '5S', '7S', 'KS KD 2H 2S'], 0)
    play(g, 0, 'AS')
    g.apply({ type: 'pass', seat: 1 })
    g.apply({ type: 'pass', seat: 2 })
    g.apply({ type: 'pass', seat: 3 })
    play(g, 1, '5S') // seat 1 out (2nd)
    g.apply({ type: 'pass', seat: 2 })
    g.apply({ type: 'pass', seat: 3 })
    play(g, 2, '7S') // seat 2 out -> round over
    expect(g.state.phase).toBe('roundOver')
    const r = g.state.lastResult!
    expect(r.order).toEqual([0, 1, 2, 3])
    // seat 3 holds K K 2♥ 2♠: 4 cards + red 2 (2) + black 2 (1) = 7
    expect(r.delta[3]).toBe(-7)
    expect(r.delta[0]).toBe(7)
    expect(g.state.scores).toEqual([7, 0, 0, -7])
  })

  it('a player who never played pays double (cóng)', () => {
    const g = new Game(players(), withRules({ rounds: 0 }), 1)
    const full = '3S 4S 5S 6S 7S 8S 9S 10S JS QS KS AS 3D'
    stage(g, ['AH', '5C', '7C', full], 0)
    g.state.playedAny = [true, true, true, false]
    play(g, 0, 'AH')
    g.apply({ type: 'pass', seat: 1 })
    g.apply({ type: 'pass', seat: 2 })
    g.apply({ type: 'pass', seat: 3 })
    play(g, 1, '5C')
    g.apply({ type: 'pass', seat: 2 })
    g.apply({ type: 'pass', seat: 3 })
    play(g, 2, '7C')
    const r = g.state.lastResult!
    expect(r.cong).toEqual([3])
    expect(r.delta[3]).toBe(-26)
  })
})

describe('chops', () => {
  it('chopping a red 2 pays the chopper 2, a black 2 pays 1', () => {
    const g = new Game(players(), withRules({ rounds: 0 }), 1)
    stage(g, ['2H 3D', '5S 5D 5H 5C 9D', '7S 8S', 'KS KD'], 0)
    play(g, 0, '2H')
    const r = play(g, 1, '5S 5D 5H 5C')
    expect(r.ok).toBe(true)
    const chop = r.events.find((e) => e.type === 'chop')
    expect(chop).toBeDefined()
    expect(g.state.scores[1]).toBe(2)
    expect(g.state.scores[0]).toBe(-2)
  })

  it('chopping the chop passes the penalty along', () => {
    const g = new Game(players(), withRules({ rounds: 0 }), 1)
    stage(g, ['2S 3D', '5S 5D 5H 5C 9D', '3S 3H 4S 4H 6S 6H 7D 7C 8S', 'KS KD'], 0)
    play(g, 0, '2S')
    play(g, 1, '5S 5D 5H 5C') // chop: +1 to seat 1 from seat 0
    expect(g.state.scores).toEqual([-1, 1, 0, 0])
    const r = play(g, 2, '3S 3H 4S 4H 6S 6H 7D 7C')
    expect(r.ok).toBe(false) // not consecutive (3,4,6,7)
    // give seat 2 a proper 4-pair sequence
    g.state.hands[2] = parseCards('3S 3H 4S 4H 5S 5H 6D 6C 8S')
    const r2 = play(g, 2, '3S 3H 4S 4H 5S 5H 6D 6C')
    expect(r2.ok).toBe(true)
    expect(g.state.scores).toEqual([-1, 0, 1, 0])
  })
})

describe('instant wins', () => {
  const rules = DEFAULT_RULES
  const h = (s: string): Card[] => parseCards(s)
  it('detects each kind', () => {
    expect(instantWin(h('2S 2C 2D 2H 3S 4S 5S 6S 7S 8S 9S 10S JS'), rules)).toBe('fourTwos')
    expect(instantWin(h('3S 3C 4D 4H 5S 5C 9D 9H JS JC KD KH 2S'), rules)).toBe('sixPairs')
    expect(instantWin(h('3S 3C 4D 4H 5S 5C 6D 6H 7S 7C 9D KH 2S'), rules)).toBe('fivePairSeq')
    expect(instantWin(h('3S 4C 5D 6H 7S 8C 9D 10H JS QC KD AH 2S'), rules)).toBe('dragon')
    expect(instantWin(h('3S 3C 3D 3H 5S 5C 5D 5H 9S 9C 9D 9H 2S'), rules)).toBe('threeQuads')
    expect(instantWin(h('3S 4C 5D 6H 7S 8C 9D 10H JS QC KD 2H 2S'), rules)).toBeNull()
  })

  it('ends the round at the deal and pays out', () => {
    for (let seed = 1; seed < 3000; seed++) {
      const g = new Game(players(), withRules({ rounds: 0 }), seed)
      const ev = g.start()
      const iw = ev.find((e) => e.type === 'instantWin')
      if (iw && iw.type === 'instantWin') {
        expect(g.state.phase).toBe('roundOver')
        expect(g.state.lastResult!.instantWin).toBe(iw.kind)
        expect(g.state.scores[iw.seat]).toBe(39)
        return
      }
    }
    throw new Error('no instant win in 3000 deals?')
  })
})

describe('match', () => {
  it('ends after the configured number of rounds with the top scorer as winner', () => {
    const g = new Game(players(), withRules({ rounds: 1, instantWins: false }), 1)
    stage(g, ['AS', '5S', '7S', 'KS KD'], 0)
    play(g, 0, 'AS')
    g.apply({ type: 'pass', seat: 1 })
    g.apply({ type: 'pass', seat: 2 })
    g.apply({ type: 'pass', seat: 3 })
    play(g, 1, '5S')
    g.apply({ type: 'pass', seat: 2 })
    g.apply({ type: 'pass', seat: 3 })
    play(g, 2, '7S')
    expect(g.state.phase).toBe('matchOver')
    expect(g.state.matchWinner).toBe(0)
  })
})

describe('reviewer regressions', () => {
  it('chopping a led four of a kind pays the four-of-a-kind penalty', () => {
    const g = new Game(players(), withRules({ rounds: 0 }), 1)
    stage(g, ['5S 5D 5H 5C 9D', '3S 3H 4S 4H 6S 6H 7D 7C 8S', '7S 8H', 'KS KD'], 0)
    play(g, 0, '5S 5D 5H 5C')
    g.state.hands[1] = parseCards('3S 3H 4S 4H 5S 5H 6D 6C 8S')
    expect(play(g, 1, '3S 3H 4S 4H 5S 5H 6D 6C').ok).toBe(true)
    expect(g.state.scores[1]).toBe(DEFAULT_RULES.penaltyFourKind)
    expect(g.state.scores[0]).toBe(-DEFAULT_RULES.penaltyFourKind)
  })

  it('a chop can reopen the trick for players who passed', () => {
    const g = new Game(players(), withRules({ rounds: 0, reopenAfterChop: true }), 1)
    stage(g, ['2S 3D', '9D 9C', '5S 5D 5H 5C 9S', 'KS KD 2H'], 0)
    play(g, 0, '2S')
    g.apply({ type: 'pass', seat: 1 })
    play(g, 2, '5S 5D 5H 5C') // chop
    expect(g.state.trick.passed).toEqual([])
    g.apply({ type: 'pass', seat: 3 })
    g.apply({ type: 'pass', seat: 0 })
    expect(g.state.turn).toBe(1) // seat 1 gets another look
  })

  it('a same-suit dragon still counts with a stray 13th card (Northern)', () => {
    const north = withRules({ straightsSameSuit: true })
    expect(instantWin(parseCards('3S 4S 5S 6S 7S 8S 9S 10S JS QS KS AS 7D'), north)).toBe('dragon')
    expect(instantWin(parseCards('3S 4S 5S 6S 7S 8S 9S 10S JS QS KS AD 7D'), north)).toBeNull()
  })
})
