import { TWO, value, type Card } from '@engine/cards'
import { isChop, isChopOf, type Combo } from '@engine/combos'
import type { Action, BotLevel, GameView, Seat } from '@engine/game'
import { enumerateCombos, legalPlays } from '@engine/moves'
import { Rng } from '@engine/rng'
import type { Rules } from '@engine/rules'

/**
 * Heuristic Tiến lên bot. Works from a GameView (own hand + public info only),
 * so the same code drives bots on the host and stand-ins for absent humans.
 */

const TYPE_PRIORITY: Record<Combo['type'], number> = {
  pairseq: 0,
  quad: 1,
  straight: 2,
  triple: 3,
  pair: 4,
  single: 5
}

/** Greedy split of a hand into the combos the bot intends to play: long shapes first. */
export function planHand(hand: Card[], rules: Rules): Combo[] {
  const combos = enumerateCombos(hand, rules)
  combos.sort((a, b) => {
    const pa = TYPE_PRIORITY[a.type]
    const pb = TYPE_PRIORITY[b.type]
    if (pa !== pb) return pa - pb
    if (a.cards.length !== b.cards.length) return b.cards.length - a.cards.length
    return a.top - b.top
  })
  const used = new Set<number>()
  const plan: Combo[] = []
  for (const c of combos) {
    // Never bury 2s in a pair-sequence (impossible anyway) but do keep 2s as singles/pairs.
    if (c.cards.some((k) => used.has(k.id))) continue
    for (const k of c.cards) used.add(k.id)
    plan.push(c)
  }
  for (const k of hand) {
    if (!used.has(k.id)) {
      const single = enumerateCombos([k], rules)[0]
      if (single) plan.push(single)
      used.add(k.id)
    }
  }
  return plan
}

function sameCards(a: Combo, b: Combo): boolean {
  if (a.cards.length !== b.cards.length) return false
  const ids = new Set(a.cards.map((c) => c.id))
  return b.cards.every((c) => ids.has(c.id))
}

function minus(hand: Card[], combo: Combo): Card[] {
  const ids = new Set(combo.cards.map((c) => c.id))
  return hand.filter((c) => !ids.has(c.id))
}

function hasTwo(c: Combo): boolean {
  return c.cards.some((k) => k.rank === TWO)
}

export class Bot {
  private rng: Rng

  constructor(
    public readonly level: BotLevel = 'normal',
    seed = 1
  ) {
    this.rng = new Rng(seed)
  }

  decide(view: GameView): Action | null {
    if (view.phase !== 'playing' || view.turn !== view.seat) return null
    return view.trick.current ? this.follow(view) : this.lead(view)
  }

  private opponents(view: GameView): Seat[] {
    return view.players.map((p) => p.seat).filter((s) => s !== view.seat && !view.finished.includes(s))
  }

  private minOppCards(view: GameView): number {
    return Math.min(...this.opponents(view).map((s) => view.handCounts[s]), 99)
  }

  // ------------------------------------------------------------------ lead

  private lead(view: GameView): Action {
    const { hand, rules } = view
    const me = view.seat
    const play = (c: Combo): Action => ({ type: 'play', seat: me, cardIds: c.cards.map((k) => k.id) })
    const must = view.mustPlayCardId
    const plan = planHand(hand, rules)
    if (must !== null) {
      const options = legalPlays(hand, rules, null, must)
      // Prefer the longest shape that includes the forced card, from the plan if possible.
      const inPlan = plan.filter((c) => c.cards.some((k) => k.id === must))
      const pool = inPlan.length ? inPlan : options
      pool.sort((a, b) => b.cards.length - a.cards.length || a.top - b.top)
      return play(pool[0])
    }
    if (plan.length === 1) return play(plan[0])

    if (this.level === 'easy') {
      const nonChop = plan.filter((c) => !isChop(c) && !hasTwo(c))
      const pool = nonChop.length ? nonChop : plan
      return play(pool[this.rng.int(pool.length)])
    }

    const oppMin = this.minOppCards(view)
    const threatened = oppMin <= 3
    // Leading: dump low, long shapes; hold 2s and chops for later unless we're nearly out.
    const candidates = plan.filter((c) => !isChop(c))
    const holdTwos = hand.length > 4 && !threatened
    let pool = candidates.filter((c) => !holdTwos || !hasTwo(c))
    if (pool.length === 0) pool = candidates.length ? candidates : plan
    const score = (c: Combo): number => {
      let s = 0
      if (threatened) {
        // Big shapes they probably can't follow, and high cards to keep the lead.
        s += c.cards.length * 5 + c.top / 4
        if (c.type === 'single') s -= 8
      } else {
        s += c.cards.length * 3 - c.top / 4
        if (hand.length <= 5 && hand.length - c.cards.length === 0) s += 100
      }
      // Hard bots avoid leading a lone low single when they hold many singles (it gives the lead away).
      if (this.level === 'hard' && c.type === 'single' && c.rank < 8 && plan.filter((p) => p.type === 'single').length > 3) s -= 2
      return s
    }
    pool.sort((a, b) => score(b) - score(a))
    return play(pool[0])
  }

