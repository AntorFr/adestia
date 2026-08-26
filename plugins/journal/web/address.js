/**
 * A journal's address — how one is written, and how one is read back.
 *
 * The first shape this plugin shipped was `encodeURIComponent` over the whole
 * folder: `#/journal/journal%2Fatelier`. It works, and it says two things
 * nobody should have to read — `%2F` is a slash the fragment never needed
 * escaped (RFC 3986 allows `/` there), and `journal` twice over is the
 * operator's filing leaking into a link, so moving the folder kills the
 * bookmark.
 *
 * So the short form is a NAME the listing resolves, never an id somebody has
 * to allocate:
 *
 *   #/journal/atelier                what we write
 *   #/journal/archives/atelier       when the name is taken twice
 *   #/journal/journal%2Fatelier      still read, forever
 *
 * The last line is the whole migration plan: nothing that was ever written
 * down stops working. A percent-encoded slash survives because decoding is
 * done SEGMENT BY SEGMENT — the old form is one segment that decodes into a
 * path, and lands on the same exact-folder match a new link takes.
 *
 * Pure on purpose: everything here takes the listing as an argument, so the
 * rules are testable without a browser, a fetch, or a journal.
 */

/** The route this plugin answers on. */
export const ROUTE = '/journal'

/** A journal's shortest name: the last segment of the folder it is. */
export function slugOf(folder) {
  return String(folder ?? '')
    .split('/')
    .filter(Boolean)
    .at(-1) ?? ''
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
 * Where to link a journal, in the shortest form that resolves BACK to it.
 *
 * The name alone only when the listing proves it is unambiguous — a journal
 * absent from the listing, or one whose folder name is taken twice, gets the
 * folder path. A pretty link that opens the wrong journal is not an
 * improvement on an ugly one.
 *
 * @param folders every journal folder this plugin knows, from its own listing
 * @param folder the journal's folder
 */
export function routeOf(folders, folder) {
  const asked = String(folder ?? '')
  const slug = slugOf(asked)
  const named = [...folders].filter((known) => slugOf(known) === slug)
  const unambiguous = named.length === 1 && named[0] === asked
  return `${ROUTE}/${unambiguous ? encodeURIComponent(slug) : encodePath(asked)}`
}

/**
 * The journal an address names, or `undefined` for the shelf.
 *
 * An ambiguous name resolves to NOTHING rather than to a guess. Landing on
 * the shelf — "here are the journals, say which" — is an honest answer to an
 * ambiguous request; opening one of two at random is not.
 *
 * @param folders every journal folder this plugin knows
 * @param rest what follows `#/journal/`, still encoded
 */
export function resolve(folders, rest) {
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
  const known = [...folders]
  if (known.includes(asked)) return asked
  const named = known.filter((folder) => slugOf(folder) === asked)
  return named.length === 1 ? named[0] : undefined
}

/** What follows `#/journal/` in a hash — `''` for the shelf itself. */
export function restOf(hash) {
  return String(hash ?? '').replace(/^#?\/?journal\/?/, '')
}
