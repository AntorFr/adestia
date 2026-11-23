/**
 * The cover the "Journal" creation writes (P-21 step 4): a page beside the folder of its entries,
 * which the plugin reads as the journal of the folder of the same name. Read from the shipped model
 * file, not from a copy of it.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildModel } from '../web/model.js'

const model = readFileSync(fileURLToPath(new URL('../templates/journal.md', import.meta.url)), 'utf8')
const front = (name) => new RegExp(`^${name}: *(.+)$`, 'm').exec(model.split('---')[1])?.[1]

test('the model is typed journal, so the plugin reads the page it creates', () => {
  assert.equal(front('type'), 'journal')
})

test('a cover made from the model, filed in a folder, is the journal of the folder of its name', () => {
  const entries = [
    { path: 'perso/voyage.md', title: 'Voyage', fields: { type: front('type'), ico: '📓' } },
    { path: 'perso/voyage/2026-11-20.md', title: '2026-11-20', fields: { type: 'entree', date: '2026-11-20' } },
    { path: 'perso/ailleurs/2026-11-21.md', title: 'x', fields: { type: 'entree', date: '2026-11-21' } },
  ]
  const [journal, ...rest] = buildModel(entries)
  assert.equal(rest.length, 0)
  assert.equal(journal.folder, 'perso/voyage')
  assert.equal(journal.path, 'perso/voyage.md')
  assert.deepEqual(journal.entries.map((e) => e.path), ['perso/voyage/2026-11-20.md'])
})

test('a cover with no entry yet is still a journal, empty', () => {
  const [journal] = buildModel([{ path: 'voyage.md', title: 'Voyage', fields: { type: front('type') } }])
  assert.equal(journal.folder, 'voyage')
  assert.deepEqual(journal.entries, [])
})
