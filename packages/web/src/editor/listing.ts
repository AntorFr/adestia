/**
 * The index's pages as the list block reads them: which sit under a folder,
 * which are closed, and what to call each.
 */

import { isFinished, type Indexed } from '@antorfr/adestia-content'

import { folderOf, prettify } from '../app/paths.js'

/**
 * Whether a page belongs in the list, at the depth asked for.
 *
 * No page stands for a folder any more (AD-40): a folder's settings live in its
 * `.folder.md`, and `INDEX.md` or `x/x.md` is a page like another. So there are
 * two answers rather than three:
 *
 * - `self` and `children` the pages filed directly in the folder (`children`
 *   used to add the index of each sub-folder; no such page exists now, and the
 *   word is kept so a block written with it still reads)
 * - `subtree`  everything below, at any depth
 *
 * The page carrying the block is the caller's to leave out of its own list.
 */
export function under(path: string, base: string, depth: string): boolean {
  const folder = folderOf(path)
  if (depth === 'subtree') return base === '' || folder === base || folder.startsWith(`${base}/`)
  return folder === base
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
