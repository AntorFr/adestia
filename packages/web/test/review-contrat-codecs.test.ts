import { describe, expect, it } from 'vitest'

import { codecFor, refuseCell, validateRow } from '../src/editor/blockform/index.js'

const dd = codecFor('label-date-done')
const lo = codecFor('label-level-owner')
const trip = (c: typeof dd, lines: string[]) => {
  const { rows, kept } = c.read(lines)
  return { rows, kept, out: c.write(rows, kept) }
}

describe('label-date-done', () => {
  const lines = ['- Recette: 2026-11-20', '- Livraison: 2026-12-01 — done', '* Go — live: 2026-12-02 — done', 'prose', '- Bad: 2026-02-31', '- X: 2026-01-01 — DONE', '- X: 2026-01-01 — done — done', '- : 2026-01-01', '- Y: 2026-01-01 —']
  it('round-trips byte for byte, unreadable lines to Raw', () => {
    const r = trip(dd, lines)
    expect(r.out).toEqual(lines)
    expect(r.rows.map((x) => x.cells['done'])).toEqual(['', 'done', 'done'])
    expect(r.kept.map((k) => k.line)).toEqual(lines.slice(3))
  })
  it('writes done or nothing', () => {
    const { rows, kept } = dd.read(['- A: 2026-01-01'])
    rows[0]!.cells = { label: 'A', date: '2026-01-01', done: 'done' }
    expect(dd.write(rows, kept)).toEqual(['- A: 2026-01-01 — done'])
    rows[0]!.cells = { label: 'A', date: '2026-01-02', done: '' }
    expect(dd.write(rows, kept)).toEqual(['- A: 2026-01-02'])
  })
})

describe('label-level-owner', () => {
  const lines = ['- Fournisseur: High — Marc', '- Budget: low', '- Délai: MEDIUM — Ann — Bob', '- Z: Critical — Marc', '- Q: High —', 'text', '- Nolevel: ']
  it('round-trips byte for byte', () => {
    const r = trip(lo, lines)
    expect(r.out).toEqual(lines)
    expect(r.rows.map((x) => x.cells['level'])).toEqual(['High', 'Low', 'Medium'])
    expect(r.rows[2]!.cells['owner']).toBe('Ann — Bob')
  })
  it('capitalises an edited level', () => {
    const { rows, kept } = lo.read(['- B: low'])
    rows[0]!.cells = { label: 'B', level: 'low', owner: 'X' }
    expect(lo.write(rows, kept)).toEqual(['- B: Low — X'])
  })
  it('a whitespace owner still reads back', () => {
    const { rows, kept } = lo.read(['- B: low'])
    rows[0]!.cells = { label: 'B', level: 'High', owner: '  ' }
    const out = lo.write(rows, kept)
    expect(lo.read(out).rows).toHaveLength(1)
  })
})

describe('validation', () => {
  const col = (kind: 'check' | 'choice') => ({ key: 'k', kind, label: 'k' }) as never
  it('check and choice', () => {
    expect(refuseCell(col('check'), 'done')).toBeNull()
    expect(refuseCell(col('check'), 'yes')).not.toBeNull()
    expect(refuseCell(col('choice'), 'high')).toBeNull()
    expect(refuseCell(col('choice'), 'Urgent')).not.toBeNull()
    expect(validateRow([{ key: 'label', kind: 'text', label: 'l' } as never], 'label-level-owner', { label: 'a:b' })).toHaveLength(1)
  })
})
