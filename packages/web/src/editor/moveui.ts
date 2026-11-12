/**
 * What every way of moving a block shares once `moveBlock` has judged it: the
 * write, the live region that says where the block went (or why it did not),
 * and the keyboard rule. Nothing here decides a move; `moveBlock.ts` does.
 */

import { NodeSelection, Plugin, type Selection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'

import type { Node as ProseNode } from '@milkdown/kit/prose/model'

import { applyMove, moveBlock, pathAtPos, slotsAt, stepBlock, type Direction, type MoveResult, type Path } from './moveBlock.js'

type Say = (key: string) => string
const identity: Say = (key) => key

const NOTE_MS = 4000
const notes = new WeakMap<Document, { element: HTMLElement; timer?: ReturnType<typeof setTimeout> }>()

/** The live region: polite, visible for a few seconds, one per document. */
export function announce(doc: Document, text: string): void {
  let note = notes.get(doc)
  if (!note) {
    const element = doc.createElement('div')
    element.className = 'adestia-movenote'
    element.setAttribute('role', 'status')
    element.setAttribute('aria-live', 'polite')
    element.hidden = true
    doc.body.append(element)
    note = { element }
    notes.set(doc, note)
  }
  clearTimeout(note.timer)
  note.element.textContent = text
  note.element.hidden = text === ''
  const kept = note
  if (text) kept.timer = setTimeout(() => announce(doc, ''), NOTE_MS)
}

/**
 * The sentence a result calls for. `direction` tells "first" from "last" on a
 * range refusal, and "already at the page level" from both when the step was out.
 */
export function said(result: MoveResult, t: Say, direction?: -1 | 1 | Direction): string {
  if (result.ok) {
    return t('Moved to position %n of %total').replace('%n', String(result.to + 1)).replace('%total', String(result.total))
  }
  if (result.reason === 'range' && (direction === -1 || direction === 'up')) return t('Already first')
  if (result.reason === 'range' && (direction === 1 || direction === 'down')) return t('Already last')
  if (result.reason === 'range' && direction === 'out') return t('Already at the page level')
  if (result.reason === 'depth') return t('Too deep: a section or columns cannot go inside a column, nor a section inside a section')
  if (result.reason === 'none-next') return t('Nothing after it can take the block')
  return t('It cannot go there')
}

/** Judge, write and announce a move of the block at `from` to `index` under `parent`. Returns where it now sits. */
export function moveTo(
  view: EditorView,
  from: number | Path,
  parent: ProseNode,
  index: number,
  t: Say,
  direction?: -1 | 1 | Direction,
): number | undefined {
  const result = moveBlock(view.state.doc, from, parent, index)
  return write(view, result, t, direction)
}

function write(view: EditorView, result: MoveResult, t: Say, direction?: -1 | 1 | Direction): number | undefined {
  announce(view.dom.ownerDocument, said(result, t, direction))
  if (!result.ok) return undefined
  const tr = view.state.tr
  const at = applyMove(tr, result)
  if (at !== undefined) view.dispatch(tr.scrollIntoView())
  return at
}

/** One step — up, down, in, out — from a button or a key. A refusal leaves the block and says why. */
export function moveByStep(view: EditorView, from: number | Path, step: -1 | 1 | Direction, t: Say = identity): number | undefined {
  const direction: Direction = step === -1 ? 'up' : step === 1 ? 'down' : step
  return write(view, stepBlock(view.state.doc, from, direction), t, direction)
}

/** Whether the block at `from` can take that step — what `disabled` on the buttons reads. */
export function canMove(view: EditorView, from: number | Path, step: -1 | 1 | Direction): boolean {
  const direction: Direction = step === -1 ? 'up' : step === 1 ? 'down' : step
  return stepBlock(view.state.doc, from, direction).ok
}

/** The path of the block at `pos` and the movable blocks beside it, for the bar's state. */
export function placeOf(view: EditorView, pos: number): { path: Path | undefined; index: number; total: number } {
  const path = pathAtPos(view.state.doc, pos)
  if (!path) return { path, index: -1, total: 0 }
  const siblings = slotsAt(view.state.doc, path.slice(0, -1))
  return { path, index: path[path.length - 1] ?? -1, total: siblings?.length ?? 0 }
}

/** Alt+↑/↓/←/→ as a step, or undefined for any other key. */
export function stepOf(event: KeyboardEvent): Direction | undefined {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return undefined
  switch (event.key) {
    case 'ArrowUp':
      return 'up'
    case 'ArrowDown':
      return 'down'
    case 'ArrowLeft':
      return 'out'
    case 'ArrowRight':
      return 'in'
    default:
      return undefined
  }
}

/**
 * The innermost movable block that holds the selection: the node itself when it
 * is selected, else the deepest block above the caret that is not a `col` (a
 * column is a place, not a block).
 */
function blockPathOf(view: EditorView, selection: Selection): Path | undefined {
  const { doc } = view.state
  if (selection instanceof NodeSelection) return pathAtPos(doc, selection.from)
  const $from = selection.$from
  for (let depth = $from.depth; depth >= 1; depth--) {
    if ($from.node(depth).type.name === 'col') continue
    const path = pathAtPos(doc, $from.before(depth))
    if (path) return path
  }
  return undefined
}

/**
 * Alt+arrows with the editor itself focused (a block selected, or the caret in
 * its body): the block holding the selection moves. The bar's own buttons keep
 * the editor from seeing their keys, so `blockview.tsx` listens there too.
 */
export const moveShortcut = (t: Say = identity) =>
  $prose(
    () =>
      new Plugin({
        props: {
          handleKeyDown(view, event) {
            const step = stepOf(event)
            if (!step) return false
            const { selection } = view.state
            const path = blockPathOf(view, selection)
            if (!path) return false
            event.preventDefault()
            moveByStep(view, path, step, t)
            return true
          },
        },
      }),
  )
