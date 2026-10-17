import { describe, expect, it } from 'vitest'

import { resolveLocale, translator } from '../src/app/i18n.js'

describe('resolveLocale', () => {
  it('honours what the operator configured', () => {
    expect(resolveLocale('fr', 'en-US')).toBe('fr')
    expect(resolveLocale('en', 'fr-FR')).toBe('en')
  })

  it('falls to the browser when the instance says nothing', () => {
    // A household in France gets French without configuring anything, and a
    // visitor from elsewhere gets English on the same instance.
    expect(resolveLocale(undefined, 'fr-FR')).toBe('fr')
    expect(resolveLocale(undefined, 'en-GB')).toBe('en')
  })

  it('falls to English for a language it does not speak', () => {
    expect(resolveLocale('de', undefined)).toBe('en')
    expect(resolveLocale(undefined, undefined)).toBe('en')
  })
})

describe('translator', () => {
  it('translates what it knows', () => {
    expect(translator('fr')('Domains')).toBe('Domaines')
    expect(translator('fr')('Nothing matches.')).toBe('Aucun résultat.')
  })

  it('returns the key untouched in English', () => {
    expect(translator('en')('Sections')).toBe('Sections')
  })

  it('degrades to the English sentence, never to an identifier', () => {
    // The whole reason keys ARE the English: a missing translation leaves a
    // correct interface rather than `home.empty.title` on screen.
    expect(translator('fr')('A sentence nobody translated yet')).toBe(
      'A sentence nobody translated yet',
    )
  })
})

describe('the French table addresses the reader as vous', () => {
  it('has no tu form in i18n.ts', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('../src/app/i18n.ts', import.meta.url), 'utf8')
    expect(source.match(/\b(ta|ton|tes|toi|tu)\b/g)).toBeNull()
  })
})
