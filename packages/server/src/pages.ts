/**
 * The pages API — reading and writing the files both hands share.
 *
 * The agent edits these with its native file tools; this endpoint is for the
 * browser. Both write the SAME markdown, validated against the SAME closed
 * vocabulary, which is what keeps the two authors from drifting apart.
 *
 * Three rules the routes below exist to enforce:
 *
 * - a save that would corrupt the vocabulary is REFUSED with diagnostics,
 *   never accepted and never silently rewritten;
 * - a save is refused if the file changed underneath the editor, because the
 *   other author here is an agent that writes without warning;
 * - writes are atomic, since the agent may be reading the file at that moment.
 */

import { extname } from 'node:path'

import type { Diagnostic } from '@antorfr/adestia-content'

import { splitFrontmatter } from './frontmatter.js'
import { fileIn, type Store } from './stores.js'


export interface PageInfo {
  readonly path: string
  /**
   * Which store carries this copy — present ONLY when the instance has more
   * than one. Adding it to the single-store case would change the answer for
   * nothing, and teach the shell a division that does not exist on its own
   * instance.
   */
  readonly store?: string
  readonly title: string
  readonly modified: string
  /** ETag-like: what an editor sends back to prove it read the current file. */
  readonly revision: string
}

export interface PageContent extends PageInfo {
  readonly markdown: string
  /**
   * The page's own frontmatter, parsed the same way the index parses it.
   *
   * Sent rather than left to the browser to re-derive: the index already
   * carries these for every page, but a page just saved is read back before
   * the index has caught up, and a screen chosen by `type` must not flicker
   * through the wrong one. Same values, from the copy that is authoritative
   * at this instant.
   */
  readonly fields: Readonly<Record<string, unknown>>
  readonly diagnostics: readonly Diagnostic[]
  /**
   * False when the document breaks the closed vocabulary. The editor opens it
   * read-only with the diagnostics rather than refusing (which loses the file)
   * or normalizing (which loses the content).
   */
  readonly editable: boolean
}

/** Modification time plus size: enough to notice a write we did not make. */
export function revisionOf(info: { mtimeMs: number; size: number }): string {
  return `${Math.trunc(info.mtimeMs)}-${info.size}`
}

/**
 * A requested page inside ONE store, or refused.
 *
 * The location half is `fileIn` — mount prefix stripped, guard applied against
 * that store's own directory. What stays here is the rule that has nothing to
 * do with where files are: only markdown. This API's contract is the content
 * vocabulary, and a general-purpose file writer behind a session cookie is a
 * different, much more dangerous thing.
 */
export function safePagePath(store: Store, requested: string): string | undefined {
  const target = fileIn(store, requested)
  if (!target) return undefined
  return extname(target) === '.md' ? target : undefined
}

/** The frontmatter title if there is one, else the file name. */
export function titleOf(markdown: string, path: string): string {
  const { head } = splitFrontmatter(markdown)
  const title = head ? /^title:\s*(.+)$/m.exec(head)?.[1]?.trim() : undefined
  if (title) return title.replace(/^["']|["']$/g, '')
  const heading = /^#\s+(.+)$/m.exec(markdown)?.[1]
  return heading ?? path.replace(/\.md$/, '').split('/').pop() ?? path
}

// The route registration lives under `routes/`; kept importable from here.
export { registerPages, type PagesOptions } from './routes/pages.js'
