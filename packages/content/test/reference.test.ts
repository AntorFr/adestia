/**
 * A reference, read and written.
 *
 * The forms below are not invented for the test: each was measured against the
 * real pipeline before the shape was decided (decision log, 2026-09-05), and
 * the ones that fail do so silently, which is why they are pinned here rather
 * than described in a comment somewhere.
 */

import { describe, expect, it } from 'vitest'

import { formatReference, isValidId, parseReference } from '../src/reference.js'

const PAGE = '01M1RXBTP8F57X5BY4N196XV1T'
const BLOCK = '01M1RXC2QK8N4TZ7WV3H0DJ5EA'

describe('reading a reference', () => {
  it('reads a page', () => {
    expect(parseReference(`fiche#${PAGE}`)).toEqual({ type: 'fiche', id: PAGE })
  })

  it('reads a block inside a page — one # per level down', () => {
    expect(parseReference(`fiche#${PAGE}#${BLOCK}`)).toEqual({
      type: 'fiche',
      id: PAGE,
      block: BLOCK,
    })
  })

  it('reads the short form, where the type is not stated', () => {
    // The second resolution rung's job: an id alone, resolved across types
    // when unique. A ULID is unique outright, so this form is not degraded.
    expect(parseReference(`#${PAGE}`)).toEqual({ id: PAGE })
  })

  it('says nothing about a PATH, which is what old references are', () => {
    // `refs: [taches/poncer-porte]` predates ids and must keep working through
    // its own rung. Mangling it here would break the corpus this serves.
    expect(parseReference('taches/poncer-porte')).toBeUndefined()
  })

  it('refuses an unfinished reference rather than guessing', () => {
    // Guessing which page `fiche#` meant is exactly what a lost reference
    // exists to avoid.
    expect(parseReference('fiche#')).toBeUndefined()
    expect(parseReference(`fiche#${PAGE}#`)).toBeUndefined()
    expect(parseReference('#')).toBeUndefined()
  })

  it('refuses a depth nothing means', () => {
    expect(parseReference(`fiche#${PAGE}#${BLOCK}#extra`)).toBeUndefined()
  })

  it('refuses an id carrying a separator, which would read as another thing', () => {
    expect(parseReference('fiche#a/b')).toBeUndefined()
    expect(parseReference('fiche#a b')).toBeUndefined()
  })
})

describe('writing a reference', () => {
  it('round-trips every shape it accepts', () => {
    for (const target of [`fiche#${PAGE}`, `fiche#${PAGE}#${BLOCK}`, `#${PAGE}`]) {
      expect(formatReference(parseReference(target)!)).toBe(target)
    }
  })
})

describe('what may serve as an id', () => {
  it('accepts a ULID, and an id a foreign referential already owns', () => {
    // The ULID is the MINTING POLICY, not the definition of identity: a
    // project in a company already has an id somewhere, and the core never
    // overwrites a declared one.
    expect(isValidId(PAGE)).toBe(true)
    expect(isValidId('tessera-2')).toBe(true)
  })

  it('refuses the separators and the empty string', () => {
    for (const bad of ['', 'a/b', 'a#b', 'a:b', 'a b']) expect(isValidId(bad)).toBe(false)
  })
})
