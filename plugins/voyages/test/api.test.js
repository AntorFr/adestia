/**
 * The trips' server side, where the interesting decisions are about BOUNDARIES
 * rather than about holidays: which paths a query string may reach, what an
 * overlay is allowed to say, and what a hub card is made of.
 *
 * The gesture rules get the most attention here because they are the ones that
 * protect the agent's file: everything the front can do lands in the overlay,
 * and every refusal below is a way somebody's trip could otherwise have been
 * quietly corrupted from a drag.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { join, sep } from 'node:path'

import {
  daysBetween,
  dayLocation,
  mergeItems,
  overlayPath,
  readGesture,
  safeDocPath,
  safeVoyagePath,
  summarise,
} from '../api.mjs'

const ROOT = `${sep}pages`
const VOYAGE = join(ROOT, 'voyages/corse/assets/voyage.json')

const trip = {
  titre: 'Corse — été 2026',
  status: 'prépa',
  debut: '2026-08-08',
  fin: '2026-08-22',
  lieux: [
    { id: 'calvi', nom: 'Calvi', lat: 42.567, lng: 8.757, arrivee: '2026-08-08', depart: '2026-08-15' },
    { id: 'bonifacio', nom: 'Bonifacio', lat: 41.387, lng: 9.16, arrivee: '2026-08-15' },
  ],
  items: [
    { id: 'hotel', type: 'hebergement', statut: 'confirme', titre: 'U Carabellu', debut: '2026-08-08', fin: '2026-08-15' },
    { id: 'anna', type: 'resto', statut: 'suggestion', titre: 'Chez Anna' },
    { id: 'citadelle', type: 'activite', statut: 'suggestion', titre: 'La citadelle' },
  ],
}

test('a voyage path resolves under the pages root', () => {
  assert.equal(safeVoyagePath(ROOT, 'voyages/corse/assets/voyage.json'), VOYAGE)
  // Leading slashes are stripped rather than refused: a path is relative here
  // whatever the caller believed it was writing.
  assert.equal(safeVoyagePath(ROOT, '/voyages/corse/assets/voyage.json'), VOYAGE)
})

test('nothing reaches outside the pages root', () => {
  for (const attempt of [
    '../../etc/passwd/voyage.json',
    'voyages/../../../voyage.json',
    'a/\0/voyage.json',
    42,
  ]) {
    assert.equal(safeVoyagePath(ROOT, attempt), undefined, String(attempt))
  }
})

test('only a file actually named voyage.json is addressable', () => {
  // The state route takes the VOYAGE path and derives the file it writes.
  // Without this, `?v=…/secrets.json` would name the file to be overwritten.
  assert.equal(safeVoyagePath(ROOT, 'voyages/corse/assets/notes.json'), undefined)
  assert.equal(safeVoyagePath(ROOT, 'voyages/corse/assets/voyage.json.bak'), undefined)
})

test('the overlay lands beside the trip, never inside it', () => {
  assert.equal(overlayPath(VOYAGE), join(ROOT, 'voyages/corse/assets/voyage-state.json'))
})

test('a document is reachable only inside its own trip', () => {
  assert.equal(
    safeDocPath(ROOT, VOYAGE, 'assets/embarquement.pdf'),
    join(ROOT, 'voyages/corse/assets/embarquement.pdf'),
  )
  // A page of the trip is a document too — the boundary is the folder, not an
  // extension list.
  assert.equal(safeDocPath(ROOT, VOYAGE, 'balade.md'), join(ROOT, 'voyages/corse/balade.md'))

  for (const attempt of ['../../autre/voyage.json', '../secrets.md', '', '.', 'a/\0/b']) {
    assert.equal(safeDocPath(ROOT, VOYAGE, attempt), undefined, String(attempt))
  }

  // An absolute-looking path is made relative rather than refused — the same
  // convention as a voyage path. It cannot escape, which is what matters: it
  // lands inside the trip and 404s there.
  assert.equal(safeDocPath(ROOT, VOYAGE, '/etc/passwd'), join(ROOT, 'voyages/corse/etc/passwd'))
})

test('a gesture is laid over the item it names, without its stamp', () => {
  const merged = mergeItems(trip, {
    items: { anna: { statut: 'confirme', jour: '2026-08-10', ordre: 1000, ts: '2026-08-24T10:00:00Z' } },
  })
  const anna = merged.find((item) => item.id === 'anna')
  assert.equal(anna.statut, 'confirme')
  assert.equal(anna.jour, '2026-08-10')
  // The stamp dates the overlay; it is not a field of the trip and must never
  // reach a card.
  assert.equal('ts' in anna, false)
  // And the untouched items come through as they were written.
  assert.equal(merged.find((item) => item.id === 'hotel').titre, 'U Carabellu')
})

test('a card carries everything the hub renders', () => {
  const card = summarise('voyages/corse/assets/voyage.json', trip, { items: {} })
  // Named explicitly: a missing key here does not throw, it prints "undefined"
  // on a card.
  for (const key of ['path', 'titre', 'status', 'debut', 'fin', 'lieux', 'confirmes', 'suggestions', 'lastActivity']) {
    assert.ok(key in card, `card is missing \`${key}\``)
  }
  assert.equal(card.titre, 'Corse — été 2026')
  assert.deepEqual(card.lieux, ['Calvi', 'Bonifacio'])
  assert.equal(card.confirmes, 1)
  assert.equal(card.suggestions, 2)
  assert.equal(card.lastActivity, null)
})

test('a trip with no title is named after its folder, not after a path', () => {
  const card = summarise('voyages/corse/assets/voyage.json', { items: [] }, { items: {} })
  assert.equal(card.titre, 'corse')
})

test('an overlay cannot invent an item', () => {
  assert.equal(readGesture(trip, { id: 'fantome', statut: 'confirme' }).error, 'unknown item')
  assert.equal(readGesture(trip, {}).error, 'unknown item')
})

test('a continuous item does not move', () => {
  // It IS the shape of the trip — a stay spans nights, and the timeline has no
  // way to draw it inside one day.
  assert.equal(
    readGesture(trip, { id: 'hotel', statut: 'confirme', jour: '2026-08-09' }).error,
    'continuous items are not movable',
  )
})

test('confirming needs a day, inside the trip', () => {
  assert.equal(readGesture(trip, { id: 'anna', statut: 'confirme' }).error, 'confirme requires jour')
  assert.equal(
    readGesture(trip, { id: 'anna', statut: 'confirme', jour: '2026-09-01' }).error,
    'jour outside voyage',
  )
  assert.equal(
    readGesture(trip, { id: 'anna', statut: 'confirme', jour: 'demain' }).error,
    'confirme requires jour',
  )
})

test('a trip without dates confirms nothing', () => {
  // The corollary of "idea ⇔ no dates": there is no day to set, so confirming
  // is mechanically impossible rather than merely discouraged.
  const idea = { ...trip, debut: undefined, fin: undefined }
  assert.equal(
    readGesture(idea, { id: 'anna', statut: 'confirme', jour: '2026-08-10' }).error,
    'voyage has no dates yet',
  )
})

test('the closed vocabularies are enforced server-side', () => {
  assert.equal(readGesture(trip, { id: 'anna', statut: 'peut-etre' }).error, 'bad statut')
  assert.equal(
    readGesture(trip, { id: 'anna', statut: 'confirme', jour: '2026-08-10', creneau: 'aube' }).error,
    'bad creneau',
  )
  assert.equal(
    readGesture(trip, { id: 'anna', statut: 'confirme', jour: '2026-08-10', ordre: 'premier' }).error,
    'bad ordre',
  )
  assert.equal(
    readGesture(trip, { id: 'anna', statut: 'confirme', jour: '2026-08-10', heure: 'midi' }).error,
    'bad heure',
  )
})

test('the hour is an annotation: absent leaves it, null clears it', () => {
  const untouched = readGesture(trip, { id: 'anna', statut: 'confirme', jour: '2026-08-10' })
  assert.equal('heure' in untouched.patch, false, 'a move must not erase an hour somebody set')
  assert.equal(untouched.replace, false, 'a confirmation merges over what was there')

  const cleared = readGesture(trip, { id: 'anna', statut: 'confirme', jour: '2026-08-10', heure: null })
  assert.equal(cleared.patch.heure, null)

  // `9h30` is what a person types; `09:30` is what the field reads back.
  const set = readGesture(trip, { id: 'anna', statut: 'confirme', jour: '2026-08-10', heure: '9h30' })
  assert.equal(set.patch.heure, '9:30')
})

test('leaving the plan drops the placement, and replaces rather than merges', () => {
  for (const statut of ['suggestion', 'ecartee']) {
    const { patch, replace } = readGesture(trip, { id: 'anna', statut })
    assert.equal(patch.statut, statut)
    // The invariant: an item that is not confirmed is never placed — even when
    // the placement came from voyage.json itself.
    assert.deepEqual(
      { jour: patch.jour, creneau: patch.creneau, ordre: patch.ordre, heure: patch.heure },
      { jour: null, creneau: null, ordre: null, heure: null },
    )
    assert.equal(replace, true, 'a returned card keeps nothing from where it had been')
  }
})

test('a day is measured from where the trip is that day', () => {
  assert.deepEqual(dayLocation(trip, '2026-08-10'), { lat: 42.567, lng: 8.757 })
  assert.deepEqual(dayLocation(trip, '2026-08-20'), { lat: 41.387, lng: 9.16 })
  // A day no stay covers still gets a location rather than no forecast at all.
  assert.deepEqual(dayLocation({ lieux: [{ lat: 1, lng: 2 }] }, '2026-01-01'), { lat: 1, lng: 2 })
  assert.equal(dayLocation({ lieux: [] }, '2026-01-01'), undefined)
})

test('the days of a trip are its days, ends included', () => {
  assert.deepEqual(daysBetween('2026-08-08', '2026-08-11'), [
    '2026-08-08',
    '2026-08-09',
    '2026-08-10',
    '2026-08-11',
  ])
  assert.deepEqual(daysBetween('2026-08-08', '2026-08-08'), ['2026-08-08'])
  // Across a DST boundary, where adding 24 h to a local date silently repeats
  // or skips a day.
  assert.equal(daysBetween('2026-10-24', '2026-10-27').length, 4)
})
