import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import type { AddressInfo } from 'node:net'

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChangeFeed, pagePathOf, registerEvents, type EventsOptions } from '../src/watch.js'
import type { WatchConfig } from '../src/config.js'

const WATCH: WatchConfig = { enabled: true, polling: false, intervalMs: 2000 }

describe('pagePathOf', () => {
  it('announces markdown, as an API path', () => {
    expect(pagePathOf('recettes/tarte.md')).toBe('recettes/tarte.md')
    expect(pagePathOf(['recettes', 'tarte.md'].join(sep))).toBe('recettes/tarte.md')
  })

  it('stays silent about what is not a page', () => {
    // A .tmp mid-save, an attachment next to a page, the workspace's plumbing:
    // none of them is a page, and announcing them makes the browser fetch for
    // nothing.
    expect(pagePathOf('recettes/tarte.md.123.tmp')).toBeUndefined()
    expect(pagePathOf('recettes/photo.jpg')).toBeUndefined()
    expect(pagePathOf('.obsidian/workspace.md')).toBeUndefined()
    expect(pagePathOf('notes/.draft.md')).toBeUndefined()
    expect(pagePathOf('')).toBeUndefined()
    expect(pagePathOf('../outside.md')).toBeUndefined()
  })
})

describe('ChangeFeed', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('batches a burst into one delivery, deduplicated and sorted', () => {
    vi.useFakeTimers()
    const feed = new ChangeFeed(250, 1000)
    const seen: (readonly string[])[] = []
    feed.subscribe((paths) => seen.push(paths))

    feed.report('b.md')
    feed.report('a.md')
    feed.report('b.md')
    expect(seen).toEqual([])

    vi.advanceTimersByTime(250)
    expect(seen).toEqual([['a.md', 'b.md']])
    feed.close()
  })

  it('never holds a batch past the deadline while writes keep coming', () => {
    vi.useFakeTimers()
    const feed = new ChangeFeed(250, 1000)
    const seen: (readonly string[])[] = []
    feed.subscribe((paths) => seen.push(paths))

    // A write every 200ms resets the quiet timer forever; the deadline is
    // what keeps the shell at most a second stale.
    for (let tick = 0; tick < 6; tick += 1) {
      feed.report(`p${tick}.md`)
      vi.advanceTimersByTime(200)
    }
    expect(seen.length).toBeGreaterThan(0)
    feed.close()
  })

  it('stops delivering after unsubscribe', () => {
    vi.useFakeTimers()
    const feed = new ChangeFeed(10, 100)
    const seen: (readonly string[])[] = []
    const unsubscribe = feed.subscribe((paths) => seen.push(paths))
    unsubscribe()
    feed.report('a.md')
    vi.advanceTimersByTime(200)
    expect(seen).toEqual([])
    feed.close()
  })
})

/** Boots a real HTTP server, because an SSE stream that never ends cannot be
    exercised through inject. */
async function serve(options: Partial<EventsOptions> & { watch?: WatchConfig }) {
  const app = Fastify()
  registerEvents(app, {
    root: join(tmpdir(), 'nowhere'),
    watch: WATCH,
    quietMs: 10,
    maxWaitMs: 100,
    lingerMs: 0,
    ...options,
  })
  await app.listen({ port: 0, host: '127.0.0.1' })
  const port = (app.server.address() as AddressInfo).port
  return { app, url: `http://127.0.0.1:${port}/api/events` }
}

/** Reads the stream until a `pages-changed` frame appears, or times out. */
async function nextBatch(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs = 4000,
): Promise<readonly string[]> {
  let buffer = ''
  const decoder = new TextDecoder()
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const { done, value } = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`no event within ${timeoutMs}ms`)), deadline - Date.now()),
      ),
    ])
    if (done) throw new Error('the stream ended without an event')
    buffer += decoder.decode(value, { stream: true })
    const match = /event: pages-changed\ndata: (.*)\n/.exec(buffer)
    if (match) return (JSON.parse(match[1]!) as { paths: string[] }).paths
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('/api/events', () => {
  let app: FastifyInstance | undefined
  const controller = { current: undefined as AbortController | undefined }

  afterEach(async () => {
    controller.current?.abort()
    controller.current = undefined
    await app?.close()
    app = undefined
  })

  it('is a fact, not an error, when the operator disabled the feed', async () => {
    const served = await serve({ watch: { ...WATCH, enabled: false } })
    app = served.app
    const response = await fetch(served.url)
    expect(response.status).toBe(404)
    expect(((await response.json()) as { error: string }).error).toContain('does not publish')
  })

  it('starts watching at the first subscriber, and streams filtered batches', async () => {
    let onPath: ((path: string) => void) | undefined
    let started = 0
    const served = await serve({
      watcherFactory: (_root, report) => {
        started += 1
        onPath = report
        return { close: () => undefined }
      },
    })
    app = served.app
    // No browser, no watcher: an idle server does no filesystem work.
    expect(started).toBe(0)

    controller.current = new AbortController()
    const response = await fetch(served.url, { signal: controller.current.signal })
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const reader = response.body!.getReader()
    // The factory runs when the route admits the subscriber, not before.
    await vi.waitFor(() => expect(started).toBe(1))

    onPath!('recettes/tarte.md')
    onPath!(join('.obsidian', 'cache.md'))
    onPath!('recettes/photo.jpg')
    expect(await nextBatch(reader)).toEqual(['recettes/tarte.md'])
  })

  it('closes the watcher once the last subscriber is gone', async () => {
    let closed = 0
    const served = await serve({
      watcherFactory: () => ({
        close: () => {
          closed += 1
        },
      }),
    })
    app = served.app

    controller.current = new AbortController()
    const response = await fetch(served.url, { signal: controller.current.signal })
    await response.body!.getReader().read()
    controller.current.abort()
    controller.current = undefined

    await vi.waitFor(() => expect(closed).toBe(1))
  })

  it('sees a real write land as a pages-changed event', async () => {
    const root = await mkdtemp(join(tmpdir(), 'demeura-watch-'))
    // Polling, so the test does not depend on which native backend this
    // machine has; production defaults to native events.
    const served = await serve({ root, watch: { ...WATCH, polling: true, intervalMs: 100 } })
    app = served.app

    controller.current = new AbortController()
    const response = await fetch(served.url, { signal: controller.current.signal })
    const reader = response.body!.getReader()

    // Let the initial scan finish: a file landing during it reads as already
    // present rather than as a change.
    await wait(500)
    await mkdir(join(root, 'notes'), { recursive: true })
    await writeFile(join(root, 'notes', 'fraiche.md'), '# Toute fraîche\n')

    expect(await nextBatch(reader, 6000)).toContain('notes/fraiche.md')
  }, 10_000)
})
