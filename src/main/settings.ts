import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

function settingsPath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'settings.json')
}

export function loadSettings(): unknown {
  try {
    const p = settingsPath()
    if (!existsSync(p)) return null
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

export function saveSettings(data: unknown): boolean {
  try {
    writeFileSync(settingsPath(), JSON.stringify(data, null, 2), 'utf8')
    return true
  } catch {
    return false
  }
}
