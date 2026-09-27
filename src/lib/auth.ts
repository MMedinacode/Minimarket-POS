// Clave de la caja (una por dispositivo).
//
// - No hay clave por defecto: el dueño crea la suya la primera vez.
// - Nunca se guarda la clave, solo su "huella" PBKDF2-SHA256 con sal aleatoria
//   y 210.000 repeticiones (adivinarla probando es muy lento).
// - Tras varios intentos fallidos la caja se bloquea cada vez más tiempo.
//
// Protege el acceso a la pantalla (que un cliente o empleado no vea las
// ganancias). Los datos en la nube los protege además la cuenta de Supabase.
import { readPref, writePref } from './storage'

const ITERATIONS = 210_000
const SESSION_HOURS = 12
const PREF = 'pwd'

// ---------- Utilidades ----------

const toB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/** crypto.subtle solo existe en https:// o en localhost */
export function cryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle?.importKey === 'function'
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return new Uint8Array(bits)
}

/** Comparación en tiempo constante (no revela cuántos caracteres coinciden) */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/** Huella de la versión anterior de la app (solo para migrarla) */
function legacyHash(pwd: string): string {
  const cyrb53 = (str: string, seed: number) => {
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
  const salt = 'minimarket-pos::'
  return cyrb53(salt + pwd, 7) + cyrb53(pwd + salt, 13)
}

// ---------- Reglas para una clave segura ----------

const COMMON = new Set([
  '123456', '1234567', '12345678', '123456789', '1234567890', '123123', '654321', '111111', '000000', '112233',
  '121212', '123321', '159753', '147258', '789456', '987654', '666666', '555555', '696969', '131313',
  'password', 'contraseña', 'contrasena', 'qwerty', 'qwerty123', 'abc123', 'admin', 'admin123', 'minimarket',
  'clave123', 'chile123', 'asdasd', 'asdfgh',
])

/** Devuelve por qué una clave nueva es débil, o null si está bien */
export function passwordProblem(pwd: string): string | null {
  const p = pwd.trim()
  if (p.length < 6) return 'Usa al menos 6 números o letras'
  if (/^(.)\1+$/.test(p)) return 'No repitas el mismo número (ej: 111111)'
  if (/^\d+$/.test(p) && ('01234567890123'.includes(p) || '98765432109876'.includes(p))) {
    return 'No uses números seguidos (ej: 123456)'
  }
  if (/^(.{1,3})\1+$/.test(p)) return 'Evita patrones repetidos (ej: 121212)'
  if (COMMON.has(p.toLowerCase())) return 'Esa clave es muy común, elige otra'
  return null
}

// ---------- Guardar y comprobar ----------

export function hasPassword(): boolean {
  return readPref<string | null>(PREF, null) !== null
}

export async function setPassword(pwd: string): Promise<void> {
  if (!cryptoAvailable()) throw new Error('Abre la app desde su dirección segura (https://)')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(pwd, salt, ITERATIONS)
  writePref(PREF, `pbkdf2:${ITERATIONS}:${toB64(salt)}:${toB64(hash)}`)
}

export async function verifyPassword(pwd: string): Promise<boolean> {
  const stored = readPref<string | null>(PREF, null)
  if (!stored) return false
  if (!stored.startsWith('pbkdf2:')) {
    // Clave de la versión anterior: si es correcta, se guarda con el formato seguro
    const ok = legacyHash(pwd) === stored
    if (ok && cryptoAvailable()) await setPassword(pwd)
    return ok
  }
  if (!cryptoAvailable()) throw new Error('Abre la app desde su dirección segura (https://)')
  const [, iter, salt, hash] = stored.split(':')
  const test = await pbkdf2(pwd, fromB64(salt), Number(iter))
  return sameBytes(test, fromB64(hash))
}

export async function changePassword(current: string, next: string): Promise<string | null> {
  if (!(await verifyPassword(current))) return 'La clave actual no es correcta'
  const problem = passwordProblem(next)
  if (problem) return problem
  await setPassword(next)
  return null
}

/** Olvidó la clave: se borra para crear una nueva (solo tras entrar con la cuenta o borrar los datos) */
export function forgetPassword() {
  writePref(PREF, null)
  clearFailedAttempts()
}

// ---------- Sesión ----------

export function startSession() {
  writePref('session', Date.now() + SESSION_HOURS * 3_600_000)
}

export function hasValidSession(): boolean {
  return hasPassword() && readPref<number>('session', 0) > Date.now()
}

export function endSession() {
  writePref('session', null)
}

// ---------- Bloqueo por intentos fallidos (cada vez más largo) ----------

function lockDuration(fails: number): number {
  if (fails >= 10) return 10 * 60_000
  if (fails >= 8) return 2 * 60_000
  if (fails >= 5) return 30_000
  return 0
}

/** Anota un intento fallido y devuelve cuántos van */
export function registerFailedAttempt(now = Date.now()): number {
  const n = readPref<number>('fails', 0) + 1
  writePref('fails', n)
  const lock = lockDuration(n)
  if (lock) writePref('lockUntil', now + lock)
  return n
}

export function clearFailedAttempts() {
  writePref('fails', null)
  writePref('lockUntil', null)
}

export function lockedForMs(now = Date.now()): number {
  return Math.max(0, readPref<number>('lockUntil', 0) - now)
}

/** Intentos que quedan antes del próximo bloqueo (para avisar) */
export function attemptsBeforeLock(): number {
  const n = readPref<number>('fails', 0)
  const next = [5, 8, 10].find((t) => t > n) ?? n + 1
  return next - n
}
