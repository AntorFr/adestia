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
  entry('achats/INDEX.md', { title: 'Achats', ico: '🛍️', couleur: 'turquoise' }),
  entry('achats/cnc.md'),
  entry('achats/bateau.md'),
  entry('diy/INDEX.md', { title: 'DIY', ico: '🪚' }),
  entry('diy/projets/INDEX.md', { title: 'Projets' }),
  entry('diy/projets/etabli.md'),
  entry('sujets/INDEX.md', { title: 'Sujets', ico: '💬' }),
  entry('sujets/armee.md'),
  entry('todo/taches.md'),
]

describe('sectionsOf', () => {
  it('makes a section of every first-level folder', () => {
    expect(sectionsOf(CORPUS).map((s) => s.path)).toEqual(['achats', 'diy', 'sujets', 'todo'])
  })

  it('surfaces a folder that declares NOTHING, named from itself', () => {
    // Measured on a real corpus, the first rule — INDEX.md or nothing — hid
    // twelve folders. Hiding content is a worse failure than labelling it
    // imperfectly: declared beats guessed, guessed beats gone.
    const todo = sectionsOf(CORPUS).find((s) => s.path === 'todo')
    expect(todo?.title).toBe('Todo')
    expect(todo?.count).toBe(1)
  })

  it('surfaces a folder that holds only OTHER FOLDERS', () => {
    // The reversal, and the failure it comes from: a shared circle carrying
    // `voyages/baden-2026/…` with no page directly in `voyages/`. The old rule
    // asked whether a folder held a page, so `voyages` did not exist and each
    // trip became a top-level tile — three loose cards where one domain
    // belonged. A folder holding folders is not empty.
    const circle = [
      entry('voyages/baden-2026/baden-2026.md'),
      entry('voyages/broceliande-2026/val-sans-retour.md'),
      entry('voyages/colo-ucpa-2026/colo-ucpa-2026.md'),
    ]
    expect(sectionsOf(circle).map((s) => s.path)).toEqual(['voyages'])
    // One, not three: `baden-2026/baden-2026.md` and `colo-ucpa-2026/…` are
    // homonymous, which makes them their folder's index rather than its
    // contents — so only `val-sans-retour` counts as a page held.
    expect(sectionsOf(circle)[0]?.count).toBe(1)
  })

  it('shows a grouping folder as itself, rather than guessing past it', () => {
    // The cost of the rule above, and it is deliberate. A corpus that keeps a
    // `domaines/` level gets one tile named for it — the honest answer, since
    // the folder is real. The fix is the corpus: a folder that only files
    // other folders belongs in the store's path, not in the tree.
    const grouped = [entry('domaines/achats/cnc.md'), entry('domaines/diy/etabli.md')]
    expect(sectionsOf(grouped).map((s) => s.path)).toEqual(['domaines'])
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

  it('absorbs a folder wherever the operator filed it', () => {
    // A plugin cannot know the layout it lands in. The trips app declares
    // `voyages`; the corpus here files them under `domaines/`, and on another
    // instance they sit at the top. One declaration has to cover both.
    const corpus = [
      { path: 'domaines/voyages/baden/notes.md', title: 'Notes', fields: {} },
      { path: 'voyages/corse/notes.md', title: 'Notes', fields: {} },
    ]
    expect(sectionsOf(corpus, ['voyages'])).toEqual([])
  })

  it('absorbs what is UNDER the folder, not only the folder', () => {
    // Each trip is a folder holding pages, so each became a section beside the
    // app's tile — the duplication the field exists to prevent, minus the one
    // folder it was aimed at.
    const corpus = [
      { path: 'voyages/baden/notes.md', title: 'Notes', fields: {} },
      { path: 'voyages/corse/assets/carnet.md', title: 'Carnet', fields: {} },
    ]
    expect(sectionsOf(corpus, ['voyages'])).toEqual([])
  })

  it('absorbs on a segment boundary, never on a prefix', () => {
    // `voyages` must not swallow somebody's `mes-voyages`, nor a `voyages-old`
    // they kept deliberately.
    const corpus = [
      { path: 'mes-voyages/notes.md', title: 'Notes', fields: {} },
      { path: 'voyages-old/notes.md', title: 'Notes', fields: {} },
    ]
    expect(sectionsOf(corpus, ['voyages']).map((s) => s.path).sort()).toEqual([
      'mes-voyages',
      'voyages-old',
    ])
  })

  it('keeps a sub-section out of the top level', () => {
    // `diy/projets` declares an index, but `diy` already owns it: surfacing
    // both would show the same pages twice.
    expect(sectionsOf(CORPUS).some((s) => s.path === 'diy/projets')).toBe(false)
  })

  it('dresses a tile from the declaration, field by field', () => {
    const achats = sectionsOf(CORPUS).find((s) => s.path === 'achats')
    expect(achats).toMatchObject({ title: 'Achats', icon: '🛍️', hue: 'turquoise' })
  })

  it('falls back per field rather than all at once', () => {
    // `diy` gives a title and an icon but no colour: it must keep both, not
    // lose them to an all-or-nothing rule.
    const diy = sectionsOf(CORPUS).find((s) => s.path === 'diy')
    expect(diy).toMatchObject({ title: 'DIY', icon: '🪚' })
    expect(diy?.hue).toBeUndefined()
  })

  it('counts what a section holds, index pages excluded', () => {
    const achats = sectionsOf(CORPUS).find((s) => s.path === 'achats')
    expect(achats?.count).toBe(2)
    // Everything below counts, not only the top level: a section's weight is
    // what it contains, however deep.
    const diy = sectionsOf(CORPUS).find((s) => s.path === 'diy')
    expect(diy?.count).toBe(1)
  })

  it('says nothing about an empty body of pages', () => {
    expect(sectionsOf([])).toEqual([])
  })
})

describe('pagesIn', () => {
  it('returns the pages a section holds directly', () => {
    expect(pagesIn(CORPUS, 'achats').map((e) => e.path)).toEqual([
      'achats/cnc.md',
      'achats/bateau.md',
    ])
  })

  it('does not reach into sub-folders, nor list the index page', () => {
    expect(pagesIn(CORPUS, 'diy')).toEqual([])
  })
})

describe('subsectionsOf', () => {
  it('finds the rooms inside a section, with their full paths', () => {
    expect(subsectionsOf(CORPUS, 'diy').map((s) => s.path)).toEqual([
      'diy/projets',
    ])
  })

  it('finds none where a section has no rooms', () => {
    expect(subsectionsOf(CORPUS, 'achats')).toEqual([])
  })
})

describe('sectionAt', () => {
  it('names a section at any depth', () => {
    // The screen that opens a room asks this: `sectionsOf` only knows the top
    // level, and printing `domaines/diy/projets` at a reader whose page says
    // "Projets" is the shell admitting it never read the declaration.
    expect(sectionAt(CORPUS, 'diy/projets')?.title).toBe('Projets')
    expect(sectionAt(CORPUS, 'achats')?.title).toBe('Achats')
  })

  it('names a folder that declares nothing, from itself', () => {
    expect(sectionAt(CORPUS, 'todo')?.title).toBe('Todo')
  })

  it('knows nothing of a folder that holds nothing', () => {
    expect(sectionAt(CORPUS, 'nowhere')).toBeUndefined()
  })
})
