import { describe, expect, it } from 'vitest'

import { parsePluginManifest } from '../src/validate.js'

const base = { schemaVersion: 1, id: 'workbench', kind: 'feature', description: 'A plugin.' }
const entry = { name: 'Bench', line: 'A bench.', image: './web/bench.svg', group: 'Workbench' }
const read = (fields: unknown) => parsePluginManifest({ ...base, gallery: { bench: { ...entry, fields } } }, 'workbench').gallery?.['bench']

describe('check/choice columns and the two project lines', () => {
  it('accepts milestones and risks declarations', () => {
    const m = read({ line: 'label-date-done', columns: [
      { key: 'label', kind: 'text', label: 'Label', required: true },
      { key: 'date', kind: 'date', label: 'Date', required: true },
      { key: 'done', kind: 'check', label: 'Done' }] })
    expect(m?.fields?.line).toBe('label-date-done')
    expect(m?.fields?.columns.map((c) => c.kind)).toEqual(['text', 'date', 'check'])
    const r = read({ line: 'label-level-owner', columns: [
      { key: 'label', kind: 'text', label: 'Label' },
      { key: 'level', kind: 'choice', label: 'Level' },
      { key: 'owner', kind: 'text', label: 'Owner' }] })
    expect(r?.fields?.columns[1]?.kind).toBe('choice')
  })
  it('refuses an unknown kind or line without losing the card', () => {
    const k = read({ line: 'label-value', columns: [{ key: 'label', kind: 'radio', label: 'L' }] })
    expect(k?.name).toBe('Bench')
    expect(k?.fields).toBeUndefined()
    expect(read({ line: 'label-date-owner', columns: [{ key: 'label', kind: 'text', label: 'L' }] })?.fields).toBeUndefined()
  })
})
