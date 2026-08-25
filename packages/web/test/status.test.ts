import { describe, expect, it } from 'vitest'

import { isFinished, toneOf } from '../src/app/status.js'

describe('toneOf', () => {
  it('reads the vocabulary the real corpus writes', () => {
    // Measured, not guessed: these are the eight values a real body of pages
    // actually carries, in their real spellings and accents.
    expect(toneOf('en-cours')).toBe('underway')
    expect(toneOf('en cours')).toBe('underway')
    expect(toneOf('idée')).toBe('underway')
    expect(toneOf('veille')).toBe('underway')
    expect(toneOf('à-acheter')).toBe('waiting')
    expect(toneOf('commandé')).toBe('waiting')
    expect(toneOf('clos')).toBe('settled')
    expect(toneOf('réalisé')).toBe('settled')
  })

  it('is tolerant about case and spacing', () => {
    expect(toneOf('  Clos ')).toBe('settled')
  })

  it('falls back to underway for a word it has never met', () => {
    // The safe direction: an unknown status keeps its page visible and
    // normally-coloured rather than dressing it as something it is not.
    expect(toneOf('en-jachère')).toBe('underway')
    expect(toneOf(undefined)).toBe('underway')
    expect(toneOf(42)).toBe('underway')
  })
})

describe('isFinished', () => {
  it('archives what is settled', () => {
    expect(isFinished({ status: 'clos' })).toBe(true)
    expect(isFinished({ statut: 'réalisé' })).toBe(true)
  })

  it('keeps what is underway or waiting', () => {
    expect(isFinished({ status: 'en-cours' })).toBe(false)
    expect(isFinished({ status: 'à-acheter' })).toBe(false)
    expect(isFinished({})).toBe(false)
  })

  it('archives a purchase that was bought, but not a gift that was', () => {
    // The distinction a colour table cannot express: `acheté` is settled as a
    // colour everywhere, but a gift bought is still a gift to GIVE.
    expect(isFinished({ status: 'acheté', type: 'achat' })).toBe(true)
    expect(isFinished({ status: 'acheté', type: 'cadeau' })).toBe(false)
    // Its colour stays settled either way.
    expect(toneOf('acheté')).toBe('settled')
  })
})
