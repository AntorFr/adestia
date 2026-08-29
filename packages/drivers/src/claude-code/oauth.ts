/**
 * Arming a Claude subscription token, over HTTP.
 *
 * `claude setup-token` is a terminal program wrapped around three HTTP calls.
 * Adestia used to drive the program: a pty, a wide terminal, and regexes over
 * what Ink painted. That reading broke on a CLI update in a way no test could
 * have caught — a successful authorization reported as a failure, because the
 * token arrived with holes in it — and it will break again, silently, on the
 * next redesign of a screen nobody promised us.
 *
 * So this speaks the protocol instead. It is an ordinary OAuth 2.0
 * authorization-code flow with PKCE (RFC 7636), and the constants below are
 * the CLI's own, read out of the shipped binary and confirmed against a live
 * authorization URL it printed:
 *
 *     AUTHORIZE_URL   https://claude.com/cai/oauth/authorize
 *     TOKEN_URL       https://platform.claude.com/v1/oauth/token
 *     CLIENT_ID       9d1c250a-e61b-44d9-88ed-5944d1962f5e
 *     REDIRECT_URI    https://platform.claude.com/oauth/code/callback
 *
 * What this buys is not elegance, it is DIAGNOSIS. Every failure here is a
 * status code and a body: a refused code is a 400 with `invalid_grant`, a
 * changed contract is a 404 or a payload missing `access_token`, and both
 * arrive with something to read. Nothing is inferred from silence, and the
 * whole path is exercised against a stub in `test/oauth.test.ts` — no account,
 * no browser, no terminal.
 *
 * The bet, stated plainly: this endpoint is not a documented public API, and
 * Anthropic may change it. That was equally true of the screen, with one
 * difference — when this breaks, it says so.
 */

import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto'

import type { ArmingFlow } from './driver.js'

export const AUTHORIZE_URL = 'https://claude.com/cai/oauth/authorize'
export const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token'
export const REDIRECT_URI = 'https://platform.claude.com/oauth/code/callback'
export const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
/** Inference on the user's subscription — the only scope this token needs. */
export const SCOPE = 'user:inference'
/** What makes the token long-lived; the CLI asks for exactly this. */
export const ONE_YEAR_SECONDS = 31_536_000
const EXCHANGE_TIMEOUT_MS = 30_000
/** Enough of a failing body to diagnose it, not enough to fill a log. */
const BODY_EXCERPT = 400
/**
 * Random bytes behind the verifier AND the state, both 32 as the CLI does it:
 *
 *     A1f = () => base64url(randomBytes(32))   // verifier
 *     x1f = () => base64url(randomBytes(32))   // state
 *
 * Sixteen bytes of state produced a link the authorization page rejected out
 * of hand with `Invalid request format`, and a 22-character state was the only
 * difference between it and a link from the CLI that the same page accepts.
 * Matching the implementation that works is not superstition here: nothing
 * documents what that page will take.
 */
const SECRET_BYTES = 32

/** The secret half of a PKCE pair, plus the state that ties one flow to one code. */
export interface Pkce {
  readonly verifier: string
  readonly challenge: string
  readonly state: string
}

function base64Url(bytes: Buffer): string {
  return bytes.toString('base64url')
}

/**
 * A fresh PKCE pair.
 *
 * The verifier never leaves this process until the exchange; the challenge is
 * its SHA-256, which is all the authorization page ever sees. That is the
 * whole point of PKCE: the code the user pastes back is worthless to anyone
 * who did not generate the verifier.
 */
export function createPkce(randomBytes: (size: number) => Buffer = nodeRandomBytes): Pkce {
  const verifier = base64Url(randomBytes(SECRET_BYTES))
  return {
    verifier,
    challenge: base64Url(createHash('sha256').update(verifier).digest()),
    state: base64Url(randomBytes(SECRET_BYTES)),
  }
}

