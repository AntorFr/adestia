import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { McpSignIn } from '../src/mcp-signin.js'
import type { McpServerConfig } from '../src/config.js'

let dataDir: string

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'adestia-signin-'))
})

const HA: McpServerConfig = {
  name: 'home-assistant',
  url: 'https://ha.example/',
  identity: 'user',
  signIn: 'oauth',
}

/**
 * An mcp-auth shaped authorization server, in one closure: RFC 9728 and 8414
 * documents, dynamic registration, and a token endpoint that speaks both
 * grants and ROTATES the refresh token — the behaviour that locked this very
 * machine's helper out when a rotation was lost.
 */
function fakeAuthServer() {
  const log = {
    registrations: 0,
    exchanges: [] as URLSearchParams[],
    refreshes: [] as URLSearchParams[],
  }
  let issued = 0
  /** Rotation per CHAIN, as real servers do: using a valid refresh burns that
      one and issues the next — it does not touch anybody else's chain. */
  const valid = new Set<string>()
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })

    if (url === 'https://ha.example/.well-known/oauth-protected-resource') {
      return json({ resource: 'https://ha.example/', authorization_servers: ['https://ha.example/'] })
    }
    if (url === 'https://ha.example/.well-known/oauth-authorization-server') {
      return json({
        issuer: 'https://ha.example/',
        authorization_endpoint: 'https://ha.example/.idp/auth',
        token_endpoint: 'https://ha.example/.idp/token',
        registration_endpoint: 'https://ha.example/.idp/register',
        grant_types_supported: ['authorization_code', 'refresh_token'],
      })
    }
    if (url === 'https://ha.example/.idp/register') {
      log.registrations += 1
      return json({ client_id: `client-${log.registrations}` }, 201)
    }
    if (url === 'https://ha.example/.idp/token') {
      const body = new URLSearchParams(String(init?.body))
      if (body.get('grant_type') === 'authorization_code') {
        log.exchanges.push(body)
        if (body.get('code') !== 'good-code') return json({ error: 'invalid_grant' }, 400)
        issued += 1
        valid.add(`refresh-${issued}`)
        return json({
          access_token: `access-${issued}`,
          refresh_token: `refresh-${issued}`,
          expires_in: 3600,
        })
      }
      log.refreshes.push(body)
      const presented = body.get('refresh_token') ?? ''
      if (!valid.has(presented)) return json({ error: 'invalid_grant' }, 400)
      valid.delete(presented)
      issued += 1
      valid.add(`refresh-${issued}`)
      return json({
        access_token: `access-${issued}`,
        refresh_token: `refresh-${issued}`,
        expires_in: 3600,
      })
    }
    return json({ error: 'not found' }, 404)
  }) as typeof fetch
  return { fetchImpl, log }
}

/** Runs one person through the whole flow and returns their state param. */
async function connect(service: McpSignIn, fetchImpl: typeof fetch, userId: string) {
  const begun = await service.begin(HA, userId, 'https://alfred.example', 'Alfred')
  if ('problem' in begun) throw new Error(begun.problem)
  const state = new URL(begun.authorizeUrl).searchParams.get('state')!
  const done = await service.complete(state, 'good-code')
  if ('problem' in done) throw new Error(done.problem)
  return done
}

describe('beginning a sign-in', () => {
  it('discovers, registers ONCE, and builds a PKCE authorization URL', async () => {
    const { fetchImpl, log } = fakeAuthServer()
    const service = new McpSignIn(dataDir, fetchImpl)

    const first = await service.begin(HA, 'sebastien', 'https://alfred.example', 'Alfred')
    if ('problem' in first) throw new Error(first.problem)
    const url = new URL(first.authorizeUrl)
    expect(url.origin + url.pathname).toBe('https://ha.example/.idp/auth')
    expect(url.searchParams.get('client_id')).toBe('client-1')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://alfred.example/api/mcp/signin/callback',
    )

    // A second person does NOT register a second client: the instance is ONE
    // client at this server, however many people connect through it.
    const second = await service.begin(HA, 'emilie', 'https://alfred.example', 'Alfred')
    expect('problem' in second).toBe(false)
    expect(log.registrations).toBe(1)
  })

  it('refuses a server that declares no sign-in', async () => {
    const { fetchImpl } = fakeAuthServer()
    const service = new McpSignIn(dataDir, fetchImpl)
    const begun = await service.begin(
      { name: 'plain', url: 'https://x.example/' },
      'sebastien',
      'https://alfred.example',
      'Alfred',
    )
    expect(begun).toMatchObject({ problem: expect.stringContaining('no sign-in') })
  })
})

