/**
 * Minting access tokens for MCP hubs.
 *
 * The behaviours asserted here are the ones that decide whether an agent has
 * its tools tomorrow morning: a token is reused until it is nearly stale, two
 * turns starting at once do not mint twice, and a provider that says no costs
 * the SERVERS rather than the turn.
 */

import { describe, expect, it, vi } from 'vitest'

import { McpTokens } from '../src/mcp-oauth.js'

const IDENTITY = {
  tokenUrl: 'https://auth.example/api/oidc/token',
  clientId: 'agent-golem',
  clientSecret: 's3cret',
  scope: 'mcp',
  audience: 'https://hub.example',
}

function provider(answers: readonly { token?: string; expiresIn?: number; ok?: boolean }[]) {
  const calls: { headers: Record<string, string>; body: string }[] = []
  let index = 0
  const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
    calls.push({
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: String(init?.body ?? ''),
    })
    const answer = answers[Math.min(index++, answers.length - 1)] ?? {}
    return Promise.resolve({
      ok: answer.ok ?? true,
      status: answer.ok === false ? 401 : 200,
      json: () =>
        Promise.resolve({ access_token: answer.token ?? 'tok', expires_in: answer.expiresIn ?? 3600 }),
    } as unknown as Response)
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

describe('the token exchange', () => {
  it('asks for client credentials, with the scope and the audience', async () => {
    const { fetchImpl, calls } = provider([{ token: 'abc' }])
    expect(await new McpTokens(fetchImpl).for(IDENTITY)).toBe('abc')

    const body = new URLSearchParams(calls[0]!.body)
    expect(body.get('grant_type')).toBe('client_credentials')
    expect(body.get('scope')).toBe('mcp')
    // A resource server checks this: a token for another audience is valid and
    // still refused, and the refusal reads like a credentials problem.
    expect(body.get('audience')).toBe('https://hub.example')
  })

  it('presents the client secret in the header, not in the body', async () => {
    // `client_secret_post` is what several providers refuse with a bare
    // `invalid_client` — which reads as a wrong secret rather than a wrong
    // method, and sends somebody rotating a perfectly good credential.
    const { fetchImpl, calls } = provider([{}])
    await new McpTokens(fetchImpl).for(IDENTITY)
    expect(calls[0]!.headers['authorization']).toMatch(/^Basic /)
    expect(calls[0]!.body).not.toContain('s3cret')
  })

  it('reuses a live token instead of minting on every turn', async () => {
    const { fetchImpl, calls } = provider([{ token: 'first' }, { token: 'second' }])
    const tokens = new McpTokens(fetchImpl)
    expect(await tokens.for(IDENTITY)).toBe('first')
    expect(await tokens.for(IDENTITY)).toBe('first')
    expect(calls).toHaveLength(1)
  })

  it('mints again once the token is nearly stale', async () => {
    // A minute of margin: handing the CLI a token that expires mid-turn is
    // the same failure as handing it none, discovered later.
    const { fetchImpl } = provider([{ token: 'short', expiresIn: 30 }, { token: 'fresh' }])
    const tokens = new McpTokens(fetchImpl)
    expect(await tokens.for(IDENTITY)).toBe('short')
    vi.useFakeTimers()
    try {
      vi.setSystemTime(Date.now() + 5_000)
      expect(await tokens.for(IDENTITY)).toBe('fresh')
    } finally {
      vi.useRealTimers()
    }
  })

  it('shares one identity across the addons that hold it', async () => {
    // Nine addons of one hub, one exchange — not nine tokens expiring at nine
    // different moments for no gain.
    const { fetchImpl, calls } = provider([{ token: 'shared' }])
    const tokens = new McpTokens(fetchImpl)
    const all = await Promise.all([tokens.for(IDENTITY), tokens.for(IDENTITY), tokens.for(IDENTITY)])
    expect(all).toEqual(['shared', 'shared', 'shared'])
    // Also proves two simultaneous turns do not race the exchange, which
    // matters where a provider rotates what it hands back.
    expect(calls).toHaveLength(1)
  })

  it('keeps identities apart', async () => {
    const { fetchImpl, calls } = provider([{ token: 'a' }, { token: 'b' }])
    const tokens = new McpTokens(fetchImpl)
    await tokens.for(IDENTITY)
    await tokens.for({ ...IDENTITY, clientId: 'agent-other' })
    expect(calls).toHaveLength(2)
  })

  it('answers nothing when the provider refuses, rather than throwing', async () => {
    // The cost lands on the servers that needed it; the turn still runs, with
    // fewer tools. A throw here would take the whole conversation down over a
    // hub being briefly unavailable.
    const { fetchImpl } = provider([{ ok: false }])
    expect(await new McpTokens(fetchImpl).for(IDENTITY)).toBeUndefined()
  })

  it('answers nothing when the provider cannot be reached', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch
    expect(await new McpTokens(fetchImpl).for(IDENTITY)).toBeUndefined()
  })

  it('does not cache a refusal', async () => {
    // A hub that was down for a minute must not be treated as down for an hour.
    const { fetchImpl, calls } = provider([{ ok: false }, { token: 'back' }])
    const tokens = new McpTokens(fetchImpl)
    expect(await tokens.for(IDENTITY)).toBeUndefined()
    expect(await tokens.for(IDENTITY)).toBe('back')
    expect(calls).toHaveLength(2)
  })
})
