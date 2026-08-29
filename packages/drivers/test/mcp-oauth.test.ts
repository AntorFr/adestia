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
  clientId: 'agent-adestia',
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

describe('the refresh-token grant (acting for a person)', () => {
  const USER = {
    tokenUrl: 'https://gw.example/token',
    clientId: 'public-client',
    refreshToken: 'rt-initial',
    scope: 'openid',
  }

  function refreshProvider(answers: readonly { token?: string; refresh?: string; expiresIn?: number }[]) {
    const calls: { headers: Record<string, string>; body: string }[] = []
    let index = 0
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      calls.push({
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: String(init?.body ?? ''),
      })
      const a = answers[Math.min(index++, answers.length - 1)] ?? {}
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            access_token: a.token ?? 'access',
            expires_in: a.expiresIn ?? 3600,
            ...(a.refresh ? { refresh_token: a.refresh } : {}),
          }),
      } as unknown as Response)
    }) as unknown as typeof fetch
    return { fetchImpl, calls }
  }

  it('uses the refresh_token grant and sends the public client id in the body', async () => {
    const { fetchImpl, calls } = refreshProvider([{ token: 'at' }])
    expect(await new McpTokens(fetchImpl).for(USER)).toBe('at')

    const body = new URLSearchParams(calls[0]!.body)
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('rt-initial')
    expect(body.get('client_id')).toBe('public-client')
    // A public client authenticates with no secret: no Basic header.
    expect(calls[0]!.headers['authorization']).toBeUndefined()
  })

  it('follows a rotated refresh token into the next exchange', async () => {
    // OAuth 2.1 servers commonly rotate and invalidate the old one; presenting
    // the spent token on the next turn would lock the instance out.
    const { fetchImpl, calls } = refreshProvider([
      { token: 'first', refresh: 'rt-2', expiresIn: 30 },
      { token: 'second' },
    ])
    const tokens = new McpTokens(fetchImpl)
    expect(await tokens.for(USER)).toBe('first')
    vi.useFakeTimers()
    try {
      vi.setSystemTime(Date.now() + 5_000)
      expect(await tokens.for(USER)).toBe('second')
    } finally {
      vi.useRealTimers()
    }
    expect(new URLSearchParams(calls[1]!.body).get('refresh_token')).toBe('rt-2')
  })

  it('persists a rotated refresh token and reads it back after a restart', async () => {
    const saved: Record<string, string> = {}
    const store = {
      load: (k: string) => saved[k],
      save: (k: string, v: string) => {
        saved[k] = v
      },
    }
    const first = refreshProvider([{ token: 'a', refresh: 'rt-2' }])
    expect(await new McpTokens(first.fetchImpl, store).for(USER)).toBe('a')
    expect(Object.values(saved)).toContain('rt-2')

    // A fresh instance — a restart — must present the PERSISTED token, not the
    // spent one still sitting in the config.
    const second = refreshProvider([{ token: 'b' }])
    expect(await new McpTokens(second.fetchImpl, store).for(USER)).toBe('b')
    expect(new URLSearchParams(second.calls[0]!.body).get('refresh_token')).toBe('rt-2')
  })
})

describe('a refresh store that fails', () => {
  /**
   * The store is the core's, not this file's — a disk that will not read, a
   * file somebody chmod'ed. `for` promises `undefined` rather than a throw,
   * and that promise cannot quietly depend on which store was handed in: a
   * rejection here would take down the TURN, not just the MCP servers.
   */
  const person = {
    tokenUrl: 'https://auth.example/api/oidc/token',
    clientId: 'public-client',
    refreshToken: 'from-config',
  }

  it('falls back to the configured token when the store cannot be read', async () => {
    const { fetchImpl, calls } = provider([{ token: 'live' }])
    const tokens = new McpTokens(fetchImpl, {
      load: () => {
        throw new Error('disk is gone')
      },
      save: () => undefined,
    })

    expect(await tokens.for(person)).toBe('live')
    // The turn ran, on the token the config carried.
    expect(calls[0]!.body).toContain('refresh_token=from-config')
  })

  it('still hands the turn its token when the rotation cannot be persisted', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ access_token: 'live', expires_in: 3600, refresh_token: 'rotated' }),
      } as unknown as Response),
    ) as unknown as typeof fetch
    const tokens = new McpTokens(fetchImpl, {
      load: () => undefined,
      save: () => Promise.reject(new Error('read-only filesystem')),
    })

    // What is lost is the RESTART, never the turn in hand.
    expect(await tokens.for(person)).toBe('live')
  })
})
