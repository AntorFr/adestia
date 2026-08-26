/**
 * How a journal is addressed.
 *
 * Two properties carry everything here. A link must be the SHORTEST form that
 * resolves back to the same journal — pretty is worthless if it opens the
 * wrong one. And every shape ever written down must still read: a bookmark
 * from before this file existed, or a link the agent put in a page months ago.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { resolve, restOf, routeOf, slugOf } from '../web/address.js'

const JOURNALS = ['journal/atelier', 'journal/lecture']

test('a journal is written by name — no filing, no %2F', () => {
  assert.equal(routeOf(JOURNALS, 'journal/atelier'), '/journal/atelier')
})

test('a name taken twice falls back to the path, slashes intact', () => {
  const twice = ['journal/atelier', 'archives/atelier']
  // A pretty link that opens the wrong journal is not an improvement on an
  // ugly one: both of them stay long.
  assert.equal(routeOf(twice, 'journal/atelier'), '/journal/journal/atelier')
  assert.equal(routeOf(twice, 'archives/atelier'), '/journal/archives/atelier')
})

test('a journal the listing does not know is written in full', () => {
  assert.equal(routeOf([], 'journal/atelier'), '/journal/journal/atelier')
})

test('a name reads back to its folder, and so does the folder', () => {
  assert.equal(resolve(JOURNALS, 'atelier'), 'journal/atelier')
  assert.equal(resolve(JOURNALS, 'journal/atelier'), 'journal/atelier')
})

test('the shape written before this file existed still opens', () => {
  // `encodeURIComponent` over the whole folder — every bookmark taken from the
  // first version of this plugin. Decoding segment by segment turns it back
  // into the path it always was.
  assert.equal(resolve(JOURNALS, 'journal%2Fatelier'), 'journal/atelier')
})

test('an ambiguous name opens nothing rather than one of two', () => {
  const twice = ['journal/atelier', 'archives/atelier']
  assert.equal(resolve(twice, 'atelier'), undefined)
})

test('the shelf is what an empty tail means', () => {
  assert.equal(resolve(JOURNALS, ''), undefined)
  assert.equal(restOf('#/journal'), '')
  assert.equal(restOf('#/journal/atelier'), 'atelier')
})

test('a stray percent is read as itself rather than thrown out of a router', () => {
  assert.equal(resolve(JOURNALS, '100%'), undefined)
})

test('a name is the last segment, whatever the folder is called', () => {
  assert.equal(slugOf('journal/atelier'), 'atelier')
  assert.equal(slugOf(''), '')
})
