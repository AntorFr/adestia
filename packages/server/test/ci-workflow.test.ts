import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const suite = readFileSync(
  fileURLToPath(new URL('../../../scripts/suite-attestee.sh', import.meta.url)),
  'utf8',
)

describe('attested suite script', () => {
  it('plays the documentation and bench-once guards', () => {
    expect(suite).toMatch(
      /^step guards\s+node --test\b.*bench\/tests\/doc-besoin\.test\.mjs bench\/tests\/bench-once\.test\.mjs\s*$/m,
    )
  })
})
