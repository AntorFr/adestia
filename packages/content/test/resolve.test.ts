/**
 * Resolution, rung by rung.
 *
 * The case that matters most is the LAST one: today a reference that finds
 * nothing erases its row, because `todo` resolves with `.filter(Boolean)`.
 * Every test here exists so that failure has a name instead of a silence.
 */

import { describe, expect, it } from 'vitest'

import { resolveReference, type Indexed } from '../src/resolve.js'

const PAGE = '01M1RXBTP8F57X5BY4N196XV1T'
const OTHER = '01M1RXC2QK8N4TZ7WV3H0DJ5EA'

const page = (path: string, type: string, id: string, store?: string): Indexed => ({
  path,
  fields: { type, id },
  ...(store !== undefined ? { store } : {}),
})

const CORPUS = [
  page('domaines/voyages/baden-2026/vannes-a-pied.md', 'fiche', PAGE),
  page('taches/poncer-porte.md', 'tache', OTHER),
]

describe('rung 1 — the type and the id are both stated', () => {
  it('goes straight to the page', () => {
    const found = resolveReference(CORPUS, `fiche#${PAGE}`)
    expect(found).toMatchObject({ kind: 'found', byIdAlone: false })
    expect(found.kind === 'found' && found.page.path).toBe(
      'domaines/voyages/baden-2026/vannes-a-pied.md',
    )
  })

  it('follows the page after a move — the whole point', () => {
    // Same id, another folder. A path-shaped reference would have died here.
    const moved = [page('domaines/voyages/archives/vannes-a-pied.md', 'fiche', PAGE)]
    expect(resolveReference(moved, `fiche#${PAGE}`)).toMatchObject({
      kind: 'found',
      page: { path: 'domaines/voyages/archives/vannes-a-pied.md' },
    })
  })
})

describe('rung 2 — only the id', () => {
  it('finds it across types, and SAYS it came that way', () => {
    expect(resolveReference(CORPUS, `#${PAGE}`)).toMatchObject({
      kind: 'found',
      byIdAlone: true,
    })
  })

  it('rescues a reference whose type drifted, rather than calling it lost', () => {
    // The page is there; the `type:` changed. Reporting it lost would break
    // every pointer at once for a rename nobody meant as a deletion.
    expect(resolveReference(CORPUS, `note#${PAGE}`)).toMatchObject({
      kind: 'found',
      byIdAlone: true,
    })
  })

  it('refuses to pick when two types share an id', () => {
    // Legitimate: an id is unique WITHIN its type. The reference simply did
    // not say enough, and choosing for it is how one corrects the wrong page.
    const twins = [page('a.md', 'fiche', PAGE), page('b.md', 'tache', PAGE)]
    const answer = resolveReference(twins, `#${PAGE}`)
    expect(answer.kind).toBe('ambiguous')
    expect(answer.kind === 'ambiguous' && answer.candidates).toHaveLength(2)
  })
})

describe('the same type and id twice — never settled in silence', () => {
  it('reports both when two stores carry the page', () => {
    // What a shared circle makes possible. The rule is the same in both
    // directions: a collision is surfaced, never resolved quietly.
    const shared = [page('voyages/vannes.md', 'fiche', PAGE, 'perso'),
                    page('voyages/vannes.md', 'fiche', PAGE, 'famille')]
    const answer = resolveReference(shared, `fiche#${PAGE}`)
    expect(answer.kind).toBe('ambiguous')
    expect(answer.kind === 'ambiguous' && answer.candidates.map((c) => c.store)).toEqual([
      'perso',
      'famille',
    ])
  })
})

describe('when nothing answers', () => {
  it('says LOST instead of returning nothing', () => {
    // The line this module exists to delete: `.filter(Boolean)` turns this
    // case into a row that vanishes. A visible gap gets repaired.
    expect(resolveReference(CORPUS, `fiche#01M1ZZZZZZZZZZZZZZZZZZZZZZ`)).toEqual({
      kind: 'lost',
    })
  })

  it('leaves a PATH alone — it has its own resolution', () => {
    expect(resolveReference(CORPUS, 'taches/poncer-porte')).toEqual({
      kind: 'not-a-reference',
    })
  })
})
