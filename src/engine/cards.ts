/**
 * Card primitives for Tiến lên.
 *
 * One 52-card deck. Ranks run 3 (lowest) … K, A, 2 (highest); suits rank
 * spades < clubs < diamonds < hearts, so the 2♥ is the highest card.
 */

export type Suit = 'S' | 'C' | 'D' | 'H'
/** 3..10, J=11, Q=12, K=13, A=14, 2=15 */
export type Rank = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15

export const TWO: Rank = 15
export const ACE: Rank = 14

export interface Card {
  /** 0..51, stable for the whole match. */
  id: number
  suit: Suit
  rank: Rank
}

export const SUITS: Suit[] = ['S', 'C', 'D', 'H']
export const RANKS: Rank[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

const SUIT_ORDER: Record<Suit, number> = { S: 0, C: 1, D: 2, H: 3 }

export function suitOrder(s: Suit): number {
  return SUIT_ORDER[s]
}

export function isRed(s: Suit): boolean {
  return s === 'D' || s === 'H'
}

/** Absolute ordering of a card: rank first, then suit. */
export function value(c: Card): number {
  return c.rank * 4 + SUIT_ORDER[c.suit]
}

export function buildDeck(): Card[] {
  const deck: Card[] = []
  let id = 0
  for (const rank of RANKS) {
    for (const suit of SUITS) deck.push({ id: id++, suit, rank })
  }
  return deck
}

export function cardFromId(id: number): Card {
  return { id, rank: RANKS[Math.floor(id / 4)], suit: SUITS[id % 4] }
}

export function rankLabel(rank: Rank): string {
  switch (rank) {
    case 11:
      return 'J'
    case 12:
      return 'Q'
    case 13:
      return 'K'
    case 14:
      return 'A'
    case 15:
      return '2'
    default:
      return String(rank)
  }
}

export function suitSymbol(suit: Suit): string {
  switch (suit) {
    case 'S':
      return '♠'
    case 'C':
      return '♣'
    case 'D':
      return '♦'
    case 'H':
      return '♥'
  }
}

export function cardLabel(c: Card): string {
  return rankLabel(c.rank) + suitSymbol(c.suit)
}

/** Sort a hand for display: low to high. */
export function sortHand(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => value(a) - value(b))
}

/** Parse "3S", "10H", "AD", "2C". */
export function parseCard(s: string, id = -1): Card {
  s = s.trim().toUpperCase()
  const suit = s[s.length - 1] as Suit
  const r = s.slice(0, -1)
  const rank = (r === 'A' ? 14 : r === 'K' ? 13 : r === 'Q' ? 12 : r === 'J' ? 11 : r === '2' ? 15 : parseInt(r, 10)) as Rank
  if (!SUITS.includes(suit) || !RANKS.includes(rank)) throw new Error(`bad card ${s}`)
  const canonical = (rank - 3) * 4 + SUIT_ORDER[suit]
  return { id: id < 0 ? canonical : id, suit, rank }
}

export function parseCards(list: string): Card[] {
  return list
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((s) => parseCard(s))
}
