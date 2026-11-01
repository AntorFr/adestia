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
import { createOAuthFlow } from '../src/claude-code/oauth.js'

// The protocol's fixed values, as literals: a changed constant must fail here.
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const REDIRECT_URI = 'https://platform.claude.com/oauth/code/callback'
const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token'
const ONE_YEAR_SECONDS = 31_536_000

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

/** A flow started against a stub; `submit` pastes `code#<its own state>` unless told otherwise. */
async function started(reply: Parameters<typeof service>[0] = { body: { access_token: TOKEN } }) {
  const stub = service(reply)
  const flow = createOAuthFlow({ fetchImpl: stub.fetchImpl })
  const { authorizeUrl } = await flow.start()
  const url = new URL(authorizeUrl)
  const state = url.searchParams.get('state') as string
  return { flow, url, state, ...stub }
}

describe('the authorization link', () => {
  it('carries the CLI own client and a challenge, never the verifier', async () => {
    const { flow, url, state, calls } = await started()

    expect(url.origin + url.pathname).toBe('https://claude.com/cai/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID)
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    // `code=true` is what makes the page show the code: there is no browser on
    // this side and no port of ours it could post to.
    expect(url.searchParams.get('code')).toBe('true')
    // The secret half stays here. Anything else would defeat PKCE entirely.
    await flow.submit(`the-code#${state}`)
    const verifier = calls[0]?.body['code_verifier'] as string
    expect(verifier).toBeTruthy()
    expect(url.toString()).not.toContain(verifier)
  })

  it('challenges with the SHA-256 of the verifier, as PKCE requires', async () => {
    const { flow, url, state, calls } = await started()
    await flow.submit(`the-code#${state}`)
    const verifier = calls[0]?.body['code_verifier'] as string
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(verifier).digest('base64url'),
    )
  })

  it('never repeats a verifier', async () => {
    const one = await started()
    const two = await started()
    await one.flow.submit(`c#${one.state}`)
    await two.flow.submit(`c#${two.state}`)
    expect(one.calls[0]?.body['code_verifier']).not.toBe(two.calls[0]?.body['code_verifier'])
  })

  it('sizes the state like the CLI does, because the page is fussy', async () => {
    // 32 bytes, base64url: 43 characters. A 22-character state was the only
    // difference between our link and the CLI's, and the page answered
    // `Invalid request format`.
    const { flow, state, calls } = await started()
    expect(state).toHaveLength(43)
    await flow.submit(`c#${state}`)
    expect(calls[0]?.body['code_verifier']).toHaveLength(43)
  })
})

describe('the code the user pastes', () => {
  it('takes the `code#state` form the page gives, and tolerates the paste', async () => {
    const a = await started()
    await a.flow.submit(`  abc#${a.state} \n`)
    expect(a.calls[0]?.body).toMatchObject({ code: 'abc', state: a.state })
  })

  it('takes a bare code with no state', async () => {
    const a = await started()
    await a.flow.submit('abc')
    expect(a.calls[0]?.body).toMatchObject({ code: 'abc', state: a.state })
  })

  it('refuses a code from another authorization instead of relaying a 400', async () => {
    const a = await started()
    await expect(a.flow.submit('code#someone-elses-state')).rejects.toThrow(
      /belongs to a different authorization/,
    )
    expect(a.calls).toEqual([])
  })

  it('says when nothing was pasted', async () => {
    const a = await started()
    await expect(a.flow.submit('   ')).rejects.toThrow(/no code was pasted/)
    expect(a.calls).toEqual([])
  })
})

describe('the exchange', () => {
  it('sends the verifier and asks for a year', async () => {
    const a = await started({ body: { access_token: TOKEN, expires_in: 31536000 } })

    expect(await a.flow.submit(`the-code#${a.state}`)).toEqual({ token: TOKEN })
    expect(a.calls[0]?.url).toBe(TOKEN_URL)
    expect(a.calls[0]?.body).toEqual({
      grant_type: 'authorization_code',
      code: 'the-code',
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: expect.any(String),
      state: a.state,
      expires_in: ONE_YEAR_SECONDS,
    })
  })

  it('quotes the service when it refuses', async () => {
    // THE point of speaking the protocol: a refusal that can be read, rather
    // than a screen that stopped changing.
    const a = await started({
      status: 400,
      body: { error: 'invalid_grant', error_description: 'code expired' },
    })

    await expect(a.flow.submit('stale')).rejects.toThrow(/HTTP 400.*invalid_grant.*code expired/)
  })

  it('blames the network for a network failure, not the code', async () => {
    // Otherwise an outage becomes an hour of re-copying a perfectly good code.
    const fetchImpl = (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch
    const flow = createOAuthFlow({ fetchImpl })
    await flow.start()

    await expect(flow.submit('code')).rejects.toThrow(
      /could not reach the authorization service: ECONNREFUSED/,
    )
  })

  it('names a changed contract instead of returning nothing', async () => {
    const a = await started({ body: { token: TOKEN, expires_in: 60 } })

    await expect(a.flow.submit('code')).rejects.toThrow(
      /carried no access_token \(fields: token, expires_in\)/,
    )
  })

  it('never puts a credential in an error', async () => {
    // The one field worth hiding is the one an error is most tempted to show.
    const a = await started({ body: { access_token: '', secret_token: TOKEN } })

    await expect(a.flow.submit('code')).rejects.toThrow(/fields: access_token, secret_token/)
    await expect(a.flow.submit('code')).rejects.not.toThrow(new RegExp(TOKEN))
  })

  it('reports a body that is not JSON at all', async () => {
    // A proxy's HTML error page, which is what a broken deployment returns.
    const a = await started({ text: '<html>502 Bad Gateway</html>' })

    await expect(a.flow.submit('code')).rejects.toThrow(/not JSON.*502 Bad Gateway/)
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
