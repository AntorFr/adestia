import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  build: { outDir: 'dist-web', emptyOutDir: true },
  server: {
    // Dev runs the shell on Vite and the API on Golem; one origin keeps
    // cookies and same-origin plugin imports behaving as in production.
    proxy: { '/api': 'http://127.0.0.1:8730', '/plugins': 'http://127.0.0.1:8730' },
  },
})
