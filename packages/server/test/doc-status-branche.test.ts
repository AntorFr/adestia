import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// B-5 — .agent/status.md says the state: one working branch, not two contradictory lines.
const lines = readFileSync(
  fileURLToPath(new URL('../../../.agent/status.md', import.meta.url)),
  'utf8',
).split('\n')
const numbered = lines.map((text, i) => ({ n: i + 1, text }))

describe('B-5 — status.md names one working branch', () => {
  it('has exactly one "Branche de travail" list item', () => {
    const found = numbered.filter((l) => /^\s*-\s*Branche de travail\s*:/.test(l.text))
    expect(found.map((l) => l.n)).toHaveLength(1)
  })

  it('mentions "Branche de travail :" nowhere else', () => {
    const stray = numbered.filter(
      (l) => /Branche de travail\s*:/.test(l.text) && !/^\s*-\s*Branche de travail\s*:/.test(l.text),
    )
    expect(stray.map((l) => l.n)).toEqual([])
  })
})
