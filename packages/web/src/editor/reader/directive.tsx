import type { ReactNode } from 'react'
import { resolveBlock } from '@antorfr/adestia-content'
import type { Node } from '../nodes.js'
import type { Ctx, RenderChildren } from './types.js'
import { ContentBlock, headOf, titled } from './ContentBlock.js'
import { Figures } from './Figures.js'
import { TableBlock } from './TableBlock.js'
import { ListBlock } from './ListBlock.js'
import { Contributed } from './Contributed.js'
import { Note, sayOf } from './Note.js'

export function directive(node: Node, ctx: Ctx, renderChildren: RenderChildren): ReactNode {
  // WHO draws this block is decided before anything is drawn. The core's
  // own branches used to come first unconditionally, which would have made
  // every override invisible: an app redefining `table` would have written
  // a claim nothing ever consulted.
  const name = node.name ?? ''
  const asked = node.attributes?.['from']
  const resolved = resolveBlock(name, {
    ...(ctx.vocabulary ?? {}),
    ...(asked !== undefined ? { from: asked } : {}),
  })

  // `title=`, `ico=` and `frame=` are RESERVED, so the header and the card
  // are drawn here, once, for whoever draws the block: in a card the
  // header is the card's band, without one it sits above the block. A
  // rendering draws its inside and nothing around it.
  const head = headOf(node)
  const framed = node.attributes?.['frame'] === 'card'
  const place = (block: ReactNode): ReactNode =>
    framed ? (
      <section className="adestia-framed">
        {head}
        {block}
      </section>
    ) : (
      titled(head, block)
    )

  if (resolved === undefined && asked !== undefined) {
    // `from=` named a plugin nothing answers for — off, renamed, or never
    // here. Said like a dead link: visibly, with the body kept underneath.
    return place(
      <>
        <Note icon="circle-alert">
          :::{name} — from={asked} : {sayOf(ctx)('nothing carries this name here')}.
        </Note>
        {renderChildren(node, ctx)}
      </>,
    )
  }

  if (resolved?.plugin === 'core') {
    if (node.type === 'containerDirective' && name === 'callout') {
      const tone = node.attributes?.['type'] ?? 'note'
      // Unframed, a callout's title is its first line: an aside is not a
      // panel with a heading on top of it.
      return framed ? (
        place(<aside className={`adestia-callout adestia-callout--${tone}`}>{renderChildren(node, ctx)}</aside>)
      ) : (
        <aside className={`adestia-callout adestia-callout--${tone}`}>
          {head}
          {renderChildren(node, ctx)}
        </aside>
      )
    }
    if (node.type === 'containerDirective' && name === 'row') {
      // Ends the line of `w=` blocks it sits between, which `children`
      // does by seeing a block with no width — and draws nothing itself.
      return null
    }
    if (node.type === 'containerDirective' && name === 'gallery') {
      return place(<div className="adestia-gallery">{renderChildren(node, ctx)}</div>)
    }
    if (node.type === 'containerDirective' && name === 'content') {
      // Draws its own header: a section always has a title, and a
      // signature. Its card is the same one, on its own section.
      return <ContentBlock node={node}>{renderChildren(node, ctx)}</ContentBlock>
    }
    if (node.type === 'containerDirective' && name === 'figures') {
      return place(<Figures node={node} />)
    }
    if (node.type === 'containerDirective' && name === 'table') {
      return place(<TableBlock>{renderChildren(node, ctx)}</TableBlock>)
    }
    if (node.type === 'containerDirective' && name === 'list') {
      return place(<ListBlock node={node} ctx={ctx} />)
    }
  }

  return place(<Contributed node={node} ctx={ctx} claim={resolved} renderChildren={renderChildren} />)
}
