// @vitest-environment jsdom
/**
 * `figures` : tuiles ou ligne selon `view`, jauge nommée sur une tuile de
 * pourcentage, et rien d'écrit pour elle (critère de la tâche blocs).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { parse, serialize, validateDocument } from '@antorfr/adestia-content'

import { Reader } from '../src/editor/Reader.js'

const BODY = '- Avancement: 62 % — 8 lots sur 13\n- Jalon: 12 sept.\n'
const page = (attrs: string) => `:::figures${attrs}\n${BODY}:::\n`

describe('figures view', () => {
  it('lit en tuiles par défaut, avec une jauge nommée sur le seul pourcentage', () => {
    const { container } = render(<Reader markdown={page('')} />)
    expect(container.querySelectorAll('.adestia-figure')).toHaveLength(2)
    expect(container.querySelector('.adestia-figures--inline')).toBeNull()
    const meters = container.querySelectorAll('[role="meter"]')
    expect(meters).toHaveLength(1)
    const meter = meters[0] as HTMLElement
    expect(meter.getAttribute('aria-label')).toBe('Avancement')
    expect(meter.getAttribute('aria-valuemin')).toBe('0')
    expect(meter.getAttribute('aria-valuemax')).toBe('100')
    expect(meter.getAttribute('aria-valuenow')).toBe('62')
    expect((meter.firstElementChild as HTMLElement).style.width).toBe('62%')
  })

  it('lit sur une ligne en view=inline, sans jauge', () => {
    const { container } = render(<Reader markdown={page('{view=inline}')} />)
    expect(container.querySelector('.adestia-figures--inline')).toBeTruthy()
    expect(container.querySelectorAll('.adestia-figure--inline')).toHaveLength(2)
    expect(container.querySelector('[role="meter"]')).toBeNull()
    expect(container.textContent).toContain('62 %')
    expect(container.textContent).toContain('Jalon')
  })

  it('lit une valeur de view inconnue comme des tuiles, sans rien perdre', () => {
    const { container } = render(<Reader markdown={page('{view=zzz}')} />)
    expect(container.querySelectorAll('.adestia-figure')).toHaveLength(2)
    expect(container.querySelector('.adestia-figures--inline')).toBeNull()
  })

  it('borne la jauge à 0–100 et accepte la virgule décimale', () => {
    const { container } = render(
      <Reader markdown={':::figures\n- Trop: 150 %\n- Fin: 12,5 %\n- Texte: environ 50 %\n:::\n'} />,
    )
    const meters = [...container.querySelectorAll('[role="meter"]')]
    expect(meters.map((m) => m.getAttribute('aria-valuenow'))).toEqual(['100', '12.5'])
  })

  it('accepte view sans avertissement, et le relit octet pour octet', () => {
    for (const attrs of ['', '{view="inline"}', '{view="tiles"}', '{w="1/2"}']) {
      const source = page(attrs)
      expect(validateDocument(parse(source)).map((i) => i.message)).toEqual([])
      expect(serialize(parse(source))).toBe(source)
    }
  })

  it('lit la page de référence écrite à la main : deux jauges, aucune ligne perdue', () => {
    const md = readFileSync(join(__dirname, 'fixtures/blockform/figures.md'), 'utf8')
    const { container } = render(<Reader markdown={md} />)
    const meters = [...container.querySelectorAll('[role="meter"]')]
    expect(meters.map((m) => m.getAttribute('aria-label'))).toEqual(['Avancement', 'Budget consommé'])
    expect(container.textContent).toContain('Retards')
  })
})
