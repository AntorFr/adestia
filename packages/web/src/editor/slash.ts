/**
 * The vocabulary's blocks, in the editor's slash menu.
 *
 * Until this existed the editor could DRAW every block and offer none: a
 * person writing a page had no way to add a callout without knowing that
 * `:::callout` is a thing, which makes a closed vocabulary feel like a secret
 * rather than a shape. Crepe already ships the menu — `/` opens it, typing
 * filters it by label — so what was missing was the group, not the mechanism.
 *
 * Read from `editorBlocks()`, the same two tables the nodes come from. That is
 * the whole point: a block added to the core, or contributed by a plugin
 * mounted this morning, appears here because it EXISTS. Nothing to keep in
 * step, which is the mistake this file's neighbour paid for twice.
 *
 * What is presentation, and therefore hand-written, is small and fails safe: a
 * glyph per name with a fallback, and one label override. A block nobody gave
 * an icon still appears, wearing the fallback.
 */

import { shapesOf, type BlockSpec } from '@antorfr/adestia-content'
import type { BlockEditFeatureConfig } from '@milkdown/crepe/feature/block-edit'
import { commandsCtx, schemaCtx } from '@milkdown/kit/core'
import {
  addBlockTypeCommand,
  clearTextInCurrentBlockCommand,
  wrapInBlockTypeCommand,
} from '@milkdown/kit/preset/commonmark'

import { openSettingsOnNextBlock } from './blockview.js'
import { editorBlocks, pmId } from './vocabulary.js'

/** Crepe's builder, named through the config that receives it. */
type MenuBuilder = Parameters<NonNullable<BlockEditFeatureConfig['buildMenu']>>[0]

/**
 * The label a block wears in the menu — its own NAME, so what you pick is what
 * the file will say, and `/figures` finds it.
 *
 * `table` is the one override, and the reason is a collision: Crepe's own
 * "Table" (a bare markdown grid) already sits two groups above. `:::table` is
 * a different thing — a grid whose first column is read as a tone — and two
 * entries called "Table" in one menu is a coin toss on every insertion.
 */
const LABELS: Readonly<Record<string, string>> = {
  table: 'bloc-table',
}

const ICONS: Readonly<Record<string, string>> = {
  callout: '💡',
  gallery: '🖼',
  content: '📄',
  figures: '📊',
  table: '▦',
  list: '🗂',
  row: '↵',
}

/** Anything the table gains before somebody chooses it a glyph. */
const FALLBACK = '❖'

/**
 * Every block the menu can offer — now that a block's settings can be edited
 * where it is inserted, a required attribute is something to ASK for, not a
 * reason to keep the block out. `content` comes in, and opens its settings on
 * its `type`.
 *
 * `app` stays out: the core's own table says nothing draws it, and offering a
 * block that renders as a notice is a dead end in a menu.
 */
function insertable(spec: BlockSpec): boolean {
  return spec.name !== 'app'
}

/**
 * The attributes an inserted block carries: only what it cannot do without.
 * A required attribute gets its default, else a word to replace — `section`
 * for a section's subject — and the settings open on it. Nothing else is
 * written: an attribute at its default reads as a decision nobody made.
 */
function seed(spec: BlockSpec): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const [name, attribute] of Object.entries(spec.attributes)) {
    if (!attribute.required) continue
    attributes[name] = attribute.default ?? attribute.values?.[0] ?? (name === 'type' ? 'section' : name)
  }
  return attributes
}

/**
 * Adds the group to Crepe's own menu.
 *
 * Appended rather than replacing: text, lists and the advanced group are
 * commonmark, they are not ours to remove, and a person reaching for a heading
 * should not have to know which half of the menu we wrote.
 */
export function buildBlockMenu(builder: MenuBuilder): void {
  const blocks = editorBlocks().filter(insertable)
  if (blocks.length === 0) return

  const group = builder.addGroup('adestia', 'Blocs')
  for (const spec of blocks) {
    group.addItem(spec.name, {
      label: LABELS[spec.name] ?? spec.name,
      icon: ICONS[spec.name] ?? FALLBACK,
      onRun: (ctx) => {
        const nodeType = ctx.get(schemaCtx).nodes[pmId(spec.name)]
        // The node is registered by `adestiaVocabulary()` from the same table
        // this menu reads, so this cannot happen — and returning is still
        // better than throwing inside a click handler if it ever does.
        if (!nodeType) return

        const commands = ctx.get(commandsCtx)
        // The block about to exist opens its settings: it asks for what it
        // needs instead of appearing bare.
        openSettingsOnNextBlock()
        // Clears the `/table` the person just typed; without it the text stays
        // inside the block they asked for.
        commands.call(clearTextInCurrentBlockCommand.key)
        // A block that holds flow WRAPS what the cursor is in, the way a quote
        // does — so `/callout` on a paragraph you already wrote keeps it. One
        // that holds nothing is added beside it. `shapesOf` rather than the
        // spec's own `content`, because that is the rule the NODE was built
        // with: a name any definition gives a body to is a container.
        commands.call(
          shapesOf(spec.name).has('flow')
            ? wrapInBlockTypeCommand.key
            : addBlockTypeCommand.key,
          { nodeType, attrs: { attributes: seed(spec) } },
        )
      },
    })
  }
}
