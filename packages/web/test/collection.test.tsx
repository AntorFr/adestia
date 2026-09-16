// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CollectionLayout, CollectionShell } from '../src/app/Collection.js'
import type { IndexEntry } from '../src/app/sections.js'
import { Editor, type PageDocument } from '../src/editor/Editor.js'

const entry = (path: string, fields: Record<string, unknown>, title: string): IndexEntry => ({
  path,
  title,
  fields,
})

const DECLARED = {
  type: 'collection',
  of: 'projet',
  groupBy: 'cat',
  labels: 'menuiserie=Menuiserie',
  into: 'diy/projets',
}

const ENTRIES: readonly IndexEntry[] = [
  entry('diy/projets.md', DECLARED, 'Projets'),
  entry('diy/projets/garage.md', { type: 'projet', cat: 'menuiserie', status: 'en-cours' }, 'Garage'),
  entry('diy/projets/etagere.md', { type: 'projet', cat: 'menuiserie' }, 'Étagère'),
  entry('diy/projets/capteur.md', { type: 'projet', cat: 'electronique' }, 'Capteur'),
  entry('diy/projets/lampe.md', { type: 'projet' }, 'Lampe'),
  entry('diy/projets/terrasse.md', { type: 'projet', cat: 'menuiserie', status: 'clos' }, 'Terrasse'),
  entry('note.md', { type: 'fiche' }, 'Une note'),
]

function draw(fields: Record<string, unknown>) {
  const ask = vi.fn()
  const openPage = vi.fn()
  const { container } = render(
    <CollectionShell.Provider value={{ entries: ENTRIES, ask, t: (key) => key }}>
      <CollectionLayout
        path="diy/projets.md"
        fields={fields}
        title="Projets"
        markdown=""
        revision="r1"
        openPage={openPage}
      >
        <p>Les chantiers en cours.</p>
      </CollectionLayout>
    </CollectionShell.Provider>,
  )
  return { ask, openPage, container }
}

describe('a collection page', () => {
  it('draws the page’s own words, then the facets as cards', () => {
    draw(DECLARED)
    expect(screen.getByText('Les chantiers en cours.')).toBeTruthy()
    expect(screen.getByText('Menuiserie')).toBeTruthy()
    expect(screen.getByText('Electronique')).toBeTruthy()
    expect(screen.getByText('Uncategorised')).toBeTruthy()
    // Two figures: what is live, and what is done — "5 pages" over a grid
    // showing four is the arithmetic that teaches people to distrust a count.
    expect(screen.getByText('4 pages · 1 archived')).toBeTruthy()
    // The members wait behind their facet.
    expect(screen.queryByText('Garage')).toBeNull()
  })

  it('opens a facet, folds the finished away, and comes back', () => {
    const { container } = draw(DECLARED)
    fireEvent.click(screen.getByText('Menuiserie'))
    expect(screen.getByText('Garage')).toBeTruthy()
    expect(screen.getByText('Étagère')).toBeTruthy()
    // Closed, never absent: the finished project is what somebody looks for
    // when they want to know how the last one went.
    const fold = container.querySelector('details.adestia-archive')
    expect(fold?.textContent).toContain('Terrasse')
    expect(fold?.hasAttribute('open')).toBe(false)

    fireEvent.click(screen.getByText('‹ All'))
    expect(screen.queryByText('Garage')).toBeNull()
    expect(screen.getByText('Menuiserie')).toBeTruthy()
  })

  it('lists flat when it groups by nothing', () => {
    const { container } = draw({ type: 'collection', of: 'projet' })
    expect(screen.getByText('Garage')).toBeTruthy()
    expect(screen.getByText('Lampe')).toBeTruthy()
    expect(container.querySelector('details.adestia-archive')?.textContent).toContain('Terrasse')
  })

  it('says so when it declares no `of:`', () => {
    draw({ type: 'collection' })
    expect(screen.getByText('This collection declares no `of:` and collects nothing.')).toBeTruthy()
    expect(screen.queryByText('Menuiserie')).toBeNull()
  })

  it('asks the agent for a new member, where `into:` says', () => {
    // A member is a page, and writing pages is the agent's job: the button
    // asks rather than opening a form.
    const { ask } = draw(DECLARED)
    fireEvent.click(screen.getByText('＋ Ask for a new page'))
    expect(ask).toHaveBeenCalledTimes(1)
    const prompt = String(ask.mock.calls[0]![0])
    expect(prompt).toContain('projet')
    expect(prompt).toContain('diy/projets')
  })

  it('offers no ＋ without a place to file', () => {
    draw({ type: 'collection', of: 'projet', groupBy: 'cat' })
    expect(screen.queryByText('＋ Ask for a new page')).toBeNull()
  })

  it('opens a member', () => {
    const { openPage } = draw({ type: 'collection', of: 'projet' })
    fireEvent.click(screen.getByText('Garage'))
    expect(openPage).toHaveBeenCalledWith('diy/projets/garage.md')
  })

  it('is what the editor draws for the type, prose included', () => {
    // The core's layout goes through the same door as a plugin's: the editor
    // draws it for `type: collection` and hands it the page's own body.
    const declared: PageDocument = {
      path: 'diy/projets.md',
      title: 'Projets',
      markdown: '---\ntype: collection\nof: projet\ngroupBy: cat\n---\n\nLes chantiers en cours.\n',
      revision: '1',
      editable: true,
      diagnostics: [],
      fields: DECLARED,
    }
    render(
      <CollectionShell.Provider value={{ entries: ENTRIES, t: (key) => key }}>
        <Editor page={declared} layouts={{ collection: CollectionLayout }} />
      </CollectionShell.Provider>,
    )
    expect(screen.getByText('Les chantiers en cours.')).toBeTruthy()
    expect(screen.getByText('Menuiserie')).toBeTruthy()
  })
})
