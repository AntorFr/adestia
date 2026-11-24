/**
 * The path words the pages share (AD-13 a).
 */
import { describe, expect, it } from 'vitest'

import { folderOf, prettify } from '../src/app/paths.js'

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
