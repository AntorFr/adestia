// @vitest-environment jsdom
/** Reading sections and columns (B-28, AD-32, AD-structure-1). Expectations are written by hand. */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'

import { Reader } from '../src/editor/Reader.js'

afterEach(cleanup)

async function draw(markdown: string) {
  const view = render(<Reader markdown={markdown} />)
  await act(async () => {})
  return view.container
}

const band = (w: string, text: string) => `:::content{type=a w=${w}}\n${text}\n:::\n`

it('a section closed=fold starts hidden, unfolds on click, folds again, and the markdown prop is untouched', async () => {
  const markdown = ':::section{title="Détails" closed=fold}\nCaché.\n:::\n'
  const root = await draw(markdown)
  const toggle = root.querySelector('button.adestia-block-section__toggle') as HTMLButtonElement
  const body = root.querySelector('.adestia-block-section__body') as HTMLElement
  expect(toggle.textContent).toContain('Détails')
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  expect(body.hidden).toBe(true)
  fireEvent.click(toggle)
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  expect(body.hidden).toBe(false)
  expect(body.textContent).toContain('Caché.')
  fireEvent.click(toggle)
  expect(body.hidden).toBe(true)
  expect(markdown).toBe(':::section{title="Détails" closed=fold}\nCaché.\n:::\n')
})

it('a section without closed starts open; closed with another value does not fold', async () => {
  const open = await draw(':::section{title="A"}\nx\n:::\n')
  expect((open.querySelector('.adestia-block-section__body') as HTMLElement).hidden).toBe(false)
  cleanup()
  const other = await draw(':::section{title="A" closed=yes}\nx\n:::\n')
  expect((other.querySelector('.adestia-block-section__body') as HTMLElement).hidden).toBe(false)
})

it('a section shows its icon, and a default title when it has none', async () => {
  const root = await draw(':::section{ico=📋}\nx\n:::\n')
  expect(root.querySelector('.adestia-head__ico')?.textContent).toBe('📋')
  expect(root.querySelector('.adestia-block-section__title')?.textContent).toBe('Untitled section')
})

it('two sections fold independently', async () => {
  const root = await draw(':::section{title="A" closed=fold}\na\n:::\n\n:::section{title="B" closed=fold}\nb\n:::\n')
  const toggles = root.querySelectorAll('button.adestia-block-section__toggle')
  fireEvent.click(toggles[1] as Element)
  const bodies = root.querySelectorAll<HTMLElement>('.adestia-block-section__body')
  expect(bodies[0]?.hidden).toBe(true)
  expect(bodies[1]?.hidden).toBe(false)
})

it('columns draw 2 or 3 cells in file order', async () => {
  const two = await draw('::::columns\n:::col\nUn\n:::\n:::col\nDeux\n:::\n::::\n')
  expect(two.querySelector('.adestia-columns')?.className).toContain('adestia-columns--2')
  expect([...two.querySelectorAll('.adestia-col')].map((c) => c.textContent)).toEqual(['Un', 'Deux'])
  cleanup()
  const three = await draw('::::columns\n:::col\nA\n:::\n:::col\nB\n:::\n:::col\nC\n:::\n::::\n')
  expect(three.querySelector('.adestia-columns')?.className).toContain('adestia-columns--3')
  expect([...three.querySelectorAll('.adestia-col')].map((c) => c.textContent)).toEqual(['A', 'B', 'C'])
})

it('the stylesheet stacks the columns under 820px, and not above', () => {
  const css = readFileSync(resolve(__dirname, '../src/app/styles/reader.css'), 'utf8')
  const media = css.slice(css.indexOf('@media (max-width: 820px) {\n  .adestia-columns'))
  expect(media).toBeDefined()
  expect(media).toMatch(/adestia-columns--2/)
  expect(media).toMatch(/adestia-columns--3/)
  expect(media).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  expect(css).toMatch(/\.adestia-columns--3 \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/)
})

it('w and row in a section lay out as at the root', async () => {
  const rows = band('1/2', 'Un') + '\n' + band('1/2', 'Deux') + '\n' + band('2/3', 'Trois') + '\n:::row\n:::\n\n' + band('1/3', 'Quatre')
  const shape = (el: Element) =>
    [...el.querySelectorAll('.adestia-row')].map((r) => [...r.querySelectorAll(':scope > .adestia-row__cell')].map((c) => c.className + '|' + c.textContent))
  const atRoot = shape(await draw(rows))
  cleanup()
  const inSection = await draw(`::::section{title="S"}\n${rows}::::\n`)
  expect(atRoot).toEqual([
    ['adestia-row__cell adestia-row__cell--1-2|AUn', 'adestia-row__cell adestia-row__cell--1-2|ADeux'],
    ['adestia-row__cell adestia-row__cell--2-3|ATrois'],
    ['adestia-row__cell adestia-row__cell--1-3|AQuatre'],
  ])
  expect(shape(inSection)).toEqual(atRoot)
})

it('w in a col has no effect: no row, no cell, whatever the width', async () => {
  const root = await draw(`::::columns\n:::col\n${band('1/2', 'Un')}\n${band('1/2', 'Deux')}:::\n:::col\n${band('1/3', 'Trois')}:::\n::::\n`)
  expect(root.querySelector('.adestia-row')).toBeNull()
  expect(root.querySelector('.adestia-row__cell')).toBeNull()
  expect(root.querySelectorAll('.adestia-col')).toHaveLength(2)
  expect(root.textContent).toContain('Un')
  expect(root.textContent).toContain('Trois')
})

it('a col inside a section inside the page: w outside the columns keeps its row', async () => {
  const root = await draw(`::::columns\n:::col\n${band('1/2', 'Dedans')}:::\n:::col\nx\n:::\n::::\n\n${band('1/2', 'Un')}\n${band('1/2', 'Deux')}`)
  expect(root.querySelectorAll('.adestia-row')).toHaveLength(1)
  expect(root.querySelectorAll('.adestia-row__cell')).toHaveLength(2)
})
