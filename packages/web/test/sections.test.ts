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
  it('makes a section of every folder that holds pages', () => {
    expect(sectionsOf(CORPUS).map((s) => s.path)).toEqual([
      'domaines/achats',
      'domaines/diy',
      'sujets',
      'todo',
    ])
  })

  it('surfaces a folder that declares NOTHING, named from itself', () => {
    // Measured on a real corpus, the first rule — INDEX.md or nothing — hid
    // twelve folders. Hiding content is a worse failure than labelling it
    // imperfectly: declared beats guessed, guessed beats gone.
    const todo = sectionsOf(CORPUS).find((s) => s.path === 'todo')
    expect(todo?.title).toBe('Todo')
    expect(todo?.count).toBe(1)
  })

  it('is not fooled by a grouping folder that holds no page itself', () => {
    // `domaines/` contains only other folders; its children are the sections.
    expect(sectionsOf(CORPUS).some((s) => s.path === 'domaines')).toBe(false)
  })

  it('reads the sibling shell’s "space": a folder beside a page of its name', () => {
    // `dietetique/dietetique.md` — seven of them in the corpus, all invisible
    // until this. The homonymous page dresses the section AND is not listed
    // among its contents.
    const corpus = [
      entry('sante/INDEX.md', { title: 'Santé' }),
      entry('sante/dietetique/dietetique.md', { title: 'Diététique', ico: '🥗' }),
      entry('sante/dietetique/menus.md'),
    ]
    const rooms = subsectionsOf(corpus, 'sante')
    expect(rooms.map((r) => r.path)).toEqual(['sante/dietetique'])
    expect(rooms[0]).toMatchObject({ title: 'Diététique', icon: '🥗', count: 1 })
    expect(pagesIn(corpus, 'sante/dietetique').map((e) => e.path)).toEqual([
      'sante/dietetique/menus.md',
    ])
  })

  it('lets an app absorb the folder its tile already stands for', () => {
    // The todo app's tile IS the todo store: a section beside it would be the
    // same thing said twice.
    expect(sectionsOf(CORPUS, ['todo']).some((s) => s.path === 'todo')).toBe(false)
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

  it('names a folder that declares nothing, from itself', () => {
    expect(sectionAt(CORPUS, 'todo')?.title).toBe('Todo')
  })

  it('knows nothing of a folder that holds nothing', () => {
    expect(sectionAt(CORPUS, 'nowhere')).toBeUndefined()
  })
})
