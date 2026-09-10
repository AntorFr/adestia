/**
 * One frontmatter field, changed without disturbing its neighbours.
 *
 * The editor writes the title through this rather than around it: a second
 * writer on the same file is a 409 on somebody's unsaved paragraph, and the
 * one who loses is the one who typed most.
 */

import { describe, expect, it } from 'vitest'

import { readField, writeField } from '../src/editor/frontmatter.js'

const page = '---\ntype: entree\ndate: 2026-09-08T17:30\ntitle: Ancien\n---\n\nLe corps.\n'

describe('a frontmatter field', () => {
  it('is read back, quotes stripped', () => {
    expect(readField(page, 'title')).toBe('Ancien')
    expect(readField('---\ntitle: "Cité"\n---\n', 'title')).toBe('Cité')
  })

  it('answers empty for a page that has none, rather than throwing', () => {
    expect(readField('Pas de frontmatter.\n', 'title')).toBe('')
    expect(readField(page, 'nowhere')).toBe('')
  })

  it('is rewritten in place, leaving its neighbours alone', () => {
    const next = writeField(page, 'title', 'Nouveau')
    expect(next).toMatch(/^title: Nouveau$/m)
    expect(next).toMatch(/^type: entree$/m)
    expect(next).toMatch(/^date: 2026-09-08T17:30$/m)
    expect(next).toMatch(/Le corps\./)
  })

  it('is added when it was never there', () => {
    const untitled = '---\ntype: entree\n---\n\nLe corps.\n'
    expect(writeField(untitled, 'title', 'Enfin')).toMatch(/^title: Enfin$/m)
  })

  it('is REMOVED when emptied, never blanked', () => {
    // `title: ""` prints as an empty heading wherever something draws it.
    expect(writeField(page, 'title', '   ')).not.toMatch(/^title:/m)
    expect(writeField(page, 'title', '   ')).toMatch(/^type: entree$/m)
  })

  it('gives a page with no frontmatter one, because that is the naming case', () => {
    const bare = '# Un titre\n\nDu texte.\n'
    const named = writeField(bare, 'title', 'Le gabarit')
    expect(named.startsWith('---\ntitle: Le gabarit\n---\n')).toBe(true)
    expect(named).toMatch(/Du texte\./)
    // And emptying a page that has none changes nothing at all.
    expect(writeField(bare, 'title', '')).toBe(bare)
  })
})

describe('composition, the way the editor does it every render', () => {
  it('replaces the title it already has instead of adding a second one', () => {
    const entry = '---\ntype: entree\ndate: 2026-09-10T09:02\ntitle: Le gabarit\n---\n\nLe corps.\n'
    const once = writeField(entry, 'title', readField(entry, 'title'))
    expect(once.match(/^title:/gm)).toHaveLength(1)
    const twice = writeField(once, 'title', 'Le gabarit de queues droites')
    expect(twice.match(/^title:/gm)).toHaveLength(1)
  })

  it('survives a title carrying regex and replacement punctuation', () => {
    const entry = '---\ntype: entree\ntitle: Avant\n---\n\nLe corps.\n'
    const odd = writeField(entry, 'title', 'Coût $& (a+b) [x]')
    expect(odd).toMatch(/^title: Coût \$& \(a\+b\) \[x\]$/m)
    expect(odd.match(/^title:/gm)).toHaveLength(1)
  })
})
