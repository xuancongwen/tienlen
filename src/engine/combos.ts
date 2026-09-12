import { TWO, isRed, value, type Card } from './cards'
import type { Rules } from './rules'

export type ComboType =
  | 'single'
  | 'pair'
  | 'triple'
  | 'quad' // tứ quý
  | 'straight' // sảnh, 3+ cards
  | 'pairseq' // đôi thông, 3+ consecutive pairs

export interface Combo {
  type: ComboType
  cards: Card[]
  /** Rank of the highest card. */
  rank: number
  /** value() of the card that decides ties (highest card). */
  top: number
  /** Number of cards (straights) or pairs (pair sequences). */
  length: number
}

export const COMBO_NAMES: Record<ComboType, string> = {
  single: 'Single',
  pair: 'Pair',
  triple: 'Triple',
  quad: 'Four of a kind',
  straight: 'Straight',
  pairseq: 'Consecutive pairs'
}

/** Detect the combo a set of cards forms, or null. */
export function detect(cards: Card[], rules: Rules): Combo | null {
  const n = cards.length
  if (n === 0) return null
  const sorted = [...cards].sort((a, b) => value(a) - value(b))
  const top = value(sorted[n - 1])
  const rank = sorted[n - 1].rank
  const sameRank = sorted.every((c) => c.rank === rank)

  if (n === 1) return { type: 'single', cards: sorted, rank, top, length: 1 }
  if (sameRank) {
    if (n === 2) {
      if (rules.pairsSameColor && isRed(sorted[0].suit) !== isRed(sorted[1].suit)) return null
      return { type: 'pair', cards: sorted, rank, top, length: 1 }
    }
    if (n === 3) return { type: 'triple', cards: sorted, rank, top, length: 1 }
    if (n === 4) return { type: 'quad', cards: sorted, rank, top, length: 1 }
    return null
  }

  // Straight: 3+ distinct consecutive ranks, no 2s.
  if (n >= 3 && sorted.every((c) => c.rank !== TWO)) {
    let straight = true
    for (let i = 1; i < n; i++) {
      if (sorted[i].rank !== sorted[i - 1].rank + 1) {
        straight = false
        break
      }
    }
    if (straight) {
      if (rules.straightsSameSuit && !sorted.every((c) => c.suit === sorted[0].suit)) return null
      return { type: 'straight', cards: sorted, rank, top, length: n }
    }
  }

  // Consecutive pairs: 3+ pairs, no 2s.
  if (n >= 6 && n % 2 === 0 && sorted.every((c) => c.rank !== TWO)) {
    let ok = true
    for (let i = 0; i < n; i += 2) {
      if (sorted[i].rank !== sorted[i + 1].rank) {
        ok = false
        break
      }
      if (rules.pairsSameColor && isRed(sorted[i].suit) !== isRed(sorted[i + 1].suit)) {
        ok = false
        break
      }
      if (i > 0 && sorted[i].rank !== sorted[i - 2].rank + 1) {
        ok = false
        break
      }
    }
    if (ok) return { type: 'pairseq', cards: sorted, rank, top, length: n / 2 }
  }
  return null
}

/** Is this combo one of the "bombs" that can chop 2s? */
export function isChop(c: Combo): boolean {
  return c.type === 'quad' || c.type === 'pairseq'
}

/**
 * Strength ladder for chops: 3 đôi thông < tứ quý < 4 đôi thông < 5 đôi thông < …
 */
export function chopPower(c: Combo): number {
  if (c.type === 'quad') return 2
  if (c.type === 'pairseq') return c.length === 3 ? 1 : c.length
  return 0
}

/** How many 2s a chop of this power may chop. */
function twosChoppedBy(c: Combo, rules: Rules): number {
  if (c.type === 'quad') return rules.fourKindChopsPairOfTwos ? 2 : 1
  if (c.type === 'pairseq') return c.length - 2 // 3 pairs → one 2, 4 pairs → two 2s, 5 pairs → three 2s
  return 0
}

/** Does `a` beat `b` (the combo on the table)? */
export function beats(a: Combo, b: Combo, rules: Rules): boolean {
  const bIsTwos = b.cards.every((c) => c.rank === TWO) && b.type !== 'quad' && b.type !== 'pairseq'
  // Chopping 2s.
  if (bIsTwos && isChop(a)) return twosChoppedBy(a, rules) >= b.cards.length
  // Chopping chops.
  if (isChop(b) && isChop(a) && (a.type !== b.type || a.length !== b.length)) return rules.chopChains && chopPower(a) > chopPower(b)
  if (a.type !== b.type || a.length !== b.length) return false
  if (a.type === 'single' && rules.followSuitSingles) {
    return a.cards[0].suit === b.cards[0].suit && a.top > b.top
  }
  if (a.type === 'quad' || a.type === 'triple') return a.rank > b.rank
  return a.top > b.top
}

/** True when playing `a` over `b` is a chop (penalty changes hands). */
export function isChopOf(a: Combo, b: Combo): boolean {
  if (!isChop(a)) return false
  const bIsTwos = b.cards.every((c) => c.rank === TWO) && !isChop(b)
  return bIsTwos || (isChop(b) && (a.type !== b.type || a.length !== b.length))
}

export function describeCombo(c: Combo): string {
  switch (c.type) {
    case 'straight':
      return `${c.length}-card straight`
    case 'pairseq':
      return `${c.length} consecutive pairs`
    default:
      return COMBO_NAMES[c.type]
  }
}
