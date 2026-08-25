/**
 * Enumerating a hub.
 *
 * What is asserted is what an operator gets for declaring one line instead of
 * a dozen: every addon mounted, named so two hubs cannot collide, addressed
 * with the slash that keeps a bearer off a redirect — and a loud line whenever
 * nothing could be mounted, because an instance with no tools looks exactly
 * like an agent that is merely unhelpful.
 */

import { describe, expect, it, vi } from 'vitest'

import { McpTokens } from '@antorfr/golem-drivers'

import { discoverHub, discoverHubs } from '../src/mcp-hubs.js'

const AUTH = {
  tokenUrl: 'https://auth.example/token',
  clientId: 'agent-golem',
  clientSecret: 's3cret',
  scope: 'mcp',
  audience: 'https://hub.example',
}

const HUB = { name: 'rosetta', url: 'https://hub.example', auth: AUTH }

/** A provider that always mints, and a hub that answers what it is told to. */
function world(index: unknown, options: { status?: number; token?: string | null } = {}) {
  const asked: string[] = []
  const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
    if (String(url) === AUTH.tokenUrl) {
      return Promise.resolve({
        ok: options.token !== null,
        status: options.token === null ? 401 : 200,
        json: () => Promise.resolve({ access_token: options.token ?? 'tok', expires_in: 3600 }),
      } as unknown as Response)
    }
    asked.push(`${String(url)} ${(init?.headers as Record<string, string>)?.['authorization'] ?? ''}`)
    const status = options.status ?? 200
    return Promise.resolve({
      ok: status === 200,
      status,
      json: () => Promise.resolve(index),
    } as unknown as Response)
  }) as unknown as typeof fetch
  return { fetchImpl, asked, tokens: new McpTokens(fetchImpl) }
}

describe('a hub that answers', () => {
  const index = {
    service: 'rosetta',
    addons: { maps: { state: 'ok' }, google: { state: 'ok' }, meteo: { state: 'ok' } },
  }

  it('mounts every addon it carries', async () => {
    const { fetchImpl, tokens } = world(index)
    const { servers } = await discoverHub(HUB, tokens, fetchImpl)
    expect(servers.map((s) => s.name)).toEqual(['rosetta-google', 'rosetta-maps', 'rosetta-meteo'])
  })

  it('prefixes each one, so two hubs may both carry a maps', async () => {
    const { fetchImpl, tokens } = world(index)
    const { servers } = await discoverHub({ ...HUB, name: 'other' }, tokens, fetchImpl)
    expect(servers[0]?.name).toBe('other-google')
  })

  it('addresses each addon with a trailing slash', async () => {
    // Not cosmetic: without it these endpoints answer 307 to the slashed
    // form, and a redirect is a poor thing to hand a bearer token to.
    const { fetchImpl, tokens } = world(index)
    const { servers } = await discoverHub(HUB, tokens, fetchImpl)
    expect(servers.find((s) => s.name === 'rosetta-maps')?.url).toBe('https://hub.example/maps/')
  })

  it('gives every addon the hub identity, so one exchange serves them all', async () => {
    const { fetchImpl, tokens } = world(index)
    const { servers } = await discoverHub(HUB, tokens, fetchImpl)
    expect(servers.every((s) => s.auth === AUTH)).toBe(true)
  })

  it('asks WITH the identity, so bad credentials fail at boot', async () => {
    // Rather than letting the first tool call discover it, inside somebody's
    // conversation.
    const { fetchImpl, asked, tokens } = world(index)
    await discoverHub(HUB, tokens, fetchImpl)
    expect(asked[0]).toBe('https://hub.example/ Bearer tok')
  })

  it('leaves out what the operator excluded', async () => {
    // Today's honest use: the addons that refuse a machine identity.
    const { fetchImpl, tokens } = world(index)
    const { servers } = await discoverHub({ ...HUB, exclude: ['google'] }, tokens, fetchImpl)
    expect(servers.map((s) => s.name)).toEqual(['rosetta-maps', 'rosetta-meteo'])
  })

  it('names an addon the hub itself reports as broken', async () => {
    const { fetchImpl, tokens } = world({
      addons: { maps: { state: 'ok' }, withings: { state: 'failed', detail: 'no credential' } },
    })
    const { servers, problems } = await discoverHub(HUB, tokens, fetchImpl)
    expect(servers.map((s) => s.name)).toEqual(['rosetta-maps'])
    expect(problems[0]?.reason).toContain('"withings" is failed on the hub')
  })
})

describe('a hub that does not answer', () => {
  it('says so, and mounts nothing, rather than failing silently', async () => {
    const { fetchImpl, tokens } = world({}, { status: 502 })
    const { servers, problems } = await discoverHub(HUB, tokens, fetchImpl)
    expect(servers).toEqual([])
    expect(problems[0]).toMatchObject({ id: 'mcp:rosetta', severity: 'degraded' })
    expect(problems[0]?.reason).toContain('502')
  })

  it('reports a credential that could not be exchanged', async () => {
    const { fetchImpl, tokens } = world({}, { token: null })
    const { problems } = await discoverHub(HUB, tokens, fetchImpl)
    expect(problems[0]?.reason).toContain('could not obtain a token')
  })

  it('refuses to guess when the answer is not an addon list', async () => {
    const { fetchImpl, tokens } = world({ hello: 'world' })
    const { problems } = await discoverHub(HUB, tokens, fetchImpl)
    expect(problems[0]?.reason).toContain('is this a hub?')
  })
})

describe('several hubs', () => {
  it('are expanded together, and one failing does not cost the others', async () => {
    const good = world({ addons: { maps: { state: 'ok' } } })
    const bad = world({}, { status: 500 })
    const mixed = ((url: string, init?: RequestInit) =>
      String(url).startsWith('https://down.example')
        ? (bad.fetchImpl as unknown as typeof fetch)(url, init)
        : (good.fetchImpl as unknown as typeof fetch)(url, init)) as unknown as typeof fetch

    const { servers, problems } = await discoverHubs(
      [HUB, { ...HUB, name: 'down', url: 'https://down.example' }],
      new McpTokens(mixed),
      mixed,
    )
    expect(servers.map((s) => s.name)).toEqual(['rosetta-maps'])
    expect(problems).toHaveLength(1)
  })

  it('is a no-op when none are declared', async () => {
    const { fetchImpl, tokens } = world({})
    expect(await discoverHubs([], tokens, fetchImpl)).toEqual({ servers: [], problems: [] })
  })
})
