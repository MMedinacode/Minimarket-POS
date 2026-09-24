import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// Las páginas se cargan con React.lazy, así que Recharts, SheetJS y el
// escáner de cámara quedan en archivos separados y solo se descargan al usarlos.
export default defineConfig({
  // Rutas relativas: el mismo build funciona en Netlify (raíz) y en
  // GitHub Pages (subcarpeta /Minimarket-POS/)
  base: './',
  plugins: [react(), tailwindcss()],
  server: { host: true },
  build: {
    chunkSizeWarningLimit: 900,
  },
})
