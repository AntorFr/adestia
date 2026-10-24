import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const design = readFileSync(fileURLToPath(new URL('../../../DESIGN.md', import.meta.url)), 'utf8')
const log = design.slice(design.indexOf('\n## Decision log'))

describe('DESIGN.md', () => {
  it('keeps the decision log oldest first', () => {
    const dates = [...log.matchAll(/^\*\*(20[0-9-]+)/gm)].map((m) => m[1])
    expect(dates.length).toBeGreaterThan(30)
    expect(dates).toEqual([...dates].sort())
  })

  it('carries no delivery state outside the dated log', () => {
    const head = design.slice(0, design.indexOf('\n## Decision log'))
    expect(head).not.toMatch(/not built/i)
    expect(head).not.toMatch(/^## Spikes \(validation record\)/m)
    expect(head).not.toMatch(/implemented unless marked/i)
  })
})
