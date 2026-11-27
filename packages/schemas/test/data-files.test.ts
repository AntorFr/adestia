import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { matchesDataFile } from '../src/data-files.js'
import { ManifestError, parsePluginManifest } from '../src/validate.js'

const base = { schemaVersion: 1, id: 'demo', kind: 'app', description: 'A demo.' }

function issuesOf(dataFiles: unknown): string[] {
  try {
    parsePluginManifest({ ...base, dataFiles }, 'demo')
  } catch (error) {
    if (error instanceof ManifestError) return error.issues.map((i) => `${i.field}: ${i.message}`)
    throw error
  }
  return []
}

function manifestOf(id: string): ReturnType<typeof parsePluginManifest> {
  const url = new URL(`../../../plugins/${id}/adestia-plugin.json`, import.meta.url)
  return parsePluginManifest(JSON.parse(readFileSync(fileURLToPath(url), 'utf8')), id)
}

const matchesAny = (patterns: readonly string[] | undefined, path: string): boolean =>
  (patterns ?? []).some((p) => matchesDataFile(p, path))

describe('dataFiles in the plugin manifest (AD-41)', () => {
  it('accepts a list of relative patterns, and the key is optional', () => {
    expect(parsePluginManifest({ ...base, dataFiles: ['assets/x.json', '*.y.json'] }, 'demo').dataFiles).toEqual([
      'assets/x.json',
      '*.y.json',
    ])
    expect(parsePluginManifest(base, 'demo').dataFiles).toBeUndefined()
    expect(issuesOf([])).toEqual([])
  })

  it.each([
    ['a string', 'assets/x.json'],
    ['an object', { a: 1 }],
    ['a number', 3],
    ['null', null],
  ])('refuses %s instead of a list', (_name, value) => {
    expect(issuesOf(value).join('\n')).toMatch(/dataFiles: must be an array of non-empty strings/)
  })

  it.each([
    ['a number element', ['a.json', 3]],
    ['a null element', [null]],
    ['an object element', [{}]],
    ['an empty string', ['']],
  ])('refuses %s', (_name, value) => {
    expect(issuesOf(value).join('\n')).toMatch(/dataFiles: must be an array of non-empty strings/)
  })

  it.each([
    ['an absolute path', ['/etc/x.json'], /dataFiles\[0\]: must be relative/],
    ['a leading ..', ['../x.json'], /dataFiles\[0\]: must not escape/],
    ['a .. in the middle', ['assets/../x.json'], /dataFiles\[1\]: must not escape/],
    ['a URL', ['https://x/y.json'], /dataFiles\[0\]/],
  ])('refuses %s with the message of the other path keys', (_name, value, expected) => {
    const list = value[0] === 'assets/../x.json' ? ['ok.json', ...value] : value
    expect(issuesOf(list).join('\n')).toMatch(expected)
  })

  it('refuses the plugin (ManifestError), not just reports', () => {
    expect(() => parsePluginManifest({ ...base, dataFiles: '/x' }, 'demo')).toThrow(ManifestError)
  })
})

describe('matchesDataFile', () => {
  it('matches a literal path exactly', () => {
    expect(matchesDataFile('assets/voyage.json', 'assets/voyage.json')).toBe(true)
    expect(matchesDataFile('assets/voyage.json', 'voyage.json')).toBe(false)
    expect(matchesDataFile('assets/voyage.json', 'a/assets/voyage.json')).toBe(false)
    expect(matchesDataFile('assets/voyage.json', 'assets/voyage.json.bak')).toBe(false)
  })

  it('treats the dot as a literal, not as any character', () => {
    expect(matchesDataFile('assets/voyage.json', 'assets/voyageXjson')).toBe(false)
    expect(matchesDataFile('*.parcours.json', 'xparcoursxjson')).toBe(false)
  })

  it('lets * stand for a run inside one segment, never across a slash', () => {
    expect(matchesDataFile('*.parcours.json', 'x.parcours.json')).toBe(true)
    expect(matchesDataFile('*.parcours.json', 'a b.parcours.json')).toBe(true)
    expect(matchesDataFile('*.parcours.json', 'assets/x.parcours.json')).toBe(false)
    expect(matchesDataFile('*.parcours.json', 'a/b.parcours.json')).toBe(false)
    expect(matchesDataFile('assets/*.parcours.json', 'assets/x.parcours.json')).toBe(true)
    expect(matchesDataFile('assets/*.parcours.json', 'assets/sub/x.parcours.json')).toBe(false)
    expect(matchesDataFile('assets/*.parcours.json', 'x.parcours.json')).toBe(false)
  })

  it('lets * match the empty run', () => {
    expect(matchesDataFile('*.parcours.json', '.parcours.json')).toBe(true)
  })

  it('takes every regex metacharacter literally', () => {
    expect(matchesDataFile('a+b(1).json', 'a+b(1).json')).toBe(true)
    expect(matchesDataFile('a+b(1).json', 'aab1.json')).toBe(false)
    expect(matchesDataFile('[x]$.json', '[x]$.json')).toBe(true)
    expect(matchesDataFile('a|b', 'a')).toBe(false)
    expect(matchesDataFile('a\\b', 'a\\b')).toBe(true)
  })

  it('does not let a newline slip past the anchors', () => {
    expect(matchesDataFile('assets/voyage.json', 'assets/voyage.json\nx')).toBe(false)
    expect(matchesDataFile('*.parcours.json', 'x.parcours.json\n')).toBe(false)
  })
})

describe('the data files the official plugins declare', () => {
  it.each([
    ['voyages', 'assets/voyage.json', true],
    ['voyages', 'voyage.json', false],
    ['voyages', 'a/assets/voyage.json', false],
    ['voyages', 'assets/notes.json', false],
    ['voyages', 'notes.json', false],
    ['atelier', 'assets/workbook.json', true],
    ['atelier', 'workbook.json', false],
    ['atelier', 'a/assets/workbook.json', false],
    ['atelier', 'assets/notes.json', false],
    ['parcours', 'x.parcours.json', true],
    ['parcours', 'assets/x.parcours.json', true],
    ['parcours', 'a/assets/x.parcours.json', false],
    ['parcours', 'a/x.parcours.json', false],
    ['parcours', 'notes.json', false],
    ['parcours', 'assets/notes.json', false],
    ['parcours', 'parcours.json', false],
  ])('%s: %s → %s', (plugin, path, expected) => {
    expect(matchesAny(manifestOf(plugin).dataFiles, path)).toBe(expected)
  })

  it('declares nothing else than its own files', () => {
    expect(manifestOf('voyages').dataFiles).toEqual(['assets/voyage.json'])
    expect(manifestOf('atelier').dataFiles).toEqual(['assets/workbook.json'])
    expect(manifestOf('parcours').dataFiles).toEqual(['*.parcours.json', 'assets/*.parcours.json'])
  })
})
