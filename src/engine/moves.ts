import { TWO, isRed, type Card, type Rank } from './cards'
import { beats, detect, type Combo } from './combos'
import type { Rules } from './rules'

/**
 * Every distinct combo a hand can form. Used by the AI and the hint button.
 */
export function enumerateCombos(hand: Card[], rules: Rules): Combo[] {
  const byRank = new Map<Rank, Card[]>()
  for (const c of hand) {
    const arr = byRank.get(c.rank) ?? []
    arr.push(c)
    byRank.set(c.rank, arr)
  }
  const out: Combo[] = []
  const push = (cards: Card[]): void => {
    const c = detect(cards, rules)
    if (c) out.push(c)
  }

  // Singles.
  for (const c of hand) push([c])

  // Pairs / triples / quads (all suit combinations for pairs and triples — suits matter for ties).
  for (const cards of byRank.values()) {
    const n = cards.length
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) push([cards[i], cards[j]])
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) push([cards[i], cards[j], cards[k]])
    if (n === 4) push(cards)
  }

  // Straights: every window of 3+ consecutive ranks (no 2s); pick the highest-suited card of
  // each rank for the top position and try suit variants only for the top card (ties are
  // decided by the top card), plus one variant with the lowest cards to keep options open.
  const ranks = [...byRank.keys()].filter((r) => r !== TWO).sort((a, b) => a - b)
  for (let i = 0; i < ranks.length; i++) {
    for (let j = i + 1; j < ranks.length; j++) {
      if (ranks[j] !== ranks[j - 1] + 1) break
      if (j - i < 2) continue
      const window = ranks.slice(i, j + 1)
      if (rules.straightsSameSuit) {
        for (const suit of ['S', 'C', 'D', 'H'] as const) {
          const cards = window.map((r) => byRank.get(r)!.find((c) => c.suit === suit))
          if (cards.every(Boolean)) push(cards as Card[])
        }
        continue
      }
      const low = window.map((r) => byRank.get(r)![0])
      push(low)
      const topCards = byRank.get(window[window.length - 1])!
      for (const t of topCards) push([...low.slice(0, -1), t])
    }
  }

  // Consecutive pairs: windows of 3+ ranks that all have 2+ cards.
  const pairable = ranks.filter((r) => {
    const cards = byRank.get(r)!
    if (!rules.pairsSameColor) return cards.length >= 2
    return cards.filter((c) => isRed(c.suit)).length >= 2 || cards.filter((c) => !isRed(c.suit)).length >= 2
  })
  for (let i = 0; i < pairable.length; i++) {
    for (let j = i + 1; j < pairable.length; j++) {
      if (pairable[j] !== pairable[j - 1] + 1) break
      if (j - i < 2) continue
      const window = pairable.slice(i, j + 1)
      const pairOf = (r: Rank): Card[] => {
        const all = byRank.get(r)!
        if (!rules.pairsSameColor) return all.slice(0, 2)
        const reds = all.filter((c) => isRed(c.suit))
        const blacks = all.filter((c) => !isRed(c.suit))
        return reds.length >= 2 ? reds.slice(0, 2) : blacks.slice(0, 2)
      }
      const base = window.slice(0, -1).flatMap(pairOf)
      // The top pair decides ties, so try every suit choice for it.
      const topRank = window[window.length - 1]
      const topAll = byRank.get(topRank)!
      const seen = new Set<string>()
      for (let a = 0; a < topAll.length; a++) {
        for (let b = a + 1; b < topAll.length; b++) {
          if (rules.pairsSameColor && isRed(topAll[a].suit) !== isRed(topAll[b].suit)) continue
          const key = `${topAll[a].id}.${topAll[b].id}`
          if (seen.has(key)) continue
          seen.add(key)
          push([...base, topAll[a], topAll[b]])
        }
      }
    }
  }
  return out
}

/** Every combo in `hand` that may be played on `table` (any combo when leading). */
export function legalPlays(hand: Card[], rules: Rules, table: Combo | null, mustIncludeId: number | null = null): Combo[] {
  let all = enumerateCombos(hand, rules)
  if (mustIncludeId !== null) all = all.filter((c) => c.cards.some((k) => k.id === mustIncludeId))
  if (!table) return all
  return all.filter((c) => beats(c, table, rules))
}
