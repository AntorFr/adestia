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

/** `#/voyages/<encoded path>` → the trip, anything else → the hub. */
function tripOf(hash) {
  const rest = String(hash ?? '').replace(/^#?\/?voyages\/?/, '')
  return rest === '' ? undefined : decodeURIComponent(rest)
}

export default function view(api) {
  function Voyages() {
    const host = useRef(null)
    const engine = useRef(null)
    const [crumbs, setCrumbs] = useState([])
    /** Bumped on every hash change, to re-route the engine. */
    const [tick, setTick] = useState(0)

    useEffect(() => {
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
          // Breadcrumbs become React state rather than DOM the engine owns:
          // the shell already has a header, and two competing ones would look
          // like a bug rather than a feature.
          crumbs: (items) => setCrumbs(items ?? []),
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
        })
        // Inside the subtree, so unmounting the view takes the dialog with it.
        page.parentElement?.append(engine.current.modal)
      }

      const trip = tripOf(window.location.hash)
      void (trip ? engine.current.voyage(trip) : engine.current.hub())
    }, [tick])

    return h('section', { className: 'voyages' }, [
      crumbs.length > 0 &&
        h(
          'nav',
          { key: 'c', className: 'voyages-crumbs' },
          crumbs.map((crumb, index) =>
            h('a', { key: `${crumb.hash}-${index}`, href: crumb.hash ?? '#' }, crumb.label ?? '…'),
          ),
        ),
      // The engine writes into this and nothing else touches it — which is what
      // lets React and innerHTML coexist without fighting over the DOM.
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

    return {
      ...(next ? { subtitle: `${next.titre} — ${days > 0 ? `J-${days}` : '…'}` } : {}),
      chips: [
        { text: `${voyages.length} trip${voyages.length === 1 ? '' : 's'}` },
        ...(suggestions > 0 ? [{ text: `${suggestions} to sort`, hot: true }] : []),
      ],
    }
  }

  // A route owns its descendants, so `/voyages/<path>` reaches one trip and a
  // bookmark survives a reload — the thing a screen full of state cannot do.
  return { component: Voyages, route: '/voyages', tileInfo }
}
