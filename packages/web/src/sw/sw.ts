/**
 * The service worker — the half of "installable" the manifest does not cover.
 *
 * It is deliberately small. Everything that decides anything lives in
 * `policy.ts`, which is pure and tested; this file is the plumbing that a
 * worker context requires and a test cannot reach.
 *
 * Written against a hand-declared `self` rather than the WebWorker lib: the
 * shell's TypeScript project is a DOM project, and the two libs contradict
 * each other on half the globals. Narrower, and it typechecks with the rest of
 * the package instead of beside it.
 */

import { isCacheable, strategyFor } from './policy.js'

/** Injected by `build/sw.mjs`: rotates the cache when the shell changes. */
declare const __SW_VERSION__: string
/** Injected by `build/sw.mjs`: the shell and its entry chunks. */
declare const __SW_PRECACHE__: readonly string[]

interface ExtendableEventLike {
  waitUntil(promise: Promise<unknown>): void
}

interface FetchEventLike extends ExtendableEventLike {
  readonly request: Request
  respondWith(response: Response | Promise<Response>): void
}

declare const self: {
  addEventListener(type: 'install', listener: (event: ExtendableEventLike) => void): void
  addEventListener(type: 'activate', listener: (event: ExtendableEventLike) => void): void
  addEventListener(type: 'fetch', listener: (event: FetchEventLike) => void): void
  readonly clients: { claim(): Promise<void> }
  readonly location: { readonly origin: string }
}

const CACHE = `golem-${__SW_VERSION__}`

/** The address an offline navigation falls back to when nothing else matches. */
const SHELL = '/'

self.addEventListener('install', (event) => {
  /*
   * Precached, not merely cached on the way past: the navigation that installs
   * a worker is not handled BY it, so a first visit followed by a flight would
   * find the cache holding nothing at all. The list is the shell and the
   * chunks its HTML names — never the lazy ones (the editor alone is ~450 kB),
   * which the network-first path picks up the first time they are needed.
   */
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Individually, and forgiving: `addAll` is atomic, so one asset renamed
      // between the build and the request would throw away the whole install
      // and leave the app with no worker.
      Promise.all(
        __SW_PRECACHE__.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined)),
      ),
    ),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Every previous build's cache, dropped in one pass. Content-addressed
      // entries are immortal otherwise: nothing ever requests them again, so
      // nothing ever evicts them.
      for (const name of await caches.keys()) {
        if (name.startsWith('golem-') && name !== CACHE) await caches.delete(name)
      }
      /*
       * Taking control of the page that installed us, so the tab that just
       * opened is cached like every later one. Safe despite what `skipWaiting`
       * usually costs: a NEW worker only reaches activation once every client
       * of the old one is gone, so this never swaps policies under a live tab.
       */
      await self.clients.claim()
    })(),
  )
})

async function networkFirst(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (isCacheable(response)) {
      // Not awaited: a full disk must cost the write, never the answer the
      // user is waiting for.
      void cache.put(request, response.clone()).catch(() => undefined)
    }
    return response
  } catch {
    const hit = await cache.match(request)
    if (hit) return hit
    if (request.mode === 'navigate') {
      const shell = await cache.match(SHELL)
      if (shell) return shell
    }
    /*
     * A refusal in the product's own words. Letting the fetch throw hands the
     * browser its own error page, which blames the site for a network that is
     * simply not there — and on an installed app, that page has no address bar
     * to explain itself from.
     */
    return new Response('offline', {
      status: 503,
      statusText: 'offline',
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
}

async function cacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (isCacheable(response)) void cache.put(request, response.clone()).catch(() => undefined)
  return response
}

self.addEventListener('fetch', (event) => {
  const strategy = strategyFor({
    method: event.request.method,
    url: event.request.url,
    mode: event.request.mode,
    origin: self.location.origin,
  })
  // Not calling `respondWith` at all is the bypass: the browser then performs
  // the request exactly as it would with no worker registered, streaming and
  // range requests included.
  if (strategy === 'bypass') return
  event.respondWith(strategy === 'cache-first' ? cacheFirst(event.request) : networkFirst(event.request))
})
