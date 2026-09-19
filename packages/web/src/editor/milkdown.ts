/**
 * Mounting Milkdown.
 *
 * Kept apart from the component so the editor's behaviour — save, conflict,
 * read-only, diagnostics — is testable without dragging ProseMirror and a
 * full DOM into every run. The component takes `mount` as a prop; this is the
 * real implementation.
 */

import { Crepe, CrepeFeature } from '@milkdown/crepe'
import { editorViewCtx } from '@milkdown/kit/core'
import { blockConfig } from '@milkdown/kit/plugin/block'
import { remarkPreserveEmptyLinePlugin } from '@milkdown/kit/preset/commonmark'
import type { Node as ProseNode, ResolvedPos } from '@milkdown/kit/prose/model'

// Crepe's own chrome — its toolbar, slash menu, block handles and tooltips.
// These sheets are STRUCTURE ONLY: every colour, font and shadow in them reads
// a `var(--crepe-*)` that one of Crepe's theme files is meant to declare.
// Adestia imports no theme on purpose — a second palette would compete with
// the skin's — and declares the whole `--crepe-*` set from its own tokens in
// shell.css instead. The two go together: importing these without that leaves
// the toolbar transparent and unshadowed, which is how the editing controls
// came to be invisible rather than absent.
//
// One by one rather than `common/style.css`, so that `reset.css` can go into a
// cascade layer — see `crepe-layer.css`, and why it has to.
import '@milkdown/crepe/theme/common/prosemirror.css'
import './crepe-layer.css'
import '@milkdown/crepe/theme/common/block-edit.css'
import '@milkdown/crepe/theme/common/code-mirror.css'
import '@milkdown/crepe/theme/common/cursor.css'
import '@milkdown/crepe/theme/common/image-block.css'
import '@milkdown/crepe/theme/common/link-tooltip.css'
import '@milkdown/crepe/theme/common/list-item.css'
import '@milkdown/crepe/theme/common/placeholder.css'
import '@milkdown/crepe/theme/common/toolbar.css'
import '@milkdown/crepe/theme/common/table.css'
import '@milkdown/crepe/theme/common/latex.css'
import '@milkdown/crepe/theme/common/top-bar.css'
import '@milkdown/crepe/theme/common/diff.css'
import '@milkdown/crepe/theme/common/ai.css'

import type { EditorEnv } from './blockview.js'
import { assetUrl } from './links.js'
import { buildBlockMenu } from './slash.js'
import { buildBlockTypes } from './toolbar.js'
import { adestiaVocabulary, editorBlocks, pmId } from './vocabulary.js'

/**
 * What the block handle may aim at: text on the page, never a `:::` block nor
 * anything inside one.
 *
 * The handle aims at whatever sits at the editor's horizontal MIDDLE — not
 * under the pointer — and from a block's first line it climbs to the block.
 * In a band it sat beside the wrong block or none, beside a block's first
 * line it sat at the block's top, and dragging with it dropped one block
 * INSIDE another, where it could not reach it again. A block is moved from
 * its own bar instead (`blockview.tsx`); text inside a block is shaped from
 * the selection toolbar (`toolbar.ts`). Crepe's own exclusions are kept.
 */
function handleTargets($pos: ResolvedPos, node: ProseNode): boolean {
  const blocks = new Set(editorBlocks().map((spec) => pmId(spec.name)))
  const refused = (one: ProseNode) =>
    blocks.has(one.type.name) || ['table', 'blockquote', 'math_inline'].includes(one.type.name)
  if (blocks.has(node.type.name)) return false
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (refused($pos.node(depth))) return false
  }
  return true
}

export function mountMilkdown(
  element: HTMLElement,
  markdown: string,
  onChange: (markdown: string) => void,
  env: EditorEnv = {},
): () => void {
  const crepe = new Crepe({
    root: element,
    defaultValue: markdown,
    features: {
      // The AI panel wires an assistant Adestia does not own: the chat beside
      // the page IS the assistant, and a second one that answers to nobody
      // would be a dead control.
      [CrepeFeature.AI]: false,
    },
    featureConfigs: {
      // The vocabulary's blocks, in the `/` menu — see `slash.ts`.
      [CrepeFeature.BlockEdit]: { buildMenu: buildBlockMenu },
      // Lists, headings and quotes on the selection toolbar, so they are
      // reachable inside a block — see `toolbar.ts`.
      [CrepeFeature.Toolbar]: { buildToolbar: buildBlockTypes },
      // An image written relative to its page (`assets/avant.jpg`) resolved
      // against the SHELL's address in the editor, and drew broken where the
      // reader drew it fine. The editor now asks the reader's own resolver.
      [CrepeFeature.ImageBlock]: {
        proxyDomURL: (url: string) =>
          assetUrl(url, env.path === undefined ? undefined : env.path.slice(0, Math.max(env.path.lastIndexOf('/'), 0))),
      },
    },
  })

  crepe.editor.use(adestiaVocabulary(env))
  // Crepe's block handle — the `+ ⠿` beside a line — kept to the page's own
  // text. Set after Crepe's own config, which it replaces.
  crepe.editor.config((ctx) => {
    ctx.set(blockConfig.key, { filterNodes: handleTargets })
  })
  /*
   * An empty paragraph is written as NOTHING. Milkdown's "preserve empty
   * line" wrote each one as `<br />`, and a page is not a word processor:
   * the reader showed the tag as text, and one left between two banded
   * blocks broke their line. Removed before `create`, which `remove` must
   * finish first — the `<br />` a page already carries is dropped on parse
   * by `dropBlankBreaks` in the vocabulary, and gone at the next save.
   */
  void crepe.editor
    .remove(remarkPreserveEmptyLinePlugin)
    .then(() => crepe.create())
    .then(() => {
      /*
       * One empty transaction, so the trailing-paragraph plugin runs on the
       * document the editor was HANDED. It only fires from `appendTransaction`
       * — never on the initial state — and a page that opens ending in an atom
       * has nowhere to put a caret: a new journal entry is frontmatter and
       * nothing else, so the only thing a click could reach was the atom.
       *
       * Sent BEFORE the listener is wired, deliberately. The paragraph is
       * empty and serialises to nothing, but a document event arriving before
       * anybody typed would still light up Save on a page nobody touched.
       */
      crepe.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        view.dispatch(view.state.tr)
      })
      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, next) => onChange(next))
      })
    })
    // Never silently. `create()` rejects when the document holds a node this
    // editor has no parser for, and the rejection used to go nowhere: the
    // surface stayed EMPTY, the page still readable underneath, and nothing
    // on screen or in the console said why. Four core blocks shipped that way
    // for a day (2026-09-09), and the `table` collision that `PM_ID` now
    // settles was read off a blank rectangle with a fifteen-second wait in
    // front of it. The parse failure is written where the editor would have
    // been, so the next one is a sentence rather than a wait.
    .catch((cause: unknown) => {
      console.error('Adestia: the editor could not open this page', cause)
      const problem = element.ownerDocument.createElement('p')
      problem.className = 'adestia-editor__problem'
      problem.setAttribute('role', 'status')
      problem.textContent = `The editor could not open this page: ${
        cause instanceof Error ? cause.message : String(cause)
      }`
      element.replaceChildren(problem)
    })

  // A page switch must tear the editor down: two live instances on one host
  // leave the second reading the first's document.
  return () => void crepe.destroy()
}
