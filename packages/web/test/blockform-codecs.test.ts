/**
 * The four line codecs (AD-forms-1, AD-forms-2), judged from the criterion:
 * `lines → rows → lines` gives the same bytes on a page written by hand before
 * the epic, unreadable lines included, and an edited row changes only its line.
 * Every expected line below is written out by hand, not read back from a codec.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { codecFor, validateRow, refuseCell, isNumericValue } from '../src/editor/blockform/index.js'
import type { Row } from '../src/editor/blockform/index.js'

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./fixtures/blockform/${name}.md`, import.meta.url)), 'utf8')

/** The lines between the `:::name` opener and its closing `:::`. */
function body(page: string): string[] {
  const lines = page.split('\n')
  const open = lines.findIndex((l) => l.startsWith(':::'))
  const close = lines.indexOf(':::', open + 1)
  return lines.slice(open + 1, close)
}

const CASES = [
  ['figures', 'label-value-caption', [3, 5]],
  ['timeline', 'label-range', [3, 4]],
  ['list', 'label-value', [3, 4]],
  ['table', 'table', [1, 4]],
] as const

describe.each(CASES)('%s fixture', (name, line, keptAt) => {
  const codec = codecFor(line)
  const lines = body(fixture(name))

  it('comes back byte for byte, unreadable lines included', () => {
    const { rows, kept } = codec.read(lines)
    expect(codec.write(rows, kept)).toEqual(lines)
  })

  it('keeps the unreadable lines at the index they stood at', () => {
    const { kept, rows } = codec.read(lines)
    expect(kept.map((k) => k.index)).toEqual([...keptAt])
    for (const k of kept) expect(k.line).toBe(lines[k.index])
    expect(rows.length + kept.length).toBe(lines.length)
    expect(rows.length).toBe(lines.length - keptAt.length)
  })
})

describe('figures: label-value-caption', () => {
  const codec = codecFor('label-value-caption')
  const lines = body(fixture('figures'))

  it('reads label, value and caption; a line with no colon is kept', () => {
    const { rows, kept } = codec.read(lines)
    expect(rows.map((r) => r.cells)).toEqual([
      { label: 'Avancement', value: '62 %', caption: '8 lots sur 13' },
      { label: 'Budget consommé', value: '41 %', caption: '' },
      { label: 'Retards', value: '3', caption: 'deux sur le gros œuvre' },
      { label: 'Lots livrés', value: '8 of 13', caption: 'dont l’électricité — et la plomberie' },
    ])
    expect(kept.map((k) => k.line)).toEqual(['Un commentaire que personne ne sait lire', '- Sans libellé'])
  })

  it('an edited row changes only its own line', () => {
    const { rows, kept } = codec.read(lines)
    const edited = rows.map((r, i): Row => (i === 2 ? { ...r, cells: { ...r.cells, value: '4' } } : r))
    const out = codec.write(edited, kept)
    const want = [...lines]
    want[2] = '- Retards: 4 — deux sur le gros œuvre'
    expect(out).toEqual(want)
  })

  it('a row given no raw is written in the canonical form', () => {
    const out = codec.write([{ cells: { label: 'Budget', value: '10 %', caption: '' } }], [])
    expect(out).toEqual(['- Budget: 10 %'])
  })

  it('a row added at the end lands after the kept line standing there', () => {
    const { rows, kept } = codec.read(lines)
    const out = codec.write([...rows, { cells: { label: 'Neuf', value: '1', caption: 'x' } }], kept)
    expect(out).toEqual([...lines, '- Neuf: 1 — x'])
  })

  it('a removed row leaves the kept lines at their index', () => {
    const { rows, kept } = codec.read(lines)
    const out = codec.write(rows.slice(1), kept)
    expect(out).toEqual([
      '* Budget consommé: 41 %',
      '-   Retards:   3   —  deux sur le gros œuvre',
      '- Lots livrés: 8 of 13 — dont l’électricité — et la plomberie',
      'Un commentaire que personne ne sait lire',
      '- Sans libellé',
    ])
  })
})

describe('timeline: label-range', () => {
  const codec = codecFor('label-range')
  const lines = body(fixture('timeline'))

  it('reads both arrows, a milestone with no start; a backwards range or a word is kept', () => {
    const { rows, kept } = codec.read(lines)
    expect(rows.map((r) => r.cells)).toEqual([
      { label: 'Cadrage', start: '2026-01-15', due: '2026-03-01' },
      { label: 'Maquettes', start: '2026-03-02', due: '2026-04-15' },
      { label: 'Recette', start: '', due: '2026-06-01' },
      { label: 'Go live', start: '', due: '2026-09-01' },
    ])
    expect(kept.map((k) => k.line)).toEqual(['- Livraison: bientôt', '- Fin: 2026-05-01 → 2026-04-01'])
  })

  it('editing a row written with -> rewrites only that row, with the arrow →', () => {
    const { rows, kept } = codec.read(lines)
    const edited = rows.map((r, i): Row => (i === 1 ? { ...r, cells: { ...r.cells, due: '2026-04-20' } } : r))
    const want = [...lines]
    want[1] = '- Maquettes: 2026-03-02 → 2026-04-20'
    expect(codec.write(edited, kept)).toEqual(want)
  })

  it('a milestone is written with its due alone', () => {
    expect(codec.write([{ cells: { label: 'Jalon', start: '', due: '2026-07-01' } }], [])).toEqual(['- Jalon: 2026-07-01'])
  })
})

