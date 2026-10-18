import type { ReactNode } from 'react'
import { prettify } from '../../app/paths.js'
import type { Node } from '../nodes.js'
/**
 * `:::content{type=…}` — a title and prose.
 *
 * The one rendering that makes the doctrine pay: a summary, a scope, a
 * context and a letter to Father Christmas are the same drawing, so they are
 * the same block and their difference is a word in `type`. Inventing a kind
 * of content costs nothing — no code, no manifest entry, no restart.
 *
 * The title is the subject prettified, since nothing declares labels yet. A
 * `pm-config` will one day say `summary: Synthèse`; until it does, the word
 * the author wrote is a better answer than no title at all.
 */
export function ContentBlock({ node, children }: { readonly node: Node; readonly children: ReactNode }) {
  const subject = node.attributes?.['type'] ?? ''
  // The page convention, one level down: `ico:` and `title:` are what a PAGE
  // declares, so a block declares the same words. The title ladder is the
  // tiles' — the occurrence beats a configured label (pm-config, when it
  // exists), which beats the prettified type. `title=` fixes what the bench
  // showed: « Perimetre », accents lost, because a slug was standing in for
  // a word someone meant to read.
  const title = node.attributes?.['title'] ?? (subject ? prettify(subject) : '')
  const ico = node.attributes?.['ico']
  const signed = [node.attributes?.['by'], node.attributes?.['on']].filter(Boolean).join(' · ')
  const framed = node.attributes?.['frame'] === 'card'
  return (
    <section className={`adestia-content${framed ? ' adestia-framed' : ''}`}>
      {(title || ico || signed) && <BlockHead title={title} ico={ico} by={signed} />}
      {children}
    </section>
  )
}

/**
 * A block's header: its glyph, its title, and — for a section — its signature,
 * on ONE row, so they read as the block's heading rather than as lines stacked
 * above it. The same drawing for every block, core or plugin: a list's heading
 * and a section's are the same thing.
 */
export function BlockHead({
  title,
  ico,
  by,
}: {
  readonly title?: string | undefined
  readonly ico?: string | undefined
  readonly by?: string | undefined
}) {
  return (
    <header className="adestia-head">
      {ico && (
        <span className="adestia-head__ico" aria-hidden="true">
          {ico}
        </span>
      )}
      {title && <h3 className="adestia-head__title">{title}</h3>}
      {by && <p className="adestia-head__by">{by}</p>}
    </header>
  )
}

/** The header a block ASKED for, or nothing: a block with neither word stays bare. */
export function headOf(node: Node): ReactNode {
  const title = node.attributes?.['title']
  const ico = node.attributes?.['ico']
  return title || ico ? <BlockHead title={title} ico={ico} /> : null
}

/**
 * The header set ABOVE a block that is not in a card. A component is never
 * asked to make room: it draws what it draws, and the heading sits on top.
 */
export function titled(head: ReactNode, block: ReactNode): ReactNode {
  if (!head) return block
  return (
    <section className="adestia-titled">
      {head}
      {block}
    </section>
  )
}

