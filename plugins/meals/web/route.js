/**
 * A period's address in the shell — written once, read from both sides.
 *
 * The block's `vue="lien"` builds it and the standalone view takes it apart.
 * Two copies of one encoding rule is a link that works on one side and not the
 * other the day a folder takes a space in its name.
 *
 * Segments are encoded, the slash is left alone — the shell's own convention
 * for `#/page/…` and `#/section/…`, and the one thing that keeps an address
 * readable (a slash is legal in a fragment, RFC 3986). READING accepts either
 * shape: a link written the old way is still a link.
 */

/** The shell route for a workspace path. */
export function routeOf(path) {
  return `#/meals/${String(path ?? '')
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
}

/**
 * The path a route carries, or nothing when it is not one of ours.
 *
 * Anchored rather than trimmed: a plain `replace` of the prefix hands back the
 * WHOLE of any other hash as though it were a path, so `#/page/x` would read
 * as a period called `#/page/x` and the screen would report it unreadable
 * instead of saying there is nothing here.
 */
export function pathOf(hash) {
  const match = /^#?\/?meals(?:\/(.*))?$/.exec(String(hash ?? ''))
  const rest = match?.[1]
  if (!rest) return undefined
  return rest
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        // A stray `%` in a hand-typed hash: read it verbatim rather than
        // leaving the router by way of an exception.
        return segment
      }
    })
    .join('/')
}

/** The folder of the page a period hangs off. */
export const folderOf = (path) => String(path ?? '').replace(/\/?(assets\/)?[^/]+$/, '')
