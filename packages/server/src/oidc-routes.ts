/**
 * The login round trip.
 *
 * Mounted only in `oidc` mode. Everything it does is stateless server-side —
 * two signed cookies, no session table — so restarting Demeura does not sign
 * everyone out and two instances behind a load balancer need nothing shared
 * beyond the signing secret.
 */

import cookie from '@fastify/cookie'
import type { FastifyInstance, FastifyRequest } from 'fastify'

import type { Identity } from './auth.js'
import type { DemeuraConfig } from './config.js'
import {
  LOGIN_COOKIE,
  LOGIN_TTL_MS,
  OidcClient,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  safeReturnTo,
  sessionSecret,
  signPayload,
  verifyPayload,
  type LoginState,
  type SessionPayload,
} from './oidc.js'

export async function registerOidc(
  app: FastifyInstance,
  config: DemeuraConfig,
  /**
   * Where a login's refresh token is kept, when the instance wants a rebound.
   * Passed in rather than built here: this module speaks OIDC, and the store
   * belongs to the instance's data directory.
   */
  userTokens?: { remember(subject: string, refreshToken: string): Promise<void> },
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

  app.addHook('onRequest', async (request: FastifyRequest) => {
    const raw = request.cookies[SESSION_COOKIE]
    const payload = raw ? verifyPayload<SessionPayload>(raw, secret) : undefined
    if (payload) {
      ;(request as FastifyRequest & { session?: { identity: Identity } }).session = {
        identity: {
          userId: payload.userId,
          displayName: payload.displayName,
          groups: payload.groups,
        },
      }
    }
  })

  app.get<{ Querystring: { returnTo?: string } }>('/auth/login', async (request, reply) => {
    try {
      const { url, state } = await client.beginLogin(safeReturnTo(request.query.returnTo))
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

    // Kept for the person, not for the session: a cookie is a browser's, and
    // this outlives every browser they sign in from. A failure to store must
    // never cost them the login they just completed.
    if (userTokens && outcome.refreshToken) {
      await userTokens
        .remember(outcome.identity.userId, outcome.refreshToken)
        .catch(() => undefined)
    }

    const payload: SessionPayload = { ...outcome.identity, expiresAt: Date.now() + SESSION_TTL_MS }
    return reply
      .setCookie(SESSION_COOKIE, signPayload(payload, secret), {
        httpOnly: true,
        sameSite: 'lax',
        secure,
        path: '/',
        maxAge: Math.floor(SESSION_TTL_MS / 1000),
      })
      .redirect(login.returnTo)
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
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    // A browser that posted a form is sent somewhere; a fetch gets its JSON.
    // Showing `{"signedOut":true}` to somebody who clicked a button is the
    // same mistake as showing them `{"error":"not signed in"}`.
    const wantsDocument = String(request.headers.accept ?? '').includes('text/html')
    // ⚠️ This ends DEMEURA's session, not the identity provider's. The SSO
    // cookie outlives it, so the next visit signs them straight back in
    // without a password. That is what a single sign-on does, and saying so
    // in the interface is a separate piece of work from this fix.
    return wantsDocument ? reply.redirect('/') : reply.send({ signedOut: true })
  })
}
