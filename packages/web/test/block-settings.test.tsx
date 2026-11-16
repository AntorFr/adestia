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

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { VOCABULARY } from '@antorfr/adestia-content'

import { translator } from '../src/app/i18n.js'
import { BlockSettings } from '../src/editor/BlockSettings.js'

afterEach(cleanup)

const setup = (name: string, attributes: Record<string, string>, locale?: 'en' | 'fr') => {
  const onChange = vi.fn()
  render(
    <BlockSettings
      name={name}
      spec={VOCABULARY[name]}
      attributes={attributes}
      onChange={onChange}
      onClose={() => {}}
      {...(locale ? { t: translator(locale) } : {})}
    />,
  )
  return onChange
}

// By attribute: the popover is `visibility: hidden` until measured, which empties every accessible name.
const group = (name: string): HTMLElement => {
  const found = document.querySelector<HTMLElement>(`[role=radiogroup][aria-label="${name}"]`)
  if (!found) throw new Error(`no radiogroup "${name}"`)
  return found
}
const radio = (name: string) => document.querySelector<HTMLElement>(`[role=radio][aria-label="${name}"]`)

describe('BlockSettings', () => {
  it('offers the variants of a block as a radiogroup, and a click writes the chosen one at once, once', () => {
    const onChange = setup('list', {})
    const look = group('Look')
    expect(within(look).getAllByRole('radio', { hidden: true })).toHaveLength(3)
    fireEvent.click(within(look).getByLabelText('cards'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ view: 'cards' })
  })

  it('offers figures its two variants as pictures, and writes nothing when the one in force is clicked', () => {
    const onChange = setup('figures', {})
    const radios = within(group('Look')).getAllByRole('radio', { hidden: true })
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['tiles', 'inline'])
    expect(radios.every((r) => r.querySelector('svg'))).toBe(true)
    expect(radios[0]!.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(radios[0]!)
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(radios[1]!)
    expect(onChange).toHaveBeenCalledWith({ view: 'inline' })
  })

  it('keeps the other attributes when a variant is chosen', () => {
    const onChange = setup('figures', { title: 'T', w: '1/2' })
    fireEvent.click(within(group('Look')).getByLabelText('inline'))
    expect(onChange).toHaveBeenCalledWith({ title: 'T', w: '1/2', view: 'inline' })
  })

  it('draws no Look group for a block with a single view', () => {
    setup('callout', {})
    expect(screen.queryByText('Look')).toBeNull()
  })

  it('puts a block in a card with Yes, and takes it out with No', () => {
    const onChange = setup('content', { type: 'synthese' })
    fireEvent.click(within(group('Show a box')).getByLabelText('Yes'))
    expect(onChange).toHaveBeenLastCalledWith({ type: 'synthese', frame: 'card' })
    cleanup()
    const again = setup('content', { type: 'synthese', frame: 'card' })
    fireEvent.click(within(group('Show a box')).getByLabelText('No'))
    expect(again).toHaveBeenLastCalledWith({ type: 'synthese' })
  })

  it('removes an attribute whose field is emptied, rather than writing it empty', () => {
    const onChange = setup('content', { type: 'synthese', title: 'Synthèse' })
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith({ type: 'synthese' })
  })

  it('writes a width from the four words, whole line included only when chosen', () => {
    const onChange = setup('figures', { w: '1/2' })
    const width = group('Width')
    expect(within(width).getAllByRole('radio', { hidden: true }).map((r) => r.getAttribute('aria-label'))).toEqual(['⅓', '½', '⅔', 'Full'])
    expect(within(width).getByLabelText('½').getAttribute('aria-checked')).toBe('true')
    fireEvent.click(within(width).getByLabelText('⅔'))
    expect(onChange).toHaveBeenLastCalledWith({ w: '2/3' })
  })

  it('shows no width written and the whole line as in force, and clicking it writes nothing', () => {
    const onChange = setup('figures', {})
    const full = within(group('Width')).getByLabelText('Full')
    expect(full.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(full)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('chooses a width with the arrow keys, one write per key, wrapping, one tab stop', () => {
    const onChange = setup('figures', { w: '1/2' })
    const radios = within(group('Width')).getAllByRole('radio', { hidden: true })
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1, -1])
    fireEvent.keyDown(radios[1]!, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith({ w: '2/3' })
    fireEvent.keyDown(radios[1]!, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith({ w: '1/3' })
    fireEvent.keyDown(radios[0]!, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith({ w: '1' })
    expect(onChange).toHaveBeenCalledTimes(3)
    fireEvent.keyDown(radios[1]!, { key: 'a' })
    expect(onChange).toHaveBeenCalledTimes(3)
  })

  it('says what a required attribute is missing, by its label', () => {
    setup('content', {})
    expect(screen.getByText(/To fill in: Subject/)).toBeTruthy()
  })

  it('shows an attribute the block does not know under Other attributes, and lets it be removed', () => {
    const onChange = setup('figures', { couleur: 'rouge' })
    expect(screen.getByText('Other attributes')).toBeTruthy()
    expect(screen.getByText('couleur=rouge')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Remove couleur'))
    expect(onChange).toHaveBeenLastCalledWith({})
  })

  it('draws no Other attributes heading for a block that carries none, even with reserved ones', () => {
    setup('figures', { title: 'x', ico: '📋', w: '1/2', frame: 'card', view: 'inline', id: 'a', from: 'b' })
    expect(screen.queryByText('Other attributes')).toBeNull()
  })

  it('gives a plugin block\'s attribute its identifier, and no help line', () => {
    const onChange = vi.fn()
    render(
      <BlockSettings
        name="timeline"
        spec={{ description: 'd', attributes: { span: { default: 'week' } } } as never}
        attributes={{}}
        onChange={onChange}
        onClose={() => {}}
        t={translator('fr')}
      />,
    )
    expect(screen.getByText('span')).toBeTruthy()
  })

  it.each(['en', 'fr'] as const)('names every attribute of every core block in words in %s', (locale) => {
    for (const [name, spec] of Object.entries(VOCABULARY)) {
      cleanup()
      render(<BlockSettings name={name} spec={spec} attributes={{}} onChange={() => {}} onClose={() => {}} t={translator(locale)} />)
      const labels = Array.from(document.querySelectorAll('.adestia-field__label')).map((n) => n.textContent ?? '')
      for (const key of Object.keys(spec.attributes ?? {})) {
        if (['id', 'from', 'title', 'ico', 'frame', 'w'].includes(key)) continue
        expect(labels, `${name}.${key} in ${locale}`).not.toContain(key)
      }
      expect(document.body.textContent).not.toMatch(/\bview\b|\bsource\b|\bdepth\b/)
    }
  })

  it('speaks French for the groups and the choices', () => {
    setup('figures', {}, 'fr')
    expect(group('Largeur')).toBeTruthy()
    expect(radio('Pleine')).toBeTruthy()
    expect(radio('Tuiles')).toBeTruthy()
    for (const word of ['Apparence', 'Mise en page', 'Titre et icône']) expect(screen.getByText(word)).toBeTruthy()
  })
})