describe('list: label-value', () => {
  const codec = codecFor('label-value')
  const lines = body(fixture('list'))

  it('reads a bullet with an empty value, and keeps the blank and the colon-less lines', () => {
    const { rows, kept } = codec.read(lines)
    expect(rows.map((r) => r.cells)).toEqual([
      { label: 'Pilote', value: 'Camille' },
      { label: 'Rôle sans personne', value: '' },
      { label: 'Relecture', value: 'Noé' },
      { label: 'Support', value: 'Aïcha — jours pairs' },
    ])
    expect(kept.map((k) => k.line)).toEqual(['', '- une ligne sans deux-points'])
  })

  it('editing the `*` bullet row changes only it', () => {
    const { rows, kept } = codec.read(lines)
    const edited = rows.map((r, i): Row => (i === 2 ? { ...r, cells: { ...r.cells, value: 'Léo' } } : r))
    const want = [...lines]
    want[2] = '- Relecture: Léo'
    expect(codec.write(edited, kept)).toEqual(want)
  })
})

describe('table', () => {
  const codec = codecFor('table')
  const lines = body(fixture('table'))

  it('reads header and body, keeps the delimiter and the row with no closing pipe', () => {
    const { rows, kept } = codec.read(lines)
    expect(rows.map((r) => r.cells)).toEqual([
      { c0: 'Risque', c1: 'Gravité', c2: 'Action' },
      { c0: 'Retard livraison', c1: 'Haute', c2: 'Relancer \\| le fournisseur' },
      { c0: 'Fuite', c1: 'Moyenne', c2: 'Colmater' },
      { c0: 'Chute', c1: 'Basse', c2: 'Rien' },
    ])
    expect(kept.map((k) => k.line)).toEqual(['| :--- | :-: | ---: |', '| ligne sans tuyau final | x | y'])
  })

  it('editing a cell keeps the delimiter, alignment colons included', () => {
    const { rows, kept } = codec.read(lines)
    const edited = rows.map((r, i): Row => (i === 3 ? { ...r, cells: { ...r.cells, c2: 'Aucune' } } : r))
    const want = [...lines]
    want[5] = '| Chute | Basse | Aucune |'
    expect(codec.write(edited, kept)).toEqual(want)
  })

  it('adding a column rewrites the delimiter to the new width, and only it among kept lines', () => {
    const { rows, kept } = codec.read(lines)
    const wider = rows.map((r, i): Row => ({ cells: { ...r.cells, c3: i === 0 ? 'Qui' : 'moi' } }))
    const out = codec.write(wider, kept)
    expect(out[1]).toBe('| --- | --- | --- | --- |')
    expect(out[4]).toBe('| ligne sans tuyau final | x | y')
    expect(out[0]).toBe('| Risque | Gravité | Action | Qui |')
  })
})

describe('column rules', () => {
  const number = { key: 'value', kind: 'number', label: 'Value' } as const
  const date = { key: 'due', kind: 'date', label: 'Due' } as const

  it.each([['3'], ['62 %'], ['14 of 37'], ['']])('accepts %j as a numeric value', (v) => {
    expect(isNumericValue(v)).toBe(true)
    expect(refuseCell(number, v)).toBeNull()
  })

  it('refuses « three » as a numeric value', () => {
    expect(refuseCell(number, 'three')).toBe('number')
  })

  it('refuses a required empty cell, accepts an optional one', () => {
    expect(refuseCell({ key: 'label', kind: 'text', label: 'L', required: true }, '  ')).toBe('required')
    expect(refuseCell({ key: 'caption', kind: 'text', label: 'C' }, '')).toBeNull()
  })

  it('refuses a date that does not exist or is not written 2026-03-01', () => {
    expect(refuseCell(date, '2026-02-30')).toBe('date')
    expect(refuseCell(date, '1/3/2026')).toBe('date')
    expect(refuseCell(date, '2026-03-01')).toBeNull()
  })

  const columns = [
    { key: 'label', kind: 'text', label: 'L', required: true },
    { key: 'start', kind: 'date', label: 'S' },
    { key: 'due', kind: 'date', label: 'D', required: true },
  ] as const

  it('refuses a due before the start, on the due', () => {
    expect(validateRow(columns, 'label-range', { label: 'x', start: '2026-03-02', due: '2026-03-01' })).toEqual([
      { key: 'due', refusal: 'order' },
    ])
  })

  it('accepts a due equal to the start and a milestone with no start', () => {
    expect(validateRow(columns, 'label-range', { label: 'x', start: '2026-03-01', due: '2026-03-01' })).toEqual([])
    expect(validateRow(columns, 'label-range', { label: 'x', start: '', due: '2026-03-01' })).toEqual([])
  })

  it('refuses a figures row whose value is « three »', () => {
    const cols = [
      { key: 'label', kind: 'text', label: 'L', required: true },
      { key: 'value', kind: 'number', label: 'V' },
    ] as const
    expect(validateRow(cols, 'label-value-caption', { label: 'x', value: 'three', caption: '' })).toEqual([
      { key: 'value', refusal: 'number' },
    ])
    expect(validateRow(cols, 'label-value-caption', { label: 'x', value: '62 %', caption: '' })).toEqual([])
  })
})
