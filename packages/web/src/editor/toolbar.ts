/**
 * What the selection toolbar adds to Crepe's: turning a line into a list, a
 * heading or a quote.
 *
 * Crepe's own toolbar formats TEXT — bold, italic, strike, code, a link. The
 * rest lives on the block handle beside each line, and that handle cannot
 * reach inside a block: it aims at whatever sits at the editor's horizontal
 * middle, and from a block's first paragraph it climbs to the block itself.
 * So a person writing in a card had bold and no bullet. These buttons act on
 * the selection wherever it is — a card, a callout, a band — which is where
 * the toolbar already appears.
 */

import type { ToolbarFeatureConfig } from '@milkdown/crepe/feature/toolbar'
import { commandsCtx, editorViewCtx, type CmdKey } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import {
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/kit/preset/commonmark'

type ToolbarBuilder = Parameters<NonNullable<ToolbarFeatureConfig['buildToolbar']>>[0]

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

const ICONS = {
  bullet: svg('<circle cx="5" cy="7" r="1.2" fill="currentColor"/><circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="5" cy="17" r="1.2" fill="currentColor"/><path d="M9 7h11M9 12h11M9 17h11"/>'),
  ordered: svg('<path d="M4 6h1.5v4M4 10h3M4 14.5c0-1 2.8-1 2.8.4 0 .9-2.8 1.8-2.8 3.1h3M10 7h10M10 12h10M10 17h10"/>'),
  heading: svg('<path d="M5 5v14M13 5v14M5 12h8M17 10l2-1.5V19"/>'),
  subheading: svg('<path d="M5 5v14M13 5v14M5 12h8M16.5 10.5c0-1.5 3.5-1.5 3.5.3 0 1.5-3.5 2.6-3.5 4.7H20"/>'),
  quote: svg('<path d="M6 17c-1.2-4 .2-8 3.5-10M13 17c-1.2-4 .2-8 3.5-10"/>'),
  text: svg('<path d="M6 6h12M12 6v13"/>'),
}

/** Whether the selection sits inside a node of this kind — at any depth. */
function inside(ctx: Ctx, name: string, level?: number): boolean {
  const { $from } = ctx.get(editorViewCtx).state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name === name && (level === undefined || node.attrs['level'] === level)) return true
  }
  return false
}

function run<T>(ctx: Ctx, key: CmdKey<T>, payload?: T): void {
  ctx.get(commandsCtx).call(key, payload)
}

export function buildBlockTypes(builder: ToolbarBuilder): void {
  builder
    .addGroup('adestia-blocks', 'Blocs de texte')
    .addItem('bullet-list', {
      icon: ICONS.bullet,
      label: 'Liste à puces',
      active: (ctx: Ctx) => inside(ctx, 'bullet_list'),
      onRun: (ctx: Ctx) => run(ctx, wrapInBulletListCommand.key),
    })
    .addItem('ordered-list', {
      icon: ICONS.ordered,
      label: 'Liste numérotée',
      active: (ctx: Ctx) => inside(ctx, 'ordered_list'),
      onRun: (ctx: Ctx) => run(ctx, wrapInOrderedListCommand.key),
    })
    .addItem('heading', {
      icon: ICONS.heading,
      label: 'Titre',
      active: (ctx: Ctx) => inside(ctx, 'heading', 2),
      onRun: (ctx: Ctx) => run(ctx, wrapInHeadingCommand.key, inside(ctx, 'heading', 2) ? 0 : 2),
    })
    .addItem('subheading', {
      icon: ICONS.subheading,
      label: 'Sous-titre',
      active: (ctx: Ctx) => inside(ctx, 'heading', 3),
      onRun: (ctx: Ctx) => run(ctx, wrapInHeadingCommand.key, inside(ctx, 'heading', 3) ? 0 : 3),
    })
    .addItem('quote', {
      icon: ICONS.quote,
      label: 'Citation',
      active: (ctx: Ctx) => inside(ctx, 'blockquote'),
      onRun: (ctx: Ctx) => run(ctx, wrapInBlockquoteCommand.key),
    })
    .addItem('text', {
      icon: ICONS.text,
      label: 'Texte simple',
      active: () => false,
      onRun: (ctx: Ctx) => run(ctx, turnIntoTextCommand.key),
    })
}
