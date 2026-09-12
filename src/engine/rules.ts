/**
 * Every table-level variant Tiến lên groups actually argue about.
 * Defaults follow the common Southern (miền Nam) game.
 */
export interface Rules {
  /** Seats at the table. 13 cards each; leftover cards stay in the box. */
  playerCount: 2 | 3 | 4

  /** How the very first round opens. */
  firstLead: 'lowestMustPlay' | 'lowestLeads' | 'random'
  /** Later rounds: the previous winner leads (otherwise the lowest card leads again). */
  winnerLeadsNext: boolean

  /** Instant wins (tới trắng): four 2s, six pairs, five consecutive pairs, 3→A dragon straight, three four-of-a-kinds. */
  instantWins: boolean
  /** Points each other player pays on an instant win. */
  instantWinPoints: number

  /** Four of a kind (tứ quý) may chop a pair of 2s (as well as a single 2). */
  fourKindChopsPairOfTwos: boolean
  /** Chops can themselves be chopped (tứ quý over 3 đôi thông, 4 đôi thông over tứ quý…). */
  chopChains: boolean
  /** After a chop, players who had passed may respond again. */
  reopenAfterChop: boolean

  /** Northern (miền Bắc) style constraints. */
  pairsSameColor: boolean
  straightsSameSuit: boolean
  followSuitSingles: boolean

  /** Scoring. */
  pointsPerCard: number
  penaltyBlackTwo: number // thối heo đen
  penaltyRedTwo: number // thối heo đỏ
  penaltyFourKind: number // thối tứ quý
  penaltyPairSequence: number // thối 3 đôi thông
  congMultiplier: number // never played a card
  /** Rounds per match. 0 = play until someone leaves. */
  rounds: number

  /** Seconds a human has to act. 0 = no timer. */
  turnTimeSeconds: number
}

export const DEFAULT_RULES: Rules = {
  playerCount: 4,
  firstLead: 'lowestMustPlay',
  winnerLeadsNext: true,
  instantWins: true,
  instantWinPoints: 13,
  fourKindChopsPairOfTwos: true,
  chopChains: true,
  reopenAfterChop: false,
  pairsSameColor: false,
  straightsSameSuit: false,
  followSuitSingles: false,
  pointsPerCard: 1,
  penaltyBlackTwo: 1,
  penaltyRedTwo: 2,
  penaltyFourKind: 4,
  penaltyPairSequence: 3,
  congMultiplier: 2,
  rounds: 10,
  turnTimeSeconds: 0
}

export function withRules(overrides: Partial<Rules>): Rules {
  return { ...DEFAULT_RULES, ...overrides }
}

export interface RuleOption {
  key: keyof Rules
  label: string
  help: string
  kind: 'toggle' | 'choice'
  choices?: { value: string | number; label: string }[]
}

