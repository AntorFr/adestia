/**
 * moveBlock (AD-deplacer-1): the one judgment every way of moving a block asks.
 * Doc: frontmatter + n directive blocks (+ empty paragraphs), a minimal schema.
 */
import { Schema, type Node as ProseNode } from '@milkdown/kit/prose/model'
import { EditorState } from '@milkdown/kit/prose/state'
import { describe, expect, it } from 'vitest'

import { applyMove, indexAt, movableSlots, moveBlock, slotAtPos, slotToIndex } from '../src/editor/moveBlock.js'
import { said } from '../src/editor/moveui.js'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    frontmatter: { group: 'block', atom: true, attrs: { n: { default: 0 } } },
    card: { group: 'block', atom: true, attrs: { id: { default: '' } } },
    text: { group: 'inline' },
  },
})

const card = (id: string) => schema.nodes.card!.create({ id })
const para = (text = '') => schema.nodes.paragraph!.create(null, text ? schema.text(text) : undefined)
const make = (...kids: ProseNode[]) => schema.nodes.doc!.create(null, kids)
const ids = (doc: ProseNode) => {
  const out: string[] = []
  doc.forEach((n) => out.push(n.type.name === 'card' ? (n.attrs.id as string) : n.type.name === 'paragraph' ? `p:${n.textContent}` : n.type.name))
  return out
}
const six = () => make(card('a'), card('b'), card('c'), card('d'), card('e'), card('f'))
const run = (doc: ProseNode, from: number, to: number) => {
  const state = EditorState.create({ doc })
  const tr = state.tr
  const result = moveBlock(doc, from, doc, to)
  applyMove(tr, result)
  return { result, doc: tr.doc }
}

describe('moveBlock · judgment', () => {
  it('refuses out-of-range indices with {ok:false, reason:range}', () => {
    const doc = six()
    for (const [from, to] of [[3, -1], [3, 6], [-1, 2], [6, 2], [0, -1], [5, 6], [3, 1.5], [3, NaN], [Infinity, 1]]) {
      expect(moveBlock(doc, from!, doc, to!)).toEqual({ ok: false, reason: 'range' })
    }
  })
  it('refuses any parent other than the page root', () => {
    const doc = six()
    expect(moveBlock(doc, 1, doc.child(2), 0)).toEqual({ ok: false, reason: 'parent' })
  })
  it('accepts every in-range move, reporting from/to/total', () => {
    const doc = six()
    expect(moveBlock(doc, 3, doc, 1)).toEqual({ ok: true, from: 3, to: 1, total: 6 })
    expect(moveBlock(doc, 0, doc, 5)).toEqual({ ok: true, from: 0, to: 5, total: 6 })
  })
  it('a one-block page has nowhere to go', () => {
    const doc = make(card('a'))
    expect(moveBlock(doc, 0, doc, 1).ok).toBe(false)
    expect(moveBlock(doc, 0, doc, -1).ok).toBe(false)
  })
  it('an empty page has no block to move', () => {
    const doc = make(para())
    expect(moveBlock(doc, 0, doc, 0)).toEqual({ ok: false, reason: 'range' })
  })
})

describe('moveBlock · counting', () => {
  it('ignores the frontmatter and empty paragraphs, counts text paragraphs', () => {
    const doc = make(schema.nodes.frontmatter!.create(), card('a'), para(), card('b'), para('hi'), para())
    expect(movableSlots(doc)).toHaveLength(3)
    expect(indexAt(doc, 0)).toBe(-1)
  })
})

describe('applyMove · writing', () => {
  it('fourth to second place (Alt+Up twice) on six blocks', () => {
    const { result, doc } = run(six(), 3, 1)
    expect(result).toMatchObject({ ok: true, to: 1, total: 6 })
    expect(ids(doc)).toEqual(['a', 'd', 'b', 'c', 'e', 'f'])
  })
  it('first to last and last to first', () => {
    expect(ids(run(six(), 0, 5).doc)).toEqual(['b', 'c', 'd', 'e', 'f', 'a'])
    expect(ids(run(six(), 5, 0).doc)).toEqual(['f', 'a', 'b', 'c', 'd', 'e'])
  })
  it('one step each way, each index reaches its place', () => {
    for (let from = 0; from < 6; from++) {
      for (let to = 0; to < 6; to++) {
        const order = ['a', 'b', 'c', 'd', 'e', 'f']
        const [m] = order.splice(from, 1)
        order.splice(to, 0, m!)
        expect(ids(run(six(), from, to).doc)).toEqual(order)
      }
    }
  })
  it('a move onto its own place writes nothing', () => {
    const doc = six()
    const tr = EditorState.create({ doc }).tr
    expect(applyMove(tr, moveBlock(doc, 2, doc, 2))).toBeUndefined()
    expect(tr.docChanged).toBe(false)
  })
  it('a refusal writes nothing', () => {
    const doc = six()
    const tr = EditorState.create({ doc }).tr
    expect(applyMove(tr, moveBlock(doc, 0, doc, -1))).toBeUndefined()
    expect(tr.docChanged).toBe(false)
  })
  it('keeps frontmatter first and empty paragraphs in the document', () => {
    const doc = make(schema.nodes.frontmatter!.create(), card('a'), para(), card('b'), card('c'))
    const out = run(doc, 2, 0).doc
    expect(ids(out)[0]).toBe('frontmatter')
    expect(ids(out).filter((x) => x !== 'frontmatter' && x !== 'p:').join('')).toBe('cab')
    expect(ids(out)).toHaveLength(5)
  })
  it('moving with a trailing empty paragraph keeps it trailing', () => {
    const doc = make(card('a'), card('b'), para())
    expect(ids(run(doc, 0, 1).doc)).toEqual(['b', 'a', 'p:'])
  })
})

describe('drop slots', () => {
  it('slot → destination index', () => {
    expect(slotToIndex(3, 1)).toBe(1)
    expect(slotToIndex(1, 3)).toBe(2)
    expect(slotToIndex(2, 2)).toBe(2)
    expect(slotToIndex(2, 3)).toBe(2)
    expect(slotToIndex(0, 6)).toBe(5)
  })
  it('position → slot', () => {
    const doc = six()
    expect(slotAtPos(doc, 0)).toBe(0)
    expect(slotAtPos(doc, doc.content.size)).toBe(6)
    let pos = 0
    doc.forEach((n, p) => { if (n.attrs.id === 'c') pos = p })
    expect(slotAtPos(doc, pos)).toBe(2)
  })
})

describe('said', () => {
  const t = (k: string) => k
  it('words for a move and each refusal', () => {
    expect(said({ ok: true, from: 3, to: 1, total: 6 }, t)).toBe('Moved to position 2 of 6')
    expect(said({ ok: false, reason: 'range' }, t, -1)).toBe('Already first')
    expect(said({ ok: false, reason: 'range' }, t, 1)).toBe('Already last')
    expect(said({ ok: false, reason: 'parent' }, t)).toBe('It cannot go there')
  })
})
