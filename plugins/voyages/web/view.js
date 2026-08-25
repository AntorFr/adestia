/**
 * The adapter: Golem's view contract on one side, the ported engine on the
 * other.
 *
 * The engine renders with innerHTML into an element it is handed and asks its
 * host for a handful of small functions. That is the entire coupling — which
 * is what let a screen's worth of debugged drag-and-drop cross over without a
 * line of its own logic changing.
 *
 * Two things this shim does that the predecessor's launcher did not:
 *
 * - the dialog lives INSIDE the plugin's subtree rather than on
 *   `document.body`, so unmounting the view takes it with it. The atelier port
 *   had to sweep the body by class name on teardown; this one has nothing to
 *   sweep.
 * - the engine is built ONCE and routed afterwards. Rebuilding it per
 *   navigation was the leak that put a modal behind every click.
 */

import { createElement as h, useEffect, useRef, useState } from 'react'

import createVoyagesApp from './app.js'
import { folderOf, resolve, restOf, routeOf } from './address.js'

/** What the engine escapes with before putting anything in innerHTML. */
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  )

/**
 * A status's tone, and whether it means the trip is over.
 *
 * The shell's own tables live in TypeScript the plugin cannot import — a
 * plugin importing the shell would be the cycle the contract exists to
 * prevent. So the vocabulary a TRIP writes is transcribed here: it is small,
 * closed, and documented next door in the skill.
 */
const TONES = {
  'idée': 'underway',
  idee: 'underway',
  'prépa': 'underway',
  prepa: 'underway',
  'en-cours': 'underway',
  'en cours': 'underway',
  clos: 'settled',
  'terminé': 'settled',
  termine: 'settled',
}
const normalise = (status) => String(status ?? '').toLowerCase().trim()
const tone = (status) => TONES[normalise(status)] ?? 'underway'
const finished = (status) => tone(status) === 'settled'