  // ---------------------------------------------------------------- follow

  private follow(view: GameView): Action {
    const { hand, rules } = view
    const me = view.seat
    const table = view.trick.current!
    const lastPlayer = view.trick.lastPlayer!
    const legal = legalPlays(hand, rules, table)
    const pass: Action = { type: 'pass', seat: me }
    const play = (c: Combo): Action => ({ type: 'play', seat: me, cardIds: c.cards.map((k) => k.id) })
    if (legal.length === 0) return pass

    const finisher = legal.find((c) => c.cards.length === hand.length)
    if (finisher) return play(finisher)

    if (this.level === 'easy') {
      const cheap = legal.filter((c) => !isChopOf(c, table))
      if (cheap.length && this.rng.next() < 0.7) return play(cheap[this.rng.int(cheap.length)])
      return pass
    }

    const plan = planHand(hand, rules)
    const oppMin = this.minOppCards(view)
    const victimCards = view.handCounts[lastPlayer]
    const chops = legal.filter((c) => isChopOf(c, table))
    const normal = legal.filter((c) => !isChopOf(c, table))

    // Normal follow: cheapest play that keeps the plan intact, or the least damaging one.
    const shortlist = [...normal].sort((a, b) => a.top - b.top).slice(0, 8)
    const scored = shortlist.map((c) => {
      const inPlan = plan.some((p) => sameCards(p, c))
      const after = planHand(minus(hand, c), rules).length
      return { c, inPlan, after }
    })
    scored.sort((a, b) => a.after - b.after || (a.inPlan === b.inPlan ? a.c.top - b.c.top : a.inPlan ? -1 : 1))
    const best = scored[0]
    if (best) {
      const spendsTwo = hasTwo(best.c)
      const tableIsLow = table.type === 'single' ? table.rank < 10 : table.rank < 12
      const wasteful = spendsTwo && tableIsLow && hand.length > 6 && oppMin > 3
      // Hard bots hold their 2s a little longer.
      const hardHold = this.level === 'hard' && spendsTwo && oppMin > 5 && hand.length > 4 && table.rank < 13
      if (!wasteful && !hardHold && best.after <= plan.length) return play(best.c)
      if (oppMin <= 3 && !wasteful) return play(best.c)
    }

    // Chop decisions: chopping earns points, so do it when the victim is dangerous or it's cheap.
    if (chops.length) {
      chops.sort((a, b) => a.cards.length - b.cards.length || a.top - b.top)
      const smallest = chops[0]
      const aggressive = this.level === 'hard'
      if (victimCards <= 4 || oppMin <= 2) return play(smallest)
      if (view.trick.chopPoints === 0 && table.cards.some((c) => c.rank === TWO && (c.suit === 'H' || c.suit === 'D'))) return play(smallest)
      if (aggressive && hand.length <= 8) return play(smallest)
      if (aggressive && view.trick.chopPoints >= 2) return play(smallest)
    }
    return pass
  }
}

/** Utility for tests: lowest card in a hand by absolute value. */
export function lowestCard(hand: Card[]): Card {
  return hand.reduce((a, b) => (value(b) < value(a) ? b : a))
}
