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

const auth = await import('./auth')

beforeEach(() => store.clear())

describe('clave de la caja', () => {
  it('rechaza claves fáciles de adivinar', () => {
    for (const bad of ['1234', '123456', '654321', '111111', '121212', '123123', 'abcabc', 'Password', 'minimarket']) {
      expect(auth.passwordProblem(bad), bad).not.toBeNull()
    }
    for (const good of ['482915', 'rosita2026', 'pan con palta']) {
      expect(auth.passwordProblem(good), good).toBeNull()
    }
  })

  it('guarda solo una huella PBKDF2 con sal, nunca la clave', async () => {
    await auth.setPassword('482915')
    const saved = store.get('mm-pos:pwd')!
    expect(saved).toMatch(/^"pbkdf2:210000:/)
    expect(saved).not.toContain('482915')
    expect(await auth.verifyPassword('482915')).toBe(true)
    expect(await auth.verifyPassword('482916')).toBe(false)
    // La misma clave en otro dispositivo da otra huella (sal distinta)
    await auth.setPassword('482915')
    expect(store.get('mm-pos:pwd')).not.toBe(saved)
  })

  it('cambiar la clave exige la actual y una nueva segura', async () => {
    await auth.setPassword('482915')
    expect(await auth.changePassword('000000', 'rosita2026')).toMatch(/actual/)
    expect(await auth.changePassword('482915', '111111')).toMatch(/repitas/)
    expect(await auth.changePassword('482915', 'rosita2026')).toBeNull()
    expect(await auth.verifyPassword('rosita2026')).toBe(true)
  })

  it('migra la clave de la versión anterior al formato seguro', async () => {
    // Huella de "4321" guardada por la versión anterior de la app
    const legacy = JSON.stringify('x4alb4pede1tro497od9q')
    store.set('mm-pos:pwd', legacy)
    expect(await auth.verifyPassword('9999')).toBe(false)
    expect(store.get('mm-pos:pwd')).toBe(legacy)
    // Con la clave correcta entra y la huella se actualiza al formato seguro
    expect(await auth.verifyPassword('4321')).toBe(true)
    expect(store.get('mm-pos:pwd')).toMatch(/^"pbkdf2:/)
    expect(await auth.verifyPassword('4321')).toBe(true)
  })

  it('bloquea cada vez más tiempo tras intentos fallidos', () => {
    const t0 = 1_000_000
    for (let i = 0; i < 4; i++) auth.registerFailedAttempt(t0)
    expect(auth.lockedForMs(t0)).toBe(0)
    expect(auth.attemptsBeforeLock()).toBe(1)
    auth.registerFailedAttempt(t0) // 5
    expect(auth.lockedForMs(t0)).toBe(30_000)
    auth.registerFailedAttempt(t0)
    auth.registerFailedAttempt(t0)
    auth.registerFailedAttempt(t0) // 8
    expect(auth.lockedForMs(t0)).toBe(120_000)
    auth.registerFailedAttempt(t0)
    auth.registerFailedAttempt(t0) // 10
    expect(auth.lockedForMs(t0)).toBe(600_000)
    auth.clearFailedAttempts()
    expect(auth.lockedForMs(t0)).toBe(0)
  })

  it('sin clave creada no hay sesión válida', async () => {
    auth.startSession()
    expect(auth.hasValidSession()).toBe(false)
    await auth.setPassword('482915')
    auth.startSession()
    expect(auth.hasValidSession()).toBe(true)
  })
})
