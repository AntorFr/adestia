/**
 * moveBlock / stepBlock / applyMove across containers (AD-structure-1): into,
 * out of and between columns, the three refusals (depth, none-next, bounds —
 * named `range` in the code) and "a refusal writes nothing".
 */
import { Schema, type Node as ProseNode } from '@milkdown/kit/prose/model'
import { EditorState } from '@milkdown/kit/prose/state'
import { describe, expect, it } from 'vitest'

import { applyMove, moveBlock, nodeAtPath, stepBlock, type Path } from '../src/editor/moveBlock.js'
import { said } from '../src/editor/moveui.js'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    frontmatter: { group: 'block', atom: true },
    card: { group: 'block', atom: true, attrs: { id: { default: '' } } },
    section: { group: 'block', content: 'block*' },
    columns: { group: 'block', content: 'col*' },
    col: { content: 'block*' },
    text: { group: 'inline' },
  },
})
const n = schema.nodes
const card = (id: string) => n.card!.create({ id })
const col = (...k: ProseNode[]) => n.col!.create(null, k)
const columns = (...c: ProseNode[]) => n.columns!.create(null, c)
const section = (...k: ProseNode[]) => n.section!.create(null, k)
const make = (...k: ProseNode[]) => n.doc!.create(null, k)

/** A compact picture of the tree: cards by id, containers by brackets. */
const show = (node: ProseNode): string => {
  const out: string[] = []
  node.forEach((c) => {
    const t = c.type.name
    out.push(t === 'card' ? (c.attrs.id as string) : t === 'paragraph' ? 'p' : `${t}[${show(c)}]`)
  })
  return out.join(' ')
}

const doStep = (doc: ProseNode, from: number | Path, dir: 'up' | 'down' | 'in' | 'out') => {
  const result = stepBlock(doc, from, dir)
  const tr = EditorState.create({ doc }).tr
  applyMove(tr, result)
  return { result, doc: tr.doc }
}

describe('moveBlock · refusals', () => {
  it('depth: a section into a column, a section into a section, columns into a column', () => {
    const doc = make(section(card('s')), columns(col(card('a')), col(card('b'))), section(card('t')))
    const colNode = nodeAtPath(doc, [1, 0])!.node
    expect(moveBlock(doc, 0, colNode, 0)).toEqual({ ok: false, reason: 'depth' })
    expect(moveBlock(doc, 2, nodeAtPath(doc, [0])!.node, 0)).toEqual({ ok: false, reason: 'depth' })
    expect(moveBlock(doc, 1, colNode, 0)).toEqual({ ok: false, reason: 'depth' })
  })
  it('depth: a container into itself or into its own descendant', () => {
    const doc = make(section(columns(col(card('a')), col(card('b')))))
    expect(moveBlock(doc, [0], nodeAtPath(doc, [0])!.node, 0)).toEqual({ ok: false, reason: 'depth' })
    expect(moveBlock(doc, [0], nodeAtPath(doc, [0, 0, 0])!.node, 0)).toEqual({ ok: false, reason: 'depth' })
  })
  it('depth refusal writes nothing', () => {
    const doc = make(section(card('s')), columns(col(card('a')), col(card('b'))))
    const result = moveBlock(doc, 0, nodeAtPath(doc, [1, 1])!.node, 0)
    const tr = EditorState.create({ doc }).tr
    expect(applyMove(tr, result)).toBeUndefined()
    expect(tr.docChanged).toBe(false)
  })
  it('none-next: Alt+→ with nothing after, or a plain block after, or a section as last block', () => {
    const doc = make(card('a'), card('b'), section(card('x')))
    expect(stepBlock(doc, 2, 'in')).toEqual({ ok: false, reason: 'none-next' })
    expect(stepBlock(doc, 0, 'in')).toEqual({ ok: false, reason: 'none-next' })
    expect(doStep(doc, 2, 'in').doc).toBe(doc)
  })
  it('bounds (code name: range): index past either end, bad source, page edge on step', () => {
    const doc = make(card('a'), columns(col(card('b')), col(card('c'))))
    const colNode = nodeAtPath(doc, [1, 0])!.node
    expect(moveBlock(doc, 0, colNode, 5)).toEqual({ ok: false, reason: 'range' })
    expect(moveBlock(doc, 0, colNode, -1)).toEqual({ ok: false, reason: 'range' })
    expect(moveBlock(doc, [1, 0, 7], doc, 0)).toEqual({ ok: false, reason: 'range' })
    expect(moveBlock(doc, [], doc, 0)).toEqual({ ok: false, reason: 'range' })
    expect(moveBlock(doc, [1, 0, 0], colNode, 1)).toEqual({ ok: false, reason: 'range' })
    expect(stepBlock(doc, 0, 'up')).toEqual({ ok: false, reason: 'range' })
    expect(stepBlock(doc, [1, 1, 0], 'down')).toEqual({ ok: false, reason: 'range' })
    expect(stepBlock(doc, 0, 'out')).toEqual({ ok: false, reason: 'range' })
  })
  it('a column is not a block: it cannot be moved', () => {
    const doc = make(columns(col(card('a')), col(card('b'))), section())
    expect(moveBlock(doc, [0, 0], nodeAtPath(doc, [1])!.node, 0).ok).toBe(false)
  })
  it('says the reason of each refusal', () => {
    const t = (k: string) => k
    expect(said({ ok: false, reason: 'depth' }, t)).toMatch(/Too deep/)
    expect(said({ ok: false, reason: 'none-next' }, t)).toMatch(/Nothing after/)
    expect(said({ ok: false, reason: 'range' }, t, 'out')).toBe('Already at the page level')
  })
})

