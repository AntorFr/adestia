/**
 * A refused account and the sign-out that ends the provider's session
 * (AD-acces-refuse-1, -2), against the bench's stand-in provider.
 *
 * Expected values are written out by hand from the design, not read back from
 * what the routes answer.
 */

import { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { DEFAULT_SESSION_TTL_MS, parseConfig } from '../src/config.js'
import {
  COOKIE_LIMIT,
  LOGIN_COOKIE,
  REFUSED_COOKIE,
  SESSION_COOKIE,
  signPayload,
  verifyPayload,
} from '../src/oidc.js'
import { ScriptedDriver } from './support/driver.js'

// @ts-expect-error — plain .mjs bench helper, no declarations
import { CLIENT_ID, CLIENT_SECRET, startOidcStub } from '../../../bench/oidc-stub.mjs'

const SECRET = 'a-test-secret-long-enough-to-pass'
const REDIRECT = 'https://adestia.example/auth/callback'

interface Stub {
  issuer: string
  close: () => Promise<void>
}

let app: FastifyInstance | undefined
let stub: Stub | undefined

afterEach(async () => {
  await app?.close()
  await stub?.close()
  app = undefined
  stub = undefined
})

const boot = async (opts: { noEndSession?: boolean; extra?: string } = {}) => {
  stub = (await startOidcStub({ noEndSession: opts.noEndSession === true })) as Stub
  const config = [
    'auth:',
    '  mode: oidc',
    '  oidc:',
    `    issuer: ${stub.issuer}`,
    `    clientId: ${CLIENT_ID}`,
    `    clientSecret: ${CLIENT_SECRET}`,
    `    redirectUri: ${REDIRECT}`,
    '    groupsClaim: groups',
    '    allowedGroups: [famille]',
    `    sessionSecret: ${SECRET}`,
    opts.extra ?? '',
  ]
    .filter(Boolean)
    .join('\n')
  app = await buildApp({
    config: parseConfig(config),
    driver: new ScriptedDriver([], { capabilities: [] }),
    plugins: [],
    pluginProblems: [],
  })
  return app
}

const setCookies = (response: { headers: Record<string, unknown> }): string[] => {
  const raw = response.headers['set-cookie']
  return raw === undefined ? [] : Array.isArray(raw) ? (raw as string[]) : [String(raw)]
}
const cookieValue = (response: { headers: Record<string, unknown> }, name: string) => {
  const line = setCookies(response).find((c) => c.startsWith(`${name}=`))
  return line?.split(';')[0]?.slice(name.length + 1)
}

/** Signs `user` in at the stub and returns the callback response. */
const signInAs = async (user: string) => {
  await fetch(`${stub!.issuer}/__as?user=${user}`)
  const login = await app!.inject({ url: '/auth/login' })
  const loginCookie = cookieValue(login, LOGIN_COOKIE)!
  const authorize = await fetch(String(login.headers['location']), { redirect: 'manual' })
  const back = new URL(authorize.headers.get('location')!)
  return app!.inject({
    url: `/auth/callback${back.search}`,
    cookies: { [LOGIN_COOKIE]: loginCookie },
  })
}

describe('a refused account at the callback', () => {
  it('redirects to / with adestia_refused and no session', async () => {
    await boot()
    const response = await signInAs('visiteur')
    expect(response.statusCode).toBe(302)
    expect(response.headers['location']).toBe('/')
    expect(cookieValue(response, REFUSED_COOKIE)).toBeTruthy()
    expect(setCookies(response).some((c) => c.startsWith(`${SESSION_COOKIE}=`) && !c.startsWith(`${SESSION_COOKIE}=;`))).toBe(false)
    const refused = setCookies(response).find((c) => c.startsWith(`${REFUSED_COOKIE}=`))!
    expect(refused).toMatch(/HttpOnly/i)
    expect(refused).toMatch(/SameSite=Lax/i)
    expect(refused).toMatch(/Path=\//)
    expect(refused).toMatch(/Max-Age=600/)
    // the login cookie is spent
    expect(setCookies(response).some((c) => c.startsWith(`${LOGIN_COOKIE}=;`))).toBe(true)
  })

  it('lets GET /auth/refused name the account, without any session', async () => {
    await boot()
    const callback = await signInAs('visiteur')
    const answer = await app!.inject({
      url: '/auth/refused',
      cookies: { [REFUSED_COOKIE]: cookieValue(callback, REFUSED_COOKIE)! },
    })
    expect(answer.statusCode).toBe(200)
    const body = answer.json()
    expect(Object.keys(body)).toEqual(['displayName'])
    expect(typeof body.displayName).toBe('string')
    expect(body.displayName.length).toBeGreaterThan(0)
  })

  it('answers 401 without the cookie, with a forged one, with an expired one', async () => {
    await boot()
    expect((await app!.inject({ url: '/auth/refused' })).statusCode).toBe(401)
    const forged = signPayload(
      { displayName: 'Root', userId: 'r', expiresAt: Date.now() + 60_000 },
      'a-different-secret-entirely',
    )
    expect(
      (await app!.inject({ url: '/auth/refused', cookies: { [REFUSED_COOKIE]: forged } })).statusCode,
    ).toBe(401)
    const stale = signPayload({ displayName: 'Old', userId: 'o', expiresAt: Date.now() - 1 }, SECRET)
    expect(
      (await app!.inject({ url: '/auth/refused', cookies: { [REFUSED_COOKIE]: stale } })).statusCode,
    ).toBe(401)
    expect(
      (await app!.inject({ url: '/auth/refused', cookies: { [REFUSED_COOKIE]: 'garbage' } })).statusCode,
    ).toBe(401)
  })

  it('gives a refused account no way into the instance', async () => {
    await boot()
    const callback = await signInAs('visiteur')
    const answer = await app!.inject({
      url: '/api/instance',
      cookies: { [REFUSED_COOKIE]: cookieValue(callback, REFUSED_COOKIE)! },
    })
    expect(answer.statusCode).toBe(401)
  })

  it('still signs an allowed account in with a session and no refused cookie', async () => {
    await boot()
    const response = await signInAs('alice')
    expect(response.statusCode).toBe(302)
    expect(cookieValue(response, SESSION_COOKIE)).toBeTruthy()
    expect(cookieValue(response, REFUSED_COOKIE)).toBeUndefined()
  })

  it('keeps the JSON for the other callback failures', async () => {
    await boot()
    const none = await app!.inject({ url: '/auth/callback?code=x&state=y' })
    expect(none.statusCode).toBe(400)
    expect(none.json().error).toContain('start again')
    expect(cookieValue(none, REFUSED_COOKIE)).toBeUndefined()

    const login = await app!.inject({ url: '/auth/login' })
    const bad = await app!.inject({
      url: '/auth/callback?code=nope&state=wrong',
      cookies: { [LOGIN_COOKIE]: cookieValue(login, LOGIN_COOKIE)! },
    })
    expect(bad.statusCode).toBe(403)
    expect(bad.json()).toHaveProperty('error')
    expect(cookieValue(bad, REFUSED_COOKIE)).toBeUndefined()
  })

  it('carries the id token, and drops it when the cookie would pass 4 KB', async () => {
    await boot()
    const callback = await signInAs('visiteur')
    const payload = verifyPayload<{ idToken?: string; userId: string }>(
      cookieValue(callback, REFUSED_COOKIE)!,
      SECRET,
    )
    expect(payload?.idToken?.split('.')).toHaveLength(3)
    expect(cookieValue(callback, REFUSED_COOKIE)!.length).toBeLessThan(COOKIE_LIMIT)
  })
})

describe('POST /auth/logout', () => {
  const form = { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' }

  it('sends a refused account to the provider with client_id and id_token_hint, clearing both cookies', async () => {
    await boot()
    const callback = await signInAs('visiteur')
    const hint = verifyPayload<{ idToken: string }>(cookieValue(callback, REFUSED_COOKIE)!, SECRET)!.idToken
    const response = await app!.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: form,
      payload: '',
      cookies: { [REFUSED_COOKIE]: cookieValue(callback, REFUSED_COOKIE)! },
    })
    expect(response.statusCode).toBe(302)
    const to = new URL(String(response.headers['location']))
    expect(to.origin + to.pathname).toBe(`${stub!.issuer}/logout`)
    expect(to.searchParams.get('client_id')).toBe('bench-client')
    expect(to.searchParams.get('id_token_hint')).toBe(hint)
    expect(to.searchParams.get('post_logout_redirect_uri')).toBe('https://adestia.example/')
    const cookies = setCookies(response)
    expect(cookies.some((c) => c.startsWith(`${SESSION_COOKIE}=;`))).toBe(true)
    expect(cookies.some((c) => c.startsWith(`${REFUSED_COOKIE}=;`))).toBe(true)
  })

  it('sends an ordinary session with client_id alone: no hint', async () => {
    await boot()
    const session = signPayload(
      { userId: 'alice', displayName: 'Alice', groups: ['famille'], expiresAt: Date.now() + DEFAULT_SESSION_TTL_MS },
      SECRET,
    )
    const response = await app!.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: form,
      payload: '',
      cookies: { [SESSION_COOKIE]: session },
    })
    const to = new URL(String(response.headers['location']))
    expect(to.searchParams.get('client_id')).toBe('bench-client')
    expect(to.searchParams.has('id_token_hint')).toBe(false)
  })

  it('ignores a forged refused cookie as a source of hint', async () => {
    await boot()
    const forged = signPayload(
      { displayName: 'x', userId: 'x', idToken: 'evil.hint.x', expiresAt: Date.now() + 60_000 },
      'a-different-secret-entirely',
    )
    const response = await app!.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: form,
      payload: '',
      cookies: { [REFUSED_COOKIE]: forged },
    })
    expect(new URL(String(response.headers['location'])).searchParams.has('id_token_hint')).toBe(false)
  })

  it('takes post_logout_redirect_uri from the config, and sends none when it is empty', async () => {
    await boot({ extra: '    postLogoutRedirectUri: https://adestia.example/bye' })
    let response = await app!.inject({ method: 'POST', url: '/auth/logout', headers: form, payload: '' })
    expect(new URL(String(response.headers['location'])).searchParams.get('post_logout_redirect_uri')).toBe(
      'https://adestia.example/bye',
    )
    await app!.close()
    await stub!.close()
    await boot({ extra: '    postLogoutRedirectUri: ""' })
    response = await app!.inject({ method: 'POST', url: '/auth/logout', headers: form, payload: '' })
    expect(new URL(String(response.headers['location'])).searchParams.has('post_logout_redirect_uri')).toBe(false)
  })

  it('falls back to /auth/login?switch=1 when the provider announces no end_session_endpoint', async () => {
    await boot({ noEndSession: true })
    const response = await app!.inject({ method: 'POST', url: '/auth/logout', headers: form, payload: '' })
    expect(response.statusCode).toBe(302)
    expect(response.headers['location']).toBe('/auth/login?switch=1')
  })

  it('falls back too when the provider cannot be reached', async () => {
    await boot()
    await stub!.close()
    const response = await app!.inject({ method: 'POST', url: '/auth/logout', headers: form, payload: '' })
    expect(response.headers['location']).toBe('/auth/login?switch=1')
    stub = undefined
  })

  it('answers a fetch its JSON, clearing both cookies, without asking the provider', async () => {
    await boot()
    const response = await app!.inject({ method: 'POST', url: '/auth/logout' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ signedOut: true })
    const cookies = setCookies(response)
    expect(cookies.some((c) => c.startsWith(`${SESSION_COOKIE}=;`))).toBe(true)
    expect(cookies.some((c) => c.startsWith(`${REFUSED_COOKIE}=;`))).toBe(true)
  })
})

