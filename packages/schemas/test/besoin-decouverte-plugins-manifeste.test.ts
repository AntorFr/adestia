/**
 * Feature `adestia-decouverte-plugins` (B-34, AD-37), the manifest contract at its door `parsePluginManifest`,
 * written from docs/donnees.md (« Creations »): a list of `{id, label, line, icon?, where?, action}`, `action` is
 * exactly `{template: "templates/<file>.md"}`, `{folder: true}` is the core's alone.
 */
import { describe, expect, it } from 'vitest'

import { parsePluginManifest } from '../src/index.js'

const entry = { id: 'notes', label: 'Notes', line: 'Une page.', action: { template: 'templates/notes.md' } }
const parse = (creations: unknown) => parsePluginManifest({ schemaVersion: 1, id: 'p', kind: 'feature', description: 'd', creations }, 'p')

describe('manifest creations (B-34)', () => {
  it('keeps a valid list, with a label as {en, fr} and an icon', () => {
    const full = { ...entry, label: { en: 'Notes', fr: 'Notes fr' }, icon: 'check' }
    expect(parse([full]).creations).toEqual([full])
  })
  it('accepts a manifest without the key', () => {
    expect(parsePluginManifest({ schemaVersion: 1, id: 'p', kind: 'feature', description: 'd' }, 'p')).not.toHaveProperty('creations')
  })
  it('refuses {folder: true}, the core\'s alone, and says which entry', () => {
    expect(() => parse([{ ...entry, action: { folder: true } }])).toThrow(/notes/)
  })
  for (const [name, value] of [
    ['an object', {}],
    ['a number', 3],
    ['null', null],
    ['an entry that is a string', ['notes']],
    ['an entry with no label', [{ ...entry, label: undefined }]],
    ['an entry with an empty label', [{ ...entry, label: '' }]],
    ['an entry with no id', [{ ...entry, id: undefined }]],
    ['an entry with no line', [{ ...entry, line: undefined }]],
    ['an entry with no action', [{ ...entry, action: undefined }]],
    ['an action that is neither template nor folder', [{ ...entry, action: { open: 'x' } }]],
    ['a repeated id', [entry, entry]],
  ] as [string, unknown][]) {
    it(`refuses ${name}`, () => {
      expect(() => parse(value)).toThrow()
    })
  }
})
