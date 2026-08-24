import { describe, expect, it } from 'vitest'

import {
  pagesIn,
  sectionAt,
  sectionsOf,
  subsectionsOf,
  type IndexEntry,
} from '../src/app/sections.js'

const entry = (path: string, fields: Record<string, unknown> = {}): IndexEntry => ({
  path,
  title: path.replace(/\.md$/, '').split('/').pop() ?? path,
  fields,
})

/** Shaped like the real corpus this was built against. */
const CORPUS: IndexEntry[] = [
  entry('domaines/achats/INDEX.md', { title: 'Achats', ico: '🛍️', couleur: 'turquoise' }),
  entry('domaines/achats/cnc.md'),
  entry('domaines/achats/bateau.md'),
  entry('domaines/diy/INDEX.md', { title: 'DIY', ico: '🪚' }),
  entry('domaines/diy/projets/INDEX.md', { title: 'Projets' }),
  entry('domaines/diy/projets/etabli.md'),
  entry('sujets/INDEX.md', { title: 'Sujets', ico: '💬' }),
  entry('sujets/armee.md'),
  entry('todo/taches.md'),
]

describe('sectionsOf', () => {
  it('makes a section of every folder that declares one', () => {
    expect(sectionsOf(CORPUS).map((s) => s.path)).toEqual([
      'domaines/achats',
      'domaines/diy',
      'sujets',
    ])
  })

  it('leaves a folder with no index page alone', () => {
    // `todo/` holds pages but declares nothing, and `domaines/` is a grouping
    // folder nobody wrote a page for. Inventing tiles from folder names is how
    // a product ends up shouting `todo` at someone who named nothing.
    expect(sectionsOf(CORPUS).some((s) => s.path === 'todo')).toBe(false)
    expect(sectionsOf(CORPUS).some((s) => s.path === 'domaines')).toBe(false)
  })

  it('keeps a sub-section out of the top level', () => {
    // `domaines/diy/projets` declares an index, but `domaines/diy` already
    // owns it: surfacing both would show the same pages twice.
    expect(sectionsOf(CORPUS).some((s) => s.path === 'domaines/diy/projets')).toBe(false)
  })

  it('dresses a tile from the declaration, field by field', () => {
    const achats = sectionsOf(CORPUS).find((s) => s.path === 'domaines/achats')
    expect(achats).toMatchObject({ title: 'Achats', icon: '🛍️', hue: 'turquoise' })
  })

  it('falls back per field rather than all at once', () => {
    // `diy` gives a title and an icon but no colour: it must keep both, not
    // lose them to an all-or-nothing rule.
    const diy = sectionsOf(CORPUS).find((s) => s.path === 'domaines/diy')
    expect(diy).toMatchObject({ title: 'DIY', icon: '🪚' })
    expect(diy?.hue).toBeUndefined()
  })

  it('counts what a section holds, index pages excluded', () => {
    const achats = sectionsOf(CORPUS).find((s) => s.path === 'domaines/achats')
    expect(achats?.count).toBe(2)
    // Everything below counts, not only the top level: a section's weight is
    // what it contains, however deep.
    const diy = sectionsOf(CORPUS).find((s) => s.path === 'domaines/diy')
    expect(diy?.count).toBe(1)
  })

  it('says nothing about an empty body of pages', () => {
    expect(sectionsOf([])).toEqual([])
  })
})

describe('pagesIn', () => {
  it('returns the pages a section holds directly', () => {
    expect(pagesIn(CORPUS, 'domaines/achats').map((e) => e.path)).toEqual([
      'domaines/achats/cnc.md',
      'domaines/achats/bateau.md',
    ])
  })

  it('does not reach into sub-folders, nor list the index page', () => {
    expect(pagesIn(CORPUS, 'domaines/diy')).toEqual([])
  })
})

describe('subsectionsOf', () => {
  it('finds the rooms inside a section, with their full paths', () => {
    expect(subsectionsOf(CORPUS, 'domaines/diy').map((s) => s.path)).toEqual([
      'domaines/diy/projets',
    ])
  })

  it('finds none where a section has no rooms', () => {
    expect(subsectionsOf(CORPUS, 'domaines/achats')).toEqual([])
  })
})

describe('sectionAt', () => {
  it('names a section at any depth', () => {
    // The screen that opens a room asks this: `sectionsOf` only knows the top
    // level, and printing `domaines/diy/projets` at a reader whose page says
    // "Projets" is the shell admitting it never read the declaration.
    expect(sectionAt(CORPUS, 'domaines/diy/projets')?.title).toBe('Projets')
    expect(sectionAt(CORPUS, 'domaines/achats')?.title).toBe('Achats')
  })

  it('knows nothing of a folder that declares nothing', () => {
    expect(sectionAt(CORPUS, 'todo')).toBeUndefined()
  })
})
