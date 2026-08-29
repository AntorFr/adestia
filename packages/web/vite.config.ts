import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * The specifiers the page's import map publishes.
 *
 * They are EXTERNAL to the shell's bundle, and that is the whole contract, not
 * an optimisation. Bundling React into the shell while plugins resolve it
 * through the import map gives two React copies in one page: the plugin's
 * hooks then read a null dispatcher and every plugin view dies with "Cannot
 * read properties of null (reading 'useState')".
 *
 * Spike 2 proved one shared instance in a page where the SHELL also went
 * through the map. This is what makes the production shell behave the same.
 */
const SHARED = ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']

export default defineConfig({
  build: {
    outDir: 'dist-web',
    emptyOutDir: true,
    rollupOptions: { external: SHARED },
  },
  server: {
    // Dev runs the shell on Vite and the API on Demeura; one origin keeps
    // cookies and same-origin plugin imports behaving as in production.
    //
    // The manifest and the icons are proxied for the same reason they are
    // served rather than bundled: the server GENERATES them from the active
    // skin. Without this, the one thing dev cannot show is what the instance
    // will look like once installed.
    proxy: {
      '/api': 'http://127.0.0.1:8730',
      '/plugins': 'http://127.0.0.1:8730',
      '/manifest.webmanifest': 'http://127.0.0.1:8730',
    },
  },
})
