import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Backend locale per elaborazione documenti
      '/api/documents': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/normattiva': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/legislation': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // WebSocket proxy
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
      // Webhook esterni
      '/api/legistra': {
        target: 'https://n8n.srv1103066.hstgr.cloud/webhook/legistra',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/legistra/, ''),
      },
      '/api/trascrizione': {
        target: 'https://n8n.srv1103066.hstgr.cloud/webhook/trascrizione',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/trascrizione/, ''),
      },
      '/api/storia': {
        target: 'https://n8n.srv1103066.hstgr.cloud/webhook/storia',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/storia/, ''),
      },
    },
  },
})
