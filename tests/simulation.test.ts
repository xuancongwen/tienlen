import { describe, expect, it } from 'vitest'
import { Bot, planHand } from '@ai/bot'
import { parseCards } from '@engine/cards'
import { detect } from '@engine/combos'
import { Game, type BotLevel, type PlayerInfo, type Seat } from '@engine/game'
import { enumerateCombos, legalPlays } from '@engine/moves'
import { DEFAULT_RULES, withRules, type Rules } from '@engine/rules'

function bots(levels: BotLevel[]): PlayerInfo[] {
  return levels.map((l, i) => ({ seat: i as Seat, name: `Bot${i}`, isBot: true, botLevel: l }))
}

function simulate(rules: Rules, seed: number, levels: BotLevel[] = ['normal', 'normal', 'normal', 'normal']) {
  const players = bots(levels)
  const game = new Game(players, rules, seed)
  const brains = players.map((p, i) => new Bot(p.botLevel, seed * 7 + i))
  game.start()
  let actions = 0
  while (game.state.phase !== 'matchOver') {
    if (game.state.phase === 'roundOver') {
      game.apply({ type: 'nextRound' })
      continue
    }
    const seat = game.waitingOn()
    if (seat === null) throw new Error(`stuck in ${game.state.phase}`)
    const action = brains[seat].decide(game.view(seat))
    if (!action) throw new Error(`bot ${seat} had no action`)
    const r = game.apply(action)
    if (!r.ok) throw new Error(`bot ${seat} illegal: ${r.error} ${JSON.stringify(action)}`)
    if (++actions > 100_000) throw new Error('runaway')
  }
  return { game, actions }
}

describe('move enumeration', () => {
  it('finds straights, pair sequences and quads', () => {
    const hand = parseCards('3S 4D 5C 6S 7H 9S 9D 9C 9H KS KD 2S 2H')
    const combos = enumerateCombos(hand, DEFAULT_RULES)
    const types = new Set(combos.map((c) => c.type))
    expect(types.has('straight')).toBe(true)
    expect(types.has('quad')).toBe(true)
    expect(types.has('pair')).toBe(true)
    expect(combos.some((c) => c.type === 'straight' && c.length === 5)).toBe(true)
    const hand2 = parseCards('3S 3D 4C 4S 5H 5S 6D 6C 7S')
    expect(enumerateCombos(hand2, DEFAULT_RULES).some((c) => c.type === 'pairseq' && c.length === 4)).toBe(true)
  })

  it('legal plays respect the table and the 3♠ rule', () => {
    const hand = parseCards('3S 4D 5C 6S 7H 9S 9D KS KD 2S')
    const table = detect(parseCards('8S 8H'), DEFAULT_RULES)!
    const legal = legalPlays(hand, DEFAULT_RULES, table)
    expect(legal.every((c) => c.type === 'pair' && c.rank > 8)).toBe(true)
    const opening = legalPlays(hand, DEFAULT_RULES, null, hand[0].id)
    expect(opening.every((c) => c.cards.some((k) => k.id === hand[0].id))).toBe(true)
    expect(opening.some((c) => c.type === 'straight')).toBe(true)
  })

  it('a plan covers every card once', () => {
    const hand = parseCards('3S 4D 5C 6S 7H 9S 9D 9C 9H KS KD 2S 2H')
    const plan = planHand(hand, DEFAULT_RULES)
    expect(plan.flatMap((c) => c.cards.map((k) => k.id)).sort()).toEqual(hand.map((k) => k.id).sort())
  })
})

