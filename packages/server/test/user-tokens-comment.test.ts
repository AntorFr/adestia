/**
 * The module comment of user-tokens.ts must say what the file holds: `Entry`
 * carries an access token and its expiry next to the refresh token.
 */

import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

const source = await readFile(new URL('../src/user-tokens.ts', import.meta.url), 'utf8')

describe('user-tokens.ts comment against its content', () => {
  it('Entry does carry an access token', () => {
    expect(source).toMatch(/interface Entry \{[^}]*accessToken\?/)
  })

  it('does not claim the file holds refresh tokens only', () => {
    expect(source).not.toMatch(/refresh tokens only/i)
  })

  it('names the access token and its expiry', () => {
    const header = source.slice(0, source.indexOf('import '))
    expect(header).toMatch(/access token/i)
    expect(header).toMatch(/expiry|expires/i)
  })
})
