/**
 * Where the gallery puts a block (B-24): after the block that has the
 * selection, at the end of the page when none has.
 */
import { Schema, type Node as ProseNode } from '@milkdown/kit/prose/model'
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state'
import { describe, expect, it } from 'vitest'

import { insertionPoint } from '../src/editor/insertionPoint.js'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    frontmatter: { group: 'block', atom: true },
    card: { group: 'block', content: 'text*', attrs: { id: { default: '' } } },
    text: { group: 'inline' },
  },
})
const card = (id: string) => schema.nodes.card!.create({ id }, schema.text(id))
const make = (...kids: ProseNode[]) => schema.nodes.doc!.create(null, kids)
const six = () => make(schema.nodes.frontmatter!.create(), card('a'), card('b'), card('c'), card('d'), card('e'), card('f'))

function at(doc: ProseNode, sel: (d: ProseNode) => TextSelection | NodeSelection) {
  const s = sel(doc)
  return insertionPoint(doc, { from: s.from, to: s.to, depth: s.$from.depth })
}
/** Position of the nth movable (after the frontmatter) top-level node. */
const posOf = (doc: ProseNode, n: number) => {
  let pos = 0
  for (let i = 0; i <= n; i++) pos += doc.child(i).nodeSize
  return pos
}

describe('insertionPoint', () => {
  it('goes to the end of the page with no selection', () => {
    const doc = six()
    expect(insertionPoint(doc)).toMatchObject({ index: 6 })
    expect(insertionPoint(doc).parent).toBe(doc)
  })

  it('goes after the block holding the cursor', () => {
    const doc = six()
    expect(at(doc, (d) => TextSelection.create(d, posOf(d, 2) + 1)).index).toBe(3) // inside c (3rd card)
    expect(at(doc, (d) => TextSelection.create(d, posOf(d, 0) + 1)).index).toBe(1) // inside a
  })

  it('goes after a block selected as a whole', () => {
    const doc = six()
    expect(at(doc, (d) => NodeSelection.create(d, posOf(d, 0))).index).toBe(1) // a selected: slot after it
    expect(at(doc, (d) => NodeSelection.create(d, posOf(d, 3))).index).toBe(4) // d selected
  })

  it('goes to the end when the selection is in the frontmatter strip', () => {
    const doc = six()
    expect(at(doc, (d) => NodeSelection.create(d, 0)).index).toBe(6)
  })

  it('a page of no movable block gives slot 0', () => {
    const doc = make(schema.nodes.frontmatter!.create(), schema.nodes.paragraph!.create())
    expect(insertionPoint(doc).index).toBe(0)
  })

  it('a cursor in a trailing empty paragraph is the end', () => {
    const doc = make(card('a'), card('b'), schema.nodes.paragraph!.create())
    expect(at(doc, (d) => TextSelection.create(d, d.content.size - 1)).index).toBe(2)
  })
})
