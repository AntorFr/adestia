/**
 * The one operation that moves a block (AD-deplacer-1, AD-structure-1).
 *
 * The grip's drag, the long press, the move buttons and Alt+←↑↓→ all end here:
 * `moveBlock` judges a move on the page tree and says what it would do;
 * `applyMove` writes it. Whoever asks draws the drop line, the live region and
 * the refusal from the RESULT, never from its own idea of the move.
 *
 * A place is a PATH of indices through the tree: page → section → column. At
 * each level an index counts the movable children: everything except the
 * frontmatter (the page's first lines) and the empty paragraphs (written as
 * nothing, so not content). A number stands for the one-step path at the page
 * level. `toIndex` is the index the block will HAVE once moved.
 *
 * Reasons of refusal: `range` (the AD's `bounds`: past either end, or the
 * page's edge), `depth` (the nesting rule of AD-32), `none-next` (nothing that
 * can take the block follows it), `parent` (not a place that holds blocks).
 */

import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { NodeSelection, type Transaction } from '@milkdown/kit/prose/state'

import { mayHold } from './containers.js'

export type Path = readonly number[]

export type MoveReason = 'range' | 'parent' | 'depth' | 'none-next'

/**
 * `from`, `to` are indices among the movable children of the block's old and
 * new parent, `total` the movable children of the new parent once moved. The
 * paths are present only for a move that touches a container.
 */
export type MoveResult =
  | {
      readonly ok: true
      readonly from: number
      readonly to: number
      readonly total: number
      readonly fromPath?: Path
      readonly parentPath?: Path
    }
  | { readonly ok: false; readonly reason: MoveReason }

interface Slot {
  readonly pos: number
  readonly size: number
}

const isHolder = (name: string) => name === 'section' || name === 'col'

function movableChildren(parent: ProseNode, base: number, top: boolean): Slot[] {
  const slots: Slot[] = []
  parent.forEach((node, offset) => {
    if (top && node.type.name === 'frontmatter') return
    if (node.type.name === 'paragraph' && node.content.size === 0) return
    slots.push({ pos: base + offset, size: node.nodeSize })
  })
  return slots
}

/** The top-level children that can be moved, in order, with where they sit. */
export function movableSlots(doc: ProseNode): Slot[] {
  return movableChildren(doc, 0, true)
}

/** The movable children of the node at `path` (the page for []), with their document positions. */
export function slotsAt(doc: ProseNode, path: Path): Slot[] | undefined {
  const found = nodeAtPath(doc, path)
  if (!found) return undefined
  return movableChildren(found.node, path.length === 0 ? 0 : found.pos + 1, path.length === 0)
}

/** The node a path leads to and where it sits; [] is the page. */
export function nodeAtPath(doc: ProseNode, path: Path): { node: ProseNode; pos: number } | undefined {
  let node = doc
  let pos = -1
  for (const index of path) {
    const slots = movableChildren(node, pos + 1, node === doc)
    const slot = slots[index]
    const child = slot ? node.nodeAt(slot.pos - (pos + 1)) : null
    if (!slot || !child) return undefined
    node = child
    pos = slot.pos
  }
  return { node, pos }
}

/** The path of `target` in the page, found by identity; undefined if it is not in it. */
export function pathOf(doc: ProseNode, target: ProseNode): Path | undefined {
  if (target === doc) return []
  const walk = (node: ProseNode, top: boolean): Path | undefined => {
    let index = 0
    let found: Path | undefined
    node.forEach((child) => {
      if (found) return
      if (top && child.type.name === 'frontmatter') return
      if (child.type.name === 'paragraph' && child.content.size === 0) return
      if (child === target) found = [index]
      else if (isHolder(child.type.name) || child.type.name === 'columns') {
        const inner = walk(child, false)
        if (inner) found = [index, ...inner]
      }
      index++
    })
    return found
  }
  return walk(doc, true)
}

/** The index of the movable child at document position `pos`, or -1. */
export function indexAt(doc: ProseNode, pos: number): number {
  return movableSlots(doc).findIndex((slot) => slot.pos === pos)
}

/** The path of the movable block at document position `pos`, or undefined. */
export function pathAtPos(doc: ProseNode, pos: number): Path | undefined {
  if (pos < 0 || pos > doc.content.size) return undefined
  const $pos = doc.resolve(pos)
  const path: number[] = []
  let node: ProseNode = doc
  let base = 0
  for (let depth = 0; depth <= $pos.depth; depth++) {
    const slots = movableChildren(node, base, node === doc)
    const here = depth === $pos.depth ? pos : $pos.before(depth + 1)
    const index = slots.findIndex((slot) => slot.pos === here)
    if (index < 0) return undefined
    path.push(index)
    if (depth === $pos.depth) return path
    node = $pos.node(depth + 1)
    // Only sections, bands and columns are places; the inside of any other block is not.
    if (!isHolder(node.type.name) && node.type.name !== 'columns') return undefined
    base = $pos.start(depth + 1)
  }
  return path
}

const same = (a: Path, b: Path) => a.length === b.length && a.every((n, i) => n === b[i])

/**
 * Would the block at `from` (an index on the page, or a path) go to `toIndex`
 * under `toParent`? A move onto its own place is `ok` with `from === to` —
 * nothing to write. `toParent` is the page or a section or column of it.
 */
