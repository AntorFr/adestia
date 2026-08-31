/**
 * The server side of the listening post: fetch the feeds, hold the queue,
 * and answer "where was that said".
 *
 * Three kinds of data meet here and the design is about keeping them apart —
 * the same frontier the trips app draws, for the same reason:
 *
 * - the LIBRARY (pages typed `ecoute`, transcripts beside them) is written by
 *   the agent and by the shell's own page editor. Nothing in this module ever
 *   writes it.
 * - the QUEUE (a link pasted in, a candidate waved away) is not memory: it
 *   lives in `dataDir`, and losing it costs a queue rather than a library.
 * - what the FEEDS say is derived, fetched on demand and cached in process.
 *   A source that does not answer is reported as a source that did not
 *   answer — never as a source with nothing new.
 *
 * No key is needed for any of it: a YouTube channel publishes an Atom feed at
 * `videos.xml?channel_id=…` and a podcast publishes RSS. That is why this
 * plugin declares no secret and works on an instance that holds none.
 */

import { readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

import { byFreshness, clockOf, deepLink, keyOf, parseFeed } from './lib/feeds.mjs'
import { assetsFor, exists, readLibrary, readSources, safePath } from './lib/library.mjs'
import { emptyState, readState, stamp, stateFile, writeState } from './lib/store.mjs'
import { parseTranscript, search } from './lib/transcript.mjs'

const TIMEOUT = 12_000
/** How long a feed's answer stands before it is asked again. */
const FEED_TTL = 900_000
/** How much of a page is read to find its title. A title is in the head. */
const HEAD = 64_000

/** A derived value's cache: in process, bounded, and never a file. */
export function makeCache(limit = 256) {
  const entries = new Map()
  return {
    get(key) {
      const hit = entries.get(key)
      return hit && hit.until > Date.now() ? hit.value : undefined
    },
    set(key, ttlMs, value) {
      entries.set(key, { until: Date.now() + ttlMs, value })
      if (entries.size > limit) {
        for (const stale of [...entries.keys()].slice(0, limit / 4)) entries.delete(stale)
      }
      return value
    },
    drop() {
      entries.clear()
    },
  }
}

/**
 * The queue: what the feeds offer, plus what was pasted in, minus what is
 * already filed and what was waved away.
 *
 * Pure, and tested as such. `already` is keyed with the SAME function the
 * feeds use, which is the whole reason an episode kept from a `youtu.be` link
 * stops appearing under its `watch?v=` spelling.
 */
export function buildQueue({ entries = [], dropped = {}, dismissed = {}, library = [] }) {
  const filed = new Set(library.map((item) => item.key).filter(Boolean))
  const candidates = new Map()

  for (const entry of entries) {
    if (filed.has(entry.key) || dismissed[entry.key]) continue
    candidates.set(entry.key, { ...entry, origine: 'flux' })
  }

  // A link somebody pasted outranks the same link arriving through a feed:
  // pasting it IS the judgement, and the note that came with it would be lost.
  for (const [key, link] of Object.entries(dropped)) {
    if (filed.has(key) || dismissed[key]) continue
    const known = candidates.get(key)
    candidates.set(key, {
      key,
      url: link.url,
      titre: link.titre ?? known?.titre ?? link.url,
      publie: link.publie ?? known?.publie ?? link.ts ?? null,
      resume: link.resume ?? known?.resume ?? '',
      secondes: link.secondes ?? known?.secondes ?? null,
      media: link.media ?? known?.media ?? 'video',
      source: link.source ?? known?.source ?? null,
      sourceId: known?.sourceId ?? null,
      tags: known?.tags ?? [],
      note: link.note ?? null,
      origine: 'depose',
    })
  }

  return [...candidates.values()]
    .map((item) => ({ ...item, duree: clockOf(item.secondes) }))
    .sort(byFreshness)
}

/**
 * What a pasted link is about, without a key and without a scraper.
 *
 * oEmbed where the host publishes it (YouTube does, and answers with the
 * title and the channel); otherwise the `<title>` of the page. A link that
 * answers neither keeps its URL as its title — honest, and still queueable.
 */
export async function resolveLink(url, fetchImpl = fetch) {
  const fallback = { url, titre: url, source: null, media: null }
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return fallback
  }
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase()

  if (host.endsWith('youtube.com') || host === 'youtu.be') {
    try {
      const oembed = new URL('https://www.youtube.com/oembed')
      oembed.searchParams.set('url', url)
      oembed.searchParams.set('format', 'json')
      const response = await fetchImpl(oembed, { signal: AbortSignal.timeout(TIMEOUT) })
      if (response.ok) {
        const data = await response.json()
        return {
          url,
          titre: data.title ?? url,
          source: data.author_name ?? null,
          media: 'video',
        }
      }
    } catch {
      // The link is still worth queueing without its title.
    }
    return { ...fallback, media: 'video' }
  }

  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT) })
    if (!response.ok) return fallback
    const type = response.headers.get('content-type') ?? ''
    if (type.startsWith('audio/')) return { url, titre: url.split('/').at(-1), source: host, media: 'audio' }
    if (!type.includes('html')) return { ...fallback, source: host }
    const html = (await response.text()).slice(0, HEAD)
    const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i.exec(html)
    const title = og?.[1] ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
    const site = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i.exec(html)
    const audio = /<meta[^>]+property=["']og:audio["']/i.test(html)
    return {
      url,
      titre: title ? title.replace(/\s+/g, ' ').trim() : url,
      source: site?.[1] ?? host,
      media: audio ? 'audio' : null,
    }
  } catch {
    return fallback
  }
}

