/**
 * The login round trip, without an identity provider.
 *
 * What is exercised here is the half Adestia owns: the cookies, the redirect
 * safety, the session gate. The token exchange itself belongs to
 * `openid-client` and is not re-tested here — but everything around it, where
 * the mistakes actually live, is.
 */

import { type FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it } from 'vitest'

import { buildApp, type AppDependencies } from '../src/app.js'
import { DEFAULT_SESSION_TTL_MS, parseConfig } from '../src/config.js'
import { SESSION_COOKIE, signPayload, type SessionPayload } from '../src/oidc.js'
import type { Driver, DriverDescriptor, TurnEvent } from '@antorfr/adestia-drivers'

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
    '    clientId: adestia',
    '    clientSecret: shhh',
    '    redirectUri: https://adestia.example/auth/callback',
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

const sessionCookie = (
  identity: { userId: string; displayName: string; groups: string[] },
  extra: Partial<SessionPayload> = {},
) => signPayload({ ...identity, expiresAt: Date.now() + DEFAULT_SESSION_TTL_MS, ...extra }, SECRET)

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

describe('how long a session lasts', () => {
  /**
   * A store that answers the one question the gate asks of it.
   *
   * `known` is what the real store holds: an entry per person, dropped the
   * moment the provider refuses their refresh token. Nothing else of
   * `UserTokens` is reached from the gate, so nothing else is stubbed.
   */
  const store = (known: readonly string[]) =>
    ({
      remember: () => Promise.resolve(),
      has: (subject: string) => Promise.resolve(known.includes(subject)),
    }) as unknown as NonNullable<AppDependencies['userTokens']>

  const ALICE = { userId: 'alice', displayName: 'Alice', groups: ['parents'] }

  it('takes the ceiling from the config, and 12 h when none is named', () => {
    // The provider never says how long ITS session lasts, so this number is
    // chosen rather than derived — which is exactly why it has to be settable.
    expect(parseConfig(oidcConfig()).auth.oidc?.sessionTtlMs).toBe(DEFAULT_SESSION_TTL_MS)
    expect(parseConfig(oidcConfig('    sessionTtlMs: 2592000000')).auth.oidc?.sessionTtlMs).toBe(
      2_592_000_000,
    )
  })

  it('refuses a duration too short to survive its own login', () => {
    // A session shorter than the round trip signs people out on the way in,
    // which reads as a broken provider rather than as a bad number.
    expect(() => parseConfig(oidcConfig('    sessionTtlMs: 5000'))).toThrow(/sessionTtlMs/)
  })

  it('drops a backed session the provider has disowned, and clears its cookie', async () => {
    // The verdict that beats the ceiling: the store drops an entry the moment
    // a refresh is refused, so its absence says the grant is over. Without
    // this, a revoked account keeps its screen for the rest of the ceiling —
    // thirty days, on the instances that ask for thirty days.
    await build(oidcConfig(), { userTokens: store([]) })
    const response = await app.inject({
      url: '/api/instance',
      cookies: { [SESSION_COOKIE]: sessionCookie(ALICE, { backed: true }) },
    })
    expect(response.statusCode).toBe(401)
    // Cleared as it is refused: otherwise every later request pays the same
    // check for a session that will never come back.
    expect(response.headers['set-cookie']).toMatch(/adestia_session=;/)
  })

  it('admits a backed session while the grant is alive', async () => {
    await build(oidcConfig(), { userTokens: store(['alice']) })
    const response = await app.inject({
      url: '/api/instance',
      cookies: { [SESSION_COOKIE]: sessionCookie(ALICE, { backed: true }) },
    })
    expect(response.statusCode).toBe(200)
  })

  it('leaves an unbacked session to its ceiling alone', async () => {
    // An instance that keeps nothing has no verdict to read. Two of the three
    // bodies are in this case deliberately: they ask the provider for no
    // standing access, so their sessions are governed by the number alone.
    await build(oidcConfig(), { userTokens: store([]) })
    const response = await app.inject({
      url: '/api/instance',
      cookies: { [SESSION_COOKIE]: sessionCookie(ALICE) },
    })
    expect(response.statusCode).toBe(200)
  })

  it('asks nothing of a store that is no longer there', async () => {
    // An operator who removes the rebound must not sign out everyone holding
    // a cookie stamped from when it existed: with no store, there is no
    // verdict, and inventing one punishes a configuration change.
    await build(oidcConfig())
    const response = await app.inject({
      url: '/api/instance',
      cookies: { [SESSION_COOKIE]: sessionCookie(ALICE, { backed: true }) },
    })
    expect(response.statusCode).toBe(200)
  })
})
