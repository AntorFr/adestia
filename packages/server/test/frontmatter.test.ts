import { describe, expect, it } from 'vitest'

import { field, parseFrontmatter, splitFrontmatter } from '../src/frontmatter.js'

describe('splitFrontmatter', () => {
  it('splits head and body', () => {
    expect(splitFrontmatter('---\na: 1\n---\nbody')).toEqual({ head: 'a: 1', body: 'body' })
  })
  it('has no head when the fence is not the first thing in the file', () => {
    expect(splitFrontmatter('\n---\na: 1\n---\nbody').head).toBeUndefined()
    expect(splitFrontmatter('text')).toEqual({ body: 'text' })
  })
})

describe('parseFrontmatter', () => {
  it('reads scalars, lists, and ignores nested lines', () => {
    expect(parseFrontmatter('---\nn: 3\nok: true\nz: ~\ntags: [a, "b"]\nm:\n  x: 1\n---\n')).toEqual({
      n: 3,
      ok: true,
      z: null,
      tags: ['a', 'b'],
      m: '',
    })
  })
  it('is empty without frontmatter', () => {
    expect(parseFrontmatter('# t')).toEqual({})
  })
})

describe('field', () => {
  it('returns a trimmed string', () => {
    expect(field({ d: '  hi ' }, 'd')).toBe('hi')
  })
  it('drops block-scalar indicators, empties, non-strings and missing keys', () => {
    expect(field({ d: '>' }, 'd')).toBeUndefined()
    expect(field({ d: '|' }, 'd')).toBeUndefined()
    expect(field({ d: '  ' }, 'd')).toBeUndefined()
    expect(field({ d: 3 }, 'd')).toBeUndefined()
    expect(field({}, 'd')).toBeUndefined()
  })
})

describe('a CRLF page and a fence with trailing spaces', () => {
  it('splits a \\r\\n head as the editor does', () => {
    expect(splitFrontmatter('---\r\na: 1\r\n---\r\nbody')).toEqual({ head: 'a: 1', body: 'body' })
  })
  it('reads fields from a \\r\\n head without a stray \\r in the values', () => {
    expect(parseFrontmatter('---\r\ntitle: Brief\r\nstatus: active\r\n---\r\n# T\r\n')).toEqual({
      title: 'Brief',
      status: 'active',
    })
  })
  it('accepts spaces after the closing fence and keeps them out of the body', () => {
    expect(splitFrontmatter('---\na: 1\n---  \nbody')).toEqual({ head: 'a: 1', body: 'body' })
    expect(splitFrontmatter('---\r\na: 1\r\n---\t \r\nbody')).toEqual({ head: 'a: 1', body: 'body' })
    expect(splitFrontmatter('---\na: 1\n---  ')).toEqual({ head: 'a: 1', body: '' })
  })
  it('does not take text after the fence for a fence', () => {
    expect(splitFrontmatter('---\na: 1\n--- x\nbody').head).toBeUndefined()
  })
})