describe('/auth/login?switch=1', () => {
  it('asks the provider for prompt=login, and a plain login does not', async () => {
    await boot()
    const plain = await app!.inject({ url: '/auth/login' })
    expect(new URL(String(plain.headers['location'])).searchParams.has('prompt')).toBe(false)
    const switched = await app!.inject({ url: '/auth/login?switch=1' })
    expect(new URL(String(switched.headers['location'])).searchParams.get('prompt')).toBe('login')
    const other = await app!.inject({ url: '/auth/login?switch=0' })
    expect(new URL(String(other.headers['location'])).searchParams.has('prompt')).toBe(false)
  })
})

describe('the stand-in provider', () => {
  it('ends its SSO at the end_session_endpoint and then lets another account in', async () => {
    await boot()
    const doc = (await (await fetch(`${stub!.issuer}/.well-known/openid-configuration`)).json()) as Record<string, string>
    expect(doc['end_session_endpoint']).toBe(`${stub!.issuer}/logout`)

    const qs = new URLSearchParams({ redirect_uri: REDIRECT, state: 's' })
    const before = await fetch(`${stub!.issuer}/authorize?${qs}`, { redirect: 'manual' })
    expect(before.status).toBe(302)

    await fetch(`${stub!.issuer}/logout`)
    const after = await fetch(`${stub!.issuer}/authorize?${qs}`, { redirect: 'manual' })
    expect(after.status).toBe(200)
    expect(await after.text()).toContain('visiteur')

    const picked = await fetch(`${stub!.issuer}/authorize?${qs}&as=alice`, { redirect: 'manual' })
    expect(picked.status).toBe(302)
  })

  it('asks for credentials on prompt=login despite a live SSO', async () => {
    await boot()
    const qs = new URLSearchParams({ redirect_uri: REDIRECT, state: 's', prompt: 'login' })
    const answer = await fetch(`${stub!.issuer}/authorize?${qs}`, { redirect: 'manual' })
    expect(answer.status).toBe(200)
  })

  it('announces no end_session_endpoint when started with noEndSession', async () => {
    await boot({ noEndSession: true })
    const doc = (await (await fetch(`${stub!.issuer}/.well-known/openid-configuration`)).json()) as Record<string, string>
    expect(doc).not.toHaveProperty('end_session_endpoint')
  })
})
