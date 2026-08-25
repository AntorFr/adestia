/**
 * The half of the view that answers the SHELL rather than the reader.
 *
 * `routeFor` is called while a breadcrumb is being drawn — synchronously,
 * possibly for a folder that is not a trip at all. Both properties are load
 * bearing: an answer that arrived late would be no answer, and a guessed one
 * would send somebody to "unreadable trip" from a folder of notes.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import view from '../web/view.js'

const LISTING = {
  voyages: [
    { path: 'domaines/voyages/broceliande-2026/assets/voyage.json', titre: 'Brocéliande 2026' },
    { path: 'domaines/voyages/corse/assets/voyage.json', titre: 'Corse' },
  ],
}

/** The plugin api, reduced to what the factory actually touches. */
function fakeApi(listing = LISTING) {
  const calls = []
  return {
    id: 'voyages',
    base: '/plugins/voyages/',
    locale: 'fr',
    calls,
    fetch: (url) => {
      calls.push(url)
      return Promise.resolve({ ok: true, json: () => Promise.resolve(listing) })
    },
    ask() {},
    compose() {},
  }
}

/** The listing is primed asynchronously; let it land. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

test('routes a trip folder to that trip, by name', async () => {
  const contribution = view(fakeApi())
  await settled()
  assert.equal(contribution.routeFor('domaines/voyages/broceliande-2026'), '/voyages/broceliande-2026')
})

test('routes a page filed DEEPER than the trip to that same trip', async () => {
  // `.../broceliande-2026/jours` still belongs to Brocéliande: the walk climbs
  // rather than giving up on the first folder it does not recognise.
  const contribution = view(fakeApi())
  await settled()
  assert.equal(contribution.routeFor('domaines/voyages/corse/jours/mardi'), '/voyages/corse')
})

test('answers nothing for a folder under voyages that is not a trip', async () => {
  // A notes folder. The shell falls back to its own section, which is the
  // screen the reader had before any of this existed.
  const contribution = view(fakeApi())
  await settled()
  assert.equal(contribution.routeFor('domaines/voyages/idees'), undefined)
})

test('answers nothing for the voyages folder itself — that rule is the shell’s', async () => {
  const contribution = view(fakeApi())
  await settled()
  assert.equal(contribution.routeFor('domaines/voyages'), undefined)
})

test('answers nothing rather than guessing when the listing will not load', async () => {
  const api = fakeApi()
  api.fetch = () => Promise.reject(new Error('offline'))
  const contribution = view(api)
  await settled()
  assert.equal(contribution.routeFor('domaines/voyages/broceliande-2026'), undefined)
  // And the view itself is untouched: a shortcut that failed to prime costs
  // the shortcut alone.
  assert.equal(typeof contribution.component, 'function')
  assert.equal(contribution.route, '/voyages')
})

test('survives a listing whose shape is not what it expects', async () => {
  const contribution = view(fakeApi({ voyages: [null, {}, { path: 42 }] }))
  await settled()
  assert.equal(contribution.routeFor('domaines/voyages/broceliande-2026'), undefined)
})
