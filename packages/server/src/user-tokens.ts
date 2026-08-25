/**
 * Per-user access tokens, so a turn can act as the person who asked for it.
 *
 * An MCP server that serves somebody's own data — their calendar, their mail —
 * refuses the instance's identity, and it is right to: the instance is not a
 * person, and "whose calendar" has no answer without one. So the shell keeps,
 * per user, the refresh token their login yielded, and mints a fresh access
 * token when a turn needs one.
 *
 * WHAT LIVES HERE AND WHAT DOES NOT. Refresh tokens only, on disk, `0600`,
 * under the instance's data directory. Never in a cookie, never in the
 * session payload, never in the workspace the agent can read. The agent is
 * handed a short-lived ACCESS token for the length of one turn and never sees
 * what produced it.
 *
 * FAILURE IS ALWAYS SILENT-BUT-DEGRADING, never fatal. A provider that is down
 * costs the user-scoped servers of that turn; a grant that was revoked drops
 * the entry so the next login re-seeds it. In both cases the turn runs, with
 * fewer tools — the same shape as every other missing credential here.
 *
 * ⚠️ Its lifetime is the identity provider's, not ours. A refresh token whose
 * default life is shorter than the session's makes an instance that looks
 * signed in and cannot reach a thing; that is a provider-side setting, and the
 * deployment notes are where it belongs.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'

interface Entry {
  refreshToken: string
  accessToken?: string
  /** Epoch ms, already pulled back from the real expiry. */
  expiresAt?: number
}

/** Refreshed this long before it actually expires. */
const EARLY_MS = 60_000
const TIMEOUT_MS = 15_000

export interface TokenExchange {
  /**
   * The provider's issuer. The token endpoint is DISCOVERED from it rather
   * than assembled: `<issuer>/api/oidc/token` is one provider's path, not a
   * standard, and hardcoding it would make this work on exactly the
   * deployment it was written against.
   */
  readonly issuer: string
  readonly clientId: string
  readonly clientSecret: string
}

export class UserTokens {
  readonly #file: string
  readonly #exchange: TokenExchange
  readonly #fetch: typeof fetch
  #cache: Record<string, Entry> | undefined
  /** Discovered once, on first use — never at boot, which would tie a
   *  restart of this product to another service being up. */
  #tokenUrl: Promise<string> | undefined
  /** One exchange at a time per subject: a rotating refresh burns on a race. */
  readonly #inFlight = new Map<string, Promise<string | undefined>>()

  constructor(dataDir: string, exchange: TokenExchange, fetchImpl: typeof fetch = fetch) {
    this.#file = join(dataDir, 'user-tokens.json')
    this.#exchange = exchange
    this.#fetch = fetchImpl
  }

  async #load(): Promise<Record<string, Entry>> {
    if (this.#cache) return this.#cache
    try {
      this.#cache = JSON.parse(await readFile(this.#file, 'utf8')) as Record<string, Entry>
    } catch {
      this.#cache = {}
    }
    return this.#cache
  }

  async #save(): Promise<void> {
    const store = this.#cache ?? {}
    await mkdir(dirname(this.#file), { recursive: true })
    // Atomic, and 0600: this file is the closest thing the instance holds to
    // somebody's account.
    const temporary = `${this.#file}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(store, null, 1), { mode: 0o600 })
    await rename(temporary, this.#file)
  }

  /** Remembers what a login yielded. Called once, at the end of the flow. */
  async remember(subject: string, refreshToken: string): Promise<void> {
    if (!subject || !refreshToken) return
    const store = await this.#load()
    // The access token from the login is deliberately NOT kept: it was minted
    // for the shell, and what a turn needs is minted per turn from the
    // refresh — one place that produces them, one shape to reason about.
    store[subject] = { refreshToken }
    await this.#save()
  }

  /** Whether this person could act at all — for a UI that wants to say so. */
  async has(subject: string): Promise<boolean> {
    return Boolean((await this.#load())[subject]?.refreshToken)
  }

  /**
   * A live access token for this person, or `undefined`.
   *
   * Undefined covers three different situations on purpose, because the caller
   * does the same thing in all three: no session material (never logged in
   * since this was turned on), a provider that cannot be reached, and a grant
   * that was revoked. The first and third differ in what happens next — the
   * revoked one drops its entry so a fresh login re-seeds it.
   */
  async accessToken(subject: string): Promise<string | undefined> {
    if (!subject) return undefined
    const store = await this.#load()
    const entry = store[subject]
    if (!entry?.refreshToken) return undefined
    if (entry.accessToken && entry.expiresAt && Date.now() < entry.expiresAt) {
      return entry.accessToken
    }

    const running = this.#inFlight.get(subject)
    if (running) return running
    const attempt = this.#refresh(subject, entry).finally(() => this.#inFlight.delete(subject))
    this.#inFlight.set(subject, attempt)
    return attempt
  }

  async #tokenEndpoint(): Promise<string> {
    this.#tokenUrl ??= (async () => {
      const base = this.#exchange.issuer.replace(/\/*$/, '/')
      const response = await this.#fetch(new URL('.well-known/openid-configuration', base), {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!response.ok) throw new Error(`discovery answered ${response.status}`)
      const document = (await response.json()) as { token_endpoint?: string }
      if (!document.token_endpoint) throw new Error('the provider published no token endpoint')
      return document.token_endpoint
    })().catch((error: Error) => {
      // Not remembered as a failure: a provider that was down for a minute
      // must not be treated as absent for the life of the process.
      this.#tokenUrl = undefined
      throw error
    })
    return this.#tokenUrl
  }

  async #refresh(subject: string, entry: Entry): Promise<string | undefined> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: entry.refreshToken,
    })

    let response: Response
    try {
      response = await this.#fetch(await this.#tokenEndpoint(), {
        method: 'POST',
        headers: {
          authorization: `Basic ${btoa(
            `${encodeURIComponent(this.#exchange.clientId)}:${encodeURIComponent(this.#exchange.clientSecret)}`,
          )}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      // Unreachable, not refused: the grant may be perfectly good, so nothing
      // is dropped. The turn goes without, and the next one tries again.
      return undefined
    }

    if (!response.ok) {
      // Refused. The grant is gone — revoked, or expired past the provider's
      // refresh lifetime — so the entry goes too, and the next login re-seeds
      // it. Keeping it would retry a dead credential on every single turn.
      const store = await this.#load()
      delete store[subject]
      await this.#save()
      return undefined
    }

    const payload = (await response.json().catch(() => ({}))) as {
      access_token?: string
      expires_in?: number
      refresh_token?: string
    }
    if (!payload.access_token) return undefined

    entry.accessToken = payload.access_token
    entry.expiresAt = Date.now() + Math.max((payload.expires_in ?? 3600) * 1000 - EARLY_MS, 1_000)
    // Rotation: providers that hand back a new refresh token kill the old one
    // as they do it. Missing this is an instance that works until it suddenly
    // does not, hours later, with nothing in the logs.
    if (payload.refresh_token) entry.refreshToken = payload.refresh_token
    await this.#save()
    return entry.accessToken
  }
}
