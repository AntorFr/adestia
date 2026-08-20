/**
 * Round-trip conformance — the gate.
 *
 * Promoted from spike 1, where it decided which editor Golem would use. It now
 * guards the pipeline itself: files are the source of truth, so a save that
 * rewrites bytes the user did not touch is a bug, however "equivalent" the
 * markdown may be.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parse, serialize } from '../src/pipeline.js'
import { frontmatterOf, validateDocument } from '../src/validate.js'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const fixtures = readdirSync(fixturesDir).filter((f) => f.endsWith('.md') && f !== 'README.md')

describe('round-trip conformance', () => {
  it('has fixtures to check', () => {
    // A silently empty corpus would turn this gate into a green light that
    // checks nothing — the most expensive kind of passing test.
    expect(fixtures.length).toBeGreaterThan(0)
  })

  for (const fixture of fixtures) {
    it(`${fixture} round-trips byte-identical`, () => {
      const input = readFileSync(join(fixturesDir, fixture), 'utf8')
      expect(serialize(parse(input))).toBe(input)
    })

    it(`${fixture} carries no diagnostics`, () => {
      // House-style fixtures must also be legal documents: a file that
      // round-trips perfectly but breaks the vocabulary is not a good example.
      expect(validateDocument(parse(readFileSync(join(fixturesDir, fixture), 'utf8')))).toEqual([])
    })
  }
})

describe('typed blocks are first-class', () => {
  const doc = parse(readFileSync(join(fixturesDir, 'typed-blocks.md'), 'utf8'))

  it('parses directives as directive nodes, never as text', () => {
    const kinds = doc.children.map((child) => child.type)
    expect(kinds.filter((k) => k === 'containerDirective')).toHaveLength(3)
    expect(JSON.stringify(doc)).not.toContain(':::')
  })

  it('keeps attributes structured', () => {
    const callouts = doc.children.filter(
      (child): child is Extract<typeof child, { type: 'containerDirective' }> =>
        child.type === 'containerDirective' && child.name === 'callout',
    )
    expect(callouts.map((c) => c.attributes?.['type'])).toEqual(['warning', 'note'])
  })

  it('keeps block content as real nodes, not opaque strings', () => {
    const callout = doc.children.find(
      (child) => child.type === 'containerDirective' && child.name === 'callout',
    )
    expect(callout && 'children' in callout && callout.children.map((c) => c.type)).toEqual([
      'paragraph',
      'list',
    ])
  })

  it('keeps frontmatter verbatim, nested YAML included', () => {
    expect(frontmatterOf(doc)).toContain('nested: true')
  })
})

describe('serialization house style', () => {
  it('never rewrites attributes into shortcut syntax', () => {
    // Left to itself, mdast-util-directive turns id="workbench" into
    // #workbench — a rewrite of every app block on its first save.
    const out = serialize(parse(':::app{id="workbench"}\n:::\n'))
    expect(out).toBe(':::app{id="workbench"}\n:::\n')
  })

  it('canonicalizes a foreign bullet style on save', () => {
    // Declared normalization, asserted so it stays deliberate.
    expect(serialize(parse('* one\n* two\n'))).toBe('- one\n- two\n')
  })

  it('leaves snake_case prose alone', () => {
    // The marked-based candidate escaped this to foo\_bar, which would have
    // churned every file an agent writes. Pinned so we never regress into it.
    const text = 'Read `total_nano_aiu` from session_store then call do_thing.\n'
    expect(serialize(parse(text))).toBe(text)
  })
})