describe('stepBlock · into, out of, between', () => {
  it('Alt+→ enters the first column of the band that follows (at its start)', () => {
    const doc = make(card('a'), columns(col(card('b')), col(card('c'))))
    expect(doStep(doc, 0, 'in').doc && show(doStep(doc, 0, 'in').doc)).toBe('columns[col[a b] col[c]]')
  })
  it('Alt+→ enters a section that follows', () => {
    const doc = make(card('a'), section(card('b')))
    expect(show(doStep(doc, 0, 'in').doc)).toBe('section[a b]')
  })
  it('Alt+← leaves the band, landing right after it', () => {
    const doc = make(columns(col(card('a'), card('b')), col(card('c'))), card('z'))
    expect(show(doStep(doc, [0, 0, 1], 'out').doc)).toBe('columns[col[a] col[c]] b z')
  })
  it('Alt+← leaves a section, landing right after it', () => {
    const doc = make(section(card('a'), card('b')), card('z'))
    expect(show(doStep(doc, [0, 0], 'out').doc)).toBe('section[b] a z')
  })
  it('Alt+← from a column inside a section lands in the section after the band', () => {
    const doc = make(section(columns(col(card('a')), col(card('b'))), card('z')))
    expect(show(doStep(doc, [0, 0, 0, 0], 'out').doc)).toBe('section[columns[col[] col[b]] a z]')
  })
  it('Alt+← at the page level is refused', () => {
    expect(stepBlock(make(card('a')), 0, 'out')).toEqual({ ok: false, reason: 'range' })
  })
  it('down at the bottom of a column goes to the top of the next; up at the top goes to the bottom of the previous', () => {
    const doc = make(columns(col(card('a'), card('b')), col(card('c'))))
    expect(show(doStep(doc, [0, 0, 1], 'down').doc)).toBe('columns[col[a] col[b c]]')
    expect(show(doStep(doc, [0, 1, 0], 'up').doc)).toBe('columns[col[a b c] col[]]')
  })
  it('a block drags between two columns (moveBlock)', () => {
    const doc = make(columns(col(card('a'), card('b')), col(card('c'))))
    const result = moveBlock(doc, [0, 0, 0], nodeAtPath(doc, [0, 1])!.node, 1)
    expect(result.ok).toBe(true)
    const tr = EditorState.create({ doc }).tr
    applyMove(tr, result)
    expect(show(tr.doc)).toBe('columns[col[b] col[c a]]')
  })
  it('a section carries its content when it moves on the page', () => {
    const doc = make(section(card('a'), columns(col(card('b')), col(card('c')))), card('z'))
    const result = moveBlock(doc, 0, doc, 1)
    const tr = EditorState.create({ doc }).tr
    applyMove(tr, result)
    expect(show(tr.doc)).toBe('z section[a columns[col[b] col[c]]]')
  })
  it('a band moves into a section keeping its columns', () => {
    const doc = make(columns(col(card('a')), col(card('b'))), section(card('s')))
    const tr = EditorState.create({ doc }).tr
    applyMove(tr, stepBlock(doc, 0, 'in'))
    expect(show(tr.doc)).toBe('section[columns[col[a] col[b]] s]')
  })
  it('in then out is a round trip', () => {
    const doc = make(card('a'), columns(col(card('b')), col(card('c'))))
    const inside = doStep(doc, 0, 'in').doc
    // a is now at [0,0,0]; out puts it after the band
    expect(show(doStep(inside, [0, 0, 0], 'out').doc)).toBe('columns[col[b] col[c]] a')
  })
  it('empty paragraphs are not counted as places', () => {
    const doc = make(card('a'), n.paragraph!.create(), columns(col(card('b')), col(card('c'))))
    expect(show(doStep(doc, 0, 'in').doc)).toBe('p columns[col[a b] col[c]]')
  })
})
