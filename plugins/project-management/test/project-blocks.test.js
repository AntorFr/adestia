import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  milestonesOf,
  parseMilestone,
  parseRisk,
  progressOf,
  risksOf,
  RISK_LEVELS,
  scopeOf,
} from '../web/model.js'

const TODAY = '2026-11-15'
const page = (path, finished, due) => ({ path, title: path, finished, fields: due ? { due } : {} })

// Eight sub-pages (5 finished) + the carrier, a page of the same folder.
const folder = () => [
  page('p/plan.md', false, '2026-12-01'), // the carrier — never counted
  page('p/a.md', true, '2026-01-01'),
  page('p/b.md', true),
  page('p/c.md', true, '2026-02-01'),
  page('p/d.md', true),
  page('p/e.md', true),
  page('p/f.md', false, '2026-11-01'), // late
  page('p/g.md', false, '2026-12-24'), // next after h
  page('p/h.md', false, '2026-11-20'), // next
  page('elsewhere/x.md', false, '2026-11-16'), // outside
]

test('progress: 5 of 8, late and next, the carrier not counted', () => {
  const r = progressOf(folder(), 'p', 'children', 'p/plan.md', TODAY)
  assert.equal(r.total, 8)
  assert.equal(r.done, 5)
  assert.equal(r.percent, 62)
  assert.equal(r.late, 1)
  assert.deepEqual(r.next, { label: 'p/h.md', path: 'p/h.md', due: '2026-11-20' })
})

test('progress: the carrier is excluded even when it is open and late', () => {
  const pages = [page('p/plan.md', false, '2020-01-01'), page('p/a.md', true)]
  const r = progressOf(pages, 'p', 'children', 'p/plan.md', TODAY)
  assert.equal(r.total, 1)
  assert.equal(r.late, 0)
  assert.equal(r.next, null)
  assert.equal(scopeOf(pages, 'p', 'children', 'p/plan.md').length, 1)
})

test('progress rounds down, never to 100 with one page left', () => {
  const pages = [...Array(7)].map((_, i) => page(`p/${i}.md`, true))
  pages.push(page('p/z.md', false))
  assert.equal(progressOf(pages, 'p', 'children', 'x.md', TODAY).percent, 87)
  const two = [page('p/a.md', true), page('p/b.md', true), page('p/c.md', false)]
  assert.equal(progressOf(two, 'p', 'children', 'x.md', TODAY).percent, 66)
})

test('progress: empty scope has no percentage, no late, no next', () => {
  const r = progressOf([], 'p', 'children', 'p/index.md', TODAY)
  assert.deepEqual(r, { total: 0, done: 0, percent: null, late: 0, next: null })
})

test('progress: all finished is 100, finished pages are never late nor next', () => {
  const r = progressOf([page('p/a.md', true, '2020-01-01'), page('p/b.md', true, '2030-01-01')], 'p', 'children', 'x', TODAY)
  assert.equal(r.percent, 100)
  assert.equal(r.late, 0)
  assert.equal(r.next, null)
})

test('progress: due today is next, not late; an unreadable due counts as neither', () => {
  const pages = [page('p/a.md', false, TODAY), page('p/b.md', false, 'soon')]
  const r = progressOf(pages, 'p', 'children', 'x', TODAY)
  assert.equal(r.late, 0)
  assert.equal(r.next.path, 'p/a.md')
  assert.equal(r.total, 3)
})

test('progress: depth subtree reaches deeper pages, children does not', () => {
  const pages = [page('p/a.md', true), page('p/sub/deep.md', false), page('p/sub/sub.md', false)]
  assert.equal(progressOf(pages, 'p', 'children', 'x', TODAY).total, 2)
  assert.equal(progressOf(pages, 'p', 'subtree', 'x', TODAY).total, 3)
})

test('milestones: late wins, first other is next, rest planned, done kept', () => {
  const r = milestonesOf(
    ['Old: 2026-11-01', 'Fin: 2026-10-01 — done', 'B: 2026-12-01', 'A: 2026-11-20', 'C: 2027-01-01'],
    TODAY,
  )
  assert.deepEqual(
    r.items.map((m) => [m.label, m.state]),
    [['Old', 'late'], ['Fin', 'done'], ['B', 'planned'], ['A', 'next'], ['C', 'planned']],
  )
  assert.deepEqual(r.unread, [])
})

test('milestones: done wins over a past date; a late one is never next; today is not late', () => {
  const r = milestonesOf(['X: 2026-11-14', 'Today: 2026-11-15'], TODAY)
  assert.deepEqual(r.items.map((m) => m.state), ['late', 'next'])
  assert.equal(milestonesOf([], TODAY).items.length, 0)
  assert.deepEqual(milestonesOf(['Y: 2020-01-01 — done'], TODAY).items.map((m) => m.state), ['done'])
})

test('milestones: nothing is next when everything is late or done', () => {
  const r = milestonesOf(['A: 2020-01-01', 'B: 2030-01-01 — done'], TODAY)
  assert.deepEqual(r.items.map((m) => m.state), ['late', 'done'])
})

test('milestones: unreadable lines are kept with their text untouched', () => {
  const bad = ['Soon: tomorrow', 'no colon here', 'Feb: 2026-02-30', ': 2026-11-20', 'Z: 2026-11-20 — finished', 'Z: 2026-11-20 — done — x']
  const r = milestonesOf([...bad, 'Ok: 2026-12-01'], TODAY)
  assert.deepEqual(r.unread, bad)
  assert.equal(r.items.length, 1)
  assert.equal(parseMilestone('Ok: 2026-12-01').done, false)
})

test('milestones: a label may follow the first colon rule; DONE in any case reads', () => {
  assert.deepEqual(parseMilestone('Go live: 2026-11-20 — DONE'), { label: 'Go live', due: '2026-11-20', done: true })
  assert.equal(parseMilestone('a: b: 2026-11-20'), null)
})

test('risks: three levels, any case, owner optional', () => {
  const r = risksOf(['A: High — Marc', 'B: medium', 'C: LOW — Léa — Dupont', 'D: hIgH'])
  assert.deepEqual(r.items, [
    { label: 'A', level: 'High', owner: 'Marc' },
    { label: 'B', level: 'Medium' },
    { label: 'C', level: 'Low', owner: 'Léa — Dupont' },
    { label: 'D', level: 'High' },
  ])
  assert.deepEqual(RISK_LEVELS, ['High', 'Medium', 'Low'])
})

test('risks: bad level, no colon, empty label are kept as written', () => {
  const bad = ['A: Critical — Marc', 'no colon', ': High', 'B: ', 'C: High Marc']
  const r = risksOf(['Ok: Low', ...bad])
  assert.deepEqual(r.unread, bad)
  assert.equal(r.items.length, 1)
  assert.equal(parseRisk('X: Highest'), null)
})

test('reading does not mutate its input', () => {
  const lines = ['A: 2026-11-20', 'bad']
  const copy = [...lines]
  milestonesOf(lines, TODAY)
  risksOf(lines)
  assert.deepEqual(lines, copy)
})

test('milestones: an impossible month or day is an unreadable line, never a throw', () => {
  for (const text of ['Odd: 2026-13-01', 'Odd: 2026-00-10', 'Odd: 2026-11-32']) {
    assert.doesNotThrow(() => parseMilestone(text), text)
    assert.equal(parseMilestone(text), null, text)
  }
  const r = milestonesOf(['Odd: 2026-13-01', 'Ok: 2026-12-01'], TODAY)
  assert.deepEqual(r.unread, ['Odd: 2026-13-01'])
  assert.equal(r.items.length, 1)
})
