// Ayuda por WhatsApp y "código de soporte" para crear una clave nueva sin borrar nada.
//
// Cómo funciona:
// 1. La caja inventa un código de 8 números (solo este equipo lo conoce) y el
//    dueño lo manda por WhatsApp al número de soporte.
// 2. Quien da soporte firma ese código en su computador (`npm run soporte -- 1234 5678`)
//    con su llave PRIVADA, que vive solo en ese computador (nunca en este repositorio).
// 3. El dueño toca el link que recibe. La caja revisa la firma con la llave PÚBLICA
//    (VITE_SUPPORT_PUBLIC_KEY): si es auténtica, deja crear una clave nueva.
//
// La app solo trae la llave pública (el "candado"), así que nadie más puede
// fabricar esos links. Cada código sirve una sola vez y vence en 1 hora.
import { readPref, writePref } from './storage'

const PREF = 'soporte'
export const HELP_VALID_MS = 60 * 60_000
/** Texto que se firma. Debe ser idéntico en scripts/soporte.mjs */
export const SUPPORT_PREFIX = 'caja-minimarket:soporte:v1:nueva-clave:'

const PHONE = ((import.meta.env.VITE_SUPPORT_WHATSAPP as string | undefined) ?? '').replace(/\D/g, '')
const PUBLIC_KEY = ((import.meta.env.VITE_SUPPORT_PUBLIC_KEY as string | undefined) ?? '').trim()

// ---------- WhatsApp ----------

/** Número de soporte tal como se lee: +56 9 3136 5012 */
export function supportPhoneLabel(): string {
  const m = PHONE.match(/^56(9)(\d{4})(\d{4})$/)
  return m ? `+56 ${m[1]} ${m[2]} ${m[3]}` : `+${PHONE}`
}

/** Para llamar desde el celular */
export function supportTelUrl(): string {
  return `tel:+${PHONE}`
}

/** Link para abrir WhatsApp con el mensaje escrito (null si no hay número configurado) */
export function whatsappUrl(text: string): string | null {
  return PHONE ? `https://wa.me/${PHONE}?text=${encodeURIComponent(text)}` : null
}

/** ¿Se puede recuperar la clave con ayuda por WhatsApp en esta instalación? */
export function supportUnlockAvailable(): boolean {
  return Boolean(PHONE && PUBLIC_KEY)
}

// ---------- Pedido de ayuda (el código de 8 números) ----------

export interface HelpRequest {
  code: string
  createdAt: number
}

function readRequest(): HelpRequest | null {
  const r = readPref<HelpRequest | null>(PREF, null)
  return r && /^\d{8}$/.test(r.code) && typeof r.createdAt === 'number' ? r : null
}

/** Pedido vigente (si pasó más de 1 hora, ya no sirve) */
export function currentHelpRequest(now = Date.now()): HelpRequest | null {
  const r = readRequest()
  return r && now - r.createdAt < HELP_VALID_MS ? r : null
}

/**
 * Crea el código para pedir ayuda. Si ya hay uno vigente se reutiliza, así el
 * código que el dueño ya mandó sigue sirviendo aunque cierre y abra la ventana.
 */
export function startHelpRequest(now = Date.now()): HelpRequest {
  const current = currentHelpRequest(now)
  if (current) return current
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 100_000_000
  const req = { code: String(n).padStart(8, '0'), createdAt: now }
  writePref(PREF, req)
  return req
}

export function cancelHelpRequest() {
  writePref(PREF, null)
}

/** 48219375 → "4821 9375" (más fácil de leer o dictar) */
export function formatHelpCode(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`
}

export function helpMessage(code: string, businessName: string): string {
  return `Hola, olvidé la clave de mi caja (${businessName}). Mi código de ayuda es: ${formatHelpCode(code)}`
}

// ---------- Link de soporte ----------

/** Busca el link de soporte dentro de cualquier texto (el link solo o el mensaje completo de WhatsApp) */
export function extractSupportToken(text: string): { code: string; sig: string } | null {
  const m = text.match(/(\d{8})\.([A-Za-z0-9_-]{80,100})/)
  return m ? { code: m[1], sig: m[2] } : null
}

/** Si la caja se abrió con un link de soporte (#/soporte?r=...), lo devuelve y lo borra de la barra de direcciones */
export function takeSupportTokenFromUrl(): string | null {
  const hash = window.location.hash
  if (!/^#\/?soporte\b/.test(hash)) return null
  const token = new URLSearchParams(hash.split('?')[1] ?? '').get('r')
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/inicio`)
  return token
}

export type SupportResult = 'ok' | 'sin-pedido' | 'vencido' | 'otro-pedido' | 'no-valido'

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

async function signatureIsValid(code: string, sig: string, publicKey: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('raw', fromB64url(publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const bytes = fromB64url(sig)
    if (bytes.length !== 64) return false
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, bytes, new TextEncoder().encode(SUPPORT_PREFIX + code))
  } catch {
    return false
  }
}

/**
 * Revisa el link de soporte. Si es auténtico y corresponde al pedido vigente de
 * este equipo, lo gasta (sirve una sola vez) y devuelve 'ok': ya se puede crear una clave nueva.
 */
export async function redeemSupportToken(text: string, opts: { publicKey?: string; now?: number } = {}): Promise<SupportResult> {
  const now = opts.now ?? Date.now()
  const publicKey = opts.publicKey ?? PUBLIC_KEY
  const token = extractSupportToken(text)
  if (!token || !publicKey) return 'no-valido'
  const req = readRequest()
  if (!req) return 'sin-pedido'
  if (now - req.createdAt >= HELP_VALID_MS) {
    cancelHelpRequest()
    return 'vencido'
  }
  if (token.code !== req.code) return 'otro-pedido'
  if (!(await signatureIsValid(token.code, token.sig, publicKey))) return 'no-valido'
  cancelHelpRequest()
  return 'ok'
}

/** Qué decirle al dueño cuando el link no sirvió */
export const SUPPORT_ERROR: Record<Exclude<SupportResult, 'ok'>, string> = {
  'sin-pedido':
    'Este link ya se usó o se abrió en otro equipo. Ábrelo en el mismo equipo donde pediste ayuda. Si tienes la caja instalada como aplicación, ábrela, toca «¿Olvidaste tu clave?» → «Pedir ayuda por WhatsApp» y pega ahí el mensaje que te mandamos.',
  vencido: 'Este link venció (dura 1 hora). Pide ayuda de nuevo desde «¿Olvidaste tu clave?».',
  'otro-pedido': 'Este link es de un código anterior. Pide que te manden el link del último código que enviaste.',
  'no-valido': 'Este link no es válido. Revisa que lo hayas copiado completo.',
}
