/**
 * Where the gallery puts a block (B-24): a pure judgment on the page tree.
 *
 * The answer is a position `(parent, index)` in the same model `moveBlock`
 * reads — `index` is the drop slot among the page's movable children, 0 the
 * gap before the first, `total` the end. The block that has the selection is
 * the one the new block goes AFTER; with none (the selection sits in the
 * frontmatter strip, or there is nothing), the end of the page. Containers
 * arrive with tranche 3: until then the parent is always the page.
 */

import type { Node as ProseNode } from '@milkdown/kit/prose/model'

import { movableSlots } from './moveBlock.js'

export interface InsertionPoint {
  readonly parent: ProseNode
  /** The slot, 0..total, in the page's movable children. */
  readonly index: number
}

/** The part of a ProseMirror selection this needs — kept narrow so it is testable without a view. */
export interface SelectionRange {
  readonly from: number
  readonly to: number
  /** Depth of the start position; 0 when a top-level node itself is selected. */
  readonly depth: number
}

export function insertionPoint(doc: ProseNode, selection?: SelectionRange): InsertionPoint {
  const slots = movableSlots(doc)
  const end: InsertionPoint = { parent: doc, index: slots.length }
  if (!selection) return end
  // A position inside the selected top-level block, or its end when the block itself is selected.
  const pos = selection.depth > 0 ? doc.resolve(Math.min(selection.from, doc.content.size)).before(1) + 1 : selection.to
  const top = doc.childAfter(Math.max(0, pos - 1)).node
  if (!top || top.type.name === 'frontmatter') return end
  return { parent: doc, index: slots.filter((slot) => slot.pos < pos).length }
}
