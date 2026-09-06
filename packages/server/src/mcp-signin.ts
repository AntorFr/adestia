/**
 * Signing IN to an MCP server — the flow the "needs a sign-in" state never had.
 *
 * Some MCP servers are their own authorization server (an mcp-auth style
 * proxy federating a household IdP): they mint their own tokens after an
 * interactive login, and accept nothing else. The rebound token that serves
 * every other `identity: user` server is foreign currency there — presenting
 * it reads as "failed" when the truthful state is "nobody connected yet".
 *
 * So connecting is a PERSON's gesture, done once, from the product: discover
 * the server's authorization endpoints (RFC 9728 then RFC 8414), register
 * ONE client for this instance (dynamic client registration), send the
 * person through authorization-code + PKCE, and keep their rotating refresh
 * key. Every later turn that person asks for mints a fresh access token from
 * their own key — two people's turns reach the same server as two different
 * people, exactly like the rebound servers. A turn with no caller, or a
 * caller who never connected, simply does not see the server: that absence
 * is what the shell's sign-in card is built on.
 *
 * Everything this module holds lives in ONE file it alone writes
 * (`mcp-signin.json`, 0600): the per-server client registrations, and the
 * per-(server, person) refresh keys — rotated at every mint, because OAuth
 * 2.1 servers invalidate the spent one, and a rotation lost to a crash locks
 * the person out until they click again (lived on this very machine's
 * helper).
 */

