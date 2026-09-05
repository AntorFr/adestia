// @vitest-environment jsdom
/**
 * What a folder shows once memory comes from more than one place.
 *
 * The rules drawn here were argued on a mockup before any of this existed, and
 * each one answers a way the screen could lie: a card that does not say where
 * it came from, a colour nobody can learn, two cards with the same name and no
 * way to tell them apart, or a mark on everything — which is a mark on nothing.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Section } from '../src/app/Section.js'
import type { IndexEntry, StoreInfo } from '../src/app/sections.js'

const STORES: readonly StoreInfo[] = [
  { id: 'perso', label: 'Perso', default: true },
  { id: 'famille', label: 'Famille', hue: 'violet' },
]

const page = (path: string, title: string, store?: string): IndexEntry => ({
  path,
  title,
  fields: {},
  ...(store ? { store } : {}),
})

const props = {
  path: 'voyages',
  title: 'Voyages',
  openSection: () => undefined,
  openPage: () => undefined,
}

describe('a folder composed of two circles', () => {
  it('marks what comes from elsewhere, and leaves mine unmarked', () => {
    render(
      <Section
        {...props}
        stores={STORES}
        entries={[
          page('voyages/lisbonne.md', 'Lisbonne', 'perso'),
          page('voyages/baden.md', 'Baden', 'famille'),
        ]}
      />,
    )

    // Absence IS the mark for my own store: a rim on every card would be a rim
    // on none.
    expect(screen.getByText('Lisbonne').closest('button')?.className).not.toContain(
      'adestia-card--store',
    )
    expect(screen.getByText('Baden').closest('button')?.className).toContain(
      'adestia-card--store',
    )
    // Two letters, not a coloured dot: the dot is what a status wears here.
    expect(screen.getByText('Fa')).toBeTruthy()
  })

  it('teaches the marks once, and says what having none means', () => {
    render(
      <Section
        {...props}
        stores={STORES}
        entries={[
          page('voyages/lisbonne.md', 'Lisbonne', 'perso'),
          page('voyages/baden.md', 'Baden', 'famille'),
        ]}
      />,
    )
    // The legend is the only place that can state what an unmarked card is,
    // which no card can say about itself.
    const legend = document.querySelector('.adestia-stores')
    expect(legend?.textContent).toContain('Perso')
    expect(legend?.textContent).toContain('Famille')
    expect(legend?.querySelector('.adestia-stores__key--none')?.textContent).toBe('Perso')
  })

  it('draws no legend for a folder that is entirely mine', () => {
    // Naming a circle that put nothing here is noise, and a legend that always
    // shows is a legend nobody reads when it finally matters.
    render(
      <Section {...props} stores={STORES} entries={[page('voyages/lisbonne.md', 'Lisbonne', 'perso')]} />,
    )
    expect(document.querySelector('.adestia-stores')).toBeNull()
  })

  it('shows both copies of a name, and suffixes the one that is not mine', () => {
    // The predecessor hid the loser. A card nobody can see is a card nobody can
    // correct — two cards under two names is the lesser failure.
    render(
      <Section
        {...props}
        stores={STORES}
        entries={[
          page('voyages/italie.md', 'Voyage Italie', 'perso'),
          page('voyages/italie.md', 'Voyage Italie', 'famille'),
        ]}
      />,
    )
    expect(screen.getByText('Voyage Italie')).toBeTruthy()
    expect(screen.getByText('Voyage Italie (Famille)')).toBeTruthy()
  })

  it('opens the copy that was clicked, not the one the name resolves to', () => {
    const openPage = vi.fn()
    render(
      <Section
        {...props}
        stores={STORES}
        openPage={openPage}
        entries={[
          page('voyages/italie.md', 'Voyage Italie', 'perso'),
          page('voyages/italie.md', 'Voyage Italie', 'famille'),
        ]}
      />,
    )
    screen.getByText('Voyage Italie (Famille)').closest('button')?.click()
    expect(openPage).toHaveBeenCalledWith('voyages/italie.md', 'famille')
  })

  it('says nothing at all when the instance has one store', () => {
    render(<Section {...props} entries={[page('voyages/lisbonne.md', 'Lisbonne')]} />)
    expect(document.querySelector('.adestia-stores')).toBeNull()
    expect(document.querySelector('.adestia-card--store')).toBeNull()
  })
})
