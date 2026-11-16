// @vitest-environment jsdom
/**
 * The block gallery (B-24, E-34), judged from the criterion: search ignores
 * case and accents, arrows + Enter choose, a click chooses, Escape closes
 * without choosing, an empty search says so.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BlockGallery } from '../src/editor/BlockGallery.js'
import type { GalleryCard } from '../src/editor/gallery.js'

const cards: GalleryCard[] = [
  { id: 'content', name: 'Content', line: 'Free text.', image: '/a.svg', group: 'Text', source: 'core' },
  { id: 'callout', name: 'Encadré', line: 'A boxed note.', image: '/b.svg', group: 'Text', source: 'core' },
  { id: 'figures', name: 'Figures', line: 'Key numbers.', image: '/c.svg', group: 'Data', source: 'core' },
  { id: 'timeline', name: 'Timeline', line: 'Phases over time.', group: 'Project', source: 'project-management' },
]

function open(overrides: Partial<{ onChoose: (n: string) => void; onClose: () => void }> = {}) {
  const onChoose = overrides.onChoose ?? vi.fn()
  const onClose = overrides.onClose ?? vi.fn()
  render(<BlockGallery open cards={cards} onChoose={onChoose} onClose={onClose} t={(k) => k} />)
  return { onChoose, onClose }
}

afterEach(cleanup)

describe('BlockGallery', () => {
  it('draws nothing while closed', () => {
    render(<BlockGallery open={false} cards={cards} onChoose={() => {}} onClose={() => {}} t={(k) => k} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows a card per block with its name and line, under its group', () => {
    open()
    expect(screen.getByRole('dialog', { name: 'Add block' })).toBeTruthy()
    expect(screen.getAllByRole('option').map((o) => o.getAttribute('aria-label'))).toEqual(['Content', 'Encadré', 'Figures', 'Timeline'])
    expect(screen.getByText('Phases over time.')).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Text', 'Data', 'Project'])
  })

  it('a click on a card chooses that block by its name', () => {
    const { onChoose } = open()
    fireEvent.click(screen.getByRole('option', { name: 'Figures' }))
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('figures')
  })

  it('Enter chooses the first card, arrows walk the cards in drawn order', () => {
    const { onChoose } = open()
    const search = screen.getByRole('searchbox')
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onChoose).toHaveBeenLastCalledWith('content')
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onChoose).toHaveBeenLastCalledWith('figures')
    fireEvent.keyDown(search, { key: 'ArrowUp' })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onChoose).toHaveBeenLastCalledWith('callout')
  })

  it('arrows stop at both ends', () => {
    const { onChoose } = open()
    const search = screen.getByRole('searchbox')
    fireEvent.keyDown(search, { key: 'ArrowUp' })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onChoose).toHaveBeenLastCalledWith('content')
    for (let i = 0; i < 9; i++) fireEvent.keyDown(search, { key: 'ArrowDown' })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onChoose).toHaveBeenLastCalledWith('timeline')
  })

  it('search ignores case and accents, and Enter takes the first match', () => {
    const { onChoose } = open()
    const search = screen.getByRole('searchbox')
    fireEvent.change(search, { target: { value: 'ENCADRE' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('callout')
  })

  it('search also matches the line', () => {
    open()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'key numbers' } })
    expect(screen.getAllByRole('option').map((o) => o.getAttribute('aria-label'))).toEqual(['Figures'])
  })

  it('a search with no match says so and Enter chooses nothing', () => {
    const { onChoose } = open()
    const search = screen.getByRole('searchbox')
    fireEvent.change(search, { target: { value: 'gantt' } })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByRole('status').textContent).toContain('No block called "gantt"')
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('Escape closes without choosing', () => {
    const { onChoose, onClose } = open()
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
    expect(onChoose).not.toHaveBeenCalled()
  })
})