import { createHash, randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'

import { McpTokens } from '@antorfr/adestia-drivers'

import type { McpServerConfig } from './config.js'

/** What DCR handed back for one server — enough to mint forever after. */
export interface Registration {
  readonly clientId: string
  readonly clientSecret?: string | undefined
  readonly authorizationEndpoint: string
  readonly tokenEndpoint: string
  /** The redirect the client was REGISTERED with: later flows must reuse it
      verbatim, whatever origin the person happens to browse from. */
  readonly redirectUri: string
}

interface Pending {
  readonly userId: string
  readonly server: string
  readonly verifier: string
  readonly redirectUri: string
  readonly at: number
}

/** An authorization left unfinished is forgotten after this long. */
const PENDING_TTL_MS = 10 * 60 * 1000
const HTTP_TIMEOUT_MS = 15_000

const b64url = (buffer: Buffer): string =>
  buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** One person's key for one server. The user id may hold anything an IdP
    emits; hashed so the JSON stays a flat map of plain words. */
function userKey(server: string, userId: string): string {
  return `user|${server}|${createHash('sha256').update(userId).digest('hex').slice(0, 16)}`
}

interface Persisted {
  registrations: Record<string, Registration>
  keys: Record<string, string>
}

export class McpSignIn {
  readonly #path: string
  readonly #fetch: typeof fetch
  readonly #pending = new Map<string, Pending>()
  /** One minting engine per person: `McpTokens` caches by identity, and its
      rotation writes go through this module's adapter to the per-user key. */
  readonly #minters = new Map<string, McpTokens>()
  #queue: Promise<unknown> = Promise.resolve()
  #cache: Persisted | undefined

  constructor(dataDir: string, fetchImpl: typeof fetch = fetch) {
    this.#path = join(dataDir, 'mcp-signin.json')
    this.#fetch = fetchImpl
  }

  async #read(): Promise<Persisted> {
    if (this.#cache) return this.#cache
    let held: Persisted = { registrations: {}, keys: {} }
    try {
      const parsed = JSON.parse(await readFile(this.#path, 'utf8')) as Partial<Persisted>
      held = { registrations: parsed.registrations ?? {}, keys: parsed.keys ?? {} }
    } catch {
      /* absent or corrupt: a fresh file — the person clicks once more */
    }
    this.#cache = held
    return held
  }

  async #write(mutate: (held: Persisted) => void): Promise<void> {
    const write = this.#queue.then(async () => {
      const held = await this.#read()
      mutate(held)
      await mkdir(dirname(this.#path), { recursive: true })
      const temporary = `${this.#path}.${randomUUID()}.tmp`
      // 0600 at creation: this file holds refresh keys, the way back into
      // every connected person's account.
      await writeFile(temporary, `${JSON.stringify(held, null, 2)}\n`, { mode: 0o600 })
      await chmod(temporary, 0o600)
      await rename(temporary, this.#path).catch(async (error) => {
        await unlink(temporary).catch(() => undefined)
        throw error
      })
      this.#cache = held
    })
    this.#queue = write.catch(() => undefined)
    await write
  }

  /**
   * Where this server's authorization actually lives.
   *
   * RFC 9728 names the authorization server(s) of a protected resource; the
   * resource's own origin is the fallback, which happens to be the truth for
   * an mcp-auth proxy. Then RFC 8414 on that origin yields the endpoints.
   */
  async #discover(
    serverUrl: string,
  ): Promise<
    | { authorizationEndpoint: string; tokenEndpoint: string; registrationEndpoint?: string }
    | { problem: string }
  > {
    const origin = new URL(serverUrl).origin
    let asBase = origin
    try {
      const resource = await this.#json(`${origin}/.well-known/oauth-protected-resource`)
      const listed = (resource as { authorization_servers?: unknown })?.authorization_servers
      if (Array.isArray(listed) && typeof listed[0] === 'string') {
        asBase = new URL(listed[0]).origin
      }
    } catch {
      /* no RFC 9728 document: try the origin itself */
    }
    let metadata: Record<string, unknown>
    try {
      metadata = (await this.#json(
        `${asBase}/.well-known/oauth-authorization-server`,
      )) as Record<string, unknown>
    } catch {
      return { problem: `no OAuth metadata at ${asBase} — is this a sign-in server?` }
    }
    const authorization = metadata['authorization_endpoint']
    const token = metadata['token_endpoint']
    if (typeof authorization !== 'string' || typeof token !== 'string') {
      return { problem: `the metadata at ${asBase} names no authorization/token endpoints` }
    }
    return {
      authorizationEndpoint: authorization,
      tokenEndpoint: token,
      ...(typeof metadata['registration_endpoint'] === 'string'
        ? { registrationEndpoint: metadata['registration_endpoint'] }
        : {}),
    }
  }

  async #json(url: string): Promise<unknown> {
    const response = await this.#fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) })
    if (!response.ok) throw new Error(`${url} answered ${response.status}`)
    return response.json()
  }

  /** The instance's ONE client at this server — registered on first need. */
  async #registration(
    server: McpServerConfig,
    origin: string,
    instanceName: string,
  ): Promise<Registration | { problem: string }> {
    const held = (await this.#read()).registrations[server.name]
    if (held) return held

    const discovered = await this.#discover(server.url!)
    if ('problem' in discovered) return discovered
    if (!discovered.registrationEndpoint) {
      return { problem: 'this server offers no dynamic client registration' }
    }

    const redirectUri = `${origin}/api/mcp/signin/callback`
    let body: Record<string, unknown>
    try {
      const response = await this.#fetch(discovered.registrationEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_name: instanceName,
          redirect_uris: [redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        }),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      })
      if (!response.ok) return { problem: `registration refused (${response.status})` }
      body = (await response.json()) as Record<string, unknown>
    } catch (error) {
      return { problem: `registration failed: ${(error as Error).message}` }
    }
    if (typeof body['client_id'] !== 'string') {
      return { problem: 'registration answered without a client_id' }
    }

    const registration: Registration = {
      clientId: body['client_id'],
      ...(typeof body['client_secret'] === 'string'
        ? { clientSecret: body['client_secret'] }
        : {}),
      authorizationEndpoint: discovered.authorizationEndpoint,
      tokenEndpoint: discovered.tokenEndpoint,
      redirectUri,
    }
    await this.#write((held) => {
      held.registrations[server.name] = registration
    })
    return registration
  }

  /**
   * Starts one person's authorization: returns where to send their browser.
   *
   * PKCE with S256 and a single-use state, both held server-side — the
   * callback proves possession of the state, the exchange proves possession
   * of the verifier, and neither ever reaches the person's page.
   */
  async begin(
    server: McpServerConfig,
    userId: string,
    origin: string,
    instanceName: string,
  ): Promise<{ authorizeUrl: string } | { problem: string }> {
    if (server.signIn !== 'oauth' || !server.url) {
      return { problem: 'this server declares no sign-in' }
    }
    const registration = await this.#registration(server, origin, instanceName)
    if ('problem' in registration) return registration

    const verifier = b64url(randomBytes(32))
    const state = b64url(randomBytes(24))
    const now = Date.now()
    for (const [key, pending] of this.#pending) {
      if (now - pending.at > PENDING_TTL_MS) this.#pending.delete(key)
    }
    this.#pending.set(state, {
      userId,
      server: server.name,
      verifier,
      redirectUri: registration.redirectUri,
      at: now,
    })

    const authorize = new URL(registration.authorizationEndpoint)
    authorize.searchParams.set('client_id', registration.clientId)
    authorize.searchParams.set('redirect_uri', registration.redirectUri)
    authorize.searchParams.set('response_type', 'code')
    authorize.searchParams.set('code_challenge', b64url(createHash('sha256').update(verifier).digest()))
    authorize.searchParams.set('code_challenge_method', 'S256')
    authorize.searchParams.set('state', state)
    return { authorizeUrl: authorize.href }
  }

  /**
   * The browser came back: trade the code for the person's keys.
   *
   * The refresh token is the WHOLE point — an access token alone dies within
   * the hour and the person would be asked to click again tomorrow. A server
   * that grants none is reported as such rather than half-connected.
   */
  async complete(
    state: string,
    code: string,
  ): Promise<{ server: string; userId: string } | { problem: string }> {
    const pending = this.#pending.get(state)
    this.#pending.delete(state)
    if (!pending || Date.now() - pending.at > PENDING_TTL_MS) {
      return { problem: 'this sign-in expired — start again from the card' }
    }
    const registration = (await this.#read()).registrations[pending.server]
    if (!registration) return { problem: 'no registration for this server any more' }

    const body = new URLSearchParams()
    body.set('grant_type', 'authorization_code')
    body.set('code', code)
    body.set('redirect_uri', pending.redirectUri)
    body.set('client_id', registration.clientId)
    body.set('code_verifier', pending.verifier)
    const headers: Record<string, string> = {
      'content-type': 'application/x-www-form-urlencoded',
    }
    if (registration.clientSecret) {
      headers['authorization'] = `Basic ${Buffer.from(
        `${encodeURIComponent(registration.clientId)}:${encodeURIComponent(registration.clientSecret)}`,
      ).toString('base64')}`
    }

    let payload: { access_token?: string; refresh_token?: string }
    try {
      const response = await this.#fetch(registration.tokenEndpoint, {
        method: 'POST',
        headers,
        body: body.toString(),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      })
      if (!response.ok) return { problem: `the token exchange was refused (${response.status})` }
      payload = (await response.json()) as { access_token?: string; refresh_token?: string }
    } catch (error) {
      return { problem: `the token exchange failed: ${(error as Error).message}` }
    }
    if (!payload.refresh_token) {
      return { problem: 'the server granted no refresh token — the connection would die within the hour' }
    }

    await this.#write((held) => {
      held.keys[userKey(pending.server, pending.userId)] = payload.refresh_token!
    })
    // A key from a previous life may sit in this person's minter cache;
    // dropping the minter makes the next turn start from the fresh key.
    this.#minters.delete(pending.userId)
    return { server: pending.server, userId: pending.userId }
  }

  /** Whether this person has a key for this server. */
  async connected(serverName: string, userId: string): Promise<boolean> {
    return (await this.#read()).keys[userKey(serverName, userId)] !== undefined
  }

  /** The sign-in servers as one person sees them — the card's and the tile's data. */
  async stateFor(
    servers: readonly McpServerConfig[],
    userId: string,
  ): Promise<readonly { name: string; connected: boolean }[]> {
    const out: { name: string; connected: boolean }[] = []
    for (const server of servers) {
      if (server.signIn !== 'oauth') continue
      out.push({ name: server.name, connected: await this.connected(server.name, userId) })
    }
    return out
  }

  /**
   * The per-turn tokens for one caller — what `TurnRequest.serverTokens`
   * carries. A server the person never connected to gets no entry; minting
   * that fails (provider down, key revoked) costs that server, not the turn.
   */
  async tokensFor(
    servers: readonly McpServerConfig[],
    userId: string,
  ): Promise<Readonly<Record<string, string>>> {
    const out: Record<string, string> = {}
    for (const server of servers) {
      if (server.signIn !== 'oauth') continue
      const registration = (await this.#read()).registrations[server.name]
      const seed = (await this.#read()).keys[userKey(server.name, userId)]
      if (!registration || !seed) continue

      let minter = this.#minters.get(userId)
      if (!minter) {
        // The adapter maps the minting engine's `tokenUrl|clientId` key onto
        // this PERSON's entry, so rotation lands where the seed came from.
        const owner = userId
        const store = {
          load: async (key: string) => {
            const name = this.#serverForMintKey(key)
            return name
              ? (await this.#read()).keys[userKey(name, owner)]
              : undefined
          },
          save: async (key: string, refreshToken: string) => {
            const name = this.#serverForMintKey(key)
            if (!name) return
            await this.#write((held) => {
              held.keys[userKey(name, owner)] = refreshToken
            })
          },
        }
        minter = new McpTokens(this.#fetch, store)
        this.#minters.set(userId, minter)
      }

      const token = await minter.for({
        tokenUrl: registration.tokenEndpoint,
        clientId: registration.clientId,
        ...(registration.clientSecret ? { clientSecret: registration.clientSecret } : {}),
        refreshToken: seed,
      })
      if (token) out[server.name] = token
    }
    return out
  }

  /** Which server a minting key (`tokenUrl|clientId`) belongs to. */
  #serverForMintKey(key: string): string | undefined {
    const registrations = this.#cache?.registrations ?? {}
    for (const [name, registration] of Object.entries(registrations)) {
      if (`${registration.tokenEndpoint}|${registration.clientId}` === key) return name
    }
    return undefined
  }
}
