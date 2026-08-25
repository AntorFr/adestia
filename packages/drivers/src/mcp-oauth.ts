/**
 * Access tokens for MCP servers that want OAuth rather than a fixed header.
 *
 * An MCP hub is a resource server: it validates short-lived JWTs from an
 * identity provider. A static `Authorization: Bearer …` in a config file works
 * for exactly one hour and then stops, which is why the predecessor grew a
 * relay process — a stdio MCP server per addon, forwarding to the hub over
 * HTTPS and minting tokens in memory, because the CLI's config file can only
 * hold a constant.
 *
 * Golem does not have that constraint and so does not need that relay. It
 * hands the driver its MCP servers at the SPAWN SITE, once per turn, which is
 * the natural moment to put a fresh token in a header. No subprocess per
 * addon, no second language in the image, no relay to keep in sync.
 *
 * What is minted here is the MACHINE identity — the instance's own client
 * credentials. A per-user token, for addons that read somebody's own calendar
 * or mail, is a different source for the same header, and slots in at the same
 * place when the shell can produce one.
 */

/** What a server needs in order to obtain a token for itself. */
export interface McpOAuth {
  /** The token endpoint. */
  readonly tokenUrl: string
  readonly clientId: string
  readonly clientSecret: string
  /** Space-separated, as OAuth spells it. */
  readonly scope?: string | undefined
  /**
   * Who the token is FOR.
   *
   * A resource server checks this: a token minted for another audience is a
   * valid token that it will still refuse, and the refusal reads like a
   * credentials problem rather than a mismatch. Named per server because one
   * instance may hold identities at several hubs.
   */
  readonly audience?: string | undefined
}

interface Cached {
  readonly token: string
  /** Epoch ms, already pulled back from the real expiry. */
  readonly until: number
}

/** Refreshed this long before it actually expires. */
const EARLY_MS = 60_000
const TIMEOUT_MS = 15_000

/**
 * Mints and caches, keyed by the credentials themselves.
 *
 * Keyed by identity rather than by server name on purpose: several addons of
 * one hub share an identity, and minting a token per addon would mean nine
 * round trips where one does — and nine entries expiring at nine different
 * moments, for no gain.
 */
export class McpTokens {
  readonly #cache = new Map<string, Cached>()
  readonly #inFlight = new Map<string, Promise<string | undefined>>()
  readonly #fetch: typeof fetch

  constructor(fetchImpl: typeof fetch = fetch) {
    this.#fetch = fetchImpl
  }

  /**
   * A live token, or `undefined` when one cannot be had.
   *
   * Undefined rather than a throw: a hub that is down, or an identity provider
   * that refuses, must cost the SERVERS that need it — not the turn. The agent
   * then runs without those tools, which is the same degradation as a missing
   * secret, and the CLI reports the server as failed.
   */
  async for(auth: McpOAuth): Promise<string | undefined> {
    const key = `${auth.tokenUrl}|${auth.clientId}|${auth.scope ?? ''}|${auth.audience ?? ''}`
    const hit = this.#cache.get(key)
    if (hit && Date.now() < hit.until) return hit.token

    // Two turns starting at once must not mint twice: the second waits on the
    // first rather than racing it, which also keeps a rotating refresh from
    // being burned by a duplicate exchange.
    const running = this.#inFlight.get(key)
    if (running) return running

    const attempt = this.#mint(auth, key).finally(() => this.#inFlight.delete(key))
    this.#inFlight.set(key, attempt)
    return attempt
  }

  async #mint(auth: McpOAuth, key: string): Promise<string | undefined> {
    const body = new URLSearchParams({ grant_type: 'client_credentials' })
    if (auth.scope) body.set('scope', auth.scope)
    if (auth.audience) body.set('audience', auth.audience)

    let payload: { access_token?: string; expires_in?: number }
    try {
      const response = await this.#fetch(auth.tokenUrl, {
        method: 'POST',
        headers: {
          // `client_secret_basic`. The alternative — credentials in the body —
          // is what several providers refuse with a bare `invalid_client`,
          // which reads as a wrong secret rather than a wrong method.
          authorization: `Basic ${btoa(`${encodeURIComponent(auth.clientId)}:${encodeURIComponent(auth.clientSecret)}`)}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!response.ok) return undefined
      payload = (await response.json()) as { access_token?: string; expires_in?: number }
    } catch {
      return undefined
    }

    const token = payload.access_token
    if (!token) return undefined

    // A minute early, and never negative: a provider that answers `expires_in:
    // 30` would otherwise cache a token already treated as stale, and every
    // turn would mint again.
    const lifetime = Math.max((payload.expires_in ?? 3600) * 1000 - EARLY_MS, 1_000)
    this.#cache.set(key, { token, until: Date.now() + lifetime })
    return token
  }
}
