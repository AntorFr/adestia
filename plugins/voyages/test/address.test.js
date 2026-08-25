/**
 * How a trip is addressed.
 *
 * Two properties carry everything here. A link must be the SHORTEST form that
 * resolves back to the same trip — pretty is worthless if it opens the wrong
 * one. And every shape ever written down must still read: a bookmark from
 * before this file existed, or a link the agent put in a page months ago.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { folderOf, resolve, restOf, routeOf, slugOf } from '../web/address.js'

/** The listing this plugin holds: folder → the `voyage.json` that is the trip. */
const listing = (...folders) =>
  new Map(folders.map((folder) => [folder, `${folder}/assets/voyage.json`]))

const TRIPS = listing('domaines/voyages/baden-2026', 'domaines/voyages/broceliande-2026')

test('a trip is written by name — no storage, no %2F, no filing', () => {
  assert.equal(
    routeOf(TRIPS, 'domaines/voyages/baden-2026/assets/voyage.json'),
    '/voyages/baden-2026',
  )
})

test('a name taken twice falls back to the path, slashes intact', () => {
  const twice = listing('domaines/voyages/baden-2026', 'archives/voyages/baden-2026')
  assert.equal(
    routeOf(twice, 'domaines/voyages/baden-2026/assets/voyage.json'),
    '/voyages/domaines/voyages/baden-2026',
  )
  // A pretty link that opens the wrong trip is not an improvement on an ugly
  // one: both of them stay long.
  assert.equal(
    routeOf(twice, 'archives/voyages/baden-2026/assets/voyage.json'),
    '/voyages/archives/voyages/baden-2026',
  )
})

test('a trip the listing has never heard of is written in full', () => {
  // Nothing proves the short form would resolve, so it is not used.
  assert.equal(
    routeOf(new Map(), 'domaines/voyages/baden-2026/assets/voyage.json'),
    '/voyages/domaines/voyages/baden-2026',
  )
})

test('a segment that needs escaping is escaped — the slashes are not', () => {
  const odd = listing('domaines/voyages/été 2026', 'archives/voyages/été 2026')
  assert.equal(
    routeOf(odd, 'domaines/voyages/été 2026/assets/voyage.json'),
    '/voyages/domaines/voyages/%C3%A9t%C3%A9%202026',
  )
})

test('a name reads back to its trip', () => {
  assert.equal(
    resolve(TRIPS, 'baden-2026'),
    'domaines/voyages/baden-2026/assets/voyage.json',
  )
})

test('a folder path reads back to its trip', () => {
  assert.equal(
    resolve(TRIPS, 'domaines/voyages/baden-2026'),
    'domaines/voyages/baden-2026/assets/voyage.json',
  )
})

test('the old %2F form still reads — nothing written down stops working', () => {
  // The shape every existing bookmark and every link the agent already wrote
  // into a page carries.
  assert.equal(
    resolve(TRIPS, 'domaines%2Fvoyages%2Fbaden-2026%2Fassets%2Fvoyage.json'),
    'domaines/voyages/baden-2026/assets/voyage.json',
  )
})

test('the long form reads WITHOUT the listing, so a cold link costs no fetch', () => {
  assert.equal(
    resolve(new Map(), 'domaines/voyages/baden-2026/assets/voyage.json'),
    'domaines/voyages/baden-2026/assets/voyage.json',
  )
})

test('an ambiguous name opens nothing rather than one of two at random', () => {
  const twice = listing('domaines/voyages/baden-2026', 'archives/voyages/baden-2026')
  // The hub — "here are the trips, say which" — is an honest answer to an
  // ambiguous request.
  assert.equal(resolve(twice, 'baden-2026'), undefined)
})

test('an unknown name opens nothing', () => {
  assert.equal(resolve(TRIPS, 'corse'), undefined)
  assert.equal(resolve(TRIPS, ''), undefined)
})

test('a stray percent in a typed hash does not throw out of the router', () => {
  assert.equal(resolve(TRIPS, '100%'), undefined)
})

test('the pieces of a path', () => {
  assert.equal(folderOf('a/b/assets/voyage.json'), 'a/b')
  assert.equal(folderOf('a/b'), 'a/b')
  assert.equal(slugOf('domaines/voyages/baden-2026'), 'baden-2026')
  assert.equal(restOf('#/voyages/baden-2026'), 'baden-2026')
  assert.equal(restOf('#/voyages'), '')
  assert.equal(restOf('#/voyages/'), '')
})
