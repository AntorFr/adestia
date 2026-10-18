/**
 * The one way the web talks to the server (AD-11, R-11).
 *
 * `requestJson` never throws: a network error is `{ ok: false, status: 0 }`, an
 * empty or non-JSON body is `data: undefined`-safe, and a refusal carries the
 * server's own `error` (and its parsed body in `data`, for a refusal that
 * carries figures) or a fallback SAID IN THE LOCALE (Q-4) — `t` is the
 * caller's translator, so the helper stays free of any language state.
 * `fetchImpl` stays the injected dependency. What a failure MEANS (silence, an
 * inline message) remains the call site's; only the plumbing lives here.
 */

export type RequestResult<T> =
  | { readonly ok: true; readonly status: number; readonly data: T }
  | { readonly ok: false; readonly status: number; readonly error: string; readonly data?: unknown }

/** The key of the fallback sentence; `%n` stands for the status. */
export const FALLBACK_KEY = 'request failed (%n)'

export function jsonInit(method: string, body?: unknown): RequestInit {
  // No body, no content-type: a server that parses JSON rejects an empty one.
  if (body === undefined) return { method }
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

export async function requestJson<T = unknown>(
  fetchImpl: typeof fetch,
  path: string,
  init?: RequestInit,
  t: (key: string) => string = (key) => key,
): Promise<RequestResult<T>> {
  const fallback = (status: number) => t(FALLBACK_KEY).replace('%n', String(status))
  let response: Response
  try {
    response = await fetchImpl(path, init)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : ''
    return { ok: false, status: 0, error: message !== '' ? message : fallback(0) }
  }
  const body: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const error = (body as { error?: unknown } | null | undefined)?.error
    return {
      ok: false,
      status: response.status,
      error: typeof error === 'string' && error !== '' ? error : fallback(response.status),
      data: body,
    }
  }
  return { ok: true, status: response.status, data: body as T }
}

export type RawResult =
  | { readonly ok: true; readonly response: Response }
  | { readonly ok: false; readonly error: string }

/**
 * For the six callers of `chat/` that want the `Response` itself: two stream
 * the body (the turn POST, the attach GET) and four do not (the upload, the
 * stop, the archive and the delete, which read only the status or the body once).
 * Any HTTP status comes back as a `response`, whole; only a failure to reach
 * the server is `{ ok: false }`, with the locale's fallback. It never throws.
 */
export async function requestRaw(
  fetchImpl: typeof fetch,
  path: string,
  init?: RequestInit,
  t: (key: string) => string = (key) => key,
): Promise<RawResult> {
  try {
    return { ok: true, response: await fetchImpl(path, init) }
  } catch {
    return { ok: false, error: t(FALLBACK_KEY).replace('%n', '0') }
  }
}