export default async function api(app, opts) {
  // The host says where the pages tree lives; its folder NAME is instance
  // configuration, not `pages` everywhere.
  const root = opts.pagesRoot
  const file = stateFile(opts.dataDir, opts.pluginId ?? 'listening-post')
  const cache = makeCache()

  /** One source's entries, cached — and its failure, reported rather than hidden. */
  async function pull(source, { fresh = false } = {}) {
    const id = `feed:${source.flux}`
    if (!fresh) {
      const hit = cache.get(id)
      if (hit) return hit
    }
    try {
      const response = await fetch(source.flux, {
        signal: AbortSignal.timeout(TIMEOUT),
        headers: { accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml' },
      })
      if (!response.ok) return { source: source.id, ok: false, error: `HTTP ${response.status}`, entries: [] }
      const entries = parseFeed(await response.text(), source)
      // Only a SUCCESS is cached: a transient failure is not an absence of
      // episodes, and caching it would keep a source silent for a quarter of
      // an hour after it came back.
      return cache.set(id, FEED_TTL, { source: source.id, ok: true, error: null, entries })
    } catch (error) {
      return { source: source.id, ok: false, error: error.message, entries: [] }
    }
  }

  /** Read once per request: a transcript is a file, and files change. */
  async function transcriptOf(item) {
    if (!item.transcript) return null
    const id = `txt:${item.transcript}`
    const hit = cache.get(id)
    if (hit) return hit
    try {
      return cache.set(id, 60_000, parseTranscript(await readFile(join(root, item.transcript), 'utf8')))
    } catch {
      return null
    }
  }

  app.get('/sources', async () => {
    const { sources, problems, files } = await readSources(root)
    return { sources, problems, declaredIn: files }
  })

  app.get('/queue', async (request) => {
    const fresh = request.query.refresh === '1'
    const { sources, problems } = await readSources(root)
    const state = await readState(file)
    const library = await readLibrary(root, keyOf)

    const pulled = await Promise.all(sources.map((source) => pull(source, { fresh })))
    const items = buildQueue({
      entries: pulled.flatMap((answer) => answer.entries),
      dropped: state.dropped,
      dismissed: state.dismissed,
      library,
    })

    return {
      items,
      // Said out loud, per source: a queue that is short because two feeds
      // timed out must not read as a quiet week.
      sources: pulled.map((answer) => ({
        id: answer.source,
        ok: answer.ok,
        error: answer.error,
        count: answer.entries.length,
      })),
      problems,
      dismissed: Object.keys(state.dismissed).length,
      fetchedAt: stamp(),
    }
  })

  app.get('/library', async () => {
    const items = await readLibrary(root, keyOf)
    return {
      items: items.map((item) => ({ ...item, assets: assetsFor(item.path) })),
    }
  })

  app.post('/drop', async (request, reply) => {
    const url = String(request.body?.url ?? '').trim()
    if (!/^https?:\/\//i.test(url)) return reply.code(400).send({ error: 'not a link' })
    const key = keyOf(url)
    if (!key) return reply.code(400).send({ error: 'not a link' })

    const resolved = await resolveLink(url)
    const state = await readState(file)
    state.dropped[key] = {
      ...resolved,
      note: request.body?.note ? String(request.body.note).slice(0, 400) : null,
      ts: stamp(),
    }
    // Dropping a link that had been waved away is a change of mind, and the
    // change of mind wins.
    delete state.dismissed[key]
    await writeState(file, state)
    return { key, ...state.dropped[key] }
  })

  app.post('/dismiss', async (request, reply) => {
    const key = String(request.body?.key ?? '').trim()
    if (!key) return reply.code(400).send({ error: 'no key' })
    const state = await readState(file)
    state.dismissed[key] = { ts: stamp(), titre: request.body?.titre ? String(request.body.titre).slice(0, 200) : null }
    delete state.dropped[key]
    await writeState(file, state)
    return { key, dismissed: true }
  })

  app.post('/restore', async (request, reply) => {
    const key = String(request.body?.key ?? '').trim()
    if (!key) return reply.code(400).send({ error: 'no key' })
    const state = await readState(file)
    delete state.dismissed[key]
    await writeState(file, state)
    return { key, dismissed: false }
  })

  app.get('/dismissed', async () => {
    const state = await readState(file)
    return {
      items: Object.entries(state.dismissed).map(([key, value]) => ({ key, ...value })),
    }
  })

  /**
   * Where a subject was talked about, across everything transcribed.
   *
   * This is the retrieval half of the plugin and it is deliberately DUMB: it
   * says which passages contain the words and at which second. It ranks
   * nothing about worth — that judgement is the agent's, in chat, with the
   * question that was actually asked.
   */
  app.get('/search', async (request, reply) => {
    const query = String(request.query.q ?? '').trim()
    if (query.length < 3) return reply.code(400).send({ error: 'query too short' })
    const limit = Math.min(Number(request.query.limit) || 20, 50)

    const library = await readLibrary(root, keyOf)
    const results = []
    for (const item of library) {
      const lines = await transcriptOf(item)
      if (!lines) continue
      const hits = search(lines, query, { limit: 4 })
      if (hits.length === 0) continue
      results.push({
        path: item.path,
        titre: item.titre,
        url: item.url,
        media: item.media,
        source: item.source,
        publie: item.publie,
        score: hits.reduce((total, hit) => total + hit.score, 0),
        hits: hits.map((hit) => ({ ...hit, lien: deepLink(item.url, hit.t) })),
      })
    }
    results.sort((a, b) => b.score - a.score)

    return {
      query,
      results: results.slice(0, limit),
      // How much of the library is even searchable. A miss over three
      // transcribed items out of forty is not the same answer as a miss over
      // forty out of forty, and the screen says which.
      transcrits: library.filter((item) => item.transcript).length,
      total: library.length,
    }
  })

  app.get('/transcript', async (request, reply) => {
    const page = safePath(root, request.query.page, { suffix: '.md' })
    if (!page) return reply.code(400).send({ error: 'not a page path' })
    // The path as the WORKSPACE spells it, not as the query string spelled
    // it: `veille/../veille/x.md` is the same page and must not become a
    // different assets folder.
    const { transcript, media } = assetsFor(relative(root, page).split(sep).join('/'))
    const path = join(root, transcript)
    if (!(await exists(path))) return reply.code(404).send({ error: 'no transcript', expected: transcript })
    const lines = parseTranscript(await readFile(path, 'utf8'))
    let meta = null
    if (await exists(join(root, media))) {
      try {
        meta = JSON.parse(await readFile(join(root, media), 'utf8'))
      } catch {
        meta = null
      }
    }
    return { path: transcript, lines, meta }
  })

  /**
   * Whether the transcriber exists on this instance.
   *
   * The plugin runs without it — feeds, queue, library and the search over
   * whatever was already transcribed all work — so this is not a health check
   * but an honesty one: the screen must say "no transcriber here" rather than
   * offer a button that fails in a terminal nobody is watching.
   */
  app.get('/health', async () => {
    const { execFile } = await import('node:child_process')
    const version = await new Promise((done) => {
      const child = execFile('yt-dlp', ['--version'], { timeout: 5000 }, (error, stdout) =>
        done(error ? null : String(stdout).trim()),
      )
      child.on('error', () => done(null))
    })
    return { transcriber: version ? { name: 'yt-dlp', version } : null }
  })
}
