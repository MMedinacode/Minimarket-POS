import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// Las páginas se cargan con React.lazy, así que Recharts, SheetJS y el
// escáner de cámara quedan en archivos separados y solo se descargan al usarlos.
export default defineConfig({
  // Rutas relativas: el mismo build funciona en Netlify (raíz) y en
  // GitHub Pages (subcarpeta /Minimarket-POS/)
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    // Service worker: guarda la app en el dispositivo para que abra sin internet.
    // 'prompt' = avisa cuando hay versión nueva en vez de recargar a mitad de una venta.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: false, // se usa public/manifest.webmanifest
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,webmanifest,xlsx}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { host: true },
  build: {
    chunkSizeWarningLimit: 900,
  },
})
