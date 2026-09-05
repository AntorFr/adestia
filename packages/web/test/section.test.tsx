// @vitest-environment jsdom
/**
 * The section screen: what it says about pages, and what it folds away.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Section } from '../src/app/Section.js'

const entry = (path: string, fields: Record<string, unknown> = {}) => ({
  path,
  title: path.split('/').pop()?.replace(/\.md$/, '') ?? path,
  fields,
})

const CORPUS = [
  entry('domaines/diy/INDEX.md', { title: 'DIY', ico: '🪚', couleur: 'vert' }),
  entry('domaines/diy/etabli.md', { type: 'projet', status: 'en-cours', cat: 'menuiserie' }),
  entry('domaines/diy/lampe.md', { type: 'projet', status: 'réalisé' }),
  entry('domaines/diy/scie.md', { type: 'machine' }),
  entry('domaines/diy/projets/INDEX.md', { title: 'Projets' }),
  entry('domaines/diy/projets/tour.md', {}),
]

const props = {
  path: 'domaines/diy',
  title: 'DIY',
  entries: CORPUS,
  openSection: () => {},
  openPage: () => {},
}

describe('the section screen', () => {
  it('leads with its rooms, then its pages', () => {
    const { container } = render(<Section {...props} />)
    expect([...container.querySelectorAll('.adestia-section')].map((h) => h.textContent)).toEqual([
      'Inside',
      'Pages',
    ])
  })

  it('wears a page’s status as a coloured pill, with the word written out', () => {
    // Hue alone is not a label: the tone is a class, the word is text.
    const { container } = render(<Section {...props} />)
    const pill = container.querySelector('.adestia-stat')
    expect(pill?.textContent).toBe('en-cours')
    expect(pill?.className).toContain('underway')
  })

  it('shows a page’s tags, capped so a card stays scannable', () => {
    render(
      <Section
        {...props}
        entries={[
          entry('domaines/diy/INDEX.md', { title: 'DIY' }),
          entry('domaines/diy/x.md', { tags: ['a', 'b', 'c', 'd', 'e'] }),
        ]}
      />,
    )
    expect(screen.getByText('#a')).toBeTruthy()
    expect(screen.getByText('#c')).toBeTruthy()
    expect(screen.queryByText('#d')).toBeNull()
  })

  it('gives a page that declares nothing a title and nothing invented', () => {
    const { container } = render(<Section {...props} />)
    const card = [...container.querySelectorAll('.adestia-card')].find((c) =>
      c.textContent?.startsWith('scie'),
    )
    expect(card?.querySelector('.adestia-card__foot')).toBeNull()
  })

  it('filters by a facet the pages actually declare', () => {
    const many = [
      entry('d/INDEX.md', { title: 'D' }),
      ...['un', 'deux', 'trois', 'quatre', 'cinq', 'six'].map((n, i) =>
        entry(`d/${n}.md`, { status: i % 2 === 0 ? 'en-cours' : 'veille' }),
      ),
    ]
    render(<Section {...props} path="d" entries={many} />)
    fireEvent.click(screen.getByRole('button', { name: 'veille' }))
    // Three of the six carry `veille`; the rest leave the grid.
    expect(document.querySelectorAll('.adestia-card').length).toBe(3)
  })

  it('searches what a card actually shows', () => {
    const many = [
      entry('d/INDEX.md', { title: 'D' }),
      ...['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'].map((n) =>
        entry(`d/${n}.md`, { tags: [n === 'beta' ? 'urgent' : 'calme'] }),
      ),
    ]
    const { container } = render(<Section {...props} path="d" entries={many} />)
    const input = container.querySelector('.adestia-search input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'urgent' } })
    expect(container.querySelectorAll('.adestia-card').length).toBe(1)
    expect(screen.getByText('beta')).toBeTruthy()
  })

  it('says so plainly when a filter matches nothing', () => {
    const many = [
      entry('d/INDEX.md', { title: 'D' }),
      ...['un', 'deux', 'trois', 'quatre', 'cinq', 'six'].map((n) => entry(`d/${n}.md`)),
    ]
    const { container } = render(<Section {...props} path="d" entries={many} />)
    const input = container.querySelector('.adestia-search input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(screen.getByText('Nothing matches.')).toBeTruthy()
  })

  it('folds finished pages away, counted, out of the living grid', () => {
    render(<Section {...props} />)
    const archive = screen.getByText(/Finished/)
    expect(archive).toBeTruthy()
    // `lampe` is réalisé: present, but inside the fold rather than among the rest.
    expect(archive.closest('details')?.textContent).toContain('lampe')
  })

  it('folds away the word the real corpus actually uses for finished', () => {
    // `clos` — eleven pages in the corpus this was measured against, and the
    // word the first guessed list missed entirely.
    render(
      <Section
        {...props}
        entries={[
          entry('domaines/diy/INDEX.md', { title: 'DIY' }),
          entry('domaines/diy/tour.md', { status: 'clos' }),
          entry('domaines/diy/vivant.md', { status: 'en-cours' }),
        ]}
      />,
    )
    expect(screen.getByText(/Finished/).closest('details')?.textContent).toContain('tour')
  })

  it('keeps a page whose status it does not recognise among the living', () => {
    // Hiding something over an unfamiliar word would make the section lie
    // about its own size.
    render(
      <Section
        {...props}
        entries={[
          entry('domaines/diy/INDEX.md', { title: 'DIY' }),
          entry('domaines/diy/mystere.md', { status: 'en-jachère' }),
        ]}
      />,
    )
    expect(screen.queryByText(/Finished/)).toBeNull()
    expect(screen.getByText('mystere')).toBeTruthy()
  })

  it('wears the section’s own icon in its header', () => {
    render(<Section {...props} tile={{ path: 'domaines/diy', title: 'DIY', icon: '🪚', hue: 'vert', count: 3 }} />)
    expect(screen.getByText('🪚')).toBeTruthy()
  })

  it('opens a page when its card is clicked', () => {
    const openPage = vi.fn()
    render(<Section {...props} openPage={openPage} />)
    screen.getByText('etabli').closest('button')?.click()
    // The store travels with the click: on an instance composing several,
    // two cards can carry the same name, and the one that opens must be the
    // one that was clicked. Undefined here — a single store marks nothing.
    expect(openPage).toHaveBeenCalledWith('domaines/diy/etabli.md', undefined)
  })
})
