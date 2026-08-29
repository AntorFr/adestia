/**
 * What the service worker does with a request — decided here, in one pure
 * function, so the rule can be read and tested without a browser.
 *
 * The whole policy exists to buy ONE property and refuse one temptation:
 *
 * - **Opens offline.** The shell and its entry chunks answer from the cache
 *   when the network is gone, so an installed Adestia opens to its own interface
 *   and says the server is unreachable — instead of the browser's dinosaur,
 *   which says nothing about which of the two is down.
 * - **Never serves stale JavaScript.** A cache-first shell is how a PWA ends
 *   up running last week's bundle against this week's API, and the user has no
 *   gesture that fixes it — reload included. So the document and everything
 *   whose name does not change are NETWORK first: the cache is a fallback for
 *   an absent network, never a shortcut past a present one.
 *
 * Content-addressed files are the one exception, and they are not really one:
 * `/assets/app-B3xK9f2p.js` cannot change meaning without changing name, so
 * serving it from the cache serves exactly what the network would have.
 */

export type Strategy =
  /** Not ours: let the browser do what it would have done with no worker. */
  | 'bypass'
  /** Network, with the cache as the offline answer. Refreshes what it gets. */
  | 'network-first'
  /** Cache, then network. Only for names that cannot outlive their content. */
  | 'cache-first'

export interface RouteDecision {
  readonly method: string
  /** The absolute request URL. */
  readonly url: string
  /** The request's mode; `navigate` is a document the browser is opening. */
  readonly mode: string
  /** The worker's own origin — anything else is somebody else's server. */
  readonly origin: string
}

/**
 * Vite's content hash: `name-<hash>.ext`, the hash being at least eight
 * URL-safe characters. Matched narrowly on purpose — a false positive here
 * pins a mutable file in the cache with no way out but a new cache name.
 */
const CONTENT_ADDRESSED = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/

/**
 * Paths a worker must keep its hands off entirely.
 *
 * `/api/` carries the turn stream — an SSE response is an infinite body, and a
 * worker that tried to cache one would hold a promise open for the length of
 * the conversation. It also carries every write in the product. `/auth/`
 * carries the sign-in bounce, whose whole content is a redirect and a
 * one-time code.
 */
const UNTOUCHED = ['/api/', '/auth/', '/mcp']

export function strategyFor(request: RouteDecision): Strategy {
  // A worker may only replay what is safe to replay. Anything else is a
  // request whose second execution is not the first one's answer.
  if (request.method !== 'GET') return 'bypass'

  let path: string
  try {
    const parsed = new URL(request.url)
    if (parsed.origin !== request.origin) return 'bypass'
    path = parsed.pathname
  } catch {
    return 'bypass'
  }

  for (const prefix of UNTOUCHED) {
    if (path === prefix || path.startsWith(prefix)) return 'bypass'
  }

  // The worker itself: fetched by the browser's own update check, which has
  // its own freshness rules. Serving it from a cache is how a worker becomes
  // impossible to replace.
  if (path === '/sw.js') return 'bypass'

  if (CONTENT_ADDRESSED.test(path)) return 'cache-first'

  return 'network-first'
}

/**
 * Whether a response may enter the cache.
 *
 * Three refusals, each one a way to poison an offline boot:
 *
 * - a redirect the worker did not follow (`opaqueredirect`) — what an OIDC
 *   instance answers to a signed-out navigation, and what would be replayed
 *   forever as "the shell" if it were kept;
 * - an opaque cross-origin response, whose status is unreadable, so "it
 *   worked" cannot be told from "the captive portal answered";
 * - anything that is not a 200: a 404 cached under the shell's address is a
 *   product that opens to nothing, offline, until the cache name changes.
 */
export function isCacheable(response: { ok: boolean; status: number; type: string }): boolean {
  if (!response.ok || response.status !== 200) return false
  return response.type === 'basic' || response.type === 'default'
}