export const RULE_OPTIONS: RuleOption[] = [
  {
    key: 'playerCount',
    label: 'Players at the table',
    help: 'Two, three or four seats. Bots fill any seat without a person.',
    kind: 'choice',
    choices: [
      { value: 4, label: '4 players' },
      { value: 3, label: '3 players' },
      { value: 2, label: '2 players' }
    ]
  },
  {
    key: 'firstLead',
    label: 'First round opens with',
    help: 'The 3♠ (or the lowest card dealt) traditionally opens the first round.',
    kind: 'choice',
    choices: [
      { value: 'lowestMustPlay', label: 'Lowest card, and it must be played' },
      { value: 'lowestLeads', label: 'Lowest card’s holder leads anything' },
      { value: 'random', label: 'A random player' }
    ]
  },
  {
    key: 'winnerLeadsNext',
    label: 'Winner leads the next round',
    help: 'Off: the lowest card opens every round.',
    kind: 'toggle'
  },
  {
    key: 'instantWins',
    label: 'Instant wins (tới trắng)',
    help: 'Four 2s, six pairs, five consecutive pairs, a 3-to-A dragon or three four-of-a-kinds win at the deal.',
    kind: 'toggle'
  },
  {
    key: 'instantWinPoints',
    label: 'Instant win pays',
    help: 'Points each other player hands over.',
    kind: 'choice',
    choices: [
      { value: 13, label: '13 (a full hand)' },
      { value: 26, label: '26 (double)' },
      { value: 20, label: '20' }
    ]
  },
  {
    key: 'fourKindChopsPairOfTwos',
    label: 'Four of a kind chops a pair of 2s',
    help: 'Otherwise only four consecutive pairs can.',
    kind: 'toggle'
  },
  {
    key: 'chopChains',
    label: 'Chops can be chopped',
    help: 'Tứ quý over 3 đôi thông, 4 đôi thông over tứ quý — and the penalty moves with it.',
    kind: 'toggle'
  },
  {
    key: 'reopenAfterChop',
    label: 'A chop reopens the trick',
    help: 'Players who had already passed may answer a chop.',
    kind: 'toggle'
  },
  {
    key: 'pairsSameColor',
    label: 'Pairs must share a color (miền Bắc)',
    help: 'Two black or two red cards make a pair.',
    kind: 'toggle'
  },
  {
    key: 'straightsSameSuit',
    label: 'Straights must be one suit (miền Bắc)',
    help: '',
    kind: 'toggle'
  },
  {
    key: 'followSuitSingles',
    label: 'Singles must follow suit (miền Bắc)',
    help: 'To beat a single card you must play the same suit.',
    kind: 'toggle'
  },
  {
    key: 'pointsPerCard',
    label: 'Points per card left',
    help: '',
    kind: 'choice',
    choices: [
      { value: 1, label: '1' },
      { value: 2, label: '2' }
    ]
  },
  {
    key: 'penaltyRedTwo',
    label: 'Penalty for a red 2 left in hand',
    help: 'Thối heo đỏ. Black 2s cost half.',
    kind: 'choice',
    choices: [
      { value: 0, label: 'None' },
      { value: 2, label: '2 (standard)' },
      { value: 4, label: '4' }
    ]
  },
  {
    key: 'penaltyFourKind',
    label: 'Penalty for a four of a kind left',
    help: 'Thối tứ quý.',
    kind: 'choice',
    choices: [
      { value: 0, label: 'None' },
      { value: 4, label: '4 (standard)' },
      { value: 8, label: '8' }
    ]
  },
  {
    key: 'congMultiplier',
    label: 'Never played a card (cóng)',
    help: 'Multiplier on what a player who never got a card down pays.',
    kind: 'choice',
    choices: [
      { value: 1, label: 'No extra' },
      { value: 2, label: 'Pays double (standard)' },
      { value: 3, label: 'Pays triple' }
    ]
  },
  {
    key: 'rounds',
    label: 'Rounds per match',
    help: '',
    kind: 'choice',
    choices: [
      { value: 5, label: '5' },
      { value: 10, label: '10 (standard)' },
      { value: 20, label: '20' },
      { value: 0, label: 'Endless' }
    ]
  },
  {
    key: 'turnTimeSeconds',
    label: 'Turn timer',
    help: 'Seconds to act before auto-pass. 0 disables the timer.',
    kind: 'choice',
    choices: [
      { value: 0, label: 'Off' },
      { value: 15, label: '15 s' },
      { value: 30, label: '30 s' },
      { value: 60, label: '60 s' }
    ]
  }
]

export function getRuleValue(rules: Rules, key: keyof Rules): string | number | boolean {
  return rules[key]
}

export function setRuleValue(rules: Rules, key: keyof Rules, value: string | number | boolean): Rules {
  const next = { ...rules }
  if (key === 'penaltyRedTwo') {
    next.penaltyRedTwo = Number(value)
    next.penaltyBlackTwo = Number(value) / 2
    return next
  }
  ;(next as unknown as Record<string, unknown>)[key] = value
  return next
}
