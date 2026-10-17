import { blockSpec, type ResolvedBlock } from '@antorfr/adestia-content'
import { PluginBoundary } from '../../plugins/Boundary.js'
import { assetUrl, workspacePath } from '../links.js'
import { listItems } from '../nodes.js'
import type { RenderChildren } from './types.js'
import type { Node } from '../nodes.js'
import type { Ctx } from './types.js'

/**
 * A block the core does not draw — a plugin's, or nobody's.
 *
 * Behind a boundary, deliberately: a block renders INSIDE somebody's page,
 * and a plugin that throws must cost its own rectangle rather than the text
 * around it. That is the same bargain the loader already makes for a factory.
 */
export function Contributed({
  node,
  ctx,
  claim,
  renderChildren,
}: {
  readonly node: Node
  readonly renderChildren: RenderChildren
  readonly ctx: Ctx
  /** Who resolution decided draws this — undefined when nobody does. */
  readonly claim?: ResolvedBlock | undefined
}) {
  const name = node.name ?? ''
  const Block = claim ? ctx.blocks?.[claim.plugin]?.[name] : undefined
  // A `flow` block gets its body; an `empty` one is its attributes and
  // nothing else, so it is not handed an empty fragment to wonder about.
  const shape = (claim?.spec ?? blockSpec(name))?.content
  const flow = shape === 'flow' || shape === 'optional'
  const body = flow ? renderChildren(node, ctx) : undefined

  if (!Block) {
    // Two ways to land here, and the reader cannot act on either: a block no
    // plugin claims, or one whose plugin is off. Saying so beats drawing
    // nothing where a person expects something.
    //
    // The BODY is kept underneath. A block that holds prose holds somebody's
    // words, and losing them to a missing plugin would be a worse answer than
    // an ugly one — the same reason a refused page shows its raw source.
    return (
      <>
        <p className="adestia-unknown-block">
          :::{name} — {`this block does not render yet`}
        </p>
        {body}
      </>
    )
  }
  // `pages` is the index the shell already holds. The core's own `:::list`
  // reads it from memory; a plugin's query block used to fetch the same
  // listing again for itself, which costs a round trip AND a server-side
  // re-read of every markdown file in the instance. Same array, same
  // reference, nothing copied.
  return (
    <PluginBoundary id={name} what="block">
      <Block
        attributes={node.attributes ?? {}}
        {...(flow ? { items: listItems(node) } : {})}
        resolve={(target) => assetUrl(target, ctx.base)}
        locate={(target) => workspacePath(target, ctx.base)}
        {...(ctx.page ? { path: ctx.page.path } : {})}
        {...(ctx.page?.store ? { store: ctx.page.store } : {})}
        {...(ctx.page?.fields ? { fields: ctx.page.fields } : {})}
        {...(ctx.pages ? { pages: ctx.pages } : {})}
        {...(ctx.stores ? { stores: ctx.stores } : {})}
        {...(ctx.openPage ? { openPage: ctx.openPage } : {})}
      >
        {body}
      </Block>
    </PluginBoundary>
  )
}

