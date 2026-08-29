/**
 * The login round trip, without an identity provider.
 *
 * What is exercised here is the half Demeura owns: the cookies, the redirect
 * safety, the session gate. The token exchange itself belongs to
 * `openid-client` and is not re-tested here — but everything around it, where
 * the mistakes actually live, is.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it } from 'vitest'

import { buildApp, type AppDependencies } from '../src/app.js'
import { parseConfig } from '../src/config.js'
import { SESSION_COOKIE, SESSION_TTL_MS, signPayload } from '../src/oidc.js'
import type { Driver, DriverDescriptor, TurnEvent } from '@antorfr/demeura-drivers'

class StubDriver implements Driver {
  describe(): Promise<DriverDescriptor> {
    return Promise.resolve({ id: 'stub', label: 'Stub', cliVersion: '0', capabilities: [] })
  }
  env(): Promise<Readonly<Record<string, string>>> {
    return Promise.resolve({})
  }
  async *runTurn(): AsyncIterable<TurnEvent> {
    return
  }
  interrupt(): Promise<void> {
    return Promise.resolve()
  }
}

const SECRET = 'a-test-secret-long-enough-to-pass'

const oidcConfig = (overrides = '') =>
  [
    'auth:',
    '  mode: oidc',
    '  oidc:',
    '    issuer: https://id.invalid',
    '    clientId: demeura',
    '    clientSecret: shhh',
    '    redirectUri: https://demeura.example/auth/callback',
    `    sessionSecret: ${SECRET}`,
    overrides,
  ]
    .filter(Boolean)
    .join('\n')

let app: FastifyInstance

const build = async (config = oidcConfig(), overrides: Partial<AppDependencies> = {}) => {
  app = await buildApp({
    config: parseConfig(config),
    driver: new StubDriver(),
    plugins: [],
    pluginProblems: [],
    ...overrides,
  })
  return app
}

const sessionCookie = (identity: { userId: string; displayName: string; groups: string[] }) =>
  signPayload({ ...identity, expiresAt: Date.now() + SESSION_TTL_MS }, SECRET)

beforeEach(() => {
  app = undefined as unknown as FastifyInstance
})

describe('the gate', () => {
  it('refuses an anonymous request', async () => {
    await build()
    expect((await app.inject({ url: '/api/instance' })).statusCode).toBe(401)
  })

  it('admits a valid session and reports who it belongs to', async () => {
    await build()
    const response = await app.inject({
      url: '/api/instance',
      cookies: {
        [SESSION_COOKIE]: sessionCookie({
          userId: 'abc-123',
          displayName: 'Chloé',
          groups: ['staff'],
        }),
      },
    })
    expect(response.json().user).toMatchObject({ userId: 'abc-123', displayName: 'Chloé' })
  })

  it('refuses a forged session', async () => {
    await build()
    const forged = signPayload(
      { userId: 'root', displayName: 'root', groups: ['admins'], expiresAt: Date.now() + 10_000 },
      'a-different-secret-entirely',
    )
    expect(
      (await app.inject({ url: '/api/instance', cookies: { [SESSION_COOKIE]: forged } })).statusCode,
    ).toBe(401)
  })

  it('refuses an expired session rather than extending it', async () => {
    await build()
    const stale = signPayload(
      { userId: 'x', displayName: 'x', groups: [], expiresAt: Date.now() - 1 },
      SECRET,
    )
    expect(
      (await app.inject({ url: '/api/instance', cookies: { [SESSION_COOKIE]: stale } })).statusCode,
    ).toBe(401)
  })

  it('separates "not signed in" from "not allowed"', async () => {
    // 401 tells the browser to log in; 403 says the account never will do.
    // Collapsing them sends people round a login loop forever.
    await build(oidcConfig('    allowedGroups: [admins]'))
    const response = await app.inject({
      url: '/api/instance',
      cookies: {
        [SESSION_COOKIE]: sessionCookie({ userId: 'x', displayName: 'x', groups: ['staff'] }),
      },
    })
    expect(response.statusCode).toBe(403)
  })

  it('keeps health reachable without credentials', async () => {
    await build()
    expect((await app.inject({ url: '/api/health' })).statusCode).toBe(200)
  })
})

describe('login', () => {
  it('answers 503 when the identity provider cannot be reached', async () => {
    // Not a 500: it says the outage is upstream, which is the one thing an
    // operator needs to know first.
    await build()
    const response = await app.inject({ url: '/auth/login' })
    expect(response.statusCode).toBe(503)
    expect(response.json().error).toContain('could not be reached')
  })

  it('is reachable without a session, or nobody could ever sign in', async () => {
    await build()
    expect((await app.inject({ url: '/auth/login' })).statusCode).not.toBe(401)
  })
})

describe('callback', () => {
  it('refuses a callback with no sign-in in progress', async () => {
    // Also what a stale bookmark looks like; saying so beats a stack trace.
    await build()
    const response = await app.inject({ url: '/auth/callback?code=x&state=y' })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toContain('start again')
  })
})

describe('logout', () => {
  it('clears the session cookie', async () => {
    await build()
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: {
        [SESSION_COOKIE]: sessionCookie({ userId: 'x', displayName: 'x', groups: [] }),
      },
    })
    expect(response.json()).toEqual({ signedOut: true })
    expect(response.headers['set-cookie']).toMatch(new RegExp(`${SESSION_COOKIE}=;`))
  })

  it('accepts the button the interface actually renders', async () => {
    // A native `<form method="post">` carries urlencoded, which Fastify does
    // not parse out of the box — so the sign-out answered 415 from the day
    // this instance became an OIDC client. Behind a reverse proxy, signing
    // out was the proxy's business and this route was dead code.
    await build()
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' },
      payload: '',
    })
    expect(response.statusCode).toBe(302)
    expect(response.headers['location']).toBe('/')
    expect(response.headers['set-cookie']).toMatch(new RegExp(`${SESSION_COOKIE}=;`))
  })

  it('sends a browser somewhere, and a fetch its JSON', async () => {
    // `{"signedOut":true}` on the screen of somebody who clicked a button is
    // the same mistake as `{"error":"not signed in"}` was.
    await build()
    const asFetch = await app.inject({ method: 'POST', url: '/auth/logout' })
    expect(asFetch.statusCode).toBe(200)
    expect(asFetch.json()).toEqual({ signedOut: true })
  })

  it('discards whatever the form sent', async () => {
    // Nothing here reads a field, and a parser that accepts input it never
    // uses is one that will be trusted with input it should not have.
    await build()
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'redirect=https://ailleurs.example&admin=true',
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ signedOut: true })
  })
})

describe('other modes', () => {
  it('mounts no login routes when auth is off', async () => {
    // A login endpoint on an instance with no identity provider is a route
    // that can only ever fail confusingly.
    await build('auth:\n  mode: none\n')
    expect((await app.inject({ url: '/auth/login' })).statusCode).toBe(404)
  })
})
