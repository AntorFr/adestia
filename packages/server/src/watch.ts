/**
 * The change feed — how an open shell learns the workspace moved.
 *
 * The agent writes pages with its own native file tools, so no route in this
 * server ever sees those writes happen. Without a feed, a page the agent just
 * created exists everywhere except on the screen of the person who asked for
 * it: the shell's index is a snapshot taken at boot. This is the "light event
 * bus (file watcher → live app refresh)" the design names next to the turn
 * stream.
 *
 * Three decisions shape this file:
 *
 * - **The watcher runs only while somebody is subscribed.** A server nobody is
 *   looking at does no filesystem work — which matters doubly in polling mode,
 *   where watching is a periodic scan of the whole tree.
 * - **Events are debounced into batches.** An agent turn writes in bursts
 *   (a Write, two Edits, a rename); one `pages-changed` frame per burst is a
 *   signal, one per syscall is noise the browser answers with a fetch each.
 * - **Polling is a config choice, not a guess.** Native events cannot cross
 *   some mount boundaries (WSL's /mnt/c, NFS, SMB, some Docker bind mounts);
 *   only the operator knows their workspace sits on one.
 */

import { isAbsolute, relative, sep } from 'node:path'

import { watch } from 'chokidar'
import type { FastifyInstance } from 'fastify'

import type { WatchConfig } from './config.js'

/** What a subscriber is told: the pages whose files changed, batched. */
export interface PagesChangedEvent {
  readonly type: 'pages-changed'
  readonly paths: readonly string[]
}

/**
 * A change worth announcing, from a path relative to the pages root.
 *
 * Same contract as the pages API: markdown only — a `.tmp` mid-save or an
 * attachment sitting next to a page is not a page — and nothing under a
 * dotted segment, which is the workspace's plumbing rather than its content.
 * Returned with forward slashes whatever the platform, because the value is
 * an API path, not a filesystem one.
 */
export function pagePathOf(path: string): string | undefined {
  const rel = path.split(sep).join('/')
  if (rel === '' || rel.startsWith('../') || rel === '..') return undefined
  if (!rel.endsWith('.md')) return undefined
  if (rel.split('/').some((segment) => segment.startsWith('.'))) return undefined
  return rel
}

/**
 * Subscribers and the debounce between the disk and them.
 *
 * `quietMs` of silence flushes a batch; `maxWaitMs` bounds how long a busy
 * burst can hold one back — an agent writing for a minute straight must not
 * leave the shell a minute stale.
 */
export class ChangeFeed {
  #listeners = new Set<(paths: readonly string[]) => void>()
  #pending = new Set<string>()
  #quiet: NodeJS.Timeout | undefined
  #deadline: NodeJS.Timeout | undefined

  constructor(
    private readonly quietMs = 250,
    private readonly maxWaitMs = 1000,
  ) {}

  subscribe(listener: (paths: readonly string[]) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  report(path: string): void {
    this.#pending.add(path)
    if (this.#quiet) clearTimeout(this.#quiet)
    this.#quiet = setTimeout(() => this.#flush(), this.quietMs)
    this.#deadline ??= setTimeout(() => this.#flush(), this.maxWaitMs)
  }

  #flush(): void {
    if (this.#quiet) clearTimeout(this.#quiet)
    if (this.#deadline) clearTimeout(this.#deadline)
    this.#quiet = undefined
    this.#deadline = undefined
    if (this.#pending.size === 0) return
    const paths = [...this.#pending].sort()
    this.#pending.clear()
    for (const listener of this.#listeners) listener(paths)
  }

  close(): void {
    if (this.#quiet) clearTimeout(this.#quiet)
    if (this.#deadline) clearTimeout(this.#deadline)
    this.#listeners.clear()
    this.#pending.clear()
  }
}

export interface EventsOptions {
  /** Absolute path of the pages directory — the same root the pages API serves. */
  readonly root: string
  readonly watch: WatchConfig
  /** Injected in tests; production watches the disk with chokidar. */
  readonly watcherFactory?: (
    root: string,
    onPath: (path: string) => void,
  ) => { close(): Promise<void> | void }
  /** How long the watcher survives its last subscriber. See `release`. */
  readonly lingerMs?: number
  readonly quietMs?: number
  readonly maxWaitMs?: number
}

function diskWatcher(
  options: EventsOptions,
): (root: string, onPath: (path: string) => void) => { close(): Promise<void> } {
  return (root, onPath) => {
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

  let watcher: { close(): Promise<void> | void } | undefined
  let subscribers = 0
  let linger: NodeJS.Timeout | undefined

  const ensureWatcher = () => {
    if (linger) clearTimeout(linger)
    linger = undefined
    watcher ??= makeWatcher(options.root, (path) => {
      const page = pagePathOf(isAbsolute(path) ? relative(options.root, path) : path)
      if (page) feed.report(page)
    })
  }

  const release = () => {
    subscribers -= 1
    if (subscribers > 0) return
    // Lingering rather than closing on the spot: a reload reconnects within
    // seconds, and in polling mode every restart pays a full scan of the tree.
    linger = setTimeout(() => {
      void watcher?.close()
      watcher = undefined
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
    await watcher?.close()
    watcher = undefined
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
