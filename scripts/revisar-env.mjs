// Revisa el .env antes de publicar (lo usan los dos comandos de deploy).
// 1. DETIENE la publicación si hay una llave secreta de Supabase: todo lo que empieza con VITE_
//    queda dentro de la app, a la vista de cualquiera.
// 2. Avisa si falta la ayuda por WhatsApp (el .env no se sube a GitHub: si se pierde, la app se
//    publicaría sin ese botón y nadie se daría cuenta).
import { existsSync, readFileSync } from 'node:fs'

// Los mismos archivos que lee Vite al compilar para producción
const FILES = ['.env', '.env.local', '.env.production', '.env.production.local']

function readEnv() {
  const vars = []
  for (const file of FILES) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(VITE_\w+)\s*=\s*(.*)$/)
      if (m) vars.push({ file, name: m[1], value: m[2].trim().replace(/^["']|["']$/g, '') })
    }
  }
  return vars
}

/** ¿Es una llave secreta de Supabase? (formato nuevo sb_secret_… o JWT antiguo con role service_role) */
function isSecretKey(value) {
  if (value.startsWith('sb_secret_')) return true
  const parts = value.split('.')
  if (parts.length !== 3) return false
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return payload?.role === 'service_role'
  } catch {
    return false
  }
}

export function checkEnvBeforeDeploy() {
  const vars = readEnv()
  const secret = vars.find((v) => isSecretKey(v.value))
  if (secret) {
    console.error(`\n✗ ${secret.name} (en ${secret.file}) tiene una llave SECRETA de Supabase.`)
    console.error('  Quedaría pública dentro de la app. Usa la "Publishable key" (sb_publishable_…). No se publicó nada.\n')
    process.exit(1)
  }
  const has = (name, re) => vars.some((v) => v.name === name && re.test(v.value))
  if (!has('VITE_SUPPORT_WHATSAPP', /^\d+$/) || !has('VITE_SUPPORT_PUBLIC_KEY', /\S/)) {
    console.warn('\n⚠ Sin VITE_SUPPORT_WHATSAPP o VITE_SUPPORT_PUBLIC_KEY en .env: la app se publica SIN "Pedir ayuda por WhatsApp".\n')
  }
}
