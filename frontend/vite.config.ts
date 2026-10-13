import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, createLogger } from 'vite'

// The /ws radar socket is proxied to the backend. Every browser reload,
// HMR update, StrictMode remount or backend --reload restart aborts that
// socket mid-flight and vite logs `ws proxy socket error: ECONNABORTED`.
// Those aborts are routine dev lifecycle (the app reconnects by itself),
// so filter exactly this benign noise and keep every other error visible.
const logger = createLogger()
const wsProxyNoise = /ws proxy (socket )?error/i
const benignAbort = /ECONNABORTED|ECONNRESET|EPIPE|ETIMEDOUT/
const origLoggerError = logger.error.bind(logger)
logger.error = ((msg: string, options?: object) => {
  if (typeof msg === 'string' && wsProxyNoise.test(msg) && benignAbort.test(msg)) return
  origLoggerError(msg, options as never)
}) as typeof logger.error

// https://vite.dev/config/
export default defineConfig({
  customLogger: logger,
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

