/**
 * A trip's address — how one is written, and how one is read back.
 *
 * The first shape shipped was the one the plugin had lying around:
 * `#/voyages/domaines%2Fvoyages%2Fbaden-2026%2Fassets%2Fvoyage.json`. It works,
 * and it says three things nobody should have to read. `assets/voyage.json` is
 * STORAGE — the reader does not need to know a trip is a JSON file in a
 * sub-folder, and every other part of this product hides exactly that.
 * `%2F` is a slash the fragment never needed escaped (RFC 3986 allows `/`
 * there). And `voyages` twice over is the operator's filing leaking into a
 * link, so moving the folder kills the bookmark.
 *
 * What the old shape bought is worth keeping: the address IS the truth, so
 * there is no registry of ids to maintain and the agent can link to a trip
 * without asking anybody. So the short form is a NAME the listing resolves,
 * never an id somebody has to allocate:
 *
 *   #/voyages/baden-2026                                   what we write
 *   #/voyages/domaines/voyages/baden-2026                  when the name is taken twice
 *   #/voyages/domaines%2F…%2Fvoyage.json                   still read, forever
 *
 * The last line is the whole migration plan: nothing that was ever written
 * down — a bookmark, a link the agent put in a page months ago — stops
 * working. Recognising a shape costs nothing; breaking a link costs trust.
 *
 * Pure on purpose: everything here takes the listing as an argument, so the
 * rules are testable without a browser, a fetch, or a trip.
 */

/** The route this plugin answers on. */
export const ROUTE = '/voyages'

/** The file that IS a trip, inside the folder that holds it. */
const ASSET = 'assets/voyage.json'

/** `domaines/voyages/baden-2026/assets/voyage.json` → `domaines/voyages/baden-2026`. */
export function folderOf(path) {
  return String(path ?? '').replace(new RegExp(`/${ASSET}$`), '')
}

/** A trip's shortest name: the folder it lives in. */
export function slugOf(folder) {
  return String(folder ?? '').split('/').filter(Boolean).at(-1) ?? ''
}

/**
 * Segments encoded, slashes left alone.
 *
 * `encodeURIComponent` on the whole path is what produced the `%2F` soup: it
 * escapes the one character that was already legal in a fragment, and only
 * that one is worth keeping readable.
 */
function encodePath(path) {
  return String(path ?? '')
    .split('/')
    .map(encodeURIComponent)
    .join('/')
}

/**
 * Where to link a trip, in the shortest form that resolves BACK to it.
 *
 * The name alone only when the listing proves it is unambiguous — a trip
 * absent from the listing, or one whose folder name is taken twice, gets the
 * folder path. A pretty link that opens the wrong trip is not an improvement
 * on an ugly one, and "silently the wrong screen" is the failure mode this
 * whole function exists to refuse.
 *
 * @param trips folder → its `voyage.json`, the listing this plugin holds
 * @param path the trip's `voyage.json`
 */
export function routeOf(trips, path) {
  const folder = folderOf(path)
  const slug = slugOf(folder)
  const named = [...trips.keys()].filter((known) => slugOf(known) === slug)
  const unambiguous = named.length === 1 && named[0] === folder
  return `${ROUTE}/${unambiguous ? encodeURIComponent(slug) : encodePath(folder)}`
}

/**
 * The trip an address names, or `undefined` for the hub.
 *
 * Three shapes are read, in the order that costs the least: the long form
 * answers without the listing at all, so a cold bookmark opens a trip without
 * waiting on a fetch.
 *
 * An ambiguous name resolves to NOTHING rather than to a guess. Landing on
 * the hub — "here are the trips, say which" — is an honest answer to an
 * ambiguous request; opening one of two at random is not.
 *
 * @param trips folder → its `voyage.json`
 * @param rest what follows `#/voyages/`, still encoded
 */
export function resolve(trips, rest) {
  const asked = String(rest ?? '')
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        // A stray `%` in a hash somebody typed: read it as itself rather than
        // throwing out of a router.
        return segment
      }
    })
    .join('/')
  if (asked === '') return undefined
  if (asked.endsWith(`/${ASSET}`)) return asked
  if (trips.has(asked)) return trips.get(asked)
  const named = [...trips.keys()].filter((known) => slugOf(known) === asked)
  return named.length === 1 ? trips.get(named[0]) : undefined
}

/** What follows `#/voyages/` in a hash — `''` for the hub itself. */
export function restOf(hash) {
  return String(hash ?? '').replace(/^#?\/?voyages\/?/, '')
}
