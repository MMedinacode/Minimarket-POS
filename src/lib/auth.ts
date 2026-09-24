// Acceso con contraseña máster. OJO: es una barrera simple para que un
// cliente o empleado no entre al panel; no reemplaza la seguridad de un
// servidor, porque todos los datos viven en este mismo navegador.
import { readPref, writePref } from './storage'

const DEFAULT_PASSWORD = (import.meta.env.VITE_MASTER_PASSWORD as string | undefined)?.trim() || '1234'
const SESSION_HOURS = 12
const SALT = 'minimarket-pos::'

/** Hash cyrb53: rápido y funciona también en http:// (crypto.subtle no) */
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

const hash = (pwd: string) => cyrb53(SALT + pwd, 7) + cyrb53(pwd + SALT, 13)

export function isUsingDefaultPassword(): boolean {
  return readPref<string | null>('pwd', null) === null
}

export function defaultPasswordHint(): string {
  return DEFAULT_PASSWORD
}

export function verifyPassword(pwd: string): boolean {
  const stored = readPref<string | null>('pwd', null)
  return stored === null ? pwd === DEFAULT_PASSWORD : hash(pwd) === stored
}

export function changePassword(current: string, next: string): string | null {
  if (!verifyPassword(current)) return 'La contraseña actual no es correcta'
  if (next.trim().length < 4) return 'La nueva contraseña debe tener al menos 4 caracteres'
  writePref('pwd', hash(next))
  return null
}

export function startSession() {
  writePref('session', Date.now() + SESSION_HOURS * 3_600_000)
}

export function hasValidSession(): boolean {
  return readPref<number>('session', 0) > Date.now()
}

export function endSession() {
  writePref('session', null)
}

// Bloqueo temporal tras varios intentos fallidos
const MAX_ATTEMPTS = 5
const LOCK_MS = 30_000

export function registerFailedAttempt(): number {
  const n = readPref<number>('fails', 0) + 1
  writePref('fails', n)
  if (n >= MAX_ATTEMPTS) {
    writePref('lockUntil', Date.now() + LOCK_MS)
    writePref('fails', 0)
  }
  return n
}

export function clearFailedAttempts() {
  writePref('fails', null)
  writePref('lockUntil', null)
}

export function lockedForMs(): number {
  return Math.max(0, readPref<number>('lockUntil', 0) - Date.now())
}
