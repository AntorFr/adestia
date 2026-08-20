import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const pkg = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url))

// One runner for the whole workspace. Tests live next to the package they
// cover (packages/<name>/test), including the conformance suites promoted
// from spikes/ — those are gates, not experiments: a markdown, editor or
// driver dependency bump must re-run them.
export default defineConfig({
  // No React plugin here: vitest's esbuild handles JSX from the tsconfig's
  // `jsx: react-jsx`, and Fast Refresh has no meaning in a test run. One less
  // dependency to keep in step with vite's major versions.
  esbuild: { jsx: 'automatic' },
  // Packages ship built JS (`dist/`) so Node can run them, but the suites read
  // the TypeScript sources directly: otherwise every test run would depend on
  // a prior build, and a stale `dist/` would quietly test yesterday's code.
  resolve: {
    alias: {
      '@antorfr/golem-schemas': pkg('schemas'),
      '@antorfr/golem-content': pkg('content'),
      '@antorfr/golem-drivers': pkg('drivers'),
      '@antorfr/golem-server': pkg('server'),
      '@antorfr/golem-web': pkg('web'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}'],
    setupFiles: [fileURLToPath(new URL('./packages/web/test/setup.ts', import.meta.url))],
    // Node by default; the browser-facing suites opt into jsdom with a
    // per-file docblock, so a pure-logic test never pays for a fake DOM.
    environment: 'node',
  },
})
