/**
 * The half of the view that answers the SHELL rather than the reader.
 *
 * `routeFor` is called while a breadcrumb is being drawn — synchronously,
 * possibly for a folder that is no journal at all. Both properties are load
 * bearing: an answer that arrived late would be no answer, and a guessed one
 * would send somebody to "unreadable journal" from a folder of notes.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import view from '../web/app.js'

const INDEX = {
  entries: [
    { path: 'journal/atelier/INDEX.md', title: 'Atelier', fields: { type: 'journal' } },
    { path: 'journal/lecture/INDEX.md', title: 'Lecture', fields: { type: 'journal' } },
    {
      path: 'journal/atelier/2026-08-25.md',
      title: '2026-08-25',
      fields: { type: 'entree', date: '2026-08-25' },
    },
    { path: 'notes/atelier/INDEX.md', title: 'Notes', fields: { type: 'section' } },
  ],
}

/** The plugin api, reduced to what the factory actually touches. */
function fakeApi(index = INDEX) {
  return {
    id: 'journal',
    base: '/plugins/journal/',
    locale: 'fr',
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(index) }),
    ask() {},
    compose() {},
    trail() {},
    PageEditor: () => null,
  }
}

/** The listing is primed asynchronously; let it land. */
const settled = () => new Promise((done) => setTimeout(done, 0))

test('routes a journal folder to that journal, by name', async () => {
  const contribution = view(fakeApi())
  await settled()
  assert.equal(contribution.routeFor('journal/atelier'), '/journal/atelier')
})

test('an entry answers for the journal that holds it', async () => {
  const contribution = view(fakeApi())
  await settled()
  assert.equal(contribution.routeFor('journal/atelier/2026-08-25.md'), '/journal/atelier')
})

test('answers nothing for a folder that is no journal', async () => {
  const contribution = view(fakeApi())
  await settled()
  // A folder of notes that happens to be called `atelier` too. Guessing here
  // would send somebody from their notes to a journal screen.
  assert.equal(contribution.routeFor('notes/atelier'), undefined)
})

test('answers nothing for the journal folder itself — that rule is the shell’s', async () => {
  const contribution = view(fakeApi())
  await settled()
  assert.equal(contribution.routeFor('journal'), undefined)
})

test('answers nothing rather than guessing when the listing will not load', async () => {
  const api = fakeApi()
  api.fetch = () => Promise.resolve({ ok: false, status: 503 })
  const contribution = view(api)
  await settled()
  assert.equal(contribution.routeFor('journal/atelier'), undefined)
})

test('claims a route of its own, and keeps its name for it', async () => {
  const contribution = view(fakeApi())
  assert.equal(contribution.route, '/journal')
  assert.equal(typeof contribution.routeFor, 'function')
})
