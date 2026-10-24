/**
 * The path words the pages share (AD-13 a): each index rule pinned on the same
 * seven paths, so the two spellings cannot drift apart again.
 */
import { describe, expect, it } from 'vitest'

import { folderOf, isIndexFile, isIndexPath, prettify } from '../src/app/paths.js'

describe('the two index rules', () => {
  const cases: readonly [string, boolean, boolean][] = [
    // path, isIndexFile, isIndexPath
    ['index.md', true, true],
    ['INDEX.MD', true, true],
    ['a/index', false, true],
    ['a/a.md', true, true],
    ['a/a', true, true],
    ['a/b.md', false, false],
    ['index', false, true],
  ]
  it.each(cases)('%s → file %s, path %s', (path, file, address) => {
    expect(isIndexFile(path)).toBe(file)
    expect(isIndexPath(path)).toBe(address)
  })

  it('differ only on paths without the .md extension', () => {
    for (const [path, file, address] of cases) {
      if (file !== address) expect(path).not.toMatch(/\.md$/i)
    }
  })

  it('does not take a root page for a homonym, nor a deeper folder name', () => {
    expect(isIndexFile('a.md')).toBe(false)
    expect(isIndexPath('a')).toBe(false)
    expect(isIndexFile('x/a/b.md')).toBe(false)
    expect(isIndexFile('a/b/a.md')).toBe(false)
    expect(isIndexFile('x/index.md')).toBe(true)
    expect(isIndexFile('x/notindex.md')).toBe(false)
  })
})

describe('folderOf and prettify', () => {
  it('cuts at the last slash, and is empty at the root', () => {
    expect(folderOf('domaines/achats/INDEX.md')).toBe('domaines/achats')
    expect(folderOf('a.md')).toBe('')
    expect(folderOf('')).toBe('')
  })
  it('spaces dashes and underscores and capitalises', () => {
    expect(prettify('plan-travail_garage')).toBe('Plan travail garage')
    expect(prettify('--')).toBe('--')
    expect(prettify('')).toBe('')
  })
})
