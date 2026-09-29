// Soporte a distancia: crea el link para que un cliente cree una clave nueva sin borrar nada.
//
//   npm run soporte -- 4821 9375     → firma el código que te mandó el cliente y copia el mensaje
//   npm run soporte -- llaves        → crea tus llaves (solo la primera vez) y deja la pública en .env
//
// Opciones: --local (link para http://localhost:5173), --sin-copiar (no tocar el portapapeles),
//           --nueva (con "llaves": reemplaza las llaves; hay que volver a publicar la app),
//           --sin-env (con "llaves": no escribir en .env; lo usan los tests).
//
// La llave PRIVADA queda en tu carpeta de usuario, fuera del proyecto: nunca se sube a GitHub.
// Guárdala también en un pendrive. Si la pierdes: `npm run soporte -- llaves --nueva` y `npm run deploy`.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const PREFIX = 'caja-minimarket:soporte:v1:nueva-clave:' // igual que SUPPORT_PREFIX en src/lib/support.ts
const KEY_FILE = process.env.MM_SOPORTE_LLAVE || join(homedir(), '.caja-minimarket', 'llave-soporte-privada.json')
const ENV_FILE = '.env'
const ALGO = { name: 'ECDSA', namedCurve: 'P-256' }

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const words = args.filter((a) => !a.startsWith('--'))
const appUrl = flags.has('--local') ? 'http://localhost:5173/' : process.env.MM_APP_URL || 'https://mmedinacode.github.io/Minimarket-POS/'

function fail(msg) {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}

function readEnvKey() {
  if (!existsSync(ENV_FILE)) return null
  const m = readFileSync(ENV_FILE, 'utf8').match(/^VITE_SUPPORT_PUBLIC_KEY=(.*)$/m)
  return m ? m[1].trim() : null
}

/** Escribe (o reemplaza) VITE_SUPPORT_PUBLIC_KEY en .env sin tocar lo demás */
function writeEnvKey(publicKey) {
  const line = `VITE_SUPPORT_PUBLIC_KEY=${publicKey}`
  const text = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : ''
  const next = /^VITE_SUPPORT_PUBLIC_KEY=.*$/m.test(text)
    ? text.replace(/^VITE_SUPPORT_PUBLIC_KEY=.*$/m, line)
    : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${line}\n`
  writeFileSync(ENV_FILE, next)
}

function copyToClipboard(text) {
  if (process.platform !== 'win32') return false
  // clip.exe entiende UTF-16 con BOM (así no se rompen los tildes)
  const input = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])
  return spawnSync('clip', { input }).status === 0
}

async function createKeys() {
  if (existsSync(KEY_FILE) && !flags.has('--nueva')) {
    const { publica } = JSON.parse(readFileSync(KEY_FILE, 'utf8'))
    if (!flags.has('--sin-env')) writeEnvKey(publica)
    console.log(`\nYa tienes llaves de soporte (${KEY_FILE}).`)
    console.log(flags.has('--sin-env') ? '' : 'Dejé la llave pública en .env. Publica con: npm run deploy\n')
    return
  }
  const pair = await crypto.subtle.generateKey(ALGO, true, ['sign', 'verify'])
  const privada = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const publica = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url')
  mkdirSync(dirname(KEY_FILE), { recursive: true })
  writeFileSync(KEY_FILE, JSON.stringify({ creada: new Date().toISOString(), publica, privada }, null, 2), { mode: 0o600 })
  if (!flags.has('--sin-env')) writeEnvKey(publica)
  console.log(`\n✓ Llaves creadas.`)
  console.log(`  Privada (NO la compartas, respáldala en un pendrive): ${KEY_FILE}`)
  if (!flags.has('--sin-env')) console.log('  Pública: guardada en .env. Publica la app con: npm run deploy\n')
}

async function signCode() {
  const text = words.join(' ')
  const m = text.match(/(?<!\d)(\d{4})[\s.-]?(\d{4})(?!\d)/)
  if (!m) fail('Escribe el código de 8 números que te mandó el cliente. Ej: npm run soporte -- 4821 9375')
  const code = m[1] + m[2]
  if (!existsSync(KEY_FILE)) fail('Todavía no tienes llaves. Créalas con: npm run soporte -- llaves')

  const { publica, privada } = JSON.parse(readFileSync(KEY_FILE, 'utf8'))
  const envKey = readEnvKey()
  if (envKey && envKey !== publica && !flags.has('--sin-env')) {
    console.warn('\n⚠ La llave pública de .env no es la de tus llaves: los links no van a funcionar hasta que corras')
    console.warn('  "npm run soporte -- llaves" y "npm run deploy".')
  }

  const key = await crypto.subtle.importKey('jwk', privada, ALGO, false, ['sign'])
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(PREFIX + code))
  const link = `${appUrl}#/soporte?r=${code}.${Buffer.from(sig).toString('base64url')}`
  const message = `Hola, toca este link desde el mismo equipo para crear tu clave nueva (sirve una sola vez y dura 1 hora):\n${link}`

  console.log(`\nCódigo ${m[1]} ${m[2]} firmado. Mensaje para el cliente:\n\n${message}\n`)
  if (!flags.has('--sin-copiar') && copyToClipboard(message)) console.log('✓ Ya quedó copiado: pégalo en el WhatsApp del cliente.')
  console.log('Antes de mandarlo, confirma que te escribe el dueño desde su número de siempre.\n')
}

if (words[0] === 'llaves') await createKeys()
else await signCode()
