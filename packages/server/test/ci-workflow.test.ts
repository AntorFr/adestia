import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  fileURLToPath(new URL('../../../.github/workflows/ci.yml', import.meta.url)),
  'utf8',
)

describe('CI workflow', () => {
  it('plays the documentation and bench-once guards', () => {
    expect(workflow).toMatch(
      /run:\s*node --test bench\/tests\/doc-besoin\.test\.mjs bench\/tests\/bench-once\.test\.mjs\s*$/m,
    )
  })
})
