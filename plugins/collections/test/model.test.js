import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCollections, facetsOf, plural, prettify, statusOf } from '../web/model.js'

// Shaped like `/api/pages/index`: the server publishes `finished`, computed by
// the content engine, so no view has to own a table of statuses.
const page = (path, fields, title = path, finished = false) => ({ path, title, fields, finished })

const sample = () =>
  buildCollections([
    page('col/projets.md', {
      type: 'collection',
      of: 'projet',
      groupBy: 'cat',
      labels: 'menuiserie=Menuiserie',
      ico: '🗂',
    }, 'Projets'),
    page('p/garage.md', { type: 'projet', cat: 'menuiserie', status: 'en-cours' }, 'Garage'),
    page('p/etagere.md', { type: 'projet', cat: 'menuiserie' }, 'Étagère'),
    page('p/capteur.md', { type: 'projet', cat: 'electronique' }, 'Capteur'),
    page('p/orphelin.md', { type: 'projet' }, 'Sans catégorie'),
    page('p/terrasse.md', { type: 'projet', cat: 'menuiserie', status: 'clos' }, 'Terrasse', true),
    page('note.md', { type: 'fiche' }, 'Une note'),
  ])

test('a collection is declared in a page, not in code', () => {
  const { collections } = sample()
  assert.equal(collections.length, 1)
  assert.equal(collections[0].title, 'Projets')
  assert.equal(collections[0].groupBy, 'cat')
})

test('it collects by type, and nothing else', () => {
  const { collections } = sample()
  assert.equal(collections[0].members.length, 5)
  assert.equal(collections[0].members.some((p) => p.type === 'fiche'), false)
})

test('what is finished leaves the grid for the archive, and is never dropped', () => {
  // A collection of projects fills with finished ones within a year; a grid
  // where nine cards out of ten are done is a grid nobody scans. Dropping them
  // would be worse: the finished project is what somebody looks for when they
  // want to know how the last one went.
  const [projets] = sample().collections
  assert.deepEqual(projets.live.map((p) => p.title).sort(), [
    'Capteur',
    'Garage',
    'Sans catégorie',
    'Étagère',
  ])
  assert.deepEqual(projets.archived.map((p) => p.title), ['Terrasse'])
  assert.equal(projets.members.length, projets.live.length + projets.archived.length)
})

test('the verdict comes from the index, never from a table of our own', () => {
  // The one thing a plugin must not own: a copy of the status vocabulary. An
  // index that says nothing leaves every page visible — the direction that
  // loses nobody's work.
  const { collections } = buildCollections([
    page('c.md', { type: 'collection', of: 'projet' }),
    { path: 'p.md', title: 'Vieux serveur', fields: { type: 'projet', status: 'clos' } },
  ])
  assert.equal(collections[0].live.length, 1)
  assert.equal(collections[0].archived.length, 0)
})

test('a declaration with no `of` collects nothing and says so', () => {
  // Collecting everything would look like a bug in the pages rather than in
  // the declaration.
  const { collections } = buildCollections([page('c.md', { type: 'collection' })])
  assert.deepEqual(collections[0].members, [])
  assert.deepEqual(collections[0].live, [])
  assert.deepEqual(collections[0].archived, [])
  assert.match(collections[0].problem, /collects nothing/)
})

test('facets are cards, biggest first', () => {
  // Alphabetical order alone buries the group someone is most likely heading
  // for under whatever starts with A.
  const facets = facetsOf(sample().collections[0])
  assert.deepEqual(facets.map((f) => f.value), ['menuiserie', 'electronique', ''])
  assert.deepEqual(facets.map((f) => f.pages.length), [2, 1, 1])
})

test('a declared label wins over the raw value', () => {
  const facets = facetsOf(sample().collections[0])
  assert.equal(facets[0].label, 'Menuiserie')
  // And an undeclared one is still readable rather than raw.
  assert.equal(facets[1].label, 'Electronique')
})

test('a facet counts the living and the archived apart', () => {
  // "3 fiches" over a grid showing one is the arithmetic that teaches people
  // to stop trusting a count.
  const facets = facetsOf(sample().collections[0])
  const menuiserie = facets.find((f) => f.value === 'menuiserie')
  assert.deepEqual(menuiserie.pages.map((p) => p.title).sort(), ['Garage', 'Étagère'])
  assert.deepEqual(menuiserie.archived.map((p) => p.title), ['Terrasse'])
})

test('a facet whose work is all done still gets a card', () => {
  // It is where the history is. It sorts below the ones with something
  // happening in them, and that is the whole difference.
  const { collections } = buildCollections([
    page('c.md', { type: 'collection', of: 'projet', groupBy: 'cat' }),
    page('a.md', { type: 'projet', cat: 'jardin' }, 'Haie', false),
    page('b.md', { type: 'projet', cat: 'toiture' }, 'Gouttières', true),
  ])
  const facets = facetsOf(collections[0])
  assert.deepEqual(facets.map((f) => f.value), ['jardin', 'toiture'])
  assert.equal(facets[1].pages.length, 0)
  assert.equal(facets[1].archived.length, 1)
})

test('a page missing the facet is shown, never hidden', () => {
  // Hiding it would make the collection lie about its own size.
  const facets = facetsOf(sample().collections[0])
  const orphans = facets.find((f) => f.value === '')
  assert.equal(orphans.label, 'Uncategorised')
  assert.equal(orphans.pages[0].title, 'Sans catégorie')
})

test('a page appears under every value of a multi-valued facet', () => {
  const { collections } = buildCollections([
    page('c.md', { type: 'collection', of: 'projet', groupBy: 'aspects' }),
    page('p.md', { type: 'projet', aspects: ['menuiserie', 'electronique'] }),
  ])
  const facets = facetsOf(collections[0])
  assert.deepEqual(facets.map((f) => f.value).sort(), ['electronique', 'menuiserie'])
})

test('a collection that groups by nothing has no facets', () => {
  const { collections } = buildCollections([page('c.md', { type: 'collection', of: 'projet' })])
  assert.equal(facetsOf(collections[0]), null)
})

test('status is read, never interpreted', () => {
  // A collection understanding only four hardcoded statuses would silently
  // ignore the fifth.
  assert.equal(statusOf({ fields: { status: 'en-cours' } }), 'en-cours')
  assert.equal(statusOf({ fields: { statut: 'bloqué' } }), 'bloqué')
  assert.equal(statusOf({ fields: { status: 'quelque-chose-de-nouveau' } }), 'quelque-chose-de-nouveau')
  assert.equal(statusOf({ fields: {} }), null)
})

test('counts read properly in both numbers', () => {
  assert.equal(plural(1, 'page'), '1 page')
  assert.equal(plural(0, 'page'), '0 pages')
  assert.equal(plural(3, 'page'), '3 pages')
})

test('prettify makes a slug readable', () => {
  assert.equal(prettify('rangement-garage'), 'Rangement garage')
  assert.equal(prettify('dev'), 'Dev')
})
