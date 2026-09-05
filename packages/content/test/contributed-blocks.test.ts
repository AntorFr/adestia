/**
 * Blocks a plugin adds to the closed vocabulary.
 *
 * What these guard is a boundary, not a feature: the vocabulary stays closed
 * to PAGES and opens only to an activated plugin, the core never loses a name
 * to one, and a block nobody contributed keeps behaving exactly as it did
 * before any of this existed.
 */

import { afterEach, describe, expect, it } from 'vitest'

import { parse, serialize } from '../src/pipeline.js'
import { validateDocument } from '../src/validate.js'
import {
  blockSpec,
  contributedBlocks,
  forgetContributedBlocks,
  isKnownBlock,
  registerBlocks,
} from '../src/vocabulary.js'

const PARCOURS = {
  parcours: {
    content: 'empty',
    description: 'A walk, drawn from its own file.',
    attributes: {
      source: { required: true },
      vue: { values: ['carte', 'lien'], default: 'carte' },
    },
  },
} as const

afterEach(() => forgetContributedBlocks())

describe('the registry', () => {
  it('refuses a name the core already owns, and says which', () => {
    const refused = registerBlocks({ callout: { content: 'flow', description: 'mine now' } })
    expect(refused).toEqual(['callout'])
    // Unchanged: a plugin taking over `callout` is the one thing a closed
    // vocabulary exists to prevent.
    expect(blockSpec('callout')?.description).toBe('A highlighted aside: note, tip or warning.')
  })

  it('takes a block with no attributes at all', () => {
    registerBlocks({ signature: { content: 'empty', description: 'A sign-off.' } })
    expect(blockSpec('signature')?.attributes).toEqual({})
  })

  it('gives the block back when the plugin goes away', () => {
    registerBlocks(PARCOURS)
    expect(isKnownBlock('parcours')).toBe(true)
    forgetContributedBlocks()
    expect(isKnownBlock('parcours')).toBe(false)
    expect(contributedBlocks()).toEqual([])
  })
})

describe('a page holding one', () => {
  const page = '::: is not it\n\n:::parcours{source="assets/val.parcours.json"}\n:::\n'

  it('is a diagnostic while no plugin contributes it', () => {
    const [issue] = validateDocument(parse(page))
    expect(issue?.severity).toBe('error')
    expect(issue?.block).toBe('parcours')
  })

  it('validates once one does', () => {
    registerBlocks(PARCOURS)
    expect(validateDocument(parse(page))).toEqual([])
  })

  it('still catches a missing required attribute', () => {
    registerBlocks(PARCOURS)
    const [issue] = validateDocument(parse(':::parcours\n:::\n'))
    expect(issue?.message).toContain('source')
  })

  it('still catches a value outside the closed set', () => {
    registerBlocks(PARCOURS)
    const [issue] = validateDocument(parse(':::parcours{source="x.json" vue="galerie"}\n:::\n'))
    expect(issue?.message).toContain('vue')
  })
})
