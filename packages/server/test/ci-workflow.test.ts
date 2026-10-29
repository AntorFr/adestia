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

  it('checks out the full history with its tags: the version guard reads git tags', () => {
    const checkout = /uses:\s*actions\/checkout@[^\n]*\n((?:\s+with:\n(?:\s+[\w-]+:[^\n]*\n)+)?)/.exec(workflow)
    expect(checkout, 'checkout step').not.toBeNull()
    expect(checkout![1]).toMatch(/fetch-depth:\s*0\b|fetch-tags:\s*true\b/)
  })
})
