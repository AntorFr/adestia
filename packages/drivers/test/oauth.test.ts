/**
 * The arming flow, against a stubbed authorization service.
 *
 * The predecessor's lesson, made a rule by the driver contract: a driver's
 * auth path must be testable with no account and no real binary. Speaking the
 * protocol makes that literal — everything below runs on a `fetch` that never
 * leaves the process, including every way the service can say no.
 */

import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'

import { looksLikeToken } from '../src/claude-code/arming.js'
import {
  CLIENT_ID,
  ONE_YEAR_SECONDS,
  REDIRECT_URI,
  TOKEN_URL,
  authorizeUrl,
  createOAuthFlow,
  createPkce,
  exchangeCode,
  splitPastedCode,
} from '../src/claude-code/oauth.js'

const TOKEN = 'sk-ant-oat01-abcdefghijklmnopqrstuvwxyz123456'

/** A service that answers once, and records what it was asked. */
function service(reply: { status?: number; body?: unknown; text?: string }) {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
    const text = reply.text ?? JSON.stringify(reply.body ?? {})
    return new Response(text, { status: reply.status ?? 200 })
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

describe('the authorization link', () => {
  it('carries the CLI own client and a challenge, never the verifier', () => {
    const pkce = createPkce()
    const url = new URL(authorizeUrl(pkce))

    expect(url.origin + url.pathname).toBe('https://claude.com/cai/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID)
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('state')).toBe(pkce.state)
    // `code=true` is what makes the page show the code: there is no browser on
    // this side and no port of ours it could post to.
    expect(url.searchParams.get('code')).toBe('true')
    // The secret half stays here. Anything else would defeat PKCE entirely.
    expect(url.toString()).not.toContain(pkce.verifier)
  })

  it('challenges with the SHA-256 of the verifier, as PKCE requires', () => {
    const pkce = createPkce()
    expect(pkce.challenge).toBe(createHash('sha256').update(pkce.verifier).digest('base64url'))
  })

  it('never repeats a verifier', () => {
    expect(createPkce().verifier).not.toBe(createPkce().verifier)
  })

  it('sizes the state like the CLI does, because the page is fussy', () => {
    // 32 bytes, base64url: 43 characters. A 22-character state was the only
    // difference between our link and the CLI's, and the page answered
    // `Invalid request format`.
    const pkce = createPkce()
    expect(pkce.state).toHaveLength(43)
    expect(pkce.verifier).toHaveLength(43)
  })
})

describe('the code the user pastes', () => {
  it('takes the `code#state` form the page gives, and tolerates the paste', () => {
    expect(splitPastedCode('abc#xyz')).toEqual({ code: 'abc', state: 'xyz' })
    expect(splitPastedCode('  abc#xyz \n')).toEqual({ code: 'abc', state: 'xyz' })
    expect(splitPastedCode('abc')).toEqual({ code: 'abc' })
  })

  it('refuses a code from another authorization instead of relaying a 400', () => {
    const pkce = createPkce()
    return expect(
      exchangeCode({ pkce, pasted: 'code#someone-elses-state', fetchImpl: service({}).fetchImpl }),
    ).rejects.toThrow(/belongs to a different authorization/)
  })

  it('says when nothing was pasted', async () => {
    const pkce = createPkce()
    await expect(exchangeCode({ pkce, pasted: '   ' })).rejects.toThrow(/no code was pasted/)
  })
})

describe('the exchange', () => {
  it('sends the verifier and asks for a year', async () => {
    const pkce = createPkce()
    const { fetchImpl, calls } = service({ body: { access_token: TOKEN, expires_in: 31536000 } })

    const armed = await exchangeCode({ pkce, pasted: `the-code#${pkce.state}`, fetchImpl })

    expect(armed).toEqual({ token: TOKEN, expiresIn: 31536000 })
    expect(calls[0]?.url).toBe(TOKEN_URL)
    expect(calls[0]?.body).toEqual({
      grant_type: 'authorization_code',
      code: 'the-code',
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: pkce.verifier,
      state: pkce.state,
      expires_in: ONE_YEAR_SECONDS,
    })
  })

  it('quotes the service when it refuses', async () => {
    // THE point of speaking the protocol: a refusal that can be read, rather
    // than a screen that stopped changing.
    const pkce = createPkce()
    const { fetchImpl } = service({
      status: 400,
      body: { error: 'invalid_grant', error_description: 'code expired' },
    })

    await expect(exchangeCode({ pkce, pasted: 'stale', fetchImpl })).rejects.toThrow(
      /HTTP 400.*invalid_grant.*code expired/,
    )
  })

  it('blames the network for a network failure, not the code', async () => {
    // Otherwise an outage becomes an hour of re-copying a perfectly good code.
    const pkce = createPkce()
    const fetchImpl = (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch

    await expect(exchangeCode({ pkce, pasted: 'code', fetchImpl })).rejects.toThrow(
      /could not reach the authorization service: ECONNREFUSED/,
    )
  })

  it('names a changed contract instead of returning nothing', async () => {
    const pkce = createPkce()
    const { fetchImpl } = service({ body: { token: TOKEN, expires_in: 60 } })

    await expect(exchangeCode({ pkce, pasted: 'code', fetchImpl })).rejects.toThrow(
      /carried no access_token \(fields: token, expires_in\)/,
    )
  })

  it('never puts a credential in an error', async () => {
    // The one field worth hiding is the one an error is most tempted to show.
    const pkce = createPkce()
    const { fetchImpl } = service({ body: { access_token: '', secret_token: TOKEN } })

    await expect(exchangeCode({ pkce, pasted: 'code', fetchImpl })).rejects.toThrow(
      /fields: access_token, secret_token/,
    )
    await expect(exchangeCode({ pkce, pasted: 'code', fetchImpl })).rejects.not.toThrow(
      new RegExp(TOKEN),
    )
  })

  it('reports a body that is not JSON at all', async () => {
    // A proxy's HTML error page, which is what a broken deployment returns.
    const pkce = createPkce()
    const { fetchImpl } = service({ text: '<html>502 Bad Gateway</html>' })

    await expect(exchangeCode({ pkce, pasted: 'code', fetchImpl })).rejects.toThrow(
      /not JSON.*502 Bad Gateway/,
    )
  })
})

describe('the flow the contract sees', () => {
  it('hands back a link, then a token', async () => {
    const { fetchImpl } = service({ body: { access_token: TOKEN } })
    const flow = createOAuthFlow({ fetchImpl })

    const { authorizeUrl } = await flow.start()
    expect(authorizeUrl).toContain('code_challenge=')

    const state = new URL(authorizeUrl).searchParams.get('state')
    expect(await flow.submit(`the-code#${state}`)).toEqual({ token: TOKEN })
  })

  it('refuses to submit when nothing is running', async () => {
    const flow = createOAuthFlow({ fetchImpl: service({}).fetchImpl })
    await expect(flow.submit('code')).rejects.toThrow(/no arming flow is running/)
  })

  it('forgets the verifier when the user gives up', async () => {
    // A verifier that outlives its authorization is a secret kept for nothing.
    const flow = createOAuthFlow({ fetchImpl: service({ body: { access_token: TOKEN } }).fetchImpl })
    const { authorizeUrl } = await flow.start()
    await flow.cancel()

    const state = new URL(authorizeUrl).searchParams.get('state')
    await expect(flow.submit(`the-code#${state}`)).rejects.toThrow(/no arming flow is running/)
  })

  it('starts a new pair on every start', async () => {
    const flow = createOAuthFlow({ fetchImpl: service({}).fetchImpl })
    const first = await flow.start()
    const second = await flow.start()
    expect(first.authorizeUrl).not.toBe(second.authorizeUrl)
  })
})

describe('what is worth storing', () => {
  it('validates a token before it is stored', () => {
    // A malformed token fails at the first turn with an error about the CLI,
    // sending its owner to debug the wrong thing entirely.
    expect(looksLikeToken(TOKEN)).toBe(true)
    expect(looksLikeToken('  ' + TOKEN + '  ')).toBe(true)
    // A later format version is still a token.
    expect(looksLikeToken('sk-ant-oat02-' + 'b'.repeat(24))).toBe(true)
    expect(looksLikeToken('')).toBe(false)
    expect(looksLikeToken('Store this token securely.')).toBe(false)
    expect(looksLikeToken('export CLAUDE_CODE_OAUTH_TOKEN=<token>')).toBe(false)
  })
})
