/**
 * The server side: a frontier and a narrowing.
 *
 * The frontier first, because it is what protects the workspace — a plugin
 * that serves an overlay must not become a way to write any file under the
 * memory. The narrowing second: an overlay is a handful of gestures, and a
 * gesture that could carry an arbitrary field would be an edit of the file by
 * another name, through the one route the front is allowed to call.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { cleanGesture, overlayPath, safeMealsPath } from '../api.mjs'

test('a period is named by its suffix, and cannot walk out', () => {
  assert.equal(
    safeMealsPath('domaines/voyages/corse/semaine.meals.json'),
    'domaines/voyages/corse/semaine.meals.json',
  )
  // A leading slash is a clumsy way to write a relative path, not an escape.
  assert.equal(safeMealsPath('/x.meals.json'), 'x.meals.json')
  // Traversal, in every shape.
  assert.equal(safeMealsPath('../../etc/passwd.meals.json'), undefined)
  assert.equal(safeMealsPath('x/.hidden/y.meals.json'), undefined)
  assert.equal(safeMealsPath('x/\0.meals.json'), undefined)
  // The suffix is checked, not merely the path: without this the route would
  // hand any file of the workspace to whoever can write a query string.
  assert.equal(safeMealsPath('domaines/prive/salaires.json'), undefined)
  assert.equal(safeMealsPath('.meals.json'), undefined)
  assert.equal(safeMealsPath(42), undefined)
})

test('the overlay sits beside the period, never inside it', () => {
  assert.equal(overlayPath('voyages/corse/semaine.meals.json'), 'voyages/corse/semaine.meals-state.json')
})

test('a gesture carries placement and status, and nothing else', () => {
  const clean = cleanGesture({ id: 'a', statut: 'confirme', jour: '2026-08-09', section: 'soir', ordre: 1.5 })
  assert.deepEqual(clean, {
    id: 'a',
    fields: { statut: 'confirme', jour: '2026-08-09', section: 'soir', ordre: 1.5 },
  })
  // A field nobody declared does not ride along into the overlay.
  assert.deepEqual(cleanGesture({ id: 'a', statut: 'confirme', props: { sel: '9 g' } }).fields, {
    statut: 'confirme',
  })
})

test('null is a value, an absent key is silence', () => {
  // Back to the tray: placement cleared, explicitly.
  assert.deepEqual(cleanGesture({ id: 'a', jour: null, section: null, ordre: null }).fields, {
    jour: null,
    section: null,
    ordre: null,
  })
  // Setting a card aside says nothing about where it was.
  assert.deepEqual(cleanGesture({ id: 'a', statut: 'ecartee' }).fields, { statut: 'ecartee' })
})

test('an overlay cannot invent a word', () => {
  assert.equal(cleanGesture({ id: 'a', statut: 'peut-etre' }), undefined)
  assert.equal(cleanGesture({ id: 'a', jour: '09/08/2026' }), undefined)
  assert.equal(cleanGesture({ id: 'a', ordre: 'premier' }), undefined)
  // Sections are declared per period, so they are validated against the file.
  assert.equal(cleanGesture({ id: 'a', section: 'goûter' }, ['matin', 'soir']), undefined)
  assert.deepEqual(cleanGesture({ id: 'a', section: 'goûter' }, ['matin', 'goûter']).fields, {
    section: 'goûter',
  })
  // Nothing to say is not a gesture.
  assert.equal(cleanGesture({ id: 'a' }), undefined)
  assert.equal(cleanGesture({ statut: 'confirme' }), undefined)
})
