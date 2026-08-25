/**
 * A workbook's address — how one is written, and how one is read back.
 *
 * The shape this replaces:
 * `#/atelier/domaines%2Fdiy%2Fprojets%2Frangement-garage%2Fassets%2Fworkbook.json`.
 * Three things nobody should have to read, in one link. `assets/workbook.json`
 * is STORAGE — that a project's bench is a JSON file in a sub-folder is this
 * plugin's business, not the reader's. `%2F` escapes a slash the fragment
 * always allowed (RFC 3986). And the filing — `domaines/diy/projets` — turns
 * a bookmark into something a tidy-up can kill.
 *
 * What the long form bought is kept: the address IS the truth, so there is no
 * registry of ids and the agent can link to a bench without asking anybody.
 * The short form is therefore a NAME the listing resolves, never an id:
 *
 *   #/atelier/rangement-garage                          what we write
 *   #/atelier/domaines/diy/projets/rangement-garage     when the name is taken twice
 *   #/atelier/domaines%2F…%2Fworkbook.json              still read, forever
 *
 * That last line is the migration plan in full: no bookmark dies, and no link
 * the agent already wrote into a page stops working.
 *
 * Pure on purpose — the listing comes in as an argument, so every rule here is
 * testable without a browser.
 *
 * (The sibling of `plugins/voyages/web/address.js`, deliberately copied rather
 * than shared: a plugin is self-contained, and importing across plugin folders
 * would couple two release cycles to save thirty lines.)
 */

/** The route this plugin answers on. */
export const ROUTE = '/atelier'

/** The file that IS a workbook, inside the project that holds it. */
const ASSET = 'assets/workbook.json'

/** `domaines/diy/projets/rangement-garage/assets/workbook.json` → the project. */
export function folderOf(path) {
  return String(path ?? '').replace(new RegExp(`/${ASSET}$`), '')
}

/** A workbook's shortest name: the project folder it lives in. */
export function slugOf(folder) {
  return String(folder ?? '').split('/').filter(Boolean).at(-1) ?? ''
}

/**
 * Segments encoded, slashes left alone.
 *
 * Encoding the whole path is what produced the `%2F` soup: it escapes the one
 * character that was already legal in a fragment, and the only one worth
 * keeping readable.
 */
function encodePath(path) {
  return String(path ?? '')
    .split('/')
    .map(encodeURIComponent)
    .join('/')
}

/**
 * Where to link a workbook, in the shortest form that resolves BACK to it.
 *
 * The name alone only when the listing proves it unambiguous — a workbook the
 * listing has never seen, or a project name used twice, gets the full path. A
 * pretty link that opens the wrong bench is not an improvement on an ugly one.
 *
 * @param books folder → its `workbook.json`, the listing this plugin holds
 * @param path the workbook's `workbook.json`
 */
export function routeOf(books, path) {
  const folder = folderOf(path)
  const slug = slugOf(folder)
  const named = [...books.keys()].filter((known) => slugOf(known) === slug)
  const unambiguous = named.length === 1 && named[0] === folder
  return `${ROUTE}/${unambiguous ? encodeURIComponent(slug) : encodePath(folder)}`
}

/**
 * The workbook an address names, or `undefined` for the hub.
 *
 * Read in the order that costs the least: the long form answers without the
 * listing at all, so a cold bookmark opens its bench without waiting on a
 * fetch. An ambiguous name resolves to NOTHING — landing on the hub is an
 * honest answer to an ambiguous request, opening one of two at random is not.
 *
 * @param books folder → its `workbook.json`
 * @param rest what follows `#/atelier/`, still encoded
 */
export function resolve(books, rest) {
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
  if (books.has(asked)) return books.get(asked)
  const named = [...books.keys()].filter((known) => slugOf(known) === asked)
  return named.length === 1 ? books.get(named[0]) : undefined
}

/** What follows `#/atelier/` in a hash — `''` for the hub itself. */
export function restOf(hash) {
  return String(hash ?? '').replace(/^#?\/?atelier\/?/, '')
}