describe('full matches with bots', () => {
  it('plays a ten-round match without illegal moves', () => {
    const { game } = simulate(DEFAULT_RULES, 1)
    expect(game.state.phase).toBe('matchOver')
    expect(game.state.history).toHaveLength(10)
    expect(game.state.scores.reduce((a, b) => a + b, 0)).toBe(0) // zero-sum
  })

  it('handles 2 and 3 players and rule variants', () => {
    const variants: [Partial<Rules>, BotLevel[]][] = [
      [{ playerCount: 3, rounds: 4 }, ['easy', 'normal', 'hard']],
      [{ playerCount: 2, rounds: 4 }, ['hard', 'hard']],
      [{ rounds: 3, instantWins: false, firstLead: 'random' }, ['normal', 'normal', 'normal', 'normal']],
      [{ rounds: 3, pairsSameColor: true, straightsSameSuit: true, followSuitSingles: true }, ['normal', 'hard', 'easy', 'normal']],
      [{ rounds: 3, chopChains: false, fourKindChopsPairOfTwos: false, winnerLeadsNext: false }, ['normal', 'normal', 'normal', 'normal']],
      [{ rounds: 3, congMultiplier: 3, penaltyRedTwo: 4, penaltyBlackTwo: 2, pointsPerCard: 2 }, ['hard', 'easy', 'hard', 'easy']]
    ]
    variants.forEach(([v, levels], i) => {
      const { game } = simulate(withRules(v), 50 + i, levels)
      expect(game.state.phase).toBe('matchOver')
      expect(game.state.scores.reduce((a, b) => a + b, 0)).toBe(0)
    })
  })

  it('card conservation holds during a round', () => {
    const players = bots(['normal', 'normal', 'normal', 'normal'])
    const game = new Game(players, withRules({ instantWins: false }), 9)
    const brains = players.map((_, i) => new Bot('normal', i))
    game.start()
    let steps = 0
    while (game.state.phase === 'playing' && steps++ < 500) {
      const seat = game.waitingOn()!
      const r = game.apply(brains[seat].decide(game.view(seat))!)
      expect(r.ok).toBe(true)
      const inHands = game.state.hands.reduce((n, h) => n + h.length, 0)
      expect(inHands + game.state.playedCardIds.length).toBe(52)
    }
  })

  it('hard bots outscore easy bots over a series', () => {
    let hardTotal = 0
    for (let seed = 100; seed < 112; seed++) {
      const { game } = simulate(withRules({ rounds: 6 }), seed, ['hard', 'easy', 'hard', 'easy'])
      hardTotal += game.state.scores[0] + game.state.scores[2]
    }
    expect(hardTotal).toBeGreaterThan(0)
  })

  it('bots decide quickly', () => {
    const players = bots(['hard', 'hard', 'hard', 'hard'])
    const game = new Game(players, withRules({ instantWins: false }), 77)
    const brains = players.map((_, i) => new Bot('hard', i))
    game.start()
    let worst = 0
    for (let i = 0; i < 60 && game.state.phase === 'playing'; i++) {
      const seat = game.waitingOn()!
      const t0 = performance.now()
      const a = brains[seat].decide(game.view(seat))!
      worst = Math.max(worst, performance.now() - t0)
      game.apply(a)
    }
    expect(worst).toBeLessThan(150)
  })
})

describe('pair-sequence enumeration tries every top pair', () => {
  it('finds the heart-topped sequence needed to beat the table', () => {
    const hand = parseCards('7S 7C 8S 8C 9S 9C 9H 2S')
    const tbl = detect(parseCards('4D 4H 5D 5H 6D 6H'), DEFAULT_RULES)!
    // beat a 3-pair sequence topped by 6♥ needs any 7-9 run; top pair 9♠9♥ vs 9♠9♣ both fine.
    expect(legalPlays(hand, DEFAULT_RULES, tbl).some((c) => c.type === 'pairseq')).toBe(true)
    // now require the heart: table topped by 9♦
    const tbl2 = detect(parseCards('7D 7H 8D 8H 9C 9D'), DEFAULT_RULES)!
    const legal = legalPlays(hand, DEFAULT_RULES, tbl2)
    expect(legal.some((c) => c.type === 'pairseq' && c.cards.some((k) => k.rank === 9 && k.suit === 'H'))).toBe(true)
  })
})
