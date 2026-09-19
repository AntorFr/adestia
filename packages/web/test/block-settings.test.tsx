// @vitest-environment jsdom
/**
 * A block's settings, drawn from what it declares.
 *
 * The form is written for no block in particular: its own attributes come
 * from its spec, closed sets as choices, and the reserved ones every block
 * carries — title, icon, card, width — are asked of all. What it hands back
 * is the next attribute record, with an emptied field REMOVED rather than
 * written empty.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { VOCABULARY } from '@antorfr/adestia-content'

import { BlockSettings } from '../src/editor/BlockSettings.js'

const setup = (name: string, attributes: Record<string, string>) => {
  const onChange = vi.fn()
  render(
    <BlockSettings name={name} spec={VOCABULARY[name]} attributes={attributes} onChange={onChange} onClose={() => {}} />,
  )
  return onChange
}

describe('BlockSettings', () => {
  it('offers a closed set as a choice, and writes the chosen value', () => {
    const onChange = setup('list', {})
    const view = screen.getByText('view').closest('label')?.querySelector('select') as HTMLSelectElement
    fireEvent.change(view, { target: { value: 'cards' } })
    expect(onChange).toHaveBeenCalledWith({ view: 'cards' })
  })

  it('puts a block in a card, and takes it out again', () => {
    const onChange = setup('content', { type: 'synthese' })
    fireEvent.click(screen.getByLabelText('dans une carte'))
    expect(onChange).toHaveBeenLastCalledWith({ type: 'synthese', frame: 'card' })
  })

  it('removes an attribute whose field is emptied, rather than writing it empty', () => {
    const onChange = setup('content', { type: 'synthese', title: 'Synthèse' })
    const title = screen.getByText('titre').closest('label')?.querySelector('input') as HTMLInputElement
    fireEvent.change(title, { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith({ type: 'synthese' })
  })

  it('writes a width, and "toute la ligne" as no width at all', () => {
    const onChange = setup('figures', { w: '1/2' })
    const width = screen.getByText('largeur').closest('label')?.querySelector('select') as HTMLSelectElement
    fireEvent.change(width, { target: { value: '2/3' } })
    expect(onChange).toHaveBeenLastCalledWith({ w: '2/3' })
    fireEvent.change(width, { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith({})
  })

  it('says what a required attribute is missing', () => {
    setup('content', {})
    expect(screen.getByText(/À remplir : type/)).toBeTruthy()
  })

  it('shows an attribute the block does not know, and lets it be removed', () => {
    const onChange = setup('figures', { couleur: 'rouge' })
    expect(screen.getByText('couleur=rouge')).toBeTruthy()
    fireEvent.click(screen.getByText('retirer'))
    expect(onChange).toHaveBeenLastCalledWith({})
  })
})
