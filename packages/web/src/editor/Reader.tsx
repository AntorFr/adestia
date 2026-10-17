/**
 * Reading a page.
 *
 * A page was ALWAYS an editor: opening one to look at it mounted ProseMirror,
 * its toolbars, its drag handles and its slash menu over a document nobody
 * had asked to change. Reading and writing are two postures, and a product
 * that only has the second makes every reader feel like they might break
 * something.
 *
 * So this renders the mdast directly. Not a second grammar — the SAME parse
 * the editor and the server use, walked into React. The vocabulary is closed,
 * which is exactly what makes a hand-written renderer the right size: it is a
 * switch over known nodes, and an unknown one is drawn as what it is rather
 * than silently dropped.
 *
 * It also means reading never loads the editor at all: ProseMirror arrives
 * when somebody actually decides to write.
 */

import type { ReactNode } from 'react'
import { parse, type Indexed } from '@antorfr/adestia-content'
import type { StoreInfo } from '../plugins/contract.js'
import type { Node } from './nodes.js'
import type { BlockComponents, VocabularyContext } from './reader/types.js'
import { render } from './reader/render.js'

export type { BlockComponents, LayoutComponents, VocabularyContext } from './reader/types.js'

/**
 * A source the grammar could not read, shown as it was written.
 *
 * Worse looking, and strictly better than a blank rectangle: whoever wrote it
 * still gets their words, and the failure is visible rather than silent.
 */
function raw(markdown: string): ReactNode {
  return <pre className="adestia-reader__raw">{markdown}</pre>
}

/**
 * The same grammar and the same switch, on something that is not a page.
 *
 * A chat message is markdown too. The agent writes `**gras**` and
 * `[label](url)` in it for the same reason it writes them in a page: markdown
 * is the only thing it writes. Rendering the two through one renderer is what
 * keeps a link written in a message and the same link written in a page from
 * meaning two different things — and it is why this costs no new dependency
 * and no second vocabulary.
 *
 * Two things separate the postures, and both are about the source being a
 * FRAGMENT rather than a document:
 *
 * - It has no frontmatter (see the `yaml` case above).
 * - It is relative to the workspace ROOT, not to a folder. An agent naming
 *   `voyages/baden-2026.md` in a message means the file at that path, so the
 *   base is `''` — present, and empty. That is what turns "j'ai écrit la
 *   fiche X" into something you can click.
 *
 * Plugin blocks are deliberately NOT passed: a `:::` block belongs to a page
 * that holds it, and one drawn inside a chat bubble would be a live control
 * in a transcript of a conversation that has already happened.
 */
export function Prose({
  markdown,
  openPage,
}: {
  readonly markdown: string
  readonly openPage?: (path: string) => void
}) {
  let tree: Node
  try {
    tree = parse(markdown) as unknown as Node
  } catch {
    return raw(markdown)
  }
  return (
    <div className="adestia-prose">
      {render(tree, { base: '', prose: true, ...(openPage ? { openPage } : {}) })}
    </div>
  )
}

export function Reader({
  markdown,
  path,
  store,
  fields,
  openPage,
  blocks,
  vocabulary,
  pages,
  stores,
  fetchImpl,
  locale,
}: {
  readonly markdown: string
  /**
   * The page's own path, which is what makes a relative link resolvable.
   * Absent — a fragment rendered outside any page — leaves relative links as
   * written rather than resolving them against the root, which would point
   * them at a file that is not there.
   */
  readonly path?: string
  /** Which store carries it, when the instance composes more than one. */
  readonly store?: string
  /** Its frontmatter, for the blocks it carries. See `BlockProps`. */
  readonly fields?: Readonly<Record<string, unknown>>
  readonly openPage?: (path: string) => void
  /** What the active plugins draw. Absent means the core's vocabulary only. */
  readonly blocks?: BlockComponents
  /** Who owns this page's domain, and the features on — `from=` resolution. */
  readonly vocabulary?: VocabularyContext
  /** The instance's pages, so a `[[type#id]]` reference can find its target. */
  readonly pages?: readonly Indexed[]
  /** The stores it composes, for a block that draws a row's provenance. */
  readonly stores?: readonly StoreInfo[]
  /** For the blocks that ask the server — `:::list{source=files}`. */
  readonly fetchImpl?: typeof fetch
  readonly locale?: string
}) {
  let tree: Node
  try {
    tree = parse(markdown) as unknown as Node
  } catch {
    return raw(markdown)
  }
  // A page at the root has an EMPTY base, which is not the same as none: its
  // neighbours are the root's own files.
  const base = path === undefined ? undefined : path.slice(0, Math.max(path.lastIndexOf('/'), 0))
  return (
    <article className="adestia-reader">
      {render(tree, {
        ...(base === undefined ? {} : { base }),
        ...(path === undefined
          ? {}
          : { page: { path, ...(store ? { store } : {}), ...(fields ? { fields } : {}) } }),
        ...(openPage ? { openPage } : {}),
        ...(blocks ? { blocks } : {}),
        ...(vocabulary ? { vocabulary } : {}),
        ...(pages ? { pages } : {}),
        ...(stores ? { stores } : {}),
        ...(fetchImpl ? { fetchImpl } : {}),
        ...(locale ? { locale } : {}),
      })}
    </article>
  )
}
