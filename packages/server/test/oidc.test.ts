import { describe, expect, it } from 'vitest'

import type { OidcConfig } from '../src/config.js'
import {
  identityFrom,
  isAllowed,
  safeReturnTo,
  sessionSecret,
  signPayload,
  verifyPayload,
} from '../src/oidc.js'

const config = (overrides: Partial<OidcConfig> = {}): OidcConfig => ({
  issuer: 'https://id.example',
  clientId: 'golem',
  clientSecret: 'shhh',
  redirectUri: 'https://golem.example/auth/callback',
  groupsClaim: 'groups',
  allowedGroups: [],
  ...overrides,
})

describe('signed payloads', () => {
  const secret = 'a-secret-long-enough-to-matter'

  it('round-trips', () => {
    const cookie = signPayload({ userId: 'chloe', expiresAt: Date.now() + 1000 }, secret)
    expect(verifyPayload<{ userId: string }>(cookie, secret)?.userId).toBe('chloe')
  })

  it('rejects an edited payload', () => {
    // A cookie carrying `groups` the browser could rewrite would be an admin
    // badge anyone can print.
    const cookie = signPayload({ userId: 'chloe', groups: [] }, secret)
    const [, signature] = cookie.split('.')
    const forged = `${Buffer.from(JSON.stringify({ userId: 'chloe', groups: ['admins'] })).toString('base64url')}.${signature}`
    expect(verifyPayload(forged, secret)).toBeUndefined()
  })

  it('rejects a payload signed with another secret', () => {
    const cookie = signPayload({ userId: 'chloe' }, 'other-secret-entirely')
    expect(verifyPayload(cookie, secret)).toBeUndefined()
  })

  it('rejects an expired payload', () => {
    const cookie = signPayload({ userId: 'chloe', expiresAt: 1000 }, secret)
    expect(verifyPayload(cookie, secret, 1001)).toBeUndefined()
    expect(verifyPayload(cookie, secret, 999)).toBeTruthy()
  })

  it('rejects nonsense rather than throwing', () => {
    expect(verifyPayload('', secret)).toBeUndefined()
    expect(verifyPayload('no-dot', secret)).toBeUndefined()
    expect(verifyPayload('not-base64.signature', secret)).toBeUndefined()
  })
})

describe('returnTo', () => {
  it('accepts a same-site path', () => {
    expect(safeReturnTo('/pages/garage')).toBe('/pages/garage')
  })

  it('refuses anything that could leave the site', () => {
    // An open redirect on a login route is how a phishing link borrows your
    // domain's credibility.
    expect(safeReturnTo('https://evil.example')).toBe('/')
    expect(safeReturnTo('//evil.example')).toBe('/')
    expect(safeReturnTo('javascript:alert(1)')).toBe('/')
    expect(safeReturnTo(undefined)).toBe('/')
  })
})

describe('identity from claims', () => {
  it('keys on the subject, not the username', () => {
    // A username can be reassigned; a conversation store keyed on one would
    // hand someone else's threads to whoever inherits the name.
    const identity = identityFrom(
      { sub: 'abc-123', preferred_username: 'chloe', groups: ['staff'] },
      config(),
    )
    expect(identity).toEqual({ userId: 'abc-123', displayName: 'chloe', groups: ['staff'] })
  })

  it('prefers a display name when the provider gives one', () => {
    expect(identityFrom({ sub: 'x', name: 'Chloé B.' }, config())?.displayName).toBe('Chloé B.')
  })

  it('falls back to the subject when there is no name at all', () => {
    expect(identityFrom({ sub: 'x' }, config())?.displayName).toBe('x')
  })

  it('reads groups from the configured claim', () => {
    const identity = identityFrom({ sub: 'x', roles: ['admins'] }, config({ groupsClaim: 'roles' }))
    expect(identity?.groups).toEqual(['admins'])
  })

  it('treats a missing or malformed groups claim as no groups', () => {
    expect(identityFrom({ sub: 'x' }, config())?.groups).toEqual([])
    expect(identityFrom({ sub: 'x', groups: 'staff' }, config())?.groups).toEqual([])
    expect(identityFrom({ sub: 'x', groups: [1, 'staff'] }, config())?.groups).toEqual(['staff'])
  })

  it('refuses a token with no subject', () => {
    expect(identityFrom({ name: 'nobody' }, config())).toBeUndefined()
  })
})

describe('group gate', () => {
  const identity = { userId: 'x', displayName: 'x', groups: ['staff'] }

  it('admits anyone authenticated when no group is required', () => {
    expect(isAllowed(identity, config())).toBe(true)
  })

  it('admits a member', () => {
    expect(isAllowed(identity, config({ allowedGroups: ['staff', 'admins'] }))).toBe(true)
  })

  it('refuses a non-member', () => {
    expect(isAllowed(identity, config({ allowedGroups: ['admins'] }))).toBe(false)
  })

  it('refuses someone with no groups at all when one is required', () => {
    expect(isAllowed({ ...identity, groups: [] }, config({ allowedGroups: ['staff'] }))).toBe(false)
  })
})

describe('session secret', () => {
  it('uses the configured one', () => {
    expect(sessionSecret('a-configured-secret-value')).toBe('a-configured-secret-value')
  })

  it('generates rather than defaulting to a constant', () => {
    // A shared default secret is a session forgery kit shipped to everyone.
    const first = sessionSecret(undefined)
    const second = sessionSecret(undefined)
    expect(first).not.toBe(second)
    expect(first.length).toBeGreaterThanOrEqual(32)
  })

  it('ignores a secret too short to be one', () => {
    expect(sessionSecret('short')).not.toBe('short')
  })
})
