/**
 * Where the gallery puts a block (B-24): a pure judgment on the page tree.
 *
 * The answer is a position `(parent, index)` in the same model `moveBlock`
 * reads — `index` is the drop slot among the page's movable children, 0 the
 * gap before the first, `total` the end. The block that has the selection is
 * the one the new block goes AFTER; with none (the selection sits in the
 * frontmatter strip, or there is nothing), the end of the page.
 *
 * `insertionPos` is the same judgment with containers (AD-32): where a block
 * called `name` lands in the document, inside the deepest section or column
 * that has the focus and may hold it.
 */

import type { Node as ProseNode } from '@milkdown/kit/prose/model'

import { mayHold } from './containers.js'
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

/** The document position a new block called `name` is inserted at. */
export function insertionPos(doc: ProseNode, selection: SelectionRange | undefined, name: string): number {
  const slots = movableSlots(doc)
  const topEnd = () => {
    const last = slots[slots.length - 1]
    return last ? last.pos + last.size : doc.content.size
  }
  if (!selection) return topEnd()
  const size = Math.min(selection.from, doc.content.size)
  const $at = doc.resolve(size)
  // A node selected as a whole: the node itself, which sits INSIDE `$at.parent`.
  const picked = selection.to > selection.from ? $at.nodeAfter : null
  const whole = picked && picked.nodeSize === selection.to - selection.from ? picked : null
  if (whole && mayHold(whole.type.name, name)) return selection.from + whole.nodeSize - 1
  for (let depth = $at.depth; depth >= 1; depth--) {
    const holder = $at.node(depth)
    if (!mayHold(holder.type.name, name)) continue
    // After the child of this container that holds the selection.
    return $at.depth > depth ? $at.after(depth + 1) : selection.from + (whole?.nodeSize ?? 0)
  }
  const point = insertionPoint(doc, selection)
  const before = slots[point.index]
  return before ? before.pos : topEnd()
}
