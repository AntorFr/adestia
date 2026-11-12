/**
 * The one operation that moves a block (AD-deplacer-1).
 *
 * The grip's drag, the long press, Move up / Move down and Alt+↑/↓ all end
 * here: `moveBlock` judges a move on the page tree and says what it would do;
 * `applyMove` writes it. Whoever asks draws the drop line, the live region and
 * the refusal from the RESULT, never from its own idea of the move.
 *
 * Positions are indices among the page's movable children: everything at the
 * top of the document except the frontmatter (the file's first lines) and the
 * empty paragraphs (written as nothing, so not content). `toIndex` is the index
 * the block will HAVE once moved, 0 to total-1.
 */

import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { NodeSelection, type Transaction } from '@milkdown/kit/prose/state'

export type MoveResult =
  | { readonly ok: true; readonly from: number; readonly to: number; readonly total: number }
  | { readonly ok: false; readonly reason: 'range' | 'parent' }

interface Slot {
  readonly pos: number
  readonly size: number
}

/** The top-level children that can be moved, in order, with where they sit. */
export function movableSlots(doc: ProseNode): Slot[] {
  const slots: Slot[] = []
  doc.forEach((node, pos) => {
    if (node.type.name === 'frontmatter') return
    if (node.type.name === 'paragraph' && node.content.size === 0) return
    slots.push({ pos, size: node.nodeSize })
  })
  return slots
}

/** The index of the movable child at document position `pos`, or -1. */
export function indexAt(doc: ProseNode, pos: number): number {
  return movableSlots(doc).findIndex((slot) => slot.pos === pos)
}

/**
 * Would block `from` go to `toIndex` under `toParent`? Tranche 1 only passes the
 * page root; any other parent is refused. A move onto its own place is `ok`
 * with `from === to` — nothing to write.
 */
export function moveBlock(doc: ProseNode, from: number, toParent: ProseNode, toIndex: number): MoveResult {
  if (toParent !== doc) return { ok: false, reason: 'parent' }
  const total = movableSlots(doc).length
  const inRange = (index: number) => Number.isInteger(index) && index >= 0 && index < total
  if (!inRange(from) || !inRange(toIndex)) return { ok: false, reason: 'range' }
  return { ok: true, from, to: toIndex, total }
}

/**
 * Writes an accepted move into `tr` and selects the moved block. Returns the
 * document position it now sits at, or undefined when nothing moved.
 */
export function applyMove(tr: Transaction, result: MoveResult): number | undefined {
  if (!result.ok || result.from === result.to) return undefined
  const slots = movableSlots(tr.doc)
  const moved = slots[result.from]
  if (!moved) return undefined
  const node = tr.doc.nodeAt(moved.pos)
  if (!node) return undefined
  const rest = slots.filter((_, index) => index !== result.from)
  const before = rest[result.to]
  const last = rest[rest.length - 1]
  const target = before ? before.pos : last ? last.pos + last.size : moved.pos
  tr.delete(moved.pos, moved.pos + moved.size)
  const to = tr.mapping.map(target)
  tr.insert(to, node)
  tr.setSelection(NodeSelection.create(tr.doc, to))
  return to
}

/**
 * A drop SLOT (0..total: the gap before block n, total being after the last)
 * as the index the dragged block will have once it has gone there.
 */
export function slotToIndex(from: number, slot: number): number {
  return slot > from ? slot - 1 : slot
}

/** The drop slot a document position stands for: how many movable blocks lie before it. */
export function slotAtPos(doc: ProseNode, pos: number): number {
  return movableSlots(doc).filter((slot) => slot.pos < pos).length
}
