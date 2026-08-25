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
import { folderOf, resolve, restOf, routeOf } from './address.js'

/** What the engine escapes with before putting anything in innerHTML. */
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  )

/**
 * Which of the engine's two screens a hash means.
 *
 * Resolved here rather than by the shell: these are the plugin's own paths,
 * and the shell has no business knowing their shape.
 *
 * NOT to be confused with the contract's `routeFor`, which this file also
 * has no business implementing under the same name — that one answers the
 * SHELL (a workspace folder in, one of our routes out), this one answers a
 * hash and returns a screen to draw. It was called `routeFor` until the two
 * met in the same file.
 */
function screenFor(routes, workbook) {
  return workbook === undefined ? () => routes.atelier() : () => routes['atelier/'](workbook)
}

export default function view(api) {
  /**
   * Project folder → the `workbook.json` that IS its bench.
   *
   * What makes a short address possible: a NAME only resolves against a
   * listing, and a link is drawn synchronously. Primed from the same endpoint
   * the tile reads, refreshed whenever the hub renders — see `address.js` for
   * what the map buys and what it refuses to guess.
   */
  const books = new Map()
  /** The request in flight, so a mount and a cold link share one fetch. */
  let priming

  /** Everything a listing teaches about where benches live. */
  function learn(list) {
    for (const book of list ?? []) {
      if (typeof book?.path === 'string') books.set(folderOf(book.path), book.path)
    }
  }

  function prime() {
    priming ??= (async () => {
      try {
        const response = await api.fetch(`/api/plugin/${api.id}/workbooks`)
        if (!response.ok) return
        learn((await response.json()).workbooks)
      } catch {
        // A listing that will not load costs the short address, never the
        // bench: the long form resolves without it.
      } finally {
        priming = undefined
      }
    })()
    return priming
  }

  // Primed at LOAD, not at mount: the shell asks where a project folder opens
  // while drawing a breadcrumb or a brief card, from screens where this view
  // is nowhere in sight. Waiting for someone to open the bench would mean
  // answering nothing until they did.
  void prime()

  /** A workbook's address, in the shortest form that resolves back to it. */
  const href = (path) => `#${routeOf(books, path)}`

  function Atelier() {
    const host = useRef(null)
    /** Bumped on every hash change, to re-run the engine. */
    const [tick, setTick] = useState(0)

    useEffect(() => {
      // Opening the bench is when a workbook written since boot shows up — so
      // the index a short address resolves against is refreshed here.
      void prime()
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
        // The engine's trail goes to the SHELL's header, which is where a
        // breadcrumb belongs. It used to be drawn inside this panel — the two
        // competing ones this comment always warned about, one under the
        // other, with the shell's stopping at "L'Atelier" whatever bench was
        // open. The shell drops what repeats it (Accueil, the hub) and draws
        // the rest.
        crumbs: (items) =>
          api.trail(
            (items ?? []).map((crumb) => ({
              label: String(crumb?.label ?? '…'),
              ...(crumb?.hash ? { route: String(crumb.hash).replace(/^#/, '') } : {}),
            })),
          ),
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
        // The engine links to workbooks — hub cards, its own crumbs — and the
        // shape of a bench's address is decided in ONE place. Two spellings of
        // the same link is how a URL scheme rots.
        href,
        // The hub fetches the listing anyway, and a short address needs it:
        // handing it over is what makes the hub's own cards short on the FIRST
        // paint rather than after a second request nobody waited for.
        learn,
        // The launcher's icon set, of which the engine uses exactly one. It
        // is the atelier's own header mark, so it moved with the atelier
        // rather than becoming a host contract nobody else would want.
        IC: {
          shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/></svg>',
        },
      })

      // A NAME has to be looked up before it means a workbook, and a cold
      // link is exactly the case where the listing has not landed. The long
      // form still resolves without it — see `address.js`.
      let cancelled = false
      void (async () => {
        const rest = restOf(location.hash)
        let workbook = resolve(books, rest)
        if (rest !== '' && workbook === undefined) {
          await prime()
          workbook = resolve(books, rest)
        }
        if (cancelled) return
        void screenFor(engine.current.routes, workbook)()
      })()
      return () => {
        cancelled = true
      }
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
      // No breadcrumb here: it is published to the shell's header, which had
      // one already. The engine writes into the node below and nothing else
      // touches it — which is what lets React and innerHTML coexist without
      // fighting over the DOM.
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

  /**
   * Where a project folder opens — on its bench.
   *
   * The atelier cannot declare `absorbs`: its benches sit in whatever project
   * folders exist (`domaines/diy/projets/rangement-garage`), and no folder
   * NAME covers them — `projets` is a word half a workspace uses, `diy` is a
   * domain full of notes this app does not draw. So it claims a path by
   * KNOWING it: a folder is a workbench because a workbook is filed in it,
   * which only this listing can say.
   *
   * The walk climbs, so a note filed beside the workbook answers for the same
   * bench. A folder with no workbook answers nothing and keeps the shell's own
   * section — the screen it always had.
   */
  function routeFor(path) {
    let candidate = String(path ?? '')
    while (candidate !== '') {
      const book = books.get(candidate)
      if (book) return routeOf(books, book)
      const cut = candidate.lastIndexOf('/')
      if (cut === -1) break
      candidate = candidate.slice(0, cut)
    }
    return undefined
  }

  // Declared, and not merely reachable from a tile: the engine's second screen
  // is a workbook, addressed by its path under this route. The shell keeps the
  // view open for everything below `/atelier`, so a bench can bookmark the
  // exact workbook it is cutting and come back to it.
  return { component: Atelier, route: '/atelier', routeFor, tileInfo }
}
