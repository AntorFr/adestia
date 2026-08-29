/**
 * OIDC login — any standard issuer, no local accounts.
 *
 * Adestia never stores a password and never owns an account. It is an
 * Authorization Code + PKCE client, and the roles it recognises come from a
 * groups claim resynchronised at every login, so the identity provider stays
 * the source of truth and anything kept here is a cache.
 *
 * Three things below are hard-won rather than obvious, and each is commented
 * where it happens: the client authentication method, lazy discovery, and
 * anchoring every URL on the configured redirect rather than on the request.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

import * as client from 'openid-client'

import type { Identity } from './auth.js'
import type { OidcConfig } from './config.js'

/** How long a login round trip may take before its state is stale. */
export const LOGIN_TTL_MS = 10 * 60 * 1000
/** How long a session lasts before the user signs in again. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000

export const SESSION_COOKIE = 'adestia_session'
export const LOGIN_COOKIE = 'adestia_login'

export interface LoginState {
  readonly state: string
  readonly codeVerifier: string
  readonly returnTo: string
  readonly expiresAt: number
}

export interface SessionPayload extends Identity {
  readonly expiresAt: number
}

/**
 * A signed, self-contained session cookie.
 *
 * Self-contained so a restart does not sign everyone out, and signed so its
 * contents cannot be edited — a cookie carrying `groups` that the browser
 * could rewrite would be an admin badge anyone can print.
 */