export default function view(api) {
  /**
   * Trip folder → the `voyage.json` that IS the trip, for `routeFor`.
   *
   * The shell asks where a folder opens while it draws a link, so the answer
   * has to be immediate — no fetch, no promise. What it costs is this map,
   * primed from the same listing the tile reads and refreshed whenever the
   * view mounts: opening the app is exactly when a new trip appears.
   *
   * A trip missing from it (created in another tab, listing not back yet)
   * simply gets no answer, and the shell falls back to its own section — the
   * screen the reader had before any of this. GUESSING a path instead would
   * send them to "unreadable trip" for every notes folder filed under
   * `voyages/`, which is a worse answer than the honest generic one.
   */
  const trips = new Map()
  /** The request in flight, so a mount and a cold link share one fetch. */
  let priming

  /** Everything a listing teaches about where trips live. */
  function learn(list) {
    for (const trip of list ?? []) {
      if (typeof trip?.path === 'string') trips.set(folderOf(trip.path), trip.path)
    }
  }

  function prime() {
    priming ??= (async () => {
      try {
        const response = await api.fetch(`/api/plugin/${api.id}/voyages`)
        if (!response.ok) return
        learn((await response.json()).voyages)
      } catch {
        // A listing that will not load costs the shortcut, never the view: the
        // links it would have dressed keep working, generically.
      } finally {
        // Cleared so the NEXT mount sees a trip framed since — the map is a
        // cache of what exists, not a decision taken once at boot.
        priming = undefined
      }
    })()
    return priming
  }
  void prime()

  /** A trip's address, in the shortest form that resolves back to it. */
  const href = (path) => `#${routeOf(trips, path)}`

  function Voyages() {
    const host = useRef(null)
    const engine = useRef(null)
    /** Bumped on every hash change, to re-route the engine. */
    const [tick, setTick] = useState(0)

    useEffect(() => {
      // Opening the app is when a trip framed since boot shows up — so the
      // map `routeFor` answers from is refreshed here rather than only once.
      void prime()
      const onHash = () => setTick((value) => value + 1)
      window.addEventListener('hashchange', onHash)
      return () => window.removeEventListener('hashchange', onHash)
    }, [])

    useEffect(() => {
      const page = host.current
      if (!page) return

      if (!engine.current) {
        engine.current = createVoyagesApp({
          page,
          esc,
          locale: api.locale,
          // The engine's trail goes to the SHELL's header, which is where a
          // breadcrumb belongs. It used to be drawn inside this panel — the
          // two competing ones this comment always warned about, one under the
          // other, with the shell's stopping at "Voyages" whatever trip was
          // open. The shell drops what repeats it (Home, the hub) and draws
          // the rest.
          crumbs: (items) =>
            api.trail(
              (items ?? []).map((crumb) => ({
                label: String(crumb?.label ?? '…'),
                ...(crumb?.hash ? { route: String(crumb.hash).replace(/^#/, '') } : {}),
              })),
            ),
          // The plugin's own API, without the engine knowing where it is
          // mounted — a plugin that hardcoded its prefix could not be renamed.
          call: (path, init) => api.fetch(`/api/plugin/${api.id}${path}`, init),
          // The shell's routes, for the one thing a trip needs from it: the
          // index of pages, to list what its folder holds.
          shellFetch: (path, init) => api.fetch(path, init),
          tone,
          finished,
          openPage: (path) => {
            window.location.hash = `#/page/${path.split('/').map(encodeURIComponent).join('/')}`
          },
          // The engine links to trips — hub cards, its own crumbs — and the
          // shape of a trip's address is decided in ONE place. Two spellings
          // of the same link is how a URL scheme rots.
          href,
          // The hub fetches the listing anyway, and a short address needs it:
          // handing it over here is what makes the hub's own cards short on
          // the FIRST paint, rather than after a second request nobody waited
          // for.
          learn,
        })
        // Inside the subtree, so unmounting the view takes the dialog with it.
        page.parentElement?.append(engine.current.modal)
      }

      // A NAME has to be looked up before it means a trip, and a cold link is
      // exactly the case where the listing has not landed yet. The long form
      // still resolves without it — see `address.js`.
      let cancelled = false
      void (async () => {
        const rest = restOf(window.location.hash)
        let trip = resolve(trips, rest)
        if (rest !== '' && trip === undefined) {
          await prime()
          trip = resolve(trips, rest)
        }
        if (cancelled) return
        void (trip ? engine.current.voyage(trip) : engine.current.hub())
      })()
      return () => {
        cancelled = true
      }
    }, [tick])

    return h('section', { className: 'voyages' }, [
      // No breadcrumb here: it is published to the shell's header, which had
      // one already. The engine writes into the node below and nothing else
      // touches it — which is what lets React and innerHTML coexist without
      // fighting over the DOM.
      h('div', { key: 'p', ref: host, className: 'voyages-page' }),
    ])
  }

  /**
   * What the tile says before anyone opens it.
   *
   * The next departure, because that is a trip's actual question — "when do we
   * leave" long before "how many trips are there". Only the suggestions run
   * hot: they are the ones waiting on a gesture from a person.
   */
  async function tileInfo() {
    const response = await api.fetch(`/api/plugin/${api.id}/voyages`)
    if (!response.ok) return undefined
    const { voyages } = await response.json()
    if (voyages.length === 0) return undefined

    const today = new Date().toISOString().slice(0, 10)
    const next = voyages.find((trip) => trip.debut && trip.fin && trip.fin >= today)
    const days = next ? Math.ceil((Date.parse(next.debut) - Date.parse(today)) / 86_400_000) : 0
    const suggestions = voyages.reduce((sum, trip) => sum + (trip.suggestions ?? 0), 0)

    // The plugin's own words, in the instance's language — the same contract
    // its screens follow. A tile is the first thing anybody reads, and it was
    // the one place this plugin still spoke English on a French instance.
    const fr = api.locale === 'fr'
    const trips = fr
      ? `${voyages.length} voyage${voyages.length === 1 ? '' : 's'}`
      : `${voyages.length} trip${voyages.length === 1 ? '' : 's'}`
    const sort = fr
      ? `${suggestions} à trier`
      : `${suggestions} to sort`
    const away = days > 0 ? `J-${days}` : fr ? 'en cours' : 'under way'

    return {
      ...(next ? { subtitle: `${next.titre} — ${away}` } : {}),
      chips: [{ text: trips }, ...(suggestions > 0 ? [{ text: sort, hot: true }] : [])],
    }
  }

  /**
   * Where a folder the tile stands for opens — one trip, on its timeline.
   *
   * `absorbs` in the manifest says this app covers `voyages/`; without this,
   * that claim held on the launcher alone and every link INTO a trip — the
   * breadcrumb out of one of its pages, a bookmark, a target the agent wrote
   * — landed on the generic list of files. A trip is addressed by the
   * `voyage.json` it carries, which the shell has no way of knowing.
   *
   * A page deeper than the trip folder still belongs to that trip, so the
   * walk climbs: `.../broceliande-2026/jours` answers for Brocéliande rather
   * than for nothing.
   */
  function routeFor(folder) {
    let candidate = String(folder ?? '')
    while (candidate !== '') {
      const trip = trips.get(candidate)
      if (trip) return routeOf(trips, trip)
      const cut = candidate.lastIndexOf('/')
      if (cut === -1) break
      candidate = candidate.slice(0, cut)
    }
    // The `voyages` folder ITSELF is the shell's to answer: its tile route is
    // the hub, and restating that here would be this plugin describing a rule
    // it does not own.
    return undefined
  }

  // A route owns its descendants, so `/voyages/<path>` reaches one trip and a
  // bookmark survives a reload — the thing a screen full of state cannot do.
  return { component: Voyages, route: '/voyages', routeFor, tileInfo }
}
