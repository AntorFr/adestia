import { describe, expect, it } from 'vitest'

import { ManifestError, parsePluginManifest } from '../src/validate.js'

const base = { schemaVersion: 1, id: 'seeds', kind: 'feature', description: 'A plugin.' }
const good = { id: 'meeting', label: 'Meeting', line: 'A meeting note.', action: { template: 'templates/meeting.md' } }
const parse = (creations: unknown) => parsePluginManifest({ ...base, creations }, 'seeds')
const refusal = (creations: unknown): string => {
  try {
    parse(creations)
  } catch (error) {
    expect(error).toBeInstanceOf(ManifestError)
    return (error as Error).message
  }
  throw new Error('accepted')
}

describe('manifest creations key', () => {
  it('keeps a valid list, with an {en, fr} label', () => {
    const list = [{ ...good, label: { en: 'Meeting', fr: 'Réunion' }, icon: 'nope', where: ['home'] }]
    expect(parse(list).creations).toEqual(list)
  })
  it('is optional', () => {
    expect(parsePluginManifest(base, 'seeds').creations).toBeUndefined()
  })
  it.each([['a string', 'x'], ['an object', { good }], ['null', null], ['a number', 3]])('refuses %s instead of a list', (_n, v) => {
    expect(refusal(v)).toContain('creations')
  })
  it.each(['id', 'label', 'line', 'action'])('refuses an entry without %s, naming the entry', (key) => {
    const { [key]: _gone, ...rest } = good as Record<string, unknown>
    const message = refusal([rest])
    expect(message).toContain(`creations[0].${key}`)
  })
  it('names the entry by id', () => {
    const { label: _l, ...rest } = good
    expect(refusal([rest])).toContain('entry "meeting"')
  })
  it('refuses the core folder action', () => {
    expect(refusal([{ ...good, action: { folder: true } }])).toContain('core')
    expect(refusal([{ ...good, action: { folder: false } }])).toContain('core')
  })
  it.each([{}, { template: '../x.md' }, { template: 'templates/a/b.md' }, { template: 'templates/.h.md' }, { template: 3 }, 'x'])(
    'refuses action %j',
    (action) => {
      expect(() => parse([{ ...good, action }])).toThrow(ManifestError)
    },
  )
  it('refuses empty label, bad where, entries that are not objects, and a repeated id', () => {
    expect(() => parse([{ ...good, label: '' }])).toThrow()
    expect(() => parse([{ ...good, label: { fr: 'x' } }])).toThrow()
    expect(() => parse([{ ...good, where: ['elsewhere'] }])).toThrow()
    expect(() => parse([{ ...good, where: 'home' }])).toThrow()
    expect(() => parse([{ ...good, icon: '' }])).toThrow()
    expect(() => parse(['x'])).toThrow()
    expect(() => parse([null])).toThrow()
    expect(() => parse([good, good])).toThrow(/twice/)
  })
})
