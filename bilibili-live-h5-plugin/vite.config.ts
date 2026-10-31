import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const BACKEND = 'http://127.0.0.1:8787'

const embedHeaders = {
  // Allow embedding in Bilibili live play console; do NOT set X-Frame-Options DENY
  'Content-Security-Policy':
    "frame-ancestors https://play-live.bilibili.com https://*.bilibili.com 'self'",
  'X-Frame-Options': 'ALLOW-FROM https://play-live.bilibili.com/',
}

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    port: 5173,
    headers: embedHeaders,
    proxy: {
      '/api': {
        target: BACKEND,
        changeOrigin: true,
      },
      '/ws': {
        target: BACKEND,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    host: true,
    port: 4173,
    headers: embedHeaders,
  },
})
