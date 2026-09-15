/**
 * Where a link written in a page actually points.
 */

/**
 * Where a link written in a page actually points.
 *
 * A page says `![Avant](assets/avant.jpg)` or `[Le devis](devis.pdf)`, and
 * means "next to me" — relative to the FOLDER the page lives in, the way it
 * reads on disk and the way the agent wrote it. Nothing in a document should
 * have to know that files are served under `/api/files`, so the translation
 * happens here, once, for images and links alike.
 *
 * Three destinations, because they behave differently: another page of this
 * instance opens IN PLACE (a document that made you leave and come back is a
 * document that lost your place), a workspace file is fetched from the file
 * route, and anything with a scheme of its own is left exactly as written.
 */
export type Href =
  | { readonly kind: 'external'; readonly href: string }
  | { readonly kind: 'page'; readonly path: string }
  | { readonly kind: 'file'; readonly href: string }

export function resolveHref(url: string | undefined, base: string | undefined): Href {
  const raw = url ?? ''
  // A scheme, a fragment, a bare query or an absolute path is already an
  // answer: rewriting it would break the one case where somebody knew exactly
  // what they meant. No base at all means no page to be relative TO — a
  // fragment rendered on its own keeps what was written rather than being
  // pointed at the root, where the file is not.
  if (base === undefined || raw === '' || /^[a-z][a-z0-9+.-]*:/i.test(raw) || /^[#?/]/.test(raw)) {
    return { kind: 'external', href: raw }
  }

  const segments = base.split('/').filter(Boolean)
  for (const segment of raw.split('/')) {
    if (segment === '' || segment === '.') continue
    // `..` climbing past the root is dropped rather than kept: the file route
    // refuses it anyway, and a path that walks out of the workspace is a typo,
    // not an intention worth transmitting.
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  const path = segments.join('/')
  if (path === '') return { kind: 'external', href: raw }
  if (/\.md$/i.test(path)) return { kind: 'page', path }
  return { kind: 'file', href: `/api/files/${path.split('/').map(encodeURIComponent).join('/')}` }
}

/**
 * The same resolution, but always ending in something fetchable.
 *
 * A block asks for a FILE — `source="assets/x.parcours.json"` — and does not
 * care that a neighbour ending in `.md` would have been a page to a link. It
 * wants bytes, so a page path is served as the file it also is.
 */
export function assetUrl(path: string, base: string | undefined): string {
  const target = resolveHref(path, base)
  if (target.kind !== 'page') return target.href
  return `/api/files/${target.path.split('/').map(encodeURIComponent).join('/')}`
}

/**
 * The same path, as the workspace spells it — no route, no encoding.
 *
 * The companion of `assetUrl`, and both are needed: a block fetches its file
 * by URL, then has to NAME that same file to its own API ("assemble the GPX
 * of this one"). Deriving the second by peeling the first apart is what the
 * ported engine used to do, and it tied a plugin to the shell's route shape.
 */
export function workspacePath(path: string, base: string | undefined): string {
  const target = resolveHref(path, base)
  if (target.kind === 'page') return target.path
  // Anything with a scheme of its own was never a workspace file; handing back
  // what was written beats inventing a path that resolves to nothing.
  return target.href.startsWith('/api/files/')
    ? target.href.slice('/api/files/'.length).split('/').map(decodeURIComponent).join('/')
    : path
}