/** Where to send the human. */
export function authorizeUrl(pkce: Pkce): string {
  const url = new URL(AUTHORIZE_URL)
  // `code=true` is what makes the page DISPLAY the code instead of posting it
  // to a listening port — there is no browser on this side, and no port of
  // ours the page could reach.
  url.searchParams.set('code', 'true')
  url.searchParams.set('client_id', CLIENT_ID)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', REDIRECT_URI)
  url.searchParams.set('scope', SCOPE)
  url.searchParams.set('code_challenge', pkce.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', pkce.state)
  return url.toString()
}

/**
 * What the user pastes: the page hands them `code#state`, and people paste
 * what they are given — with the odd space or newline around it.
 */
export function splitPastedCode(pasted: string): { code: string; state?: string } {
  const [code = '', state] = pasted.trim().split('#')
  return state === undefined || state === '' ? { code } : { code, state }
}

export interface ExchangeOptions {
  readonly pkce: Pkce
  readonly pasted: string
  readonly fetchImpl?: typeof fetch
  readonly expiresIn?: number
  readonly timeoutMs?: number
}

export interface ArmedToken {
  readonly token: string
  /** Seconds the service says it will last, when it says so. */
  readonly expiresIn?: number
}

/**
 * Trade the pasted code for a token.
 *
 * Every exit from here names what happened. "It did not work" is the one
 * answer this flow is not allowed to give.
 */
export async function exchangeCode(options: ExchangeOptions): Promise<ArmedToken> {
  const { code, state } = splitPastedCode(options.pasted)
  if (code === '') throw new Error('no code was pasted')
  if (state !== undefined && state !== options.pkce.state) {
    // Not pedantry: a code from a different authorization cannot be exchanged
    // with this verifier, and saying so beats relaying a puzzling 400.
    throw new Error('that code belongs to a different authorization — start the flow again')
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const body = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: options.pkce.verifier,
    state: options.pkce.state,
    expires_in: options.expiresIn ?? ONE_YEAR_SECONDS,
  }

  let response: Response
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? EXCHANGE_TIMEOUT_MS),
    })
  } catch (error) {
    // A network failure is about the machine, not about the code. Saying
    // "wrong or expired code" here is how an outage becomes an hour of
    // someone re-copying a perfectly good code.
    throw new Error(`could not reach the authorization service: ${(error as Error).message}`)
  }

  const text = await response.text()
  if (!response.ok) {
    throw new Error(
      `the authorization service refused the exchange (HTTP ${response.status}): ${excerpt(text)}`,
    )
  }

  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error(`the authorization service answered with something that is not JSON: ${excerpt(text)}`)
  }

  const token = (payload as { access_token?: unknown }).access_token
  if (typeof token !== 'string' || token === '') {
    // The contract changed. Name the keys, never their values: one of them is
    // a credential, and an error message is the last place it should land.
    const keys = Object.keys((payload ?? {}) as object).join(', ') || 'none'
    throw new Error(`the exchange succeeded but carried no access_token (fields: ${keys})`)
  }

  const expiresIn = (payload as { expires_in?: unknown }).expires_in
  return typeof expiresIn === 'number' ? { token, expiresIn } : { token }
}

function excerpt(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  return trimmed === ''
    ? '(empty body)'
    : trimmed.length > BODY_EXCERPT
      ? `${trimmed.slice(0, BODY_EXCERPT)}…`
      : trimmed
}

export interface OAuthFlowOptions {
  readonly fetchImpl?: typeof fetch
  readonly randomBytes?: (size: number) => Buffer
  readonly expiresIn?: number
  readonly timeoutMs?: number
}

/**
 * The contract's arming flow, with no subprocess behind it.
 *
 * One pair per flow, dropped when the flow ends: a verifier that outlived its
 * authorization is a secret kept for nothing.
 */
export function createOAuthFlow(options: OAuthFlowOptions = {}): ArmingFlow {
  let pending: Pkce | undefined

  return {
    start() {
      pending = createPkce(options.randomBytes)
      return Promise.resolve({ authorizeUrl: authorizeUrl(pending) })
    },

    async submit(pasted: string) {
      if (pending === undefined) throw new Error('no arming flow is running')
      const { token } = await exchangeCode({
        pkce: pending,
        pasted,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
        ...(options.expiresIn !== undefined ? { expiresIn: options.expiresIn } : {}),
        ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      })
      pending = undefined
      return { token }
    },

    cancel() {
      pending = undefined
      return Promise.resolve()
    },
  }
}
