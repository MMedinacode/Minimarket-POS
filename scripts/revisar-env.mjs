// Revisa el .env antes de publicar. El .env no se sube a GitHub: si se pierde, la app se
// publicaría sin la ayuda por WhatsApp y nadie se daría cuenta.
import { existsSync, readFileSync } from 'node:fs'

export function warnMissingSupport() {
  const env = existsSync('.env') ? readFileSync('.env', 'utf8') : ''
  if (!/^VITE_SUPPORT_WHATSAPP=\d+/m.test(env) || !/^VITE_SUPPORT_PUBLIC_KEY=\S+/m.test(env)) {
    console.warn('\n⚠ Sin VITE_SUPPORT_WHATSAPP o VITE_SUPPORT_PUBLIC_KEY en .env: la app se publica SIN "Pedir ayuda por WhatsApp".\n')
  }
}
