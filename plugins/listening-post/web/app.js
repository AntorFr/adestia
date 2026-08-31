/**
 * The listening post's screen: what is waiting, what was kept, and where a
 * subject was actually talked about.
 *
 * Three convictions are visible in this file.
 *
 * **The queue is not memory.** Candidates come from the feeds and from the
 * drop box, and live in the instance's data directory. Only what somebody
 * decides to keep becomes a page — written by the agent, or by the shell's own
 * editor on the item's screen. No button here writes a page behind anybody's
 * back.
 *
 * **The screen never recommends.** It shows what arrived, freshest first, and
 * says which sources answered. Ranking would be this file inventing a number
 * for something it cannot judge; the recommendation is a conversation — which
 * is what the ✦ buttons are for, and why they go through `api.ask` rather
 * than through an endpoint of ours.
 *
 * **Search is over what was SAID.** The corpus is the transcripts, and the
 * answer is a timestamp with a link that opens the media at that second. That
 * is the whole product: the extract, not the guess.
 */

import { createElement as h, useCallback, useEffect, useMemo, useState } from 'react'

import {
  ROUTE,
  briefPrompt,
  buildLibrary,
  extractPrompt,
  formatWhen,
  glyphOf,
  linkAt,
  resolve,
  restOf,
  routeFor as addressOf,
  routeOf,
  stampOf,
  words,
} from './model.js'

