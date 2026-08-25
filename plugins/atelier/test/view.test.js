/**
 * The half of the view that answers the SHELL rather than the bench.
 *
 * The atelier cannot declare `absorbs`: its workbooks sit in whatever project
 * folders exist, and no folder NAME covers them — `projets` is a word half a
 * workspace uses, `diy` is a domain full of notes this app does not draw. So
 * it claims a path by KNOWING it, and what that costs is tested here: the
 * answer must be synchronous, and it must be silence for a folder that holds
 * no workbook.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import view from '../web/view.js'

const LISTING = {
  workbooks: [
    { path: 'domaines/diy/projets/rangement-garage/assets/workbook.json', titre: 'Rangement garage' },
    { path: 'domaines/diy/projets/bibliotheque-salon/assets/workbook.json', titre: 'Bibliothèque' },
  ],
}

/** The plugin api, reduced to what the factory actually touches. */
function fakeApi(listing = LISTING) {
  return {
    id: 'atelier',
    base: '/plugins/atelier/',
    locale: 'fr',
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(listing) }),
    ask() {},
    compose() {},
  }
}

/** The listing is primed asynchronously; let it land. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

test('claims a project folder that holds a workbook, by name', async () => {
  const contribution = view(fakeApi())
  await settled()
  assert.equal(
    contribution.routeFor('domaines/diy/projets/rangement-garage'),
    '/atelier/rangement-garage',
  )
})

test('claims the workbook file itself, and anything filed beside it', async () => {
  // A brief target names the `workbook.json`; a note sits next to it. Both
  // belong to the same bench.
  const contribution = view(fakeApi())
  await settled()
  assert.equal(
    contribution.routeFor('domaines/diy/projets/rangement-garage/assets/workbook.json'),
    '/atelier/rangement-garage',
  )
  assert.equal(
    contribution.routeFor('domaines/diy/projets/rangement-garage/notes/mesures.md'),
    '/atelier/rangement-garage',
  )
})

test('claims nothing where no workbook is filed', async () => {
  // The whole reason this is not an `absorbs` on `diy`: these are notes, and
  // they keep the shell's own section.
  const contribution = view(fakeApi())
  await settled()
  assert.equal(contribution.routeFor('domaines/diy/machines'), undefined)
  assert.equal(contribution.routeFor('domaines/diy'), undefined)
  assert.equal(contribution.routeFor('domaines/diy/projets'), undefined)
})

test('claims nothing rather than guessing when the listing will not load', async () => {
  const api = fakeApi()
  api.fetch = () => Promise.reject(new Error('offline'))
  const contribution = view(api)
  await settled()
  assert.equal(contribution.routeFor('domaines/diy/projets/rangement-garage'), undefined)
  assert.equal(contribution.route, '/atelier')
  assert.equal(typeof contribution.component, 'function')
})
