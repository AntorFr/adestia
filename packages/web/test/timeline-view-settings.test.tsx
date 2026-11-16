// @vitest-environment jsdom
/**
 * `timeline` declares view bars|list (E-31): choosing a variant in its settings
 * writes ONLY the view attribute — the lines of the block, the file's content,
 * are not this form's to touch — and the choices are worded, in both locales.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { translator } from '../src/app/i18n.js'
import { BlockSettings } from '../src/editor/BlockSettings.js'

afterEach(cleanup)

const manifest = JSON.parse(
  readFileSync(join(process.cwd(), 'plugins/project-management/adestia-plugin.json'), 'utf8'),
)
const spec = manifest.vocabulary.timeline

const setup = (attributes: Record<string, string>, locale: 'en' | 'fr' = 'en') => {
  const onChange = vi.fn()
  render(<BlockSettings name="timeline" spec={spec} attributes={attributes} onChange={onChange} onClose={() => {}} t={translator(locale)} />)
  return onChange
}
const look = () => document.querySelector<HTMLElement>('[role=radiogroup][aria-label="Look"],[role=radiogroup][aria-label="Apparence"]')!
const labels = () => within(look()).getAllByRole('radio', { hidden: true }).map((r) => r.getAttribute('aria-label'))

describe('timeline settings — view', () => {
  it('offers bars and list as pictures, the bars in force by default', () => {
    setup({})
    const radios = within(look()).getAllByRole('radio', { hidden: true })
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['bars', 'list'])
    expect(radios.every((r) => r.querySelector('svg'))).toBe(true)
    expect(radios[0]!.getAttribute('aria-checked')).toBe('true')
  })

  it('choosing list writes the view attribute and nothing else, keeping the other attributes', () => {
    const onChange = setup({ scale: 'quarters', depth: 'subtree' })
    fireEvent.click(within(look()).getByLabelText('list'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ scale: 'quarters', depth: 'subtree', view: 'list' })
  })

  it('reads list back as the one in force, and clicking it again writes nothing', () => {
    const onChange = setup({ view: 'list' })
    const [bars, list] = within(look()).getAllByRole('radio', { hidden: true })
    expect(bars!.getAttribute('aria-checked')).toBe('false')
    expect(list!.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(list!)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('is worded in French, and the two variants are not left as identifiers', () => {
    setup({}, 'fr')
    const radios = within(look()).getAllByRole('radio', { hidden: true })
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['Barres', 'Liste'])
    expect(labels()).not.toContain('bars')
  })
})
