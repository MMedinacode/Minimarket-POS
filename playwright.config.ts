import { defineConfig } from '@playwright/test'

// Puerto fijo y distinto de 5173 (ese suele estar ocupado por otro proyecto)
const PORT = 5199
const URL = `http://localhost:${PORT}`

// npm run test:e2e:build: prueba la versión compilada, igual a la publicada (con su política de
// seguridad y service worker), en vez del servidor de desarrollo. Se compila en .e2e-dist/ para
// no pisar dist/ (esa compilación va sin Supabase).
const BUILD = process.env.npm_lifecycle_event === 'test:e2e:build' || process.env.E2E_BUILD === '1'

// Pruebas de punta a punta: abren la caja en un navegador de verdad y la usan como un cliente.
// Usan el Microsoft Edge que ya viene con Windows (no se descarga ningún navegador).
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: URL,
    channel: 'msedge',
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: BUILD
      ? `npx vite build --outDir .e2e-dist && npx vite preview --outDir .e2e-dist --port ${PORT} --strictPort`
      : 'npm run dev',
    url: URL,
    reuseExistingServer: false,
    timeout: BUILD ? 180_000 : 60_000,
    env: {
      PORT: String(PORT),
      // Sin nube ni WhatsApp: las pruebas siempre corren en modo local, sin red externa
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_PUBLISHABLE_KEY: '',
      VITE_SUPPORT_WHATSAPP: '',
      VITE_SUPPORT_PUBLIC_KEY: '',
    },
  },
})
