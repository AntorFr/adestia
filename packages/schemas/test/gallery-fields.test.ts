import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { parsePluginManifest } from '../src/validate.js'

const base = { schemaVersion: 1, id: 'workbench', kind: 'feature', description: 'A plugin.' }
const entry = { name: 'Bench', line: 'A bench.', image: './web/bench.svg', group: 'Workbench' }
const columns = [{ key: 'label', kind: 'text', label: 'Label', required: true }]
const read = (extra: object) => parsePluginManifest({ ...base, gallery: { bench: { ...entry, ...extra } } }, 'workbench').gallery?.['bench']

describe('gallery fields and view (AD-forms-1, AD-35)', () => {
  it('accepts the project-management manifest with the timeline fields and no view', () => {
    const path = fileURLToPath(new URL('../../../plugins/project-management/adestia-plugin.json', import.meta.url))
    const m = parsePluginManifest(JSON.parse(readFileSync(path, 'utf8')), 'project-management')
    const timeline = m.gallery?.['timeline']
    expect(timeline?.fields?.line).toBe('label-range')
    expect(timeline?.fields?.columns.map((c) => [c.key, c.kind])).toEqual([
      ['label', 'text'],
      ['start', 'date'],
      ['due', 'date'],
    ])
    expect(timeline?.view).toBeUndefined()
  })

  it('ignores a fields naming an unknown line format, without error, keeping the card', () => {
    const e = read({ fields: { line: 'label-matrix', columns } })
    expect(e?.name).toBe('Bench')
    expect(e?.fields).toBeUndefined()
  })

  it('reads fields with a label as a string or as {en, fr}', () => {
    const e = read({ fields: { line: 'label-value', columns: [{ key: 'label', kind: 'link', label: { en: 'Label', fr: 'Libellé' } }] } })
    expect(e?.fields?.columns[0]).toEqual({ key: 'label', kind: 'link', label: { en: 'Label', fr: 'Libellé' } })
  })

  it.each([
    ['unknown column kind', { line: 'label-value', columns: [{ key: 'a', kind: 'color', label: 'A' }] }],
    ['no columns for a non-table line', { line: 'label-value', columns: [] }],
    ['columns missing', { line: 'label-value' }],
    ['duplicate keys', { line: 'label-value', columns: [...columns, ...columns] }],
    ['not an object', 'label-value'],
  ])('drops a fields with %s, without error', (_n, fields) => {
    expect(read({ fields })?.fields).toBeUndefined()
  })

  it('accepts a table with no columns', () => {
    expect(read({ fields: { line: 'table', columns: [] } })?.fields?.line).toBe('table')
  })

  it('reads a view, and drops one whose default is not among its values or that has one value', () => {
    expect(read({ view: { values: ['a', 'b'], default: 'a' } })?.view).toEqual({ values: ['a', 'b'], default: 'a' })
    expect(read({ view: { values: ['a', 'b'], default: 'c' } })?.view).toBeUndefined()
    expect(read({ view: { values: ['a'], default: 'a' } })?.view).toBeUndefined()
  })
})