export function moveBlock(doc: ProseNode, from: number | Path, toParent: ProseNode, toIndex: number): MoveResult {
  const source: Path = typeof from === 'number' ? [from] : from
  const parentPath = pathOf(doc, toParent)
  if (!parentPath) return { ok: false, reason: 'parent' }
  const holder = parentPath.length === 0 ? doc : nodeAtPath(doc, parentPath)?.node
  if (!holder || (holder !== doc && !isHolder(holder.type.name))) return { ok: false, reason: 'parent' }

  const moved = source.length > 0 && source.every((n) => Number.isInteger(n) && n >= 0) ? nodeAtPath(doc, source) : undefined
  if (!moved) return { ok: false, reason: 'range' }
  const count = slotsAt(doc, parentPath)?.length ?? 0
  const sameParent = same(source.slice(0, -1), parentPath)
  const last = sameParent ? count - 1 : count
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex > last) return { ok: false, reason: 'range' }

  const name = moved.node.type.name
  if (name === 'col') return { ok: false, reason: 'parent' }
  const inside = parentPath.length >= source.length && same(parentPath.slice(0, source.length), source)
  if (inside || (holder !== doc && !mayHold(holder.type.name, name))) return { ok: false, reason: 'depth' }

  const nested = source.length > 1 || parentPath.length > 0
  return {
    ok: true,
    from: source[source.length - 1] ?? 0,
    to: toIndex,
    total: sameParent ? count : count + 1,
    ...(nested ? { fromPath: source, parentPath } : {}),
  }
}

export type Direction = 'up' | 'down' | 'in' | 'out'

/**
 * The judgment of a step by the keyboard or a button: up and down one place
 * among the siblings (crossing to the neighbouring column at a column's edge),
 * `in` into the container that immediately follows, `out` to just after the
 * container it sits in. Returns the same answer `moveBlock` gives.
 */
export function stepBlock(doc: ProseNode, from: number | Path, direction: Direction): MoveResult {
  const source: Path = typeof from === 'number' ? [from] : from
  const found = nodeAtPath(doc, source)
  if (!found) return { ok: false, reason: 'range' }
  const parentPath = source.slice(0, -1)
  const index = source[source.length - 1] ?? 0
  const parent = parentPath.length === 0 ? doc : nodeAtPath(doc, parentPath)?.node
  if (!parent) return { ok: false, reason: 'range' }
  const siblings = slotsAt(doc, parentPath)?.length ?? 0

  if (direction === 'up' || direction === 'down') {
    const step = direction === 'up' ? -1 : 1
    const to = index + step
    if (to >= 0 && to < siblings) return moveBlock(doc, source, parent, to)
    // At the edge of a column: on into the next (or previous) column of the same band.
    if (parent.type.name === 'col') {
      const bandPath = parentPath.slice(0, -1)
      const band = nodeAtPath(doc, bandPath)?.node
      const place = parentPath[parentPath.length - 1] ?? 0
      const neighbour = band ? nodeAtPath(doc, [...bandPath, place + step]) : undefined
      if (neighbour) {
        const into = step === 1 ? 0 : (slotsAt(doc, [...bandPath, place + step])?.length ?? 0)
        return moveBlock(doc, source, neighbour.node, into)
      }
    }
    return { ok: false, reason: 'range' }
  }

  if (direction === 'out') {
    if (parentPath.length === 0) return { ok: false, reason: 'range' }
    // A block in a column leaves the band, not the column alone.
    const exitPath = parent.type.name === 'col' ? parentPath.slice(0, -1) : parentPath
    const container = exitPath.length === 0 ? undefined : nodeAtPath(doc, exitPath)
    if (!container) return { ok: false, reason: 'range' }
    const destPath = exitPath.slice(0, -1)
    const dest = destPath.length === 0 ? doc : nodeAtPath(doc, destPath)?.node
    if (!dest) return { ok: false, reason: 'range' }
    return moveBlock(doc, source, dest, (exitPath[exitPath.length - 1] ?? 0) + 1)
  }

  // in: the container that immediately follows.
  const nextPath = [...parentPath, index + 1]
  const next = index + 1 < siblings ? nodeAtPath(doc, nextPath) : undefined
  if (!next) return { ok: false, reason: 'none-next' }
  const kind = next.node.type.name
  if (kind === 'columns') {
    const col = nodeAtPath(doc, [...nextPath, 0])
    if (!col) return { ok: false, reason: 'none-next' }
    return moveBlock(doc, source, col.node, 0)
  }
  if (kind === 'section') return moveBlock(doc, source, next.node, 0)
  return { ok: false, reason: 'none-next' }
}

/**
 * Writes an accepted move into `tr` and selects the moved block. Returns the
 * document position it now sits at, or undefined when nothing moved.
 */
export function applyMove(tr: Transaction, result: MoveResult): number | undefined {
  if (!result.ok) return undefined
  const source: Path = result.fromPath ?? [result.from]
  const parentPath: Path = result.parentPath ?? []
  const sameParent = same(source.slice(0, -1), parentPath)
  if (sameParent && result.from === result.to) return undefined
  const moved = nodeAtPath(tr.doc, source)
  if (!moved) return undefined
  const slots = slotsAt(tr.doc, parentPath)
  const holder = nodeAtPath(tr.doc, parentPath)
  if (!slots || !holder) return undefined
  const rest = sameParent ? slots.filter((_, i) => i !== result.from) : slots
  const before = rest[result.to]
  const last = rest[rest.length - 1]
  const start = parentPath.length === 0 ? 0 : holder.pos + 1
  const target = before ? before.pos : last ? last.pos + last.size : start
  const size = moved.node.nodeSize
  tr.delete(moved.pos, moved.pos + size)
  const to = tr.mapping.map(target)
  tr.insert(to, moved.node)
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

/** The drop slot of `pos` among the movable children of the node at `path`. */
export function slotAtPosIn(doc: ProseNode, path: Path, pos: number): number {
  return (slotsAt(doc, path) ?? []).filter((slot) => slot.pos < pos).length
}
