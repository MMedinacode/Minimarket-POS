import { createHash } from 'node:crypto'
import { loadEnv, type Plugin } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Política de seguridad (CSP) en el index.html publicado: la página solo ejecuta su propio
 * código y solo se conecta consigo misma y con Supabase. Si alguien lograra meter un script,
 * el navegador lo bloquea. Solo al compilar (en desarrollo Vite usa scripts que no calzan).
 * Va como <meta> porque GitHub Pages no permite poner cabeceras.
 */
function cspPlugin(supabaseUrl: string | undefined): Plugin {
  let supabase = ''
  if (supabaseUrl) {
    const host = new URL(supabaseUrl).host
    supabase = ` https://${host} wss://${host}`
  }
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // El script del tema va escrito en el index.html: se permite solo ese, por su huella
        const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
          (m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`,
        )
        const csp = [
          "default-src 'self'",
          `script-src 'self' ${hashes.join(' ')}`,
          "style-src 'self' 'unsafe-inline'", // los gráficos y el escáner ponen estilos en línea
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          `connect-src 'self'${supabase}`,
          "media-src 'self' blob:",
          "worker-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; ')
        return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`)
      },
    },
  }
}

// https://vite.dev/config/
// Las páginas se cargan con React.lazy, así que Recharts, SheetJS y el
// escáner de cámara quedan en archivos separados y solo se descargan al usarlos.
export default defineConfig(({ mode }) => ({
  // Rutas relativas: el mismo build funciona en Netlify (raíz) y en
  // GitHub Pages (subcarpeta /Minimarket-POS/)
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    cspPlugin(loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL?.trim()),
    // Service worker: guarda la app en el dispositivo para que abra sin internet.
    // 'prompt' = avisa cuando hay versión nueva en vez de recargar a mitad de una venta.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: false, // se usa public/manifest.webmanifest
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,xlsx}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  // PORT lo asigna el panel de vista previa si 5173 está ocupado
  server: { host: true, port: Number(process.env.PORT) || 5173 },
  // vitest no debe tomar las pruebas de punta a punta (e2e/, las corre Playwright)
  test: { exclude: [...configDefaults.exclude, 'e2e/**'] },
  build: {
    chunkSizeWarningLimit: 900,
  },
}))
