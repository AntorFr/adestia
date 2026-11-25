import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// AD-43 / P-22: page-author teaches « a folder with its attachments » and never shows an
// INDEX.md (or x/x.md) as a way to dress a folder.
const skill = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'skills', 'page-author', 'SKILL.md'),
  'utf8',
)
const lines = skill.split('\n')

describe('page-author skill · a folder with its attachments', () => {
  it('carries the rule: text page, files in the folder, settings by folder_settings in .folder.md', () => {
    expect(skill).toContain('## A folder with its attachments')
    expect(skill).toContain('folder_settings')
    expect(skill).toContain('.folder.md')
    expect(skill).toContain('GET /api/files?folder=')
  })

  it('names INDEX.md only to forbid it', () => {
    const hits = lines.flatMap((l, i) => (l.includes('INDEX.md') ? [i] : []))
    expect(hits.length).toBeGreaterThan(0)
    for (const i of hits) {
      expect(lines.slice(Math.max(0, i - 1), i + 2).join(' ')).toMatch(/Never create/)
    }
  })

  it('does not show a homonymous page (x/x.md) as a dressing, nor a front-matter index example', () => {
    const forbidden = lines.findIndex((l) => l.includes('named after its folder'))
    expect(forbidden).toBeGreaterThan(-1)
    expect(skill).not.toMatch(/<!-- [^>]*INDEX\.md/)
    expect(skill).not.toMatch(/either works/)
    expect(skill).not.toMatch(/index page of each\s+direct sub-folder/)
  })
})
