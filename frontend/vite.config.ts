import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // MapLibre loads its worker via `new URL('./maplibre-gl-worker.mjs', import.meta.url)`.
    // Pre-bundling breaks that relative URL (504 on .vite/deps/maplibre-gl-worker.mjs),
    // which kills ALL GeoJSON sources (borders, trajectories). Keep it unbundled.
    exclude: ['maplibre-gl'],
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
      },
    },
  },
})