export default function view(api) {
  const t = words(api.locale)

  /**
   * Every kept item, primed for `routeFor`.
   *
   * The shell asks where a path opens while it draws a LINK — on the
   * launcher, in a breadcrumb, in a page the agent wrote — long before this
   * view has mounted. So the listing is held here and refreshed on every
   * mount rather than read from component state.
   */
  let known = []

  const at = (path) => `/api/plugin/${api.id}${path}`
  const post = (path, body) =>
    api.fetch(at(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  const refresh = async () => {
    const response = await api.fetch('/api/pages/index')
    if (!response.ok) throw new Error(`the page index answered ${response.status}`)
    const { entries } = await response.json()
    known = buildLibrary(Array.isArray(entries) ? entries : [])
    return known
  }

  // Primed at load, so the first link drawn is already the short form rather
  // than the path form an empty listing falls back to.
  void refresh().catch(() => {})

  function Post() {
    const [library, setLibrary] = useState(null)
    const [error, setError] = useState(null)
    const [route, setRoute] = useState(() => location.hash.replace(/^#/, ''))

    const reload = useCallback(async () => {
      try {
        setLibrary(await refresh())
      } catch (cause) {
        setError(cause.message)
      }
    }, [])

    useEffect(() => {
      void reload()
    }, [reload])

    useEffect(() => {
      const apply = () => setRoute(location.hash.replace(/^#/, ''))
      window.addEventListener('hashchange', apply)
      return () => window.removeEventListener('hashchange', apply)
    }, [])

    const items = library ?? []
    const openPath = resolve(items, restOf(route))
    const open = openPath ? items.find((item) => item.path === openPath) : null

    // The shell draws the breadcrumb; this view only says where it is. `[]` is
    // not a no-op — the trail is cleared on every navigation, so the hub must
    // SAY nothing rather than leave the last item's title standing.
    useEffect(() => {
      api.trail(open ? [{ label: open.titre, route: routeOf(items, open.path) }] : [])
    }, [open?.path, open?.titre, library])

    if (error && !library) return h('p', { className: 'lp-problem' }, error)
    if (!library) return h('p', { className: 'lp-muted' }, t('Loading…'))
    return open
      ? h(One, { item: open, items, reload })
      : h(Hub, { items, reload, error })
  }

  /** The hub: search, what is waiting, what was kept. */
  function Hub({ items, reload, error }) {
    const [queue, setQueue] = useState(null)
    const [queueError, setQueueError] = useState(null)
    const [busy, setBusy] = useState(false)
    const [draft, setDraft] = useState('')
    const [query, setQuery] = useState('')
    const [results, setResults] = useState(null)
    const [health, setHealth] = useState(null)

    const load = useCallback(async (fresh = false) => {
      setBusy(true)
      setQueueError(null)
      try {
        const response = await api.fetch(at(`/queue${fresh ? '?refresh=1' : ''}`))
        if (!response.ok) throw new Error(`${response.status}`)
        setQueue(await response.json())
      } catch (cause) {
        setQueueError(cause.message)
      } finally {
        setBusy(false)
      }
    }, [])

    useEffect(() => {
      void load()
      // Whether anything can be transcribed at all. Asked once, and shown as
      // a plain sentence: a button that silently fails in a container nobody
      // is watching is worse than a button that is not offered.
      void api
        .fetch(at('/health'))
        .then((response) => (response.ok ? response.json() : null))
        .then(setHealth)
        .catch(() => {})
    }, [load])

    // `finished` is the CORE's verdict on whether a page's life is over — it
    // knows that `réalisé` closes a page while `acheté` closes only a
    // purchase. A table of statuses of our own here is the one thing
    // guaranteed to drift from the screen next door.
    const waiting = items.filter((item) => !item.finished)
    const kept = items.filter((item) => item.finished)

    const drop = async (event) => {
      event.preventDefault()
      const url = draft.trim()
      if (!url) return
      setBusy(true)
      try {
        const response = await post('/drop', { url })
        if (!response.ok) throw new Error(`${response.status}`)
        setDraft('')
        await load()
      } catch (cause) {
        setQueueError(cause.message)
      } finally {
        setBusy(false)
      }
    }

    const dismiss = async (candidate) => {
      setQueue((state) => ({
        ...state,
        items: (state?.items ?? []).filter((item) => item.key !== candidate.key),
      }))
      await post('/dismiss', { key: candidate.key, titre: candidate.titre }).catch(() => {})
    }

    const seek = async (event) => {
      event.preventDefault()
      const q = query.trim()
      if (q.length < 3) return
      setResults('…')
      try {
        const response = await api.fetch(at(`/search?q=${encodeURIComponent(q)}`))
        setResults(response.ok ? await response.json() : { results: [], error: `${response.status}` })
      } catch (cause) {
        setResults({ results: [], error: cause.message })
      }
    }

    return h(
      'div',
      { className: 'lp' },
      // No heading: the shell's breadcrumb already says where this is, and a
      // second title under it said it again — in the wrong words, since this
      // screen is the queue as much as the library.
      h(
        'header',
        { className: 'lp-head lp-head--bare' },
        h(
          'div',
          { className: 'lp-actions' },
          h(
            'button',
            { type: 'button', className: 'lp-ask', onClick: () => api.ask(briefPrompt()) },
            `✦ ${t("what's new?")}`,
          ),
          h(
            'button',
            { type: 'button', className: 'lp-quiet', disabled: busy, onClick: () => load(true) },
            `↺ ${t('refresh')}`,
          ),
        ),
      ),

      h(
        'form',
        { className: 'lp-seek', onSubmit: seek },
        h('input', {
          type: 'search',
          value: query,
          placeholder: t('search what was said'),
          'aria-label': t('search what was said'),
          onChange: (event) => setQuery(event.target.value),
        }),
        h('button', { type: 'submit' }, t('search')),
      ),

      results ? h(Results, { results, items, onClear: () => setResults(null) }) : null,

      error ? h('p', { className: 'lp-problem' }, error) : null,
      queueError ? h('p', { className: 'lp-problem' }, `${t('sources')} — ${queueError}`) : null,
      health && health.transcriber === null
        ? h('p', { className: 'lp-muted' }, `⚠ ${t('no transcriber on this instance')}`)
        : null,

      h(
        'section',
        { className: 'lp-section' },
        h('h3', null, t('to watch')),
        waiting.length === 0 && (queue?.items ?? []).length === 0
          ? h('p', { className: 'lp-muted' }, t('nothing waiting'))
          : null,
        waiting.length > 0
          ? h(
              'ul',
              { className: 'lp-cards' },
              waiting.map((item) => h(Kept, { key: item.path, item, items })),
            )
          : null,

        h(
          'div',
          { className: 'lp-fresh' },
          h('h4', null, t('in your sources')),
          h(Sources, { queue, busy }),
        ),
        queue?.items?.length
          ? h(
              'ul',
              { className: 'lp-cards' },
              queue.items.map((candidate) =>
                h(Candidate, { key: candidate.key, candidate, dismiss }),
              ),
            )
          : null,

        h(
          'form',
          { className: 'lp-drop', onSubmit: drop },
          h('input', {
            type: 'url',
            value: draft,
            placeholder: t('drop a link'),
            'aria-label': t('drop a link'),
            onChange: (event) => setDraft(event.target.value),
          }),
          h('button', { type: 'submit', disabled: busy || !draft.trim() }, t('add')),
        ),
      ),

      kept.length > 0
        ? h(
            'details',
            { className: 'lp-archive' },
            h('summary', null, `${t('archive')} · ${kept.length}`),
            h(
              'ul',
              { className: 'lp-cards' },
              kept.map((item) => h(Kept, { key: item.path, item, items })),
            ),
          )
        : null,
      items.length === 0 ? h('p', { className: 'lp-muted' }, t('nothing kept yet')) : null,
    )
  }

  /** Which sources answered, and which did not. Never a silent short list. */
  function Sources({ queue, busy }) {
    if (busy && !queue) return h('span', { className: 'lp-muted' }, t('Loading…'))
    if (!queue) return null
    const silent = (queue.sources ?? []).filter((source) => !source.ok)
    if ((queue.sources ?? []).length === 0) {
      return h('span', { className: 'lp-muted' }, t('no source declared yet'))
    }
    return h(
      'span',
      { className: silent.length > 0 ? 'lp-warn' : 'lp-muted' },
      `${queue.sources.length} ${t(queue.sources.length === 1 ? 'source' : 'sources')}${
        silent.length > 0
          ? ` · ${silent.length} ${t('silent')} (${silent.map((source) => `${source.id}: ${source.error}`).join(', ')})`
          : ''
      }`,
    )
  }

  /** A page somebody kept: it has an address of its own. */
  function Kept({ item, items }) {
    return h(
      'li',
      { className: `lp-card lp-card--${item.media}` },
      h('span', { className: 'lp-glyph' }, glyphOf(item)),
      h(
        'div',
        { className: 'lp-body' },
        h('a', { className: 'lp-title', href: `#${routeOf(items, item.path)}` }, item.titre),
        h(Meta, { item }),
      ),
      h(
        'div',
        { className: 'lp-buttons' },
        item.url
          ? h(
              'a',
              { className: 'lp-quiet', href: item.url, target: '_blank', rel: 'noreferrer' },
              `↗ ${t('open')}`,
            )
          : null,
      ),
    )
  }

  /** A candidate: a feed's entry, or a link somebody pasted. */
  function Candidate({ candidate, dismiss }) {
    return h(
      'li',
      { className: `lp-card lp-card--${candidate.media}` },
      h('span', { className: 'lp-glyph' }, candidate.media === 'audio' ? '🎧' : '🎬'),
      h(
        'div',
        { className: 'lp-body' },
        h(
          'a',
          { className: 'lp-title', href: candidate.url, target: '_blank', rel: 'noreferrer' },
          candidate.titre,
        ),
        h(Meta, { item: candidate }),
        candidate.note ? h('p', { className: 'lp-note' }, candidate.note) : null,
      ),
      h(
        'div',
        { className: 'lp-buttons' },
        h(
          'button',
          {
            type: 'button',
            className: 'lp-ask',
            title: t('extract'),
            onClick: () => api.ask(extractPrompt(candidate)),
          },
          `✦ ${t('extract')}`,
        ),
        h(
          'button',
          { type: 'button', className: 'lp-quiet', onClick: () => dismiss(candidate) },
          `✕ ${t('dismiss')}`,
        ),
      ),
    )
  }

  /** The line under a title: source, date, duration, tags. */
  function Meta({ item, tags = true }) {
    const bits = [
      item.source,
      formatWhen(item.publie, api.locale),
      item.duree,
      ...(tags ? (item.tags ?? []).map((tag) => `#${tag}`) : []),
    ].filter(Boolean)
    return h('p', { className: 'lp-meta' }, bits.join(' · '))
  }

  /** What the corpus says about a subject — timestamps, and links that seek. */
  function Results({ results, items, onClear }) {
    if (results === '…') return h('p', { className: 'lp-muted' }, t('Loading…'))
    const found = results.results ?? []
    return h(
      'section',
      { className: 'lp-results' },
      h(
        'div',
        { className: 'lp-results-head' },
        h(
          'h3',
          null,
          `« ${results.query ?? ''} » · ${found.length} ${t(found.length === 1 ? 'sheet' : 'sheets')} · ${found.reduce(
            (total, result) => total + result.hits.length,
            0,
          )} ${t('passages')}`,
        ),
        h('button', { type: 'button', className: 'lp-quiet', onClick: onClear }, '✕'),
      ),
      results.error ? h('p', { className: 'lp-problem' }, results.error) : null,
      found.length === 0
        ? h(
            'p',
            { className: 'lp-muted' },
            `${t('no result')} — ${t('searched')} ${results.transcrits ?? 0}/${results.total ?? 0} ${t('items')}`,
          )
        : null,
      h(
        'ul',
        { className: 'lp-hits' },
        found.map((result) =>
          h(
            'li',
            { key: result.path },
            h(
              'a',
              { className: 'lp-title', href: `#${routeOf(items, result.path)}` },
              result.titre,
            ),
            h('p', { className: 'lp-meta' }, [result.source, formatWhen(result.publie, api.locale)].filter(Boolean).join(' · ')),
            h(
              'ul',
              { className: 'lp-passages' },
              result.hits.map((hit) =>
                h(
                  'li',
                  { key: `${result.path}-${hit.t}` },
                  hit.lien
                    ? h(
                        'a',
                        { className: 'lp-stamp', href: hit.lien, target: '_blank', rel: 'noreferrer' },
                        stampOf(hit.t),
                      )
                    : h('span', { className: 'lp-stamp' }, stampOf(hit.t)),
                  h('span', null, ` ${hit.text}`),
                ),
              ),
            ),
          ),
        ),
      ),
    )
  }

  /**
   * One item: the page as the shell's own editor draws it, and beneath it
   * what was said.
   *
   * The editor is `api.PageEditor` — the same component `#/page/…` uses, with
   * its own reading posture, its own revision and its own conflict handling.
   * A second editor here would be a second grammar for the same file.
   */
  function One({ item, items, reload }) {
    const [transcript, setTranscript] = useState(null)
    const [filter, setFilter] = useState('')

    useEffect(() => {
      let cancelled = false
      setTranscript(null)
      api
        .fetch(at(`/transcript?page=${encodeURIComponent(item.path)}`))
        .then(async (response) => (response.ok ? response.json() : { lines: [], missing: true }))
        .then((data) => {
          if (!cancelled) setTranscript(data)
        })
        .catch(() => {
          if (!cancelled) setTranscript({ lines: [], missing: true })
        })
      return () => {
        cancelled = true
      }
    }, [item.path])

    const lines = useMemo(() => {
      const all = transcript?.lines ?? []
      const needle = filter.trim().toLowerCase()
      if (!needle) return all
      return all.filter((line) => line.text.toLowerCase().includes(needle))
    }, [transcript, filter])

    return h(
      'div',
      { className: 'lp lp-one' },
      h(
        'header',
        { className: 'lp-head' },
        h('h2', null, `${glyphOf(item)} ${item.titre}`),
        item.url
          ? h(
              'a',
              { className: 'lp-quiet', href: item.url, target: '_blank', rel: 'noreferrer' },
              `↗ ${t('open')}`,
            )
          : null,
      ),
      h(Meta, { item, tags: false }),
      h(api.PageEditor, { path: item.path, onSaved: reload }),

      h(
        'section',
        { className: 'lp-transcript' },
        h(
          'div',
          { className: 'lp-results-head' },
          h('h3', null, t('transcript')),
          transcript?.lines?.length
            ? h('input', {
                type: 'search',
                value: filter,
                placeholder: t('search'),
                'aria-label': t('search'),
                onChange: (event) => setFilter(event.target.value),
              })
            : null,
        ),
        !transcript
          ? h('p', { className: 'lp-muted' }, t('Loading…'))
          : transcript.lines?.length
            ? h(
                'ol',
                { className: 'lp-lines' },
                lines.map((line) =>
                  h(
                    'li',
                    { key: line.t },
                    item.url
                      ? h(
                          'a',
                          {
                            className: 'lp-stamp',
                            href: linkAt(item.url, line.t),
                            target: '_blank',
                            rel: 'noreferrer',
                          },
                          stampOf(line.t),
                        )
                      : h('span', { className: 'lp-stamp' }, stampOf(line.t)),
                    h('span', null, ` ${line.text}`),
                  ),
                ),
              )
            : h(
                'p',
                { className: 'lp-muted' },
                `${t('no transcript yet')}${transcript.expected ? ` (${transcript.expected})` : ''}`,
              ),
      ),
    )
  }

  return {
    component: Post,
    route: ROUTE,
    routeFor: (path) => addressOf(known, path),
    /**
     * The tile's own figures, from the page index alone — no feed is fetched
     * to draw a launcher. A number that costs a network round trip to three
     * podcast hosts is a launcher that hangs on a bad day.
     */
    tileInfo: async () => {
      const items = known.length > 0 ? known : await refresh().catch(() => [])
      const waiting = items.filter((item) => !item.finished)
      return {
        subtitle: `${items.length} ${t('kept')}`,
        chips: waiting.length > 0 ? [{ text: `${waiting.length} ${t('waiting')}`, hot: true }] : [],
      }
    },
  }
}
