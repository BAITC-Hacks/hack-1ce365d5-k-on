import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'DJANGO_')
  const proxy = {
    '/api': {
      target: process.env.DJANGO_API_TARGET || env.DJANGO_API_TARGET || 'http://127.0.0.1:8000',
      // Preserve the browser Host/Origin pair for Django's CSRF validation.
      changeOrigin: false,
    },
  }
  return {
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
  }
})
