/**
 * The events route: the stream a shell subscribes to, and the file watchers
 * that feed it. The batching itself (`ChangeFeed`) lives in `../watch.ts`.
 */

import { isAbsolute, join, relative, sep } from 'node:path'

import { watch } from 'chokidar'
import type { FastifyInstance } from 'fastify'

import type { WatchConfig } from '../config.js'
import { logicalOf, type Store } from '../stores.js'
import { ChangeFeed, pagePathOf, type PagesChangedEvent } from '../watch.js'

export interface EventsOptions {
  /**
   * The stores the pages API composes. One watcher per store, and the event
   * carries the LOGICAL path: a shell learns that `voyages/italie` changed,
   * never which circle it changed in — the same page moved between stores must
   * not read as two different pages appearing and disappearing.
   */
  readonly stores: readonly Store[]
  readonly watch: WatchConfig
  /** Injected in tests; production watches the disk with chokidar. */
  readonly watcherFactory?: (
    dir: string,
    onPath: (path: string) => void,
  ) => { close(): Promise<void> | void }
  /** How long the watcher survives its last subscriber. See `release`. */
  readonly lingerMs?: number
  readonly quietMs?: number
  readonly maxWaitMs?: number
}

function diskWatcher(
  options: EventsOptions,
): (dir: string, onPath: (path: string) => void) => { close(): Promise<void> } {
  return (dir, onPath) => {
    const root = dir
    const watcher = watch(root, {
      ignoreInitial: true,
      // The tmp-then-rename dance both authors use must read as one change to
      // the final name, not as a ghost file appearing and vanishing.
      atomic: true,
      // Pruned while WALKING, not just when reporting: never descending into
      // `.git` is the difference between watching a workspace and indexing it.
      // The path is absolute here, so only segments below the root may judge —
      // a workspace legitimately living under some dotted directory must not
      // ignore itself.
      ignored: (path) => {
        const rel = relative(root, path)
        return rel !== '' && !rel.startsWith('..') && rel.split(sep).some((s) => s.startsWith('.'))
      },
      ...(options.watch.polling
        ? { usePolling: true, interval: options.watch.intervalMs }
        : {}),
    })
    watcher.on('add', onPath)
    watcher.on('change', onPath)
    watcher.on('unlink', onPath)
    // A watcher error (EMFILE, a directory yanked mid-scan) costs liveness,
    // never the server: the shell still works, one refresh behind.
    watcher.on('error', () => undefined)
    return { close: () => watcher.close() }
  }
}

export function registerEvents(app: FastifyInstance, options: EventsOptions): void {
  if (!options.watch.enabled) {
    // 404, same shape as the other capability-gated routes: "this instance
    // does not publish change events" is a fact the client acts on — it stops
    // asking — not an error to retry.
    app.get('/api/events', async (_request, reply) =>
      reply.code(404).send({ error: 'this instance does not publish change events' }),
    )
    return
  }

  const feed = new ChangeFeed(options.quietMs, options.maxWaitMs)
  const makeWatcher = options.watcherFactory ?? diskWatcher(options)

  let watchers: { close(): Promise<void> | void }[] = []
  let subscribers = 0
  let linger: NodeJS.Timeout | undefined

  const ensureWatcher = () => {
    if (linger) clearTimeout(linger)
    linger = undefined
    if (watchers.length > 0) return
    // One per store. A single chokidar over several roots would report paths
    // this module could not attribute, and the mount point would be lost.
    watchers = options.stores.map((store) =>
      makeWatcher(store.dir, (path) => {
        // Back to the name the whole product speaks — mount point included.
        // The watcher sees `/shared/famille/italie.md`; the shell is told
        // `voyages/famille/italie.md`, which is the only name it knows.
        const full = isAbsolute(path) ? path : join(store.dir, path)
        const page = pagePathOf(logicalOf(options.stores, full) ?? '')
        if (page) feed.report(page)
      }),
    )
  }

  const release = () => {
    subscribers -= 1
    if (subscribers > 0) return
    // Lingering rather than closing on the spot: a reload reconnects within
    // seconds, and in polling mode every restart pays a full scan of the tree.
    linger = setTimeout(() => {
      for (const one of watchers) void one.close()
      watchers = []
    }, options.lingerMs ?? 10_000)
    linger.unref?.()
  }

  // Every response still open, so shutdown can end them: a permanent stream
  // nobody ends is a socket `close()` would otherwise wait on forever.
  const open = new Set<() => void>()

  app.addHook('onClose', async () => {
    feed.close()
    if (linger) clearTimeout(linger)
    for (const end of [...open]) end()
    for (const one of watchers) await one.close()
    watchers = []
  })

  app.get('/api/events', async (request, reply) => {
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      // Nginx and friends buffer SSE into uselessness without this.
      'x-accel-buffering': 'no',
    })
    // Flushes the headers, so the client knows it is subscribed before
    // anything changes — a feed that only speaks on change looks dead until
    // the first write.
    reply.raw.write(': connected\n\n')

    subscribers += 1
    ensureWatcher()

    const unsubscribe = feed.subscribe((paths) => {
      const event: PagesChangedEvent = { type: 'pages-changed', paths }
      reply.raw.write(`event: pages-changed\ndata: ${JSON.stringify(event)}\n\n`)
    })
    // Comment frames, not events: they keep idle proxies from cutting the
    // connection and cost the parser nothing.
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 30_000)
    ping.unref?.()

    await new Promise<void>((resolve) => {
      let done = false
      const end = () => {
        if (done) return
        done = true
        clearInterval(ping)
        unsubscribe()
        release()
        open.delete(end)
        reply.raw.end()
        resolve()
      }
      open.add(end)
      request.raw.on('close', end)
    })
    return reply
  })
}
