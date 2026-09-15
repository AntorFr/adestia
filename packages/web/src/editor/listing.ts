/**
 * The index's pages as the list block reads them: which sit under a folder,
 * which are closed, and what to call each.
 */

import { isFinished, type Indexed } from '@antorfr/adestia-content'

import { prettify } from './nodes.js'

/** `domaines/voyages/baden.md` → `domaines/voyages`. */
export function folderOf(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut === -1 ? '' : path.slice(0, cut)
}

/**
 * Whether a page belongs in the list, at the depth asked for.
 *
 * The subtlety is that **a child is not always a file**. This product files a
 * sub-subject as a FOLDER — that is the whole hierarchy, decided 2026-09-04 —
 * so the row standing for a child is that folder's own index page,
 * not a page beside it. A rule that only looked at files would list a project's
 * loose notes and miss every one of its sub-projects.
 *
 * Hence three answers rather than a depth counter:
 *
 * - `self`     the pages filed directly here, and nothing that stands for a folder
 * - `children` the same, PLUS the index of each direct sub-folder — the children
 * - `subtree`  everything below, at any depth
 *
 * An index page is never listed as a content page of its own folder: it IS the
 * folder. Which also keeps the page carrying the block out of its own list.
 */
export function under(path: string, base: string, depth: string): boolean {
  const folder = folderOf(path)
  const inside = base === '' ? folder !== '' || true : folder === base || folder.startsWith(`${base}/`)
  if (!inside) return false
  if (depth === 'subtree') return true

  const rest = base === '' ? folder : folder.slice(base.length + 1).replace(/^\//, '')
  if (folder === base) return !isIndexPage(path)
  if (depth === 'self') return false
  // One folder down: only its index stands for it, the rest is that folder's business.
  return !rest.includes('/') && isIndexPage(path)
}

/** A folder's own index page is the folder, not one of its contents. */
export function isIndexPage(path: string): boolean {
  const parts = path.split('/')
  const file = parts.at(-1)?.replace(/\.md$/i, '') ?? ''
  return /^index$/i.test(file) || (parts.length > 1 && file === parts.at(-2))
}

/**
 * Whether a page's life is over — asked of the content engine, never re-derived.
 *
 * The first version of this function was `toneOf(fields.status) === 'settled'`,
 * which is the same idea and a different answer: `isFinished` also reads
 * `statut`, the French spelling half this corpus uses, and knows that `acheté`
 * closes a purchase and not a gift. A second table of statuses beside the
 * engine's is precisely what drifts.
 */
export function finished(page: Indexed): boolean {
  return isFinished(page.fields)
}

export function titleOf(page: Indexed): string {
  const declared = page.fields['title']
  if (typeof declared === 'string' && declared !== '') return declared
  return prettify(page.path.split('/').at(-1)?.replace(/\.md$/i, '') ?? page.path)
}

/**
 * The initials a chip wears — one letter per word, two at most.
 *
 * Derived rather than declared, for the same reason the tone of a status is:
 * there is no directory of people in this product, and asking a page to spell
 * out initials beside a name it already wrote is asking it to keep two things
 * in step.
 */
export function initials(text: string): string {
  return text
    .split(/[\s'’-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0]?.toUpperCase() ?? '')
    .join('')
}
