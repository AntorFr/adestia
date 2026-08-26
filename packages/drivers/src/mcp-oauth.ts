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
  /** Present for a confidential client (client_credentials, or refresh with a secret). */
  readonly clientSecret?: string | undefined
  /**
   * A stored refresh token. Its presence switches the grant to
   * `refresh_token`: the instance acts on a PERSON's behalf (a token minted
   * once through an interactive authorization-code flow) rather than as its
   * own machine identity. A public client sends no secret; a rotated refresh
   * token is kept for the next turn.
   */
  readonly refreshToken?: string | undefined
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

/**
 * Persistence for a rotating refresh token, injected by the core.
 *
 * A refresh token minted through an interactive login is the ONLY way back in
 * without asking the person again. OAuth 2.1 servers rotate it and invalidate
 * the old one, so the latest must outlive the process — otherwise a restart
 * presents a spent token and the instance is locked out until someone logs in
 * anew. Keyed by `tokenUrl|clientId`; the core decides where it lands (0600,
 * beside the driver credential).
 */
export interface RefreshStore {
  load(key: string): Promise<string | undefined> | string | undefined
  save(key: string, refreshToken: string): Promise<void> | void
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
  /** Current refresh token per identity, updated when a provider rotates it. */
  readonly #refresh = new Map<string, string>()
  readonly #fetch: typeof fetch
  readonly #store: RefreshStore | undefined

  constructor(fetchImpl: typeof fetch = fetch, store?: RefreshStore) {
    this.#fetch = fetchImpl
    this.#store = store
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
    const headers: Record<string, string> = {
      'content-type': 'application/x-www-form-urlencoded',
    }
    const body = new URLSearchParams()
    const rkey = `${auth.tokenUrl}|${auth.clientId}`
    const usingRefresh = auth.refreshToken !== undefined

    if (usingRefresh) {
      // Acting for a person: the refresh token minted once through an
      // interactive authorization-code flow. A public client sends `client_id`
      // in the body and no secret; a confidential one still authenticates. The
      // persisted value wins — it is the one a provider's rotation left valid.
      const current =
        (await this.#store?.load(rkey)) ?? this.#refresh.get(rkey) ?? auth.refreshToken!
      body.set('grant_type', 'refresh_token')
      body.set('refresh_token', current)
      body.set('client_id', auth.clientId)
      if (auth.clientSecret) {
        headers.authorization = `Basic ${btoa(`${encodeURIComponent(auth.clientId)}:${encodeURIComponent(auth.clientSecret)}`)}`
      }
    } else {
      // The machine identity: the instance's own client credentials.
      body.set('grant_type', 'client_credentials')
      headers.authorization = `Basic ${btoa(`${encodeURIComponent(auth.clientId)}:${encodeURIComponent(auth.clientSecret ?? '')}`)}`
    }
    if (auth.scope) body.set('scope', auth.scope)
    if (auth.audience) body.set('audience', auth.audience)

    let payload: { access_token?: string; expires_in?: number; refresh_token?: string }
    try {
      const response = await this.#fetch(auth.tokenUrl, {
        method: 'POST',
        headers,
        body: body.toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!response.ok) return undefined
      payload = (await response.json()) as {
        access_token?: string
        expires_in?: number
        refresh_token?: string
      }
    } catch {
      return undefined
    }

    const token = payload.access_token
    if (!token) return undefined

    // Refresh-token rotation: many providers issue a new one each time and
    // invalidate the old. Keep the latest so the next turn does not present a
    // spent token, and persist it so a restart does not either.
    if (usingRefresh && payload.refresh_token) {
      this.#refresh.set(rkey, payload.refresh_token)
      await this.#store?.save(rkey, payload.refresh_token)
    }

    // A minute early, and never negative: a provider that answers `expires_in:
    // 30` would otherwise cache a token already treated as stale, and every
    // turn would mint again.
    const lifetime = Math.max((payload.expires_in ?? 3600) * 1000 - EARLY_MS, 1_000)
    this.#cache.set(key, { token, until: Date.now() + lifetime })
    return token
  }
}
