/**
 * The workbench's server side, where the interesting decisions are about
 * BOUNDARIES rather than about woodwork: which paths a query string may reach,
 * where an overlay is allowed to land, and what a hub card is made of.
 *
 * The domain itself — bands, kerf, usable zone — is guarded by the validator
 * test next door, which runs the ported rules against a real workbook.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { overlayPath, safeWorkbookPath, summarise } from '../api.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const fixture = JSON.parse(readFileSync(join(here, 'fixture-workbook.json'), 'utf8'))
const ROOT = `${sep}pages`

test('a workbook name comes back as the name the product speaks', () => {
  // A LOGICAL name in, a logical name out. Where the file lives is the core's
  // business now — it composes the stores and applies the guard in each — so
  // this plugin holds no root to resolve against.
  assert.equal(
    safeWorkbookPath('projets/garage/assets/workbook.json'),
    'projets/garage/assets/workbook.json',
  )
  // Leading slashes are stripped rather than refused: a path is relative here
  // whatever the caller believed it was writing.
  assert.equal(
    safeWorkbookPath('/projets/garage/assets/workbook.json'),
    'projets/garage/assets/workbook.json',
  )
})

test('nothing reaches outside the pages root', () => {
  for (const attempt of [
    '../../etc/passwd/workbook.json',
    'projets/../../../workbook.json',
    'a/\0/workbook.json',
  ]) {
    assert.equal(safeWorkbookPath(attempt), undefined, attempt)
  }
})

test('only a file actually named workbook.json is addressable', () => {
  // The overlay routes take the WORKBOOK path and derive the file they write.
  // Without this, `?wb=…/secrets.json` would name the file to be overwritten.
  assert.equal(safeWorkbookPath('projets/garage/assets/notes.json'), undefined)
  assert.equal(safeWorkbookPath('projets/garage/assets/workbook.json.bak'), undefined)
  assert.equal(safeWorkbookPath(42), undefined)
})

test('overlays land beside the workbook, never inside it', () => {
  const workbook = join(ROOT, 'projets/garage/assets/workbook.json')
  assert.equal(overlayPath(workbook, 'state'), join(ROOT, 'projets/garage/assets/workbook-state.json'))
  assert.equal(overlayPath(workbook, 'layout'), join(ROOT, 'projets/garage/assets/workbook-layout.json'))
})

test('a card carries everything the hub renders', () => {
  const card = summarise('p/assets/workbook.json', fixture)
  // Named explicitly: a missing key here does not throw, it prints
  // "undefined" on a card.
  for (const key of ['path', 'projet', 'titre', 'pieces', 'total', 'done', 'lastActivity']) {
    assert.ok(key in card, `card is missing \`${key}\``)
  }
  assert.equal(card.titre, 'Rangement du garage')
  assert.equal(card.pieces, 4)
  assert.ok(card.total > 0, 'a workbook with a cutting plan has steps')
  assert.equal(card.done, 0)
  assert.equal(card.lastActivity, null)
})

test('progress counts ticks, and the latest one dates the workbook', () => {
  const card = summarise('p/assets/workbook.json', fixture, {
    'P1-REF-1': '2026-08-19T09:00:00Z',
    'P1-TR-1': '2026-08-21T12:39:51Z',
    'P1-TR-2': '2026-08-20T11:00:00Z',
  })
  assert.equal(card.done, 3)
  assert.equal(card.lastActivity, '2026-08-21T12:39:51Z')
})

test('a workbook with no cutting plan falls back to its pieces', () => {
  // Otherwise every freshly written workbook shows "0/0", which reads as
  // broken rather than as early.
  const card = summarise('p/assets/workbook.json', { pieces: [{}, {}, {}] })
  assert.equal(card.total, 3)
})

test('a title is never empty, whatever the workbook omits', () => {
  assert.equal(summarise('a/assets/workbook.json', { projet: 'garage' }).titre, 'garage')
  assert.equal(summarise('a/assets/workbook.json', {}).titre, 'a/assets/workbook.json')
})
