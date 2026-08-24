/**
 * The adapter: Golem's view contract on one side, the ported engine on the
 * other.
 *
 * `app.js` renders with innerHTML into an element it is handed, and asks its
 * host for six small functions. That is the entire coupling — which is why a
 * thousand lines of debugged domain rendering could be carried across without
 * a single change to how it draws anything.
 *
 * The shim below is that host, rewritten for Golem. Each function is either
 * the same job done differently (breadcrumbs, headers) or a job that does not
 * exist here and is honestly stubbed rather than faked.
 */

import { createElement as h, useEffect, useRef, useState } from 'react'

import createAtelierApp from './app.js'

/** What the engine escapes with before putting anything in innerHTML. */
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  )

/**
 * Which of the engine's two routes a hash means.
 *
 * Resolved here rather than by the shell: these are the plugin's own paths,
 * and the shell has no business knowing their shape.
 */
function routeFor(routes, hash) {
  const path = String(hash ?? '').replace(/^#?\/?/, '')
  if (path.startsWith('atelier/')) {
    const rest = decodeURIComponent(path.slice('atelier/'.length))
    return () => routes['atelier/'](rest)
  }
  return () => routes.atelier()
}

export default function view(api) {
  function Atelier() {
    const host = useRef(null)
    const [crumbs, setCrumbs] = useState([])
    /** Bumped on every hash change, to re-run the engine. */
    const [tick, setTick] = useState(0)

    useEffect(() => {
      const onHash = () => setTick((value) => value + 1)
      window.addEventListener('hashchange', onHash)
      return () => window.removeEventListener('hashchange', onHash)
    }, [])

    /**
     * The engine, built once.
     *
     * It appends its modal and its full-screen bench to `document.body` at
     * construction, so constructing it per navigation would leave one of each
     * behind on every click. Built here, routed below.
     */
    const engine = useRef(null)

    useEffect(() => {
      const page = host.current
      if (!page) return

      engine.current ??= createAtelierApp({
        page,
        esc,
        // Breadcrumbs become React state rather than DOM the engine owns: the
        // shell already has a header, and two competing ones would look like a
        // bug rather than a feature.
        crumbs: (items) => setCrumbs(items ?? []),
        // Auth is the session cookie here, so the only header that still
        // matters is the content type on a write.
        headers: (json) => (json ? { 'content-type': 'application/json' } : {}),
        // The engine can put a message in the chat. Mapped to `ask`, which
        // SENDS — the atelier only ever calls it to hand work to the agent.
        add: (_cls, text) => api.ask(String(text ?? '')),
        // Frontmatter chips belong to the shell's page views, not here. An
        // empty list is the truthful answer; inventing chips would put labels
        // on screen that mean nothing.
        chipsOf: () => [],
        // The launcher's icon set, of which the engine uses exactly one. It
        // is the atelier's own header mark, so it moved with the atelier
        // rather than becoming a host contract nobody else would want.
        IC: {
          shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/></svg>',
        },
      })

      void routeFor(engine.current.routes, location.hash)()
    }, [tick])

    // What the engine put on `document.body` leaves with the view. It exposes
    // no teardown of its own — it never needed one in a shell that was never
    // unmounted — so the shell removes what it can see, by the classes the
    // engine gives those nodes.
    useEffect(
      () => () => {
        for (const node of document.querySelectorAll('body > .atelier-modal, body > .atelier-full')) {
          node.remove()
        }
      },
      [],
    )

    return h('section', { className: 'atelier' }, [
      crumbs.length > 0 &&
        h(
          'nav',
          { key: 'c', className: 'atelier-crumbs' },
          crumbs.map((crumb, index) =>
            h(
              'a',
              { key: `${crumb.hash}-${index}`, href: crumb.hash ?? '#' },
              crumb.label ?? '…',
            ),
          ),
        ),
      // The engine writes into this and nothing else touches it — which is
      // what lets React and innerHTML coexist without fighting over the DOM.
      h('div', { key: 'p', ref: host, className: 'atelier-page' }),
    ])
  }

  /**
   * What the tile says before anyone opens the bench.
   *
   * Steps rather than workbooks, because a workshop's question is "how much is
   * left to cut", not "how many files are there". Nothing is hot: a cutting
   * plan is never overdue, it is simply unfinished.
   */
  async function tileInfo() {
    const response = await api.fetch('/api/plugin/atelier/workbooks')
    if (!response.ok) return undefined
    const { workbooks } = await response.json()
    if (workbooks.length === 0) return undefined

    const done = workbooks.reduce((sum, book) => sum + (book.done ?? 0), 0)
    const total = workbooks.reduce((sum, book) => sum + (book.total ?? 0), 0)
    return {
      subtitle: workbooks.length === 1 ? workbooks[0].titre : undefined,
      chips: [
        { text: `${workbooks.length} workbook${workbooks.length === 1 ? '' : 's'}` },
        ...(total > 0 ? [{ text: `${done}/${total} steps` }] : []),
      ],
    }
  }

  // Declared, and not merely reachable from a tile: the engine's second screen
  // is a workbook, addressed by its path under this route. The shell keeps the
  // view open for everything below `/atelier`, so a bench can bookmark the
  // exact workbook it is cutting and come back to it.
  return { component: Atelier, route: '/atelier', tileInfo }
}
