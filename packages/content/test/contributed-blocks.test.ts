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

describe('the other shell’s spelling', () => {
  const legacy = 'Un paragraphe.\n\n{% parcours source="assets/val.parcours.json" /%}\n\nSuite.\n'

  it('stays literal text while nothing contributes the block', () => {
    // The behaviour that shipped before any of this: a tag nobody knows is
    // kept verbatim rather than swallowed. Registering blocks must not change
    // what an UNKNOWN one does.
    const node = parse(legacy).children[1] as { type: string; children: { value: string }[] }
    expect(node.type).toBe('paragraph')
    expect(node.children[0]?.value).toContain('{% parcours')
  })

  it('becomes the very node `:::` makes, once contributed', () => {
    registerBlocks(PARCOURS)
    const node = parse(legacy).children[1] as {
      type: string
      name: string
      attributes: Record<string, string>
      children: unknown[]
    }
    expect(node.type).toBe('containerDirective')
    expect(node.name).toBe('parcours')
    expect(node.attributes.source).toBe('assets/val.parcours.json')
    // `empty` means empty: a body here would be a diagnostic downstream.
    expect(node.children).toEqual([])
  })

  it('reads a contributed container, body and all', () => {
    registerBlocks({ encadre: { content: 'flow', description: 'A framed aside.' } })
    const node = parse('{% encadre %}\n\nDu texte.\n\n{% /encadre %}\n').children[0] as {
      type: string
      name: string
      children: { type: string }[]
    }
    expect(node.type).toBe('containerDirective')
    expect(node.name).toBe('encadre')
    expect(node.children[0]?.type).toBe('paragraph')
  })

  it('goes back to being text when the plugin goes away, not to a refusal', () => {
    // The asymmetry, verified against a running instance: `:::parcours` with
    // no plugin is a diagnostic and a read-only page, while `{% parcours %}`
    // is inert text. Deliberate, and it has to stay so — the corpus this
    // spelling comes from lives in a store two products share, and one of
    // them must not refuse those pages because the other turned a plugin off.
    registerBlocks(PARCOURS)
    expect(parse(legacy).children[1]?.type).toBe('containerDirective')
    forgetContributedBlocks()
    expect(parse(legacy).children[1]?.type).toBe('paragraph')
    expect(validateDocument(parse(legacy))).toEqual([])
  })

  it('serializes into Adestia’s spelling, never back', () => {
    registerBlocks(PARCOURS)
    expect(serialize(parse(legacy))).toContain(':::parcours{source="assets/val.parcours.json"}')
  })
})
