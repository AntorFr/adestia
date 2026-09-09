import assert from 'node:assert/strict'
import { test } from 'node:test'

import { classify, fraction, parseLine, span } from '../web/model.js'

// ── parseLine: one line, one entry, or null by name ─────────────────────────

test('two dates make a phase', () => {
  assert.deepEqual(parseLine('Cadrage: 2026-01-15 → 2026-03-01'), {
    label: 'Cadrage',
    start: '2026-01-15',
    due: '2026-03-01',
  })
})

test('one date makes a milestone — a phase without a beginning', () => {
  assert.deepEqual(parseLine('Recette: 2026-06-01'), { label: 'Recette', due: '2026-06-01' })
})

test('the ASCII arrow reads like the pretty one', () => {
  assert.deepEqual(parseLine('Réalisation: 2026-03-01 -> 2026-09-30'), {
    label: 'Réalisation',
    start: '2026-03-01',
    due: '2026-09-30',
  })
})

test('the FIRST colon splits, so a label may not hide a second entry', () => {
  // Same cut as `figures`: everything after the first colon is the dates.
  assert.equal(parseLine('a: b: 2026-01-01'), null)
})

test('a phase ending before it starts is unreadable, never swapped', () => {
  assert.equal(parseLine('Retour: 2026-03-01 → 2026-01-01'), null)
})

test('what is not a date is not almost a date', () => {
  assert.equal(parseLine('Cadrage: janvier'), null)
  assert.equal(parseLine('Cadrage: 2026-1-5'), null)
  assert.equal(parseLine('Cadrage: 2026-01-15 → mars'), null)
  assert.equal(parseLine(': 2026-01-15'), null)
  assert.equal(parseLine('juste du texte'), null)
  assert.equal(parseLine('a: 1 → 2 → 3'), null)
})

// ── span: the axis, snapped outward to whole units ──────────────────────────

const PHASES = [
  { label: 'Cadrage', start: '2026-01-15', due: '2026-03-01' },
  { label: 'Recette', due: '2026-06-01' },
]

test('months: floor to the 1st, ceil past the last date, one tick per month', () => {
  const box = span(PHASES, 'months')
  assert.equal(box.min, '2026-01-01')
  assert.equal(box.max, '2026-07-01')
  assert.deepEqual(box.ticks, [
    '2026-01-01',
    '2026-02-01',
    '2026-03-01',
    '2026-04-01',
    '2026-05-01',
    '2026-06-01',
  ])
})

test('weeks start on Monday', () => {
  // 2026-09-09 is a Wednesday; its week starts on Monday the 7th.
  const box = span([{ label: 'x', due: '2026-09-09' }], 'weeks')
  assert.equal(box.min, '2026-09-07')
  assert.equal(box.max, '2026-09-14')
})

test('quarters snap to their first month', () => {
  const box = span(PHASES, 'quarters')
  assert.equal(box.min, '2026-01-01')
  assert.equal(box.max, '2026-07-01')
  assert.deepEqual(box.ticks, ['2026-01-01', '2026-04-01'])
})

test('no dates, no axis — the caller says so instead of drawing one', () => {
  assert.equal(span([], 'months'), null)
})

// ── fraction and classify: geometry and the calendar's own verdicts ─────────

test('fraction is 0 at min and 1 at max', () => {
  const box = { min: '2026-01-01', max: '2026-07-01' }
  assert.equal(fraction('2026-01-01', box), 0)
  assert.equal(fraction('2026-07-01', box), 1)
  assert.ok(Math.abs(fraction('2026-04-01', box) - 0.497) < 0.01)
})

test('classify reads the calendar and nothing else', () => {
  const phase = { label: 'x', start: '2026-03-01', due: '2026-04-01' }
  assert.equal(classify(phase, '2026-02-01'), 'ahead')
  assert.equal(classify(phase, '2026-03-15'), 'current')
  assert.equal(classify(phase, '2026-05-01'), 'past')
  const mile = { label: 'y', due: '2026-06-01' }
  assert.equal(classify(mile, '2026-05-31'), 'ahead')
  assert.equal(classify(mile, '2026-06-01'), 'current')
  assert.equal(classify(mile, '2026-06-02'), 'past')
})
