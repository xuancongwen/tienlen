import { describe, expect, it } from 'vitest'
import { parseCards, value } from '@engine/cards'
import { beats, detect, isChopOf } from '@engine/combos'
import { DEFAULT_RULES, withRules, type Rules } from '@engine/rules'

const R = DEFAULT_RULES
const d = (s: string, rules: Rules = R) => detect(parseCards(s), rules)
const b = (a: string, c: string, rules: Rules = R) => beats(d(a, rules)!, d(c, rules)!, rules)

describe('card order', () => {
  it('3 is lowest, 2 is highest; spades < clubs < diamonds < hearts', () => {
    const [c3s, c3h, cAh, c2s, c2h] = parseCards('3S 3H AH 2S 2H')
    expect(value(c3s)).toBeLessThan(value(c3h))
    expect(value(cAh)).toBeLessThan(value(c2s))
    expect(value(c2s)).toBeLessThan(value(c2h))
  })
})

describe('combo detection', () => {
  it('singles, pairs, triples, quads', () => {
    expect(d('7S')!.type).toBe('single')
    expect(d('7S 7H')!.type).toBe('pair')
    expect(d('7S 7H 7D')!.type).toBe('triple')
    expect(d('7S 7H 7D 7C')!.type).toBe('quad')
    expect(d('7S 8H')).toBeNull()
  })

  it('straights of three or more, never with a 2', () => {
    expect(d('3S 4H 5D')!.type).toBe('straight')
    expect(d('3S 4H 5D 6C 7S 8H 9D 10C JS QH KD AC')!.length).toBe(12)
    expect(d('3S 4H')).toBeNull()
    expect(d('KS AH 2D')).toBeNull()
    expect(d('QS KH AD 2C')).toBeNull()
    expect(d('3S 4H 6D')).toBeNull()
  })

  it('consecutive pairs (đôi thông)', () => {
    expect(d('3S 3H 4D 4C 5S 5H')!.type).toBe('pairseq')
    expect(d('3S 3H 4D 4C 5S 5H')!.length).toBe(3)
    expect(d('3S 3H 4D 4C 5S 5H 6D 6C')!.length).toBe(4)
    expect(d('3S 3H 4D 4C')).toBeNull() // only two pairs
    expect(d('3S 3H 4D 4C 6S 6H')).toBeNull()
    expect(d('KS KH AD AC 2S 2H')).toBeNull() // 2s never
  })

  it('Northern constraints', () => {
    const north = withRules({ pairsSameColor: true, straightsSameSuit: true })
    expect(d('7S 7H', north)).toBeNull()
    expect(d('7D 7H', north)!.type).toBe('pair')
    expect(d('3S 4H 5D', north)).toBeNull()
    expect(d('3S 4S 5S', north)!.type).toBe('straight')
  })
})

describe('comparison', () => {
  it('same shape, higher top card wins (suit breaks ties)', () => {
    expect(b('8S', '7H')).toBe(true)
    expect(b('7H', '7D')).toBe(true)
    expect(b('7D', '7H')).toBe(false)
    expect(b('2S', 'AH')).toBe(true)
    expect(b('7S 7H', '7C 7D')).toBe(true) // pair with the heart wins
    expect(b('4S 5S 6H', '3S 4S 5S')).toBe(true)
    expect(b('3S 4S 5H', '3C 4C 5D')).toBe(true)
    expect(b('3S 4S 5S 6S', '4S 5S 6S')).toBe(false) // different lengths never compare
    expect(b('8S 8H', '7S')).toBe(false)
  })

  it('a single 2 is chopped by four of a kind or three consecutive pairs', () => {
    expect(b('5S 5H 5D 5C', '2H')).toBe(true)
    expect(b('3S 3H 4D 4C 5S 5H', '2H')).toBe(true)
    expect(b('3S 3H 4D 4C 5S 5H', '2S 2H')).toBe(false)
    expect(b('AH', '2S')).toBe(false)
  })

  it('a pair of 2s needs four consecutive pairs (or four of a kind when allowed)', () => {
    expect(b('3S 3H 4D 4C 5S 5H 6D 6C', '2S 2H')).toBe(true)
    expect(b('5S 5H 5D 5C', '2S 2H')).toBe(true)
    expect(b('5S 5H 5D 5C', '2S 2H', withRules({ fourKindChopsPairOfTwos: false }))).toBe(false)
    expect(b('3S 3H 4D 4C 5S 5H 6D 6C', '2S 2H 2D')).toBe(false)
    expect(b('3S 3H 4D 4C 5S 5H 6D 6C 7S 7H', '2S 2H 2D')).toBe(true)
  })

  it('chops chop chops', () => {
    expect(b('5S 5H 5D 5C', '3S 3H 4D 4C 5S 5H')).toBe(true) // quad over 3 pairs
    expect(b('3S 3H 4D 4C 5S 5H 6D 6C', '9S 9H 9D 9C')).toBe(true) // 4 pairs over quad
    expect(b('9S 9H 9D 9C', '5S 5H 5D 5C')).toBe(true) // higher quad
    expect(b('3S 3H 4D 4C 5S 5H', '9S 9H 9D 9C')).toBe(false)
    expect(b('5S 5H 5D 5C', '3S 3H 4D 4C 5S 5H', withRules({ chopChains: false }))).toBe(false)
    expect(isChopOf(d('5S 5H 5D 5C')!, d('2H')!)).toBe(true)
    expect(isChopOf(d('9S 9H 9D 9C')!, d('5S 5H 5D 5C')!)).toBe(false) // same shape, plain beat
  })

  it('Northern follow-suit singles', () => {
    const north = withRules({ followSuitSingles: true })
    expect(b('9S', '7S', north)).toBe(true)
    expect(b('9H', '7S', north)).toBe(false)
  })
})
