/**
 * What every way of moving a block shares once `moveBlock` has judged it: the
 * write, the live region that says where the block went (or why it did not),
 * and the keyboard rule. Nothing here decides a move; `moveBlock.ts` does.
 */

import { Plugin } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'

import { applyMove, indexAt, moveBlock, movableSlots, type MoveResult } from './moveBlock.js'

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

/** The sentence a result calls for; `direction` tells "first" from "last" on a range refusal. */
export function said(result: MoveResult, t: Say, direction?: -1 | 1): string {
  if (result.ok) {
    return t('Moved to position %n of %total').replace('%n', String(result.to + 1)).replace('%total', String(result.total))
  }
  if (result.reason === 'range' && direction === -1) return t('Already first')
  if (result.reason === 'range' && direction === 1) return t('Already last')
  return t('It cannot go there')
}

/** Judge, write and announce a move of block `from` to index `to` on the page. Returns where it now sits. */
export function moveTo(view: EditorView, from: number, to: number, t: Say, direction?: -1 | 1): number | undefined {
  const doc = view.state.doc
  const result = moveBlock(doc, from, doc, to)
  announce(view.dom.ownerDocument, said(result, t, direction))
  if (!result.ok) return undefined
  const tr = view.state.tr
  const at = applyMove(tr, result)
  if (at !== undefined) view.dispatch(tr.scrollIntoView())
  return at
}

/** One place up or down. Out of range, the block stays and the region says first/last. */
export function moveByStep(view: EditorView, from: number, step: -1 | 1, t: Say = identity): number | undefined {
  return moveTo(view, from, from + step, t, step)
}

/** Whether block `index` of the page can go that way — what `disabled` on the buttons reads. */
export function canMove(view: EditorView, index: number, step: -1 | 1): boolean {
  const doc = view.state.doc
  return moveBlock(doc, index, doc, index + step).ok
}

/** Total movable blocks and the index of the one at `pos` (top level only), for the bar's state. */
export function placeOf(view: EditorView, pos: number): { index: number; total: number } {
  return { index: indexAt(view.state.doc, pos), total: movableSlots(view.state.doc).length }
}

/** Alt+↑ / Alt+↓ as a direction, or undefined for any other key. */
export function stepOf(event: KeyboardEvent): -1 | 1 | undefined {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return undefined
  return event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : undefined
}

/**
 * Alt+↑/↓ with the editor itself focused (a block selected, or the caret in
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
            const pos = selection.$from.depth === 0 ? selection.from : selection.$from.before(1)
            const index = indexAt(view.state.doc, pos)
            if (index < 0) return false
            event.preventDefault()
            moveByStep(view, index, step, t)
            return true
          },
        },
      }),
  )
