/**
 * Containers in the editor (B-28, AD-32): a band's column count never deletes
 * data, a fresh container leaves a caret, and the gallery drops a block at the
 * end of the container that has the focus.
 */
import { Schema, type Node as ProseNode } from '@milkdown/kit/prose/model'
import { TextSelection } from '@milkdown/kit/prose/state'
import { describe, expect, it } from 'vitest'

import {
  columnsOf,
  freshContainer,
  isHollow,
  lastColumnHolds,
  mayHold,
  withColumnCount,
} from '../src/editor/containers.js'
import { insertionPos } from '../src/editor/insertionPoint.js'
import { pmId } from '../src/editor/vocabulary.js'

const attrs = { attributes: { default: {} } }
const flow = 'paragraph*'
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    [pmId('section')]: { group: 'block', content: 'block*', attrs },
    [pmId('columns')]: { group: 'block', content: `${pmId('col')}*`, attrs },
    [pmId('col')]: { content: 'block*', attrs },
    [pmId('callout')]: { group: 'block', content: flow, attrs },
    text: { group: 'inline' },
  },
})
const n = schema.nodes
const p = (text?: string) => n.paragraph!.create(null, text ? schema.text(text) : undefined)
const col = (...k: ProseNode[]) => n[pmId('col')]!.create({ attributes: {} }, k)
const band = (...cols: ProseNode[]) => n[pmId('columns')]!.create({ attributes: {} }, cols)
const section = (...k: ProseNode[]) => n[pmId('section')]!.create({ attributes: {} }, k)
const doc = (...k: ProseNode[]) => n.doc!.create(null, k)

describe('mayHold', () => {
  it.each([
    ['section', 'callout', true],
    ['section', 'columns', true],
    ['section', 'section', false],
    ['section', 'col', false],
    ['col', 'callout', true],
    ['col', 'section', false],
    ['col', 'columns', false],
    ['col', 'col', false],
    ['columns', 'callout', false],
    ['callout', 'callout', false],
  ])('%s holds %s: %s', (parent, name, ok) => {
    expect(mayHold(parent, name)).toBe(ok)
  })
})

describe('freshContainer', () => {
  it('gives a band two columns, each with a caret place', () => {
    const b = freshContainer(schema, 'columns')!
    expect(columnsOf(b)).toBe(2)
    expect(b.child(0).childCount).toBe(1)
    expect(b.child(1).childCount).toBe(1)
  })
  it('gives a section an empty paragraph', () => {
    expect(freshContainer(schema, 'section')!.childCount).toBe(1)
  })
  it('builds nothing for a type the schema lacks', () => {
    expect(freshContainer(schema, 'nothing')).toBeNull()
  })
})

describe('withColumnCount', () => {
  it('adds an empty third column', () => {
    const next = withColumnCount(band(col(p('a')), col(p('b'))), schema, 3)!
    expect(columnsOf(next)).toBe(3)
    expect(isHollow(next.child(2))).toBe(true)
    expect(next.child(0).textContent).toBe('a')
  })
  it('takes the third away only when it is empty (no child or empty paragraphs)', () => {
    expect(columnsOf(withColumnCount(band(col(p('a')), col(p('b')), col(p())), schema, 2)!)).toBe(2)
    expect(columnsOf(withColumnCount(band(col(p('a')), col(p('b')), col()), schema, 2)!)).toBe(2)
  })
  it('refuses to take away a third that holds text, and says so by null', () => {
    const b = band(col(p('a')), col(p('b')), col(p('c')))
    expect(lastColumnHolds(b)).toBe(true)
    expect(withColumnCount(b, schema, 2)).toBeNull()
  })
  it('refuses a third that holds a block even if no text', () => {
    const b = band(col(p('a')), col(p('b')), col(n[pmId('callout')]!.create({ attributes: {} })))
    expect(lastColumnHolds(b)).toBe(true)
    expect(withColumnCount(b, schema, 2)).toBeNull()
  })
  it('same count is the same band', () => {
    const b = band(col(p()), col(p()))
    expect(withColumnCount(b, schema, 2)).toBe(b)
  })
  it('never goes below two nor deletes from a middle column', () => {
    const b = band(col(p('a')), col(p('b')))
    expect(withColumnCount(b, schema, 1)).toBeNull()
  })
})

describe('insertionPos in containers', () => {
  const sel = (d: ProseNode, pos: number) => {
    const s = TextSelection.create(d, pos)
    return { from: s.from, to: s.to, depth: s.$from.depth }
  }

  it('goes to the end of the page with no selection', () => {
    const d = doc(p('a'), section(p('b')))
    expect(insertionPos(d, undefined, 'callout')).toBe(d.content.size)
  })

  it('puts a block after the child of the section that has the caret, inside the section', () => {
    const d = doc(section(p('one'), p('two')), p('after'))
    const at = insertionPos(d, sel(d, 3), 'callout') // inside "one"
    expect(at).toBe(1 + p('one').nodeSize)
  })

  it('puts a block in a column after the child holding the caret', () => {
    const d = doc(band(col(p('a')), col(p('b'))))
    let pos = 0
    d.descendants((node, at) => {
      if (node.isText && node.text === 'b') pos = at + 1
    })
    const at = insertionPos(d, sel(d, pos), 'callout')
    const $at = d.resolve(at)
    expect($at.parent.type.name).toBe(pmId('col'))
    expect($at.parent.textContent).toBe('b')
  })

  it('never puts a section inside a section: it lands after it, on the page', () => {
    const d = doc(section(p('one')), p('tail'))
    const at = insertionPos(d, sel(d, 3), 'section')
    expect(d.resolve(at).depth).toBe(0)
    expect(at).toBe(section(p('one')).nodeSize)
  })

  it('never puts columns inside a column: it lands after the band', () => {
    const d = doc(band(col(p('a')), col(p('b'))))
    let pos = 0
    d.descendants((node, at) => {
      if (node.isText && node.text === 'a') pos = at + 1
    })
    const at = insertionPos(d, sel(d, pos), 'columns')
    expect(d.resolve(at).depth).toBe(0)
    expect(at).toBe(d.content.size)
  })

  it('puts columns in a section that has the caret', () => {
    const d = doc(section(p('one')))
    const at = insertionPos(d, sel(d, 3), 'columns')
    expect(d.resolve(at).parent.type.name).toBe(pmId('section'))
  })
})
