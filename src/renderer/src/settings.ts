import type { BotLevel } from '@engine/game'
import { DEFAULT_RULES, withRules, type Rules } from '@engine/rules'

export interface Settings {
  name: string
  rules: Rules
  botLevel: BotLevel
  /** Bot thinking time in ms — the pace of the table. */
  botDelayMs: number
  /** Last LAN address joined, for convenience. */
  lastLanAddress: string
}

export const DEFAULT_SETTINGS: Settings = {
  name: 'Player',
  rules: DEFAULT_RULES,
  botLevel: 'normal',
  botDelayMs: 900,
  lastLanAddress: ''
}

const KEY = 'tienlen.settings'

export async function loadSettings(): Promise<Settings> {
  let raw: unknown = null
  try {
    raw = window.gd ? await window.gd.settings.load() : JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    raw = null
  }
  const s = (raw ?? {}) as Partial<Settings>
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    rules: withRules(s.rules ?? {})
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  try {
    if (window.gd) await window.gd.settings.save(s)
    else localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}
