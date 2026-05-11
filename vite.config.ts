import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Web served on :5173 (Vite default).
// Hono server runs on :8787 (see src/index.ts).
// `pnpm dev` runs both concurrently. Open http://localhost:5173.
export default defineConfig({
  root: 'web',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        // SSE keeps the connection open; no buffering, no timeout.
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-store'
          })
        },
      },
    },
  },
  build: {
    outDir: '../web-dist',
    emptyOutDir: true,
  },
})
