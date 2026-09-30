import { beforeEach, describe, expect, it } from 'vitest'

// localStorage de mentira (en Node no existe)
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage

const backup = await import('./backup')
const DAY = 86_400_000

beforeEach(() => store.clear())

describe('recordatorio de respaldo', () => {
  it('no molesta el primer día; avisa a la semana', () => {
    const t = Date.now()
    expect(backup.backupDue(t)).toBe(false)
    expect(backup.backupDue(t + 6 * DAY)).toBe(false)
    expect(backup.backupDue(t + 7 * DAY)).toBe(true)
    expect(backup.daysSinceBackup(t + 7 * DAY)).toBeNull()
  })

  it('descargar el respaldo reinicia la cuenta', () => {
    const t = Date.now()
    backup.backupDue(t)
    backup.markBackupDone(t + 8 * DAY)
    expect(backup.backupDue(t + 9 * DAY)).toBe(false)
    expect(backup.backupDue(t + 15 * DAY)).toBe(true)
    expect(backup.daysSinceBackup(t + 15 * DAY)).toBe(7)
  })

  it('"Ahora no" lo pospone 2 días', () => {
    const t = Date.now()
    backup.backupDue(t)
    backup.snoozeBackup(t + 7 * DAY)
    expect(backup.backupDue(t + 8 * DAY)).toBe(false)
    expect(backup.backupDue(t + 9 * DAY)).toBe(true)
  })
})
