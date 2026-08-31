/**
 * The half of the view that decides what a reader sees first.
 *
 * Not "does it render" — that is what the bench is for — but the ordering
 * judgement underneath: a question freezing four lots must come before one
 * freezing none, whatever their ids, and the tile must run hot for exactly one
 * figure. Both are opinions, so both are pinned here.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { buildGraph } from '../graph.mjs'
import { draftFor, problemWords, sections, tileInfo, toneOf, words } from '../web/model.js'

const fiche = (id, over = {}) => ({
  id,
  repo: '/repos/tessera',
  path: `.agent/lots/${id}.md`,
  source: 'main',
  type: 'lot',
  title: id,
  status: 'idea',
  priority: null,
  dependsOn: [],
  spec: null,
  branch: null,
  updated: '2026-08-29',
  ...over,
})

const galaxy = () =>
  buildGraph([
    fiche('q-big', { type: 'question', status: 'open', title: 'Ratifier le protocole' }),
    fiche('q-small', { type: 'question', status: 'open', title: 'Sélecteurs' }),
    fiche('q-done', { type: 'question', status: 'decided' }),
    fiche('t-1', { status: 'done' }),
    fiche('t-2', { status: 'code', branch: 'lot2', dependsOn: ['t-1'] }),
    fiche('t-3', { status: 'integrate' }),
    fiche('t-4', { dependsOn: ['q-big'] }),
    fiche('t-5', { dependsOn: ['t-4'] }),
    fiche('t-6', { status: 'design', dependsOn: ['q-big'] }),
    fiche('t-7', { dependsOn: ['q-small'] }),
  ])

test('the question freezing the most comes first, whatever its id', () => {
  const bands = sections(galaxy().items)
  assert.deepEqual(
    bands.frozen.map((item) => item.id),
    ['q-big', 'q-small'],
  )
  assert.equal(bands.frozen[0].blocks, 3)
})

test('a question that freezes nothing is yours to answer but raises no alarm', () => {
  const graph = buildGraph([fiche('q-lonely', { type: 'question', status: 'open' })])
  const bands = sections(graph.items)
  assert.deepEqual(bands.frozen, [])
  assert.deepEqual(bands.mine.map((item) => item.id), ['q-lonely'])
})

test('the bands split the galaxy the way the contract does', () => {
  const bands = sections(galaxy().items)
  assert.deepEqual(bands.mine.map((item) => item.id).sort(), [
    'q-big',
    'q-small',
    't-4',
    't-5',
    't-6',
    't-7',
  ])
  assert.deepEqual(bands.underway.map((item) => item.id).sort(), ['t-2', 't-3'])
  // What is over is folded away, never dropped.
  assert.deepEqual(bands.finished.map((item) => item.id).sort(), ['q-done', 't-1'])
})

test('four tones, and only the ones that need somebody are loud', () => {
  assert.equal(toneOf(fiche('a', { status: 'idea' })), 'waiting')
  assert.equal(toneOf(fiche('a', { status: 'code' })), 'underway')
  assert.equal(toneOf(fiche('a', { status: 'done', finished: true })), 'settled')
  assert.equal(toneOf(fiche('q', { type: 'question', status: 'open' })), 'waiting')
  assert.equal(toneOf(fiche('a', { badStatus: true })), 'fault')
  assert.equal(toneOf(fiche('a', { cycle: true })), 'fault')
})

test('the tile says how much is waiting on the reader, and runs hot for that alone', () => {
  const t = words('fr')
  const info = tileInfo(galaxy(), t)
  assert.equal(info.subtitle, 'Ratifier le protocole')
  const hot = info.chips.filter((chip) => chip.hot)
  assert.equal(hot.length, 1)
  assert.equal(hot[0].text, '6 à vous')
  assert.equal(info.chips[0].text, '8 items')
})

test('an empty galaxy says nothing on the tile rather than "0"', () => {
  assert.equal(tileInfo({ items: [] }, words('fr')), undefined)
})

test('the composer draft names the fiche and never sends itself', () => {
  const graph = galaxy()
  const question = graph.items.find((item) => item.id === 'q-big')
  const draft = draftFor(question, words('fr'))
  assert.match(draft, /q-big/)
  assert.match(draft, /Ratifier le protocole/)
  assert.match(draft, /\/repos\/tessera\/\.agent\/lots\/q-big\.md/)
  assert.match(draft, /gèle 3/)
})

test('words fall back to correct English rather than to an identifier', () => {
  assert.equal(words('en')('yours to specify'), 'yours to specify')
  assert.equal(words('fr')('yours to specify'), 'à vous de spécifier')
  assert.equal(words('de')('under way'), 'under way')
})

test('a diagnostic is rendered from its code, in the reader’s language', () => {
  const t = words('fr')
  assert.equal(
    problemWords({ code: 'branch-gone', id: 'tessera-1', branch: 'lot1', message: 'en' }, t),
    'tessera-1 nomme une branche qui n’existe plus ici (lot1)',
  )
  assert.equal(
    problemWords({ code: 'not-a-repo', repo: '/repos/tessera', message: 'en' }, t),
    'tessera n’est pas un dépôt git',
  )
  assert.equal(
    problemWords({ code: 'cycle', ids: ['a', 'b'], message: 'en' }, t),
    'ces fiches dépendent l’une de l’autre en cercle : a, b',
  )
  // A code this build has no words for degrades to the API's English line,
  // never to a blank row.
  assert.equal(problemWords({ code: 'invented-later', message: 'something new' }, t), 'something new')
})
