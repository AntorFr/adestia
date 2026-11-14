/**
 * The login round trip.
 *
 * Mounted only in `oidc` mode. Everything it does is stateless server-side —
 * two signed cookies, no session table — so restarting Adestia does not sign
 * everyone out and two instances behind a load balancer need nothing shared
 * beyond the signing secret.
 */

import cookie from '@fastify/cookie'
import type { FastifyInstance, FastifyRequest } from 'fastify'

import type { Identity } from '../auth.js'
import type { AdestiaConfig } from '../config.js'
import {
  COOKIE_LIMIT,
  LOGIN_COOKIE,
  LOGIN_TTL_MS,
  OidcClient,
  REFUSED_COOKIE,
  REFUSED_TTL_MS,
  SESSION_COOKIE,
  safeReturnTo,
  sessionSecret,
  signPayload,
  verifyPayload,
  type LoginState,
  type RefusedPayload,
  type SessionPayload,
} from '../oidc.js'

export async function registerOidc(
  app: FastifyInstance,
  config: AdestiaConfig,
  /**
   * Where a login's refresh token is kept, when the instance wants a rebound.
   * Passed in rather than built here: this module speaks OIDC, and the store
   * belongs to the instance's data directory.
   */
  userTokens?: {
    remember(subject: string, refreshToken: string): Promise<void>
    /** Whether this person's grant is still alive — see `SessionPayload.backed`. */
    has(subject: string): Promise<boolean>
  },
): Promise<void> {
  if (config.auth.mode !== 'oidc' || !config.auth.oidc) return

  const oidc = config.auth.oidc
  const secret = sessionSecret(oidc.sessionSecret)
  const client = new OidcClient(oidc)
  // Secure only when the redirect is https: a Secure cookie on a plain-http
  // deployment is never sent back, and the user loops through login forever
  // with nothing in the logs to say why.
  const secure = oidc.redirectUri.startsWith('https://')

  await app.register(cookie)

  app.addHook('onRequest', async (request: FastifyRequest, reply) => {
    const raw = request.cookies[SESSION_COOKIE]
    const payload = raw ? verifyPayload<SessionPayload>(raw, secret) : undefined
    if (!payload) return

    /**
     * A session the provider has disowned, before its ceiling.
     *
     * Only asked of a session that WAS backed, and only where the store is
     * still there to answer: an instance that stopped keeping refresh tokens
     * has no verdict to read, and guessing one would sign people out for a
     * configuration change they did not make. The store answers from memory,
     * so this costs no round trip and no disk read.
     *
     * The cookie is cleared as it is refused, or every later request pays the
     * same check for a session that will never come back.
     */
    if (payload.backed && userTokens && !(await userTokens.has(payload.userId))) {
      void reply.clearCookie(SESSION_COOKIE, { path: '/' })
      return
    }

    ;(request as FastifyRequest & { session?: { identity: Identity } }).session = {
      identity: {
        userId: payload.userId,
        displayName: payload.displayName,
        groups: payload.groups,
      },
    }
  })

  app.get<{ Querystring: { returnTo?: string; switch?: string } }>('/auth/login', async (request, reply) => {
    try {
      const { url, state } = await client.beginLogin(safeReturnTo(request.query.returnTo), {
        switchAccount: request.query.switch === '1',
      })
      return reply
        .setCookie(LOGIN_COOKIE, signPayload(state, secret), {
          httpOnly: true,
          sameSite: 'lax',
          secure,
          path: '/auth',
          maxAge: Math.floor(LOGIN_TTL_MS / 1000),
        })
        .redirect(url)
    } catch (error) {
      // The provider being down is a 503, not a 500: it says the outage is
      // upstream, which is the one thing an operator needs to know first.
      return reply.code(503).send({ error: (error as Error).message })
    }
  })

  app.get('/auth/callback', async (request, reply) => {
    const raw = request.cookies[LOGIN_COOKIE]
    const login = raw ? verifyPayload<LoginState>(raw, secret) : undefined
    if (!login) {
      return reply.code(400).send({ error: 'no sign-in was in progress; start again from /' })
    }

    // Rebuilt on the CONFIGURED redirect, never on request.url: behind a proxy
    // the request carries the container's host, and the exchange fails on a
    // mismatch that names nothing useful.
    const currentUrl = new URL(oidc.redirectUri)
    for (const [key, value] of new URL(request.url, 'http://placeholder').searchParams) {
      currentUrl.searchParams.set(key, value)
    }

    const outcome = await client.completeLogin(currentUrl, login)
    reply.clearCookie(LOGIN_COOKIE, { path: '/auth' })

    if ('error' in outcome) return reply.code(403).send({ error: outcome.error })

    // A refused account is not an error page: it leaves a short cookie saying
    // who it was, no session, and the shell asks `GET /auth/refused`.
    if ('refused' in outcome) {
      const { identity, idToken } = outcome.refused
      const refused = (hint: string | undefined): string =>
        signPayload(
          {
            displayName: identity.displayName,
            userId: identity.userId,
            ...(hint ? { idToken: hint } : {}),
            expiresAt: Date.now() + REFUSED_TTL_MS,
          } satisfies RefusedPayload,
          secret,
        )
      let value = refused(idToken)
      // Past what a browser keeps the cookie would be dropped silently, and
      // the page with it: lose the hint instead, and logout falls back.
      if (value.length > COOKIE_LIMIT) value = refused(undefined)
      return reply
        .setCookie(REFUSED_COOKIE, value, {
          httpOnly: true,
          sameSite: 'lax',
          secure,
          path: '/',
          maxAge: Math.floor(REFUSED_TTL_MS / 1000),
        })
        .redirect('/')
    }

    // Kept for the person, not for the session: a cookie is a browser's, and
    // this outlives every browser they sign in from. A failure to store must
    // never cost them the login they just completed.
    if (userTokens && outcome.refreshToken) {
      await userTokens
        .remember(outcome.identity.userId, outcome.refreshToken)
        .catch(() => undefined)
    }

    // Backed only when something was actually kept: the flag says "a verdict
    // exists to read", not "a rebound was configured". They differ the day a
    // provider grants the scope and returns no token.
    const backed = Boolean(userTokens && outcome.refreshToken)
    const payload: SessionPayload = {
      ...outcome.identity,
      expiresAt: Date.now() + oidc.sessionTtlMs,
      ...(backed ? { backed: true } : {}),
    }
    return reply
      .setCookie(SESSION_COOKIE, signPayload(payload, secret), {
        httpOnly: true,
        sameSite: 'lax',
        secure,
        path: '/',
        maxAge: Math.floor(oidc.sessionTtlMs / 1000),
      })
      .redirect(login.returnTo)
  })

  app.get('/auth/refused', async (request, reply) => {
    const raw = request.cookies[REFUSED_COOKIE]
    const refused = raw ? verifyPayload<RefusedPayload>(raw, secret) : undefined
    if (!refused) return reply.code(401).send({ error: 'no refused sign-in' })
    return reply.header('cache-control', 'no-store').send({ displayName: refused.displayName })
  })

  /*
   * A native form POST carries `application/x-www-form-urlencoded`, and
   * Fastify parses only JSON and plain text out of the box — so the sign-out
   * button answered 415 from the day this instance became an OIDC client.
   * Never seen before that: behind a reverse proxy, signing out was the
   * proxy's business and this route was dead code.
   *
   * The body is DISCARDED rather than parsed. Nothing here reads a field, and
   * a parser that accepts input it never uses is a parser that will one day be
   * trusted with input it should not have.
   */
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, _body, done) => done(null, {}),
  )

  app.post('/auth/logout', async (request, reply) => {
    // Read before it is cleared: it may carry the hint the provider wants.
    const rawRefused = request.cookies[REFUSED_COOKIE]
    const refused = rawRefused ? verifyPayload<RefusedPayload>(rawRefused, secret) : undefined
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    reply.clearCookie(REFUSED_COOKIE, { path: '/' })
    // A browser that posted a form is sent somewhere; a fetch gets its JSON.
    // Showing `{"signedOut":true}` to somebody who clicked a button is the
    // same mistake as showing them `{"error":"not signed in"}`.
    const wantsDocument = String(request.headers.accept ?? '').includes('text/html')
    if (!wantsDocument) return reply.send({ signedOut: true })
    // The provider's session too, or its SSO cookie signs the same account
    // straight back in. Without an end_session_endpoint, the next login is
    // told to ask for credentials instead.
    const endSession = await client.endSessionUrl(refused?.idToken)
    return reply.redirect(endSession ?? '/auth/login?switch=1')
  })
}
