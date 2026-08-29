/**
 * Following the server's change feed (`/api/events`).
 *
 * The agent writes pages with its own file tools, so nothing in the browser
 * ever caused the change it needs to draw. This follows the feed the server
 * publishes and hands each batch to the shell, which refetches the index —
 * the feed says THAT things changed, never what they now contain.
 *
 * The connection is expected to die — a sleeping phone, a proxy timeout, a
 * server restart — and dying must cost a delay, not the feature: it
 * reconnects with backoff for as long as the shell lives. Only the server
 * saying "no such feed" (a 404: the operator disabled it) ends it for good.
 */

import { SseParser } from '../chat/stream.js'

export interface PagesChangedEvent {
  readonly type: 'pages-changed'
  readonly paths?: readonly string[]
}

export interface FollowOptions {
  readonly fetchImpl?: typeof fetch
  /** Aborting this is how the shell unsubscribes. */
  readonly signal: AbortSignal
  /** A batch of changed page paths; empty means "resync, whatever you hold". */
  readonly onChange: (paths: readonly string[]) => void
  /** First reconnect delay; doubles up to 30 s. Injected small in tests. */
  readonly retryMs?: number
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    signal.addEventListener('abort', done)
  })
}

export async function followChanges(options: FollowOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch
  const floor = options.retryMs ?? 1000
  let delay = floor
  let everConnected = false

  while (!options.signal.aborted) {
    let response: Response
    try {
      response = await fetchImpl('/api/events', { signal: options.signal })
    } catch {
      // The server is unreachable — down, or the network is. Worth retrying:
      // this loop outlives a server restart on purpose.
      if (options.signal.aborted) return
      await sleep(delay, options.signal)
      delay = Math.min(delay * 2, 30_000)
      continue
    }

    // Anything but a live stream means the feed is not offered here — the
    // operator disabled it, or something in between answered for the server.
    // Stopping beats hammering an endpoint that already said no.
    if (!response.ok || !response.body) return

    delay = floor
    if (everConnected) {
      // Changes may have happened during the gap; an empty batch says
      // "refetch whatever you hold" without pretending to know what moved.
      options.onChange([])
    }
    everConnected = true

    const parser = new SseParser<PagesChangedEvent>()
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    // Cancelling the reader is what makes unsubscribing prompt: a feed that
    // says nothing for an hour would otherwise hold this loop in `read()`
    // long after the shell stopped caring.
    const onAbort = () => void reader.cancel().catch(() => undefined)
    options.signal.addEventListener('abort', onAbort)
    // The signal may have fired between the fetch settling and the listener
    // landing — an unsubscribe that slips through that crack would leave the
    // loop parked in `read()` forever.
    if (options.signal.aborted) onAbort()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        for (const event of parser.push(value)) {
          if (event.type === 'pages-changed') options.onChange(event.paths ?? [])
        }
      }
    } catch {
      /* the connection dropped mid-read; the loop below reconnects */
    } finally {
      options.signal.removeEventListener('abort', onAbort)
      reader.releaseLock()
    }

    // The stream ended without the shell asking it to; wait a beat, reconnect.
    if (!options.signal.aborted) await sleep(delay, options.signal)
  }
}
