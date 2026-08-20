import { defineConfig } from 'vitest/config'

// One runner for the whole workspace. Tests live next to the package they
// cover (packages/<name>/test), including the conformance suites promoted
// from spikes/ — those are gates, not experiments: a markdown, editor or
// driver dependency bump must re-run them.
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
  },
})
