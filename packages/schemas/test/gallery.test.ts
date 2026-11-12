import { describe, expect, it } from 'vitest'

import { ManifestError, parsePluginManifest } from '../src/validate.js'

const base = { schemaVersion: 1, id: 'workbench', kind: 'feature', description: 'A plugin.' }
const entry = { name: 'Bench', line: 'A bench.', image: './web/bench.svg', group: 'Workbench' }

function issues(manifest: unknown): string[] {
  try {
    parsePluginManifest(manifest, 'workbench')
  } catch (error) {
    if (error instanceof ManifestError) return error.issues.map((i) => `${i.field}: ${i.message}`)
    throw error
  }
  return []
}

describe('gallery contract', () => {
  it('accepts a gallery record, with fields and view unread', () => {
    const m = parsePluginManifest({ ...base, gallery: { bench: { ...entry, fields: {}, view: [] } } }, 'workbench')
    expect(m.gallery?.['bench']?.group).toBe('Workbench')
  })

  it('accepts an {en, fr} pair and an en-only pair', () => {
    expect(issues({ ...base, gallery: { bench: { ...entry, name: { en: 'Bench', fr: 'Établi' }, line: { en: 'x' } } } })).toEqual([])
  })

  it('refuses a record with no name', () => {
    const { name: _n, ...noName } = entry
    expect(issues({ ...base, gallery: { bench: noName } }).join()).toContain('gallery.bench.name')
  })

  it.each([
    ['empty name', { name: '' }],
    ['pair without en', { name: { fr: 'Établi' } }],
    ['empty fr', { name: { en: 'x', fr: '' } }],
    ['number line', { line: 3 }],
    ['no line', { line: undefined }],
    ['no image', { image: undefined }],
    ['absolute image', { image: '/etc/passwd' }],
    ['escaping image', { image: '../x.svg' }],
    ['no group', { group: undefined }],
  ])('refuses %s', (_label, patch) => {
    expect(issues({ ...base, gallery: { bench: { ...entry, ...patch } } })).not.toEqual([])
  })

  it('refuses a gallery that is not an object, a record that is not, and a bad block name', () => {
    expect(issues({ ...base, gallery: [] })).not.toEqual([])
    expect(issues({ ...base, gallery: { bench: 'x' } })).not.toEqual([])
    expect(issues({ ...base, gallery: { 'Bad Name': entry } })).not.toEqual([])
  })

  it('leaves a manifest without gallery valid', () => {
    expect(issues(base)).toEqual([])
  })
})
