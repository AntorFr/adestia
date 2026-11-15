/**
 * `:::timeline view=bars|list` (E-31, AD-etat-projet-2): one set of entries, two
 * drawings. Expectations are hand-written from the criterion: the list says the
 * same words as the bars, a late entry is a dashed pill with its word, amber is
 * only ever the owner's own, and an unknown view falls back to the bars.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { said } from './render.js'

const blocks = new URL('../web/blocks.js', import.meta.url).href
const NOW = Date.parse('2026-10-17T12:00:00Z')
const PAGES = [
  { path: 'p/a', title: 'Alpha', finished: false, fields: { type: 'project-management', start: '2026-01-10', due: '2026-12-01', 'project-status': 'Amber' } },
  { path: 'p/b', title: 'Bravo', finished: true, fields: { type: 'project-management', start: '2026-02-01', due: '2026-03-01' } },
  { path: 'p/d', title: 'Delta', finished: false, fields: { type: 'project-management', due: '2026-05-01' } },
]

async function tags(locale = 'en') {
  const RealDate = Date
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [NOW])) }
    static now() { return NOW }
  }
  const { default: create } = await import(blocks)
  const t = create({ locale, fetch: () => Promise.reject(new Error('no network')) }).tags
  return { t, restore: () => { globalThis.Date = RealDate } }
}
const draw = (Tag, props) => renderToStaticMarkup(createElement(Tag, props))
const queried = (view) => ({ attributes: { depth: 'subtree', ...(view ? { view } : {}) }, path: 'p/root', pages: PAGES })
const rows = (html) => html.split('<li ').slice(1)

test('list: one row per dated entry, in date order, with the word of its state', async () => {
  const { t, restore } = await tags()
  try {
    const html = draw(t.timeline, queried('list'))
    assert.ok(html.includes('pm-timeline--list'))
    assert.ok(!html.includes('pm-timeline__span'), 'no bar in the list')
    const r = rows(html)
    assert.equal(r.length, 3)
    assert.match(r[0], /Alpha/) // starts 2026-01-10
    assert.match(r[1], /Bravo/) // starts 2026-02-01
    assert.match(r[2], /Delta/) // milestone 2026-05-01
    assert.match(said(r[1]), /closed/)
    assert.match(said(r[2]), /late/)
  } finally { restore() }
})

test('list: a late entry is the dashed muted pill with its word, and nothing amber', async () => {
  const { t, restore } = await tags()
  try {
    const [, , delta] = rows(draw(t.timeline, queried('list')))
    assert.match(delta, /adestia-state--late/)
    assert.ok(!/amber/i.test(delta))
    assert.match(said(delta), /late/)
  } finally { restore() }
})

test('list: amber is the owner\'s own word, with a dot AND the word', async () => {
  const { t, restore } = await tags()
  try {
    const [alpha, bravo, delta] = rows(draw(t.timeline, queried('list')))
    assert.match(alpha, /pm-subproject__ico--amber/)
    assert.match(said(alpha), /Amber/)
    for (const other of [bravo, delta]) assert.ok(!/amber/i.test(other))
    // the calendar's own words never turn amber on written lines either
    const written = draw(t.timeline, { items: ['Overdue: 2026-09-01 → 2026-10-01'], attributes: { view: 'list' } })
    assert.ok(!/amber/i.test(written))
    assert.match(said(written), /elapsed/)
  } finally { restore() }
})

test('list says the same entries as the bars: same titles, same words', async () => {
  const { t, restore } = await tags()
  try {
    const titles = (html) => said(html).split('\n').filter((l) => l.startsWith('[title] ') && !l.startsWith('[title] today')).sort()
    const bars = titles(draw(t.timeline, queried('bars')))
    const list = titles(draw(t.timeline, queried('list')))
    assert.ok(bars.includes('[title] Delta · 2026-05-01 · late'))
    assert.deepEqual(list, bars)
    const written = { items: ['Phase one: 2026-01-15 → 2026-11-01', 'Review: 2026-12-01'] }
    const wl = titles(draw(t.timeline, { ...written, attributes: { view: 'list' } }))
    assert.deepEqual(wl, titles(draw(t.timeline, written)))
    assert.ok(wl.includes('[title] Review · 2026-12-01 · ahead'))
  } finally { restore() }
})

test('bars stay the default; an unknown view draws the bars, not nothing', async () => {
  const { t, restore } = await tags()
  try {
    const none = draw(t.timeline, queried())
    assert.equal(draw(t.timeline, queried('bars')), none)
    assert.equal(draw(t.timeline, queried('grid')), none)
    assert.ok(!none.includes('pm-timeline--list'))
    assert.ok(none.includes('pm-timeline__span'))
  } finally { restore() }
})

test('list: empty, loading and unreadable lines behave as the bars do', async () => {
  const { t, restore } = await tags()
  try {
    for (const props of [
      { items: [] },
      { items: ['nope'] },
      { attributes: { depth: 'subtree' }, path: 'p/root', pages: [] },
      { attributes: { depth: 'subtree' }, path: 'p/root' },
    ]) {
      const a = said(draw(t.timeline, { ...props, attributes: { ...props.attributes, view: 'list' } }))
      const b = said(draw(t.timeline, { ...props, attributes: { ...props.attributes, view: 'bars' } }))
      assert.equal(a, b)
    }
    const mixed = said(draw(t.timeline, { items: ['Ok: 2026-11-01', 'nope'], attributes: { view: 'list' } }))
    assert.match(mixed, /nope/)
    assert.match(mixed, /Ok/)
  } finally { restore() }
})

test('list: a row opens its page, only when the shell can open one', async () => {
  const { t, restore } = await tags()
  try {
    const open = draw(t.timeline, { ...queried('list'), openPage: () => {} })
    assert.equal(open.split('<button').length - 1, 3)
    assert.ok(!draw(t.timeline, queried('list')).includes('<button'))
  } finally { restore() }
})

test('list in French: the same words the bars carry', async () => {
  const { t, restore } = await tags('fr')
  try {
    const [, bravo, delta] = rows(draw(t.timeline, queried('list')))
    assert.match(said(bravo), /clos/)
    assert.match(said(delta), /retard|échu/i)
  } finally { restore() }
})

test('subproject: rows and cards keep working, cards wear the charter card', async () => {
  const { t, restore } = await tags()
  try {
    const pages = [{ path: 'p/root', title: 'Root', finished: false, fields: {} }, ...PAGES]
    const cards = draw(t.subproject, { path: 'p/root', pages, attributes: { view: 'cards' } })
    assert.ok(cards.includes('adestia-card'))
    assert.ok(cards.includes('adestia-card--static'), 'no openPage: not a button')
    assert.ok(!cards.includes('<button'))
    const live = draw(t.subproject, { path: 'p/root', pages, attributes: { view: 'cards' }, openPage: () => {} })
    assert.ok(live.includes('<button'))
    assert.ok(!live.includes('adestia-card--static'))
    assert.ok(!draw(t.subproject, { path: 'p/root', pages, attributes: { view: 'rows' } }).includes('adestia-card'))
  } finally { restore() }
})
