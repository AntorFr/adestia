/**
 * How the gallery reaches the editing surface without owning it.
 *
 * "Add block" lives in the React bar, "Browse" in Milkdown's `/` menu, and the
 * ProseMirror view in neither's reach. The surface registers what it can do
 * against its host element; the menu asks the bar to open by an event the host
 * hears. The point of insertion is read at the moment of insertion, from the
 * selection the view still holds while the sheet has the focus.
 */

import { editorViewCtx, parserCtx } from '@milkdown/kit/core'
import type { Editor } from '@milkdown/kit/core'
import { shapesOf } from '@antorfr/adestia-content'
import { NodeSelection } from '@milkdown/kit/prose/state'

import { insertionPoint } from './insertionPoint.js'
import { movableSlots } from './moveBlock.js'
import { seed } from './slash.js'
import { editorBlocks, pmId } from './vocabulary.js'

const DEFAULT_BODY: Record<string, string> = {
  figures: '- Label: 0',
  table: '| A | B |\n| --- | --- |\n| 1 | 2 |',
}

type Insert = (name: string) => boolean
const surfaces = new WeakMap<HTMLElement, Insert>()

/** Registered by `mountMilkdown`; returns the undo of the registration. */
export function registerSurface(host: HTMLElement, editor: Editor): () => void {
  // ProseMirror starts with a selection at the top of the document that nobody
  // placed; only a pointer or key event inside the surface makes it the user's.
  let placed = false
  const place = () => { placed = true }
  const events = ['pointerdown', 'mousedown', 'touchstart', 'keydown'] as const
  for (const name of events) host.addEventListener(name, place, true)
  surfaces.set(host, (name) => editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const spec = editorBlocks().find((one) => one.name === name)
    const type = view.state.schema.nodes[pmId(name)]
    const attrs = { attributes: seed(spec ?? { name, attributes: {} } as never) }
    // A block that holds flow must not be saved empty (the page would be refused),
    // so it lands with the body its default values give it.
    const body = spec && shapesOf(name).has('flow') ? (DEFAULT_BODY[name] ?? 'Text') : null
    let node = null
    if (spec && type && body) {
      try {
        node = type.createAndFill(attrs, ctx.get(parserCtx)(body).content)
      } catch { node = null }
    }
    if (spec && type && !node) node = type.createAndFill(attrs)
    if (!node) return false
    const { doc, selection } = view.state
    const point = placed
      ? insertionPoint(doc, { from: selection.from, to: selection.to, depth: selection.$from.depth })
      : { parent: doc, index: movableSlots(doc).length }
    const slots = movableSlots(doc)
    const before = slots[point.index]
    const last = slots[slots.length - 1]
    const at = before ? before.pos : last ? last.pos + last.size : doc.content.size
    const tr = view.state.tr.insert(at, node)
    tr.setSelection(NodeSelection.create(tr.doc, at))
    view.dispatch(tr.scrollIntoView())
    placed = true
    view.focus()
    return true
  }))
  return () => {
    for (const name of events) host.removeEventListener(name, place, true)
    surfaces.delete(host)
  }
}

/** Inserts a block of the gallery on the surface mounted in `host`; false when it could not. */
export function insertFromGallery(host: HTMLElement | null, name: string): boolean {
  const insert = host ? surfaces.get(host) : undefined
  return insert ? insert(name) : false
}
