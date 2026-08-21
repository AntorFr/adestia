import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCollections, facetsOf, plural, prettify, statusOf } from '../web/model.js'

const page = (path, fields, title = path) => ({ path, title, fields })

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
  assert.equal(collections[0].members.length, 4)
  assert.equal(collections[0].members.some((p) => p.type === 'fiche'), false)
})

test('a declaration with no `of` collects nothing and says so', () => {
  // Collecting everything would look like a bug in the pages rather than in
  // the declaration.
  const { collections } = buildCollections([page('c.md', { type: 'collection' })])
  assert.deepEqual(collections[0].members, [])
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
