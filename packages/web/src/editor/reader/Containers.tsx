import { useId, useState, type ReactNode } from 'react'

import { Icon } from '../../app/Icon.js'
import type { Node } from '../nodes.js'
import type { Ctx } from './types.js'
import { sayOf } from './Note.js'

/**
 * `:::section{title, ico, closed=fold}` — a titled, foldable stretch of the page.
 *
 * The fold is a React state of THIS reader, started from `closed=fold` and
 * never written (AD-structure-1): a reader opening a section must not make the
 * file change under whoever else is looking at it, and a read-only page has to
 * be able to unfold. React keeps it by the section's position in the tree.
 * Folded, the body stays in the DOM but hidden, so a find-in-page cannot
 * lie about what the page holds and unfolding costs nothing.
 */
export function Section({ node, children, ctx }: { readonly node: Node; readonly children: ReactNode; readonly ctx: Ctx }) {
  const [closed, setClosed] = useState(node.attributes?.['closed'] === 'fold')
  const body = useId()
  const title = node.attributes?.['title'] || sayOf(ctx)('Untitled section')
  const ico = node.attributes?.['ico']
  return (
    <section className={`adestia-block-section${closed ? ' adestia-block-section--closed' : ''}`}>
      <h3 className="adestia-block-section__head">
        <button
          type="button"
          className="adestia-block-section__toggle"
          aria-expanded={!closed}
          aria-controls={body}
          onClick={() => setClosed((was) => !was)}
        >
          <Icon name="chevron-down" className="adestia-block-section__chevron" />
          {ico && (
            <span className="adestia-head__ico" aria-hidden="true">
              {ico}
            </span>
          )}
          <span className="adestia-block-section__title">{title}</span>
        </button>
      </h3>
      <div className="adestia-block-section__body" id={body} hidden={closed}>
        {children}
      </div>
    </section>
  )
}

/** `:::columns` — two or three `col` side by side; stacked in file order on a narrow screen. */
export function Columns({ node, children }: { readonly node: Node; readonly children: ReactNode }) {
  const count = (node.children ?? []).filter((one) => one.name === 'col').length
  return <div className={`adestia-columns adestia-columns--${count >= 3 ? 3 : 2}`}>{children}</div>
}
