/**
 * Per-user tokens.
 *
 * Three behaviours decide whether somebody's calendar still works next week,
 * and each of them has a known way of failing quietly: a rotating refresh
 * token that is not kept, a revoked grant retried forever, and a provider
 * outage mistaken for a revocation.
 */

import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserTokens } from '../src/user-tokens.js'

const ISSUER = 'https://auth.example'
const TOKEN_URL = 'https://auth.example/api/oidc/token'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'golem-tokens-'))
})

/** A provider that discovers, then answers each refresh in turn. */
function provider(answers: readonly (Record<string, unknown> | number)[]) {
  const calls: { url: string; body: string; auth: string }[] = []
  let index = 0
  const fetchImpl = vi.fn((url: unknown, init?: RequestInit) => {
    const href = String(url)
    if (href.includes('.well-known')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ token_endpoint: TOKEN_URL }),
      } as unknown as Response)
    }
    calls.push({
      url: href,
      body: String(init?.body ?? ''),
      auth: (init?.headers as Record<string, string>)?.['authorization'] ?? '',
    })
    const answer = answers[Math.min(index++, answers.length - 1)] ?? {}
    if (typeof answer === 'number') {
      return Promise.resolve({ ok: false, status: answer, json: () => Promise.resolve({}) } as unknown as Response)
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(answer) } as unknown as Response)
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

const store = (fetchImpl: typeof fetch) =>
  new UserTokens(dir, { issuer: ISSUER, clientId: 'golem', clientSecret: 's3cret' }, fetchImpl)

describe('what a login leaves behind', () => {
  it('keeps the refresh token, and nothing about the browser', async () => {
    const tokens = store(provider([]).fetchImpl)
    await tokens.remember('sebastien', 'refresh-1')
    expect(await tokens.has('sebastien')).toBe(true)

    const onDisk = JSON.parse(await readFile(join(dir, 'user-tokens.json'), 'utf8'))
    expect(onDisk.sebastien.refreshToken).toBe('refresh-1')
    // Never an access token from the login: what a turn needs is minted per
    // turn, from one place.
    expect(onDisk.sebastien.accessToken).toBeUndefined()
  })

  it('writes the file readable by its owner alone', async () => {
    const tokens = store(provider([]).fetchImpl)
    await tokens.remember('sebastien', 'refresh-1')
    const mode = (await stat(join(dir, 'user-tokens.json'))).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('has nothing for somebody who never signed in since', async () => {
    const tokens = store(provider([]).fetchImpl)
    expect(await tokens.accessToken('inconnu')).toBeUndefined()
    expect(await tokens.has('inconnu')).toBe(false)
  })
})

describe('minting a token for a turn', () => {
  it('discovers the endpoint rather than assuming a path', async () => {
    // `<issuer>/api/oidc/token` is one provider's path, not a standard.
    const { fetchImpl, calls } = provider([{ access_token: 'a', expires_in: 3600 }])
    const tokens = store(fetchImpl)
    await tokens.remember('sebastien', 'refresh-1')
    await tokens.accessToken('sebastien')
    expect(calls[0]?.url).toBe(TOKEN_URL)
  })

  it('presents the client secret in the header, not the body', async () => {
    const { fetchImpl, calls } = provider([{ access_token: 'a', expires_in: 3600 }])
    const tokens = store(fetchImpl)
    await tokens.remember('sebastien', 'refresh-1')
    await tokens.accessToken('sebastien')
    expect(calls[0]?.auth).toMatch(/^Basic /)
    expect(calls[0]?.body).not.toContain('s3cret')
    expect(new URLSearchParams(calls[0]!.body).get('grant_type')).toBe('refresh_token')
  })

  it('reuses a live token across turns', async () => {
    const { fetchImpl, calls } = provider([
      { access_token: 'first', expires_in: 3600 },
      { access_token: 'second', expires_in: 3600 },
    ])
    const tokens = store(fetchImpl)
    await tokens.remember('sebastien', 'refresh-1')
    expect(await tokens.accessToken('sebastien')).toBe('first')
    expect(await tokens.accessToken('sebastien')).toBe('first')
    expect(calls).toHaveLength(1)
  })

  it('keeps a rotated refresh token', async () => {
    // THE quiet failure: providers that hand back a new refresh token kill the
    // old one as they do it. Missing this is an instance that works until it
    // suddenly does not, hours later, with nothing in the logs.
    const { fetchImpl, calls } = provider([
      { access_token: 'a', expires_in: 1, refresh_token: 'refresh-2' },
      { access_token: 'b', expires_in: 3600 },
    ])
    const tokens = store(fetchImpl)
    await tokens.remember('sebastien', 'refresh-1')
    await tokens.accessToken('sebastien')

    vi.useFakeTimers()
    try {
      vi.setSystemTime(Date.now() + 5_000)
      await tokens.accessToken('sebastien')
    } finally {
      vi.useRealTimers()
    }
    expect(new URLSearchParams(calls[1]!.body).get('refresh_token')).toBe('refresh-2')
  })

  it('does not mint twice when two turns start at once', async () => {
    // A rotating refresh burns on a race: the second exchange would present a
    // token the first has already spent.
    const { fetchImpl, calls } = provider([{ access_token: 'a', expires_in: 3600 }])
    const tokens = store(fetchImpl)
    await tokens.remember('sebastien', 'refresh-1')
    const both = await Promise.all([tokens.accessToken('sebastien'), tokens.accessToken('sebastien')])
    expect(both).toEqual(['a', 'a'])
    expect(calls).toHaveLength(1)
  })
})

describe('when the exchange fails', () => {
  it('drops a grant the provider refuses, so the next login re-seeds it', async () => {
    const { fetchImpl } = provider([400])
    const tokens = store(fetchImpl)
    await tokens.remember('sebastien', 'refresh-1')
    expect(await tokens.accessToken('sebastien')).toBeUndefined()
    // Gone: retrying a dead credential on every turn costs a round trip and
    // teaches nobody anything.
    expect(await tokens.has('sebastien')).toBe(false)
  })

  it('KEEPS a grant when the provider is merely unreachable', async () => {
    // The distinction that matters: an outage is not a revocation, and
    // dropping the entry would sign somebody out of their own calendar
    // because a service blinked.
    const fetchImpl = vi.fn((url: unknown) =>
      String(url).includes('.well-known')
        ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ token_endpoint: TOKEN_URL }) } as unknown as Response)
        : Promise.reject(new Error('ECONNREFUSED')),
    ) as unknown as typeof fetch

    const tokens = store(fetchImpl)
    await tokens.remember('sebastien', 'refresh-1')
    expect(await tokens.accessToken('sebastien')).toBeUndefined()
    expect(await tokens.has('sebastien')).toBe(true)
  })

  it('survives a provider that answers without a token', async () => {
    const { fetchImpl } = provider([{ expires_in: 3600 }])
    const tokens = store(fetchImpl)
    await tokens.remember('sebastien', 'refresh-1')
    expect(await tokens.accessToken('sebastien')).toBeUndefined()
  })
})
