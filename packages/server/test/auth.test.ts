import { describe, expect, it } from 'vitest'

import { isPublicRoute, resolveIdentity, type Identity, type RequestLike } from '../src/auth.js'
import type { AuthConfig } from '../src/config.js'

const request = (headers: Record<string, string | string[]>, session?: RequestLike['session']) =>
  ({ headers, session }) as RequestLike

describe('mode: none', () => {
  const config: AuthConfig = { mode: 'none' }

  it('lets the single local user through', () => {
    const outcome = resolveIdentity(request({}), config)
    expect(outcome).toEqual({ ok: true, identity: expect.objectContaining({ userId: 'local' }) })
  })

  it('ignores identity headers a client made up', () => {
    // Without a trusted proxy, a header is just something the client typed.
    const outcome = resolveIdentity(request({ 'remote-user': 'admin' }), config)
    expect(outcome.ok && outcome.identity.userId).toBe('local')
  })
})

describe('mode: proxy', () => {
  const config: AuthConfig = {
    mode: 'proxy',
    proxy: { userHeader: 'remote-user', groupsHeader: 'remote-groups' },
  }

  it('trusts the configured header', () => {
    const outcome = resolveIdentity(request({ 'remote-user': 'chloe' }), config)
    expect(outcome.ok && outcome.identity).toEqual({
      userId: 'chloe',
      displayName: 'chloe',
      groups: [],
    })
  })

  it('splits and trims the groups header', () => {
    const outcome = resolveIdentity(
      request({ 'remote-user': 'chloe', 'remote-groups': 'staff, admins ,' }),
      config,
    )
    expect(outcome.ok && outcome.identity.groups).toEqual(['staff', 'admins'])
  })

  it('refuses when the header is missing instead of falling back', () => {
    // A missing header in proxy mode means the proxy was bypassed — exactly
    // when serving the request is the wrong thing to do.
    expect(resolveIdentity(request({}), config)).toEqual({
      ok: false,
      status: 401,
      reason: 'missing remote-user header',
    })
  })

  it('refuses a duplicated identity header', () => {
    // Two values means something upstream is confused, or someone is trying to
    // smuggle one past the proxy. Neither is a request to serve.
    expect(resolveIdentity(request({ 'remote-user': ['chloe', 'root'] }), config).ok).toBe(false)
  })

  it('matches the header case-insensitively, as HTTP requires', () => {
    const outcome = resolveIdentity(request({ 'remote-user': 'chloe' }), {
      mode: 'proxy',
      proxy: { userHeader: 'Remote-User', groupsHeader: undefined },
    })
    expect(outcome.ok).toBe(true)
  })
})

describe('mode: oidc', () => {
  const identity: Identity = { userId: 'chloe', displayName: 'Chloé', groups: ['staff'] }
  const config = (allowedGroups: string[]): AuthConfig => ({
    mode: 'oidc',
    oidc: {
      issuer: 'https://id.example',
      clientId: 'adestia',
      clientSecret: 'shhh',
      redirectUri: 'https://adestia.example/auth/callback',
      groupsClaim: 'groups',
      allowedGroups,
    },
  })

  it('requires a session', () => {
    expect(resolveIdentity(request({}), config([]))).toEqual({
      ok: false,
      status: 401,
      reason: 'not signed in',
    })
  })

  it('admits a signed-in user when no group is required', () => {
    expect(resolveIdentity(request({}, { identity }), config([])).ok).toBe(true)
  })

  it('admits a member of an allowed group', () => {
    expect(resolveIdentity(request({}, { identity }), config(['staff'])).ok).toBe(true)
  })

  it('distinguishes "not signed in" from "not allowed"', () => {
    // 401 tells the browser to log in; 403 tells the user their account will
    // never do. Collapsing them sends people round a login loop forever.
    expect(resolveIdentity(request({}, { identity }), config(['admins']))).toEqual({
      ok: false,
      status: 403,
      reason: 'not a member of an allowed group',
    })
  })

  it('ignores a proxy header entirely in oidc mode', () => {
    expect(resolveIdentity(request({ 'remote-user': 'root' }), config([])).ok).toBe(false)
  })
})

describe('public routes', () => {
  it('are an explicit set, not a prefix rule', () => {
    // A prefix rule is how an endpoint ends up unauthenticated by accident.
    expect(isPublicRoute('/api/health')).toBe(true)
    expect(isPublicRoute('/auth/callback')).toBe(true)
    expect(isPublicRoute('/api/health/../instance')).toBe(false)
    expect(isPublicRoute('/api/turn')).toBe(false)
  })

  it('include what a browser reads before it has a session', () => {
    /*
     * Gated, these do not merely 401 in a console: the install offer never
     * appears — the manifest fetch is the browser's, not the page's — and
     * `register()` fails on a JSON body it was told would be a script. Both
     * silently, and only on the instances careful enough to run OIDC.
     */
    expect(isPublicRoute('/manifest.webmanifest')).toBe(true)
    expect(isPublicRoute('/sw.js')).toBe(true)
    expect(isPublicRoute('/icon.svg')).toBe(true)
    expect(isPublicRoute('/icon-180.png')).toBe(true)
    // And nothing beyond them: the worker's scope is the whole origin, but
    // its ADDRESS being public says nothing about what it may fetch.
    expect(isPublicRoute('/assets/index-B3xK9f2p.js')).toBe(false)
  })
})
