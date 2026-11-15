/**
 * The three project blocks, read back from what they SAY (task blocs, B-29 / E-31):
 * every state is a word AND an icon, never a hue; an empty block names Edit data;
 * a line the block cannot read is named under it; progress with no page says so.
 * Expectations are written by hand from the criterion, not from the output.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { said } from './render.js'

const blocks = new URL('../web/blocks.js', import.meta.url).href
const NOW = Date.parse('2026-10-17T12:00:00Z')

async function tags(locale) {
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
const page = (path, finished, due) => ({ path, title: path, finished, fields: due ? { due } : {} })

test('progress without a sub-page says so, and has no meter', async () => {
  const { t, restore } = await tags('en')
  try {
    const html = draw(t.progress, { path: 'p/plan.md', pages: [page('p/plan.md', false)] })
    assert.equal(said(html), 'No page below this page yet.')
    assert.ok(!html.includes('progressbar'))
  } finally { restore() }
})

test('progress bar: a progressbar with the right numbers; tiles: three figures', async () => {
  const { t, restore } = await tags('en')
  try {
    const pages = [page('p/plan.md', false), page('p/a.md', true), page('p/b.md', true), page('p/c.md', false, '2026-10-01'), page('p/d.md', false, '2026-11-20')]
    const bar = draw(t.progress, { path: 'p/plan.md', pages, attributes: { view: 'bar' } })
    assert.match(bar, /role="progressbar"/)
    assert.match(bar, /aria-valuenow="50"/)
    assert.match(bar, /aria-valuemin="0"/)
    assert.match(bar, /aria-valuemax="100"/)
    assert.match(said(bar), /2 of 4/)
    const tiles = draw(t.progress, { path: 'p/plan.md', pages })
    assert.equal(tiles.split('class="adestia-figure"').length - 1, 3)
    assert.ok(!tiles.includes('progressbar'))
    assert.match(said(tiles), /1\nLate/)
  } finally { restore() }
})

test('milestones: done, late, next, planned — each a word and an icon', async () => {
  const { t, restore } = await tags('en')
  try {
    const items = ['Old: 2026-01-01 — done', 'Missed: 2026-09-01', 'Soon: 2026-11-01', 'Later: 2027-01-01']
    for (const view of ['list', 'cards']) {
      const html = draw(t.milestones, { items, attributes: { view } })
      const text = said(html)
      for (const word of ['Done', 'Late', 'Next', 'Planned']) assert.ok(text.includes(word), `${view}: ${word}`)
      assert.equal(html.split('<svg').length - 1, 4, `${view}: one icon per state`)
      for (const s of ['done', 'late', 'next', 'planned']) assert.ok(html.includes(`adestia-state--${s}`), `${view}: ${s}`)
      assert.equal(html.includes('adestia-card--static'), view === 'cards')
    }
  } finally { restore() }
})

test('milestones: empty names Edit data; an unreadable line is named, the readable one kept', async () => {
  const { t, restore } = await tags('en')
  try {
    assert.equal(said(draw(t.milestones, { items: [] })), 'No milestone yet. Use Edit data to add one.')
    assert.equal(said(draw(t.milestones, { items: [''] })), 'No milestone yet. Use Edit data to add one.')
    const text = said(draw(t.milestones, { items: ['Recette: 2026-12-01', 'sans date'] }))
    assert.match(text, /Recette/)
    assert.match(text, /Line not understood: sans date/)
    const only = said(draw(t.milestones, { items: ['sans date'] }))
    assert.match(only, /Line not understood: sans date/)
    assert.ok(!only.includes('No milestone yet'))
  } finally { restore() }
})

test('risks: level is a word and an icon, never amber; table and cards', async () => {
  const { t, restore } = await tags('en')
  try {
    const items = ['Fuite: High — Marc', 'Retard: Medium', 'Bruit: Low — Zoé']
    for (const view of ['table', 'cards']) {
      const html = draw(t.risks, { items, attributes: { view } })
      const text = said(html)
      for (const w of ['High', 'Medium', 'Low', 'Marc', 'Zoé']) assert.ok(text.includes(w), `${view}: ${w}`)
      assert.equal(html.split('<svg').length - 1, 3, `${view}: one icon per level`)
      assert.ok(!/amber|warning|orange|yellow/i.test(html), `${view}: no amber`)
      assert.equal(html.includes('<table'), view === 'table')
      assert.equal(html.includes('adestia-card--static'), view === 'cards')
    }
    assert.match(draw(t.risks, { items }), /<th scope="col">Owner<\/th>/)
  } finally { restore() }
})

test('risks: empty names Edit data; unreadable line named', async () => {
  const { t, restore } = await tags('en')
  try {
    assert.equal(said(draw(t.risks, { items: [] })), 'No risk recorded. Use Edit data to add one.')
    const text = said(draw(t.risks, { items: ['Fuite: Severe', 'Ok: High'] }))
    assert.match(text, /Line not understood: Fuite: Severe/)
    assert.match(text, /Ok/)
  } finally { restore() }
})

test('French: the new blocks speak French', async () => {
  const { t, restore } = await tags('fr')
  try {
    assert.equal(said(draw(t.milestones, { items: [] })), 'Aucun jalon pour l’instant. Utilisez Modifier les données pour en ajouter un.')
    assert.equal(said(draw(t.risks, { items: [] })), 'Aucun risque noté. Utilisez Modifier les données pour en ajouter un.')
    assert.equal(said(draw(t.progress, { path: 'p/x.md', pages: [] })), 'Aucune page sous cette page pour l’instant.')
    assert.match(said(draw(t.milestones, { items: ['A: 2020-01-01'] })), /En retard/)
  } finally { restore() }
})
