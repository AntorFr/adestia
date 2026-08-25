// @vitest-environment jsdom
/**
 * The section screen: what it says about pages, and what it folds away.
 */

import { render, screen } from '@testing-library/react'
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
    expect([...container.querySelectorAll('.golem-section')].map((h) => h.textContent)).toEqual([
      'Inside',
      'Pages',
    ])
  })

  it('says something TRUE under a page that declares a state', () => {
    render(<Section {...props} />)
    expect(screen.getByText('en-cours · menuiserie')).toBeTruthy()
  })

  it('gives a page that declares nothing a title and no invented subtitle', () => {
    const { container } = render(<Section {...props} />)
    const card = [...container.querySelectorAll('.golem-card')].find((c) =>
      c.textContent?.startsWith('scie'),
    )
    expect(card?.querySelector('.golem-card__meta')).toBeNull()
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
    expect(openPage).toHaveBeenCalledWith('domaines/diy/etabli.md')
  })
})