describe('completing a sign-in', () => {
  it('exchanges the code with the held verifier and keeps the refresh key', async () => {
    const { fetchImpl, log } = fakeAuthServer()
    const service = new McpSignIn(dataDir, fetchImpl)

    expect(await service.connected('home-assistant', 'sebastien')).toBe(false)
    const done = await connect(service, fetchImpl, 'sebastien')
    expect(done).toEqual({ server: 'home-assistant', userId: 'sebastien' })
    expect(await service.connected('home-assistant', 'sebastien')).toBe(true)

    // The exchange carried PKCE's proof, not just the code.
    expect(log.exchanges[0]!.get('code_verifier')).toBeTruthy()
    expect(log.exchanges[0]!.get('grant_type')).toBe('authorization_code')
  })

  it('burns the state: a replayed callback gets a refusal, not a second key', async () => {
    const { fetchImpl } = fakeAuthServer()
    const service = new McpSignIn(dataDir, fetchImpl)
    const begun = await service.begin(HA, 'sebastien', 'https://alfred.example', 'Alfred')
    if ('problem' in begun) throw new Error(begun.problem)
    const state = new URL(begun.authorizeUrl).searchParams.get('state')!

    expect('problem' in (await service.complete(state, 'good-code'))).toBe(false)
    expect(await service.complete(state, 'good-code')).toMatchObject({
      problem: expect.stringContaining('expired'),
    })
  })

  it('refuses a grant without a refresh token — it would die within the hour', async () => {
    const { fetchImpl } = fakeAuthServer()
    const stingy = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/.idp/token')) {
        return new Response(JSON.stringify({ access_token: 'short-lived' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return fetchImpl(input, init)
    }) as typeof fetch
    const service = new McpSignIn(dataDir, stingy)
    const begun = await service.begin(HA, 'sebastien', 'https://alfred.example', 'Alfred')
    if ('problem' in begun) throw new Error(begun.problem)
    const state = new URL(begun.authorizeUrl).searchParams.get('state')!
    expect(await service.complete(state, 'good-code')).toMatchObject({
      problem: expect.stringContaining('refresh'),
    })
  })
})

describe('per-turn tokens', () => {
  it('mints from the caller’s own key, and only for the connected', async () => {
    const { fetchImpl } = fakeAuthServer()
    const service = new McpSignIn(dataDir, fetchImpl)
    await connect(service, fetchImpl, 'sebastien')

    const minted = await service.tokensFor([HA], 'sebastien')
    expect(Object.keys(minted)).toEqual(['home-assistant'])
    expect(minted['home-assistant']).toMatch(/^access-/)

    // Émilie never connected: no entry, and NOTHING was minted with somebody
    // else's key — the driver will omit the server from her turns, which is
    // the very signal the sign-in card is built on.
    expect(await service.tokensFor([HA], 'emilie')).toEqual({})
  })

  it('follows the rotation: the next mint presents the rotated key, and a restart still can', async () => {
    const { fetchImpl, log } = fakeAuthServer()
    const service = new McpSignIn(dataDir, fetchImpl)
    await connect(service, fetchImpl, 'sebastien')

    await service.tokensFor([HA], 'sebastien')
    expect(log.refreshes).toHaveLength(1)

    // A fresh service over the same dataDir — the process restarted. The
    // access-token cache died with it, so it must mint again, and the only
    // valid key is the ROTATED one the first mint persisted.
    const reborn = new McpSignIn(dataDir, fetchImpl)
    const minted = await reborn.tokensFor([HA], 'sebastien')
    expect(minted['home-assistant']).toMatch(/^access-/)
    expect(log.refreshes).toHaveLength(2)
    expect(log.refreshes[1]!.get('refresh_token')).toBe(
      // What the first refresh handed back, not what the login did.
      'refresh-2',
    )
  })

  it('keeps two people’s keys apart', async () => {
    const { fetchImpl } = fakeAuthServer()
    const service = new McpSignIn(dataDir, fetchImpl)
    await connect(service, fetchImpl, 'sebastien')
    await connect(service, fetchImpl, 'emilie')

    const state = await service.stateFor([HA], 'sebastien')
    expect(state).toEqual([{ name: 'home-assistant', connected: true }])
    // Both mint, each from their own seed; neither empties the other's.
    expect(Object.keys(await service.tokensFor([HA], 'sebastien'))).toHaveLength(1)
    expect(Object.keys(await service.tokensFor([HA], 'emilie'))).toHaveLength(1)
  })
})

describe('the file on disk', () => {
  it('is 0600 and never holds a user id in clear', async () => {
    const { fetchImpl } = fakeAuthServer()
    const service = new McpSignIn(dataDir, fetchImpl)
    await connect(service, fetchImpl, 'https://id.example/users/sebastien')

    const path = join(dataDir, 'mcp-signin.json')
    expect(((await stat(path)).mode & 0o777).toString(8)).toBe('600')
    // The subject an IdP emits is itself identifying material; the file keys
    // are hashes of it, so a leaked file names nobody.
    expect(await readFile(path, 'utf8')).not.toContain('sebastien')
  })
})
