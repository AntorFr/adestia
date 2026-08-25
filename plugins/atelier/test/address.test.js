/**
 * How a workbook is addressed.
 *
 * Two properties carry everything. A link must be the SHORTEST form that
 * resolves back to the same bench — pretty is worthless if it opens the wrong
 * one. And every shape ever written down must still read: a bookmark, or a
 * link the agent put in a page months ago.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { folderOf, resolve, restOf, routeOf, slugOf } from '../web/address.js'

/** The listing this plugin holds: project folder → its `workbook.json`. */
const listing = (...folders) =>
  new Map(folders.map((folder) => [folder, `${folder}/assets/workbook.json`]))

const BOOKS = listing(
  'domaines/diy/projets/rangement-garage',
  'domaines/diy/projets/bibliotheque-salon',
)

test('a workbook is written by name — no storage, no %2F, no filing', () => {
  assert.equal(
    routeOf(BOOKS, 'domaines/diy/projets/rangement-garage/assets/workbook.json'),
    '/atelier/rangement-garage',
  )
})

test('a project name used twice falls back to the path, slashes intact', () => {
  const twice = listing('domaines/diy/projets/etagere', 'archives/2019/etagere')
  assert.equal(
    routeOf(twice, 'domaines/diy/projets/etagere/assets/workbook.json'),
    '/atelier/domaines/diy/projets/etagere',
  )
})

test('a workbook the listing has never heard of is written in full', () => {
  assert.equal(
    routeOf(new Map(), 'domaines/diy/projets/rangement-garage/assets/workbook.json'),
    '/atelier/domaines/diy/projets/rangement-garage',
  )
})

test('a name reads back to its bench', () => {
  assert.equal(
    resolve(BOOKS, 'rangement-garage'),
    'domaines/diy/projets/rangement-garage/assets/workbook.json',
  )
})

test('a project path reads back to its bench', () => {
  assert.equal(
    resolve(BOOKS, 'domaines/diy/projets/bibliotheque-salon'),
    'domaines/diy/projets/bibliotheque-salon/assets/workbook.json',
  )
})

test('the old %2F form still reads — nothing written down stops working', () => {
  assert.equal(
    resolve(BOOKS, 'domaines%2Fdiy%2Fprojets%2Frangement-garage%2Fassets%2Fworkbook.json'),
    'domaines/diy/projets/rangement-garage/assets/workbook.json',
  )
})

test('the long form reads WITHOUT the listing, so a cold link costs no fetch', () => {
  assert.equal(
    resolve(new Map(), 'domaines/diy/projets/rangement-garage/assets/workbook.json'),
    'domaines/diy/projets/rangement-garage/assets/workbook.json',
  )
})

test('an ambiguous name opens the hub rather than one of two at random', () => {
  const twice = listing('domaines/diy/projets/etagere', 'archives/2019/etagere')
  assert.equal(resolve(twice, 'etagere'), undefined)
})

test('an unknown name opens nothing', () => {
  assert.equal(resolve(BOOKS, 'establi'), undefined)
  assert.equal(resolve(BOOKS, ''), undefined)
})

test('a stray percent in a typed hash does not throw out of the router', () => {
  assert.equal(resolve(BOOKS, '50%'), undefined)
})

test('the pieces of a path', () => {
  assert.equal(folderOf('a/b/assets/workbook.json'), 'a/b')
  assert.equal(folderOf('a/b'), 'a/b')
  assert.equal(slugOf('domaines/diy/projets/rangement-garage'), 'rangement-garage')
  assert.equal(restOf('#/atelier/rangement-garage'), 'rangement-garage')
  assert.equal(restOf('#/atelier'), '')
  assert.equal(restOf('#/atelier/'), '')
})
