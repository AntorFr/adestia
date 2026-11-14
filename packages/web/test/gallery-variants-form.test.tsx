// @vitest-environment jsdom
/**
 * Gallery cards with variants and the form opened on a fresh block (B-24, P-17
 * step 4, E-34, E-35), judged from the criterion: a card with `view` shows the
 * same pictures as E-6; the variant is passed only when it is not the default;
 * arrows on a variant do not walk the cards; a fresh form starts on one empty
 * row (a table keeps its header), applies nothing by itself.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PluginGalleryFields } from '@antorfr/adestia-schemas'

import { BlockForm } from '../src/editor/BlockForm.js'
import { BlockGallery } from '../src/editor/BlockGallery.js'
import type { GalleryCard } from '../src/editor/gallery.js'

afterEach(cleanup)

const cards: GalleryCard[] = [
  { id: 'callout', name: 'Callout', line: 'x', image: '/b.svg', group: 'Text', source: 'core' },
  { id: 'figures', name: 'Figures', line: 'y', image: '/c.svg', group: 'Data', source: 'core', view: { values: ['tiles', 'inline'], default: 'tiles' } },
  { id: 'list', name: 'List', line: 'z', image: '/d.svg', group: 'Data', source: 'core', view: { values: ['rows', 'cards', 'chips'], default: 'rows' } },
]

function gallery() {
  const onChoose = vi.fn()
  render(<BlockGallery open cards={cards} onChoose={onChoose} onClose={() => {}} t={(k) => k} />)
  return onChoose
}
const look = (card: string) => within(screen.getByRole('option', { name: card }).parentElement!).getByRole('radiogroup')

describe('gallery cards with variants', () => {
  it('only cards with a view show the Look choice, one picture per value', () => {
    gallery()
    expect(screen.getAllByRole('radiogroup')).toHaveLength(2)
    expect(within(look('Figures')).getAllByRole('radio')).toHaveLength(2)
    expect(within(look('List')).getAllByRole('radio')).toHaveLength(3)
    expect(look('Figures').querySelectorAll('svg.adestia-variant')).toHaveLength(2)
  })

  it('a card nobody touched chooses the block by its name alone', () => {
    const onChoose = gallery()
    fireEvent.click(screen.getByRole('option', { name: 'Figures' }))
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('figures')
  })

  it('a variant that is not the default is passed as view', () => {
    const onChoose = gallery()
    fireEvent.click(within(look('Figures')).getByRole('radio', { name: 'inline' }))
    fireEvent.click(screen.getByRole('option', { name: 'Figures' }))
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('figures', 'inline')
  })

  it('picking the default back writes nothing', () => {
    const onChoose = gallery()
    fireEvent.click(within(look('Figures')).getByRole('radio', { name: 'inline' }))
    fireEvent.click(within(look('Figures')).getByRole('radio', { name: 'tiles' }))
    fireEvent.click(screen.getByRole('option', { name: 'Figures' }))
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('figures')
  })

  it('a variant chosen on one card does not leak to another', () => {
    const onChoose = gallery()
    fireEvent.click(within(look('List')).getByRole('radio', { name: 'chips' }))
    fireEvent.click(screen.getByRole('option', { name: 'Figures' }))
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('figures')
  })

  it('Enter on the searchbox inserts the active card with its picked variant', () => {
    const onChoose = gallery()
    fireEvent.click(within(look('Figures')).getByRole('radio', { name: 'inline' }))
    const search = screen.getByRole('searchbox')
    fireEvent.change(search, { target: { value: 'figures' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onChoose).toHaveBeenLastCalledWith('figures', 'inline')
  })

  it('arrows pressed on a variant choose a variant, not another card', () => {
    const onChoose = gallery()
    const radio = within(look('Figures')).getAllByRole('radio')[0]!
    radio.focus()
    fireEvent.keyDown(radio, { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' })
    expect(onChoose).toHaveBeenCalledTimes(1)
    expect(onChoose.mock.calls[0]![0]).toBe('figures')
  })
})

const FIGURES: PluginGalleryFields = {
  line: 'label-value-caption',
  columns: [
    { key: 'label', kind: 'text', label: 'Label', required: true },
    { key: 'value', kind: 'number', label: 'Value', required: true },
    { key: 'caption', kind: 'text', label: 'Caption' },
  ],
}
const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-row]'))

function fresh(fields: PluginGalleryFields, lines: string[]) {
  const onApply = vi.fn()
  const onClose = vi.fn()
  render(<BlockForm name="Figures" fields={fields} lines={lines} fresh onApply={onApply} onClose={onClose} />)
  return { onApply, onClose }
}

describe('BlockForm opened fresh', () => {
  it('shows one empty row, not the placeholder body', () => {
    fresh(FIGURES, ['- Label: 0'])
    expect(rows()).toHaveLength(1)
    expect(Array.from(rows()[0]!.querySelectorAll('input')).map((i) => i.value)).toEqual(['', '', ''])
  })

  it('refuses Apply on the empty row, and Cancel applies nothing', () => {
    const { onApply, onClose } = fresh(FIGURES, ['- Label: 0'])
    expect((screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onApply).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('a row filled in applies as the block\'s only line', () => {
    const { onApply } = fresh(FIGURES, ['- Label: 0'])
    const inputs = rows()[0]!.querySelectorAll('input')
    fireEvent.change(inputs[0]!, { target: { value: 'Users' } })
    fireEvent.change(inputs[1]!, { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply.mock.calls[0]![0]).toHaveLength(1)
    expect(onApply.mock.calls[0]![0][0]).toContain('Users')
  })

  it('a table keeps its header row and gains one empty row', () => {
    fresh({ line: 'table', columns: [] }, ['| A | B |', '| --- | --- |', '| 1 | 2 |'])
    expect(rows()).toHaveLength(2)
    expect(Array.from(rows()[0]!.querySelectorAll('input')).map((i) => i.value)).toEqual(['A', 'B'])
    expect(Array.from(rows()[1]!.querySelectorAll('input')).map((i) => i.value)).toEqual(['', ''])
  })

  it('a form not fresh still shows the lines as read', () => {
    render(<BlockForm name="Figures" fields={FIGURES} lines={['- Label: 0']} onApply={() => {}} onClose={() => {}} />)
    expect(rows()).toHaveLength(1)
    expect((rows()[0]!.querySelector('input') as HTMLInputElement).value).toBe('Label')
  })
})