export function signPayload(payload: object, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${signature}`
}

export function verifyPayload<T>(cookie: string, secret: string, now = Date.now()): T | undefined {
  const [body, signature] = cookie.split('.')
  if (!body || !signature) return undefined

  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  const given = Buffer.from(signature)
  const want = Buffer.from(expected)
  // Constant-time, so the comparison does not leak the signature one byte at a
  // time to anyone willing to measure.
  if (given.length !== want.length || !timingSafeEqual(given, want)) return undefined

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      expiresAt?: number
    }
    if (typeof payload.expiresAt === 'number' && payload.expiresAt <= now) return undefined
    return payload as T
  } catch {
    return undefined
  }
}

/**
 * Where a login may send the user back to.
 *
 * Only same-site paths: a `returnTo` the caller controls is an open redirect,
 * and an open redirect on a login route is how a phishing link borrows your
 * domain's credibility.
 */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

export function identityFrom(
  claims: Record<string, unknown>,
  config: OidcConfig,
): Identity | undefined {
  const subject = claims['sub']
  if (typeof subject !== 'string' || subject === '') return undefined

  const rawGroups = claims[config.groupsClaim]
  const groups = Array.isArray(rawGroups)
    ? rawGroups.filter((group): group is string => typeof group === 'string')
    : []

  const name = claims['name'] ?? claims['preferred_username'] ?? subject

  return {
    // The SUBJECT, not the username: a username can be reassigned, and a
    // conversation store keyed on one would hand someone else's threads to
    // whoever inherits the name.
    userId: subject,
    displayName: typeof name === 'string' ? name : subject,
    groups,
  }
}

export function isAllowed(identity: Identity, config: OidcConfig): boolean {
  if (config.allowedGroups.length === 0) return true
  return identity.groups.some((group) => config.allowedGroups.includes(group))
}

export class OidcClient {
  #configuration: client.Configuration | undefined
  #discoveryFailure: string | undefined

  constructor(private readonly config: OidcConfig) {}

  /**
   * Discovery happens on first use, not at boot, and a failure is remembered
   * without being fatal: an identity provider that is momentarily down must
   * not stop Adestia from starting. The alternative — discovering eagerly — ties
   * every restart of the product to the availability of another service.
   */
  async #discover(): Promise<client.Configuration> {
    if (this.#configuration) return this.#configuration
    try {
      this.#configuration = await client.discovery(
        new URL(this.config.issuer),
        this.config.clientId,
        this.config.clientSecret,
        // Explicit, and NOT the library default (`client_secret_post`):
        // Authelia and several other providers answer `invalid_client` to it,
        // and the resulting error names the client rather than the method.
        client.ClientSecretBasic(this.config.clientSecret),
      )
      this.#discoveryFailure = undefined
      return this.#configuration
    } catch (error) {
      this.#discoveryFailure = (error as Error).message
      throw new Error(`the identity provider could not be reached: ${this.#discoveryFailure}`)
    }
  }

  async beginLogin(returnTo: string): Promise<{ url: string; state: LoginState }> {
    const configuration = await this.#discover()
    const codeVerifier = client.randomPKCECodeVerifier()
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier)
    const state = client.randomState()

    const url = client.buildAuthorizationUrl(configuration, {
      // Anchored on the CONFIGURED redirect, never derived from the request:
      // behind a reverse proxy the request's host is the container's, and a
      // redirect built from it sends the browser somewhere it cannot reach —
      // or fails the exchange on a mismatch.
      redirect_uri: this.config.redirectUri,
      // `offline_access` only when the instance intends to KEEP something.
      // Asking for a refresh token nobody stores is asking a person to grant
      // standing access for nothing.
      scope: `openid profile email ${this.config.groupsClaim}${
        this.config.reboundAudience?.length ? ' offline_access' : ''
      }`,
      // Frozen into the grant: a token minted later carries the audiences the
      // LOGIN asked for, and no refresh can add one. Adding an audience here
      // therefore takes effect at the next sign-in, never before.
      ...(this.config.reboundAudience?.length
        ? { audience: this.config.reboundAudience.join(' ') }
        : {}),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    })

    return {
      url: url.href,
      state: { state, codeVerifier, returnTo, expiresAt: Date.now() + LOGIN_TTL_MS },
    }
  }

  async completeLogin(
    currentUrl: URL,
    login: LoginState,
  ): Promise<{ identity: Identity; refreshToken?: string } | { error: string }> {
    if (login.expiresAt <= Date.now()) return { error: 'that sign-in took too long; try again' }

    let configuration: client.Configuration
    try {
      configuration = await this.#discover()
    } catch (error) {
      return { error: (error as Error).message }
    }

    try {
      const tokens = await client.authorizationCodeGrant(configuration, currentUrl, {
        pkceCodeVerifier: login.codeVerifier,
        expectedState: login.state,
      })

      // Claims from the userinfo endpoint rather than the id token alone:
      // several providers, Authelia among them, put group membership only
      // there, and a role read from the wrong place is a role that silently
      // never applies.
      const idClaims = (tokens.claims() ?? {}) as Record<string, unknown>
      const subject = String(idClaims['sub'] ?? '')
      const userInfo = subject
        ? await client
            .fetchUserInfo(configuration, tokens.access_token, subject)
            .catch(() => ({}) as Record<string, unknown>)
        : {}

      const identity = identityFrom({ ...idClaims, ...userInfo }, this.config)
      if (!identity) return { error: 'the identity provider returned no subject' }
      if (!isAllowed(identity, this.config)) {
        return { error: 'your account is not in a group allowed to use this instance' }
      }
      // Handed back rather than stored here: this module speaks OIDC and
      // knows nothing about where an instance keeps things. A provider that
      // grants the scope without returning a token — which happens when a
      // client omits `refresh_token` from its grant types — simply yields
      // undefined, and the instance signs people in without a rebound.
      return {
        identity,
        ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
      }
    } catch (error) {
      return { error: (error as Error).message }
    }
  }
}

/** A per-instance signing secret, when the operator supplied none. */
export function sessionSecret(configured: string | undefined): string {
  if (configured && configured.length >= 16) return configured
  // Generated rather than defaulted to a constant: a shared default secret is
  // a session forgery kit shipped to everyone. The cost is that restarting
  // signs users out, which is stated in the docs and is the right trade.
  return randomUUID() + randomUUID()
}
