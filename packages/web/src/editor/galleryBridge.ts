/**
 * How the gallery reaches the editing surface without owning it.
 *
 * "Add block" lives in the React bar, "Browse" in Milkdown's `/` menu, and the
 * ProseMirror view in neither's reach. The surface registers what it can do
 * against its host element; the menu asks the bar to open by an event the host
 * hears. The point of insertion is read at the moment of insertion, from the
 * selection the view still holds while the sheet has the focus.
 */

import { editorViewCtx } from '@milkdown/kit/core'
import type { Editor } from '@milkdown/kit/core'
import { NodeSelection } from '@milkdown/kit/prose/state'

import { insertionPoint } from './insertionPoint.js'
import { movableSlots } from './moveBlock.js'
import { seed } from './slash.js'
import { editorBlocks, pmId } from './vocabulary.js'

type Insert = (name: string) => boolean
const surfaces = new WeakMap<HTMLElement, Insert>()

/** Registered by `mountMilkdown`; returns the undo of the registration. */
export function registerSurface(host: HTMLElement, editor: Editor): () => void {
  surfaces.set(host, (name) => editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const spec = editorBlocks().find((one) => one.name === name)
    const type = view.state.schema.nodes[pmId(name)]
    const node = spec && type ? type.createAndFill({ attributes: seed(spec) }) : null
    if (!node) return false
    const { doc, selection } = view.state
    const point = insertionPoint(doc, { from: selection.from, to: selection.to, depth: selection.$from.depth })
    const slots = movableSlots(doc)
    const before = slots[point.index]
    const last = slots[slots.length - 1]
    const at = before ? before.pos : last ? last.pos + last.size : doc.content.size
    const tr = view.state.tr.insert(at, node)
    tr.setSelection(NodeSelection.create(tr.doc, at))
    view.dispatch(tr.scrollIntoView())
    view.focus()
    return true
  }))
  return () => void surfaces.delete(host)
}

/** Inserts a block of the gallery on the surface mounted in `host`; false when it could not. */
export function insertFromGallery(host: HTMLElement | null, name: string): boolean {
  const insert = host ? surfaces.get(host) : undefined
  return insert ? insert(name) : false
}
