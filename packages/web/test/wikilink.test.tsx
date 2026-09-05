// @vitest-environment jsdom
/**
 * A reference, drawn.
 *
 * What these guard is the failure the whole scheme exists to end: a link whose
 * page moved used to vanish, because `todo` resolved with `.filter(Boolean)`
 * and a missing row is simply absent. Here a reference that leads nowhere
 * KEEPS ITS LABEL and stops being clickable — a gap nobody sees is a gap
 * nobody repairs.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Reader } from '../src/editor/Reader.js'

const ID = '01M1RXBTP8F57X5BY4N196XV1T'

const PAGES = [
  { path: 'domaines/voyages/archives/vannes-a-pied.md', fields: { type: 'fiche', id: ID } },
]

describe('a reference that resolves', () => {
  it('opens the page WHEREVER it now lives', () => {
    // The file moved into `archives/`. A path-shaped link would have died; the
    // reference points at an id, so it follows.
    const openPage = vi.fn()
    render(
      <Reader
        markdown={`Voir [[fiche#${ID}:la boucle]] pour le detail.`}
        pages={PAGES}
        openPage={openPage}
      />,
    )
    screen.getByRole('button', { name: 'la boucle' }).click()
    expect(openPage).toHaveBeenCalledWith('domaines/voyages/archives/vannes-a-pied.md')
  })
})

describe('a reference that leads nowhere', () => {
  it('keeps its label and stops being clickable', () => {
    render(<Reader markdown="Voir [[fiche#01M1ZZZZZZZZZZZZZZZZZZZZZZ:la boucle]]." pages={PAGES} />)
    expect(screen.queryByRole('button', { name: 'la boucle' })).toBeNull()
    expect(screen.getByText('la boucle').className).toContain('adestia-wikilink--lost')
  })

  it('says the same thing when several pages answer', () => {
    // Two types may share an id — it is unique WITHIN a type — so this is a
    // reference that did not say enough, not a corrupt corpus. Choosing one
    // would be correcting a page while reading another.
    const twins = [
      { path: 'a.md', fields: { type: 'fiche', id: ID } },
      { path: 'b.md', fields: { type: 'tache', id: ID } },
    ]
    render(<Reader markdown={`Voir [[#${ID}:la boucle]].`} pages={twins} />)
    expect(screen.getByText('la boucle').className).toContain('adestia-wikilink--lost')
  })
})

describe('what is NOT a dead link', () => {
  it('leaves a path-shaped wikilink exactly as it behaved', () => {
    const openPage = vi.fn()
    render(<Reader markdown="Voir [[taches/poncer-porte]]." pages={PAGES} openPage={openPage} />)
    screen.getByRole('button').click()
    expect(openPage).toHaveBeenCalledWith('taches/poncer-porte.md')
  })

  it('does not call a reference dead merely because no index is at hand', () => {
    // A chat bubble renders prose without the index. "Not known here" is not
    // "the target is gone", and saying so would be a lie the reader cannot
    // check.
    const openPage = vi.fn()
    render(<Reader markdown={`Voir [[fiche#${ID}:la boucle]].`} openPage={openPage} />)
    expect(screen.getByRole('button', { name: 'la boucle' })).toBeTruthy()
  })
})
