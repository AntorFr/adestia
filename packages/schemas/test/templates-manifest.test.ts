import { describe, expect, it } from 'vitest'

import { ManifestError, parsePluginManifest } from '../src/validate.js'

const base = { schemaVersion: 1, id: 'pm', kind: 'feature', description: 'x', contract: 1 }
const fields = (fn: () => unknown): string[] => {
  try {
    fn()
  } catch (error) {
    if (error instanceof ManifestError) return error.issues.map((i) => i.field)
    throw error
  }
  return []
}

describe('manifest key `templates` (AD-36)', () => {
  it('accepts paths directly under templates/', () => {
    expect(parsePluginManifest({ ...base, templates: ['templates/status.md', 'templates/a b.md'] }, 'pm').templates).toEqual([
      'templates/status.md',
      'templates/a b.md',
    ])
  })
  it('stays valid without the key', () => {
    expect(parsePluginManifest(base, 'pm').templates).toBeUndefined()
  })
  it('accepts an empty list', () => {
    expect(fields(() => parsePluginManifest({ ...base, templates: [] }, 'pm'))).toEqual([])
  })
  it.each(['status.md', 'templates/status.txt', 'templates/sub/status.md', '../templates/x.md', '/templates/x.md', 'templates/.hidden.md', 'templates/..\\x.md', 'templates/.md/'])(
    'refuses %s',
    (path) => {
      expect(fields(() => parsePluginManifest({ ...base, templates: [path] }, 'pm'))).toEqual(['templates[0]'])
    },
  )
  it('refuses a non-array and a non-string entry', () => {
    expect(fields(() => parsePluginManifest({ ...base, templates: 'templates/a.md' }, 'pm'))).toEqual(['templates'])
    expect(fields(() => parsePluginManifest({ ...base, templates: [3] }, 'pm'))).toEqual(['templates[0]'])
  })
})
