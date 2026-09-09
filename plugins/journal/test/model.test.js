/**
 * The journal model, tested as plain JavaScript.
 *
 * Deliberately not a Adestia package: a bundled plugin is an ordinary plugin,
 * and a plugin author has no monorepo. If this can only be tested from inside
 * the repository, the contract is not what it claims to be.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildModel,
  entryMarkdown,
  entryWhen,
  folderOf,
  isIndexPage,
  journalFolder,
  journalMarkdown,
  newEntryPath,
  setField,
  slugify,
  sortEntries,
  stamp,
  words,
} from '../web/model.js'

const page = (path, fields, extra = {}) => ({
  path,
  title: path.replace(/\.md$/, '').split('/').pop(),
  fields,
  ...extra,
})

test('a folder is read from a path, root included', () => {
  assert.equal(folderOf('journal/atelier/2026-08-25.md'), 'journal/atelier')
  assert.equal(folderOf('carnet.md'), '')
})

test('the three spellings of a cover all name the same folder', () => {
  assert.equal(journalFolder('journal/atelier/INDEX.md'), 'journal/atelier')
  assert.equal(journalFolder('journal/atelier/atelier.md'), 'journal/atelier')
  assert.equal(journalFolder('journal/atelier.md'), 'journal/atelier')
  assert.ok(isIndexPage('journal/atelier/INDEX.md'))
  assert.ok(!isIndexPage('journal/atelier/2026-08-25.md'))
})

test('an entry is dated by its frontmatter, and by its name when nobody said', () => {
  assert.equal(entryWhen(page('j/a/x.md', { date: '2026-08-25T14:30' })), '2026-08-25T14:30')
  assert.equal(entryWhen(page('j/a/2026-08-25-1430.md', {})), '2026-08-25T14:30')
  assert.equal(entryWhen(page('j/a/2026-08-24.md', {})), '2026-08-24')
  // Nothing to read is not a date invented: it sorts last rather than as today.
  assert.equal(entryWhen(page('j/a/notes.md', {})), '')
})

test('the history reads newest first, undated entries last', () => {
  const sorted = sortEntries([
    { path: 'a', when: '2026-08-24' },
    { path: 'b', when: '' },
    { path: 'c', when: '2026-08-25T14:30' },
  ])
  assert.deepEqual(
    sorted.map((entry) => entry.path),
    ['c', 'a', 'b'],
  )
})

test('a journal collects the entries of its own folder, and no others', () => {
  const journals = buildModel([
    page('journal/atelier/INDEX.md', { type: 'journal', ico: '🪚' }, { title: "Carnet d'atelier" }),
    page('journal/atelier/2026-08-24.md', { type: 'entree' }),
    page('journal/atelier/2026-08-25-1430.md', { type: 'entree', title: 'Guide' }),
    // Same type, another folder: a `type` collision must not fill somebody's
    // journal with a neighbouring app's pages.
    page('recettes/entrees/tapenade.md', { type: 'entree' }),
    page('journal/atelier/notes/2026-08-01.md', { type: 'entree' }),
  ])

  assert.equal(journals.length, 1)
  const [journal] = journals
  assert.equal(journal.folder, 'journal/atelier')
  assert.equal(journal.ico, '🪚')
  assert.deepEqual(
    journal.entries.map((entry) => entry.path),
    ['journal/atelier/2026-08-25-1430.md', 'journal/atelier/2026-08-24.md'],
  )
  // Only a title somebody wrote is a title: the index falls back to the file
  // name, which for an entry is its date.
  assert.equal(journal.entries[0].title, 'Guide')
  assert.equal(journal.entries[1].title, null)
})

test("a journal the core calls finished carries the core's verdict, not ours", () => {
  const [journal] = buildModel([
    page('journal/vieux/INDEX.md', { type: 'journal', status: 'clos' }, { finished: true }),
  ])
  assert.equal(journal.finished, true)
})

test('two covers for one folder give the same answer every time', () => {
  const journals = buildModel([
    page('journal/atelier/INDEX.md', { type: 'journal' }, { title: 'Premier' }),
    page('journal/atelier/atelier.md', { type: 'journal' }, { title: 'Second' }),
  ])
  assert.equal(journals.length, 1)
  assert.equal(journals[0].title, 'Premier')
})

test('an entry is named after its minute, and never overwrites a neighbour', () => {
  const when = new Date(2026, 7, 25, 14, 30)
  assert.equal(newEntryPath('journal/atelier', when), 'journal/atelier/2026-08-25-1430.md')
  assert.equal(
    newEntryPath('journal/atelier', when, ['journal/atelier/2026-08-25-1430.md']),
    'journal/atelier/2026-08-25-1430-2.md',
  )
  assert.equal(stamp(when), '2026-08-25T14:30')
})

test('an entry named by its title takes that name, and keeps its date in the field', () => {
  const when = new Date(2026, 7, 25, 14, 30)
  // `gabarit-queues-droites.md` says what it holds; the stamp says only when.
  assert.equal(
    newEntryPath('journal/atelier', when, [], 'Le gabarit de queues droites'),
    'journal/atelier/le-gabarit-de-queues-droites.md',
  )
  // Optional, so the two spellings live in one folder forever.
  assert.equal(newEntryPath('journal/atelier', when, [], '   '), 'journal/atelier/2026-08-25-1430.md')
  // And a title taken twice does not overwrite the first one either.
  assert.equal(
    newEntryPath('journal/atelier', when, ['journal/atelier/affutage.md'], 'Affûtage'),
    'journal/atelier/affutage-2.md',
  )
  // What orders it is the FIELD, which the creation always writes — the file
  // name is only read back when that field is missing.
  assert.match(entryMarkdown({ when: stamp(when), title: 'Affûtage', body: '' }), /^date: 2026-08-25T14:30$/m)
})

test('a title is rewritten in place, and cleared away rather than blanked', () => {
  const page = '---\ntype: entree\ndate: 2026-08-25T14:30\ntitle: Ancien\n---\n\nLe corps.\n'
  assert.match(setField(page, 'title', 'Nouveau'), /^title: Nouveau$/m)
  // Untouched neighbours: the frontmatter carries conventions this plugin
  // does not model, and rewriting the block would reformat them.
  assert.match(setField(page, 'title', 'Nouveau'), /^date: 2026-08-25T14:30$/m)
  // Emptied means ABSENT: a title that is the empty string prints as a blank
  // heading, which is worse than no heading.
  assert.doesNotMatch(setField(page, 'title', '  '), /^title:/m)
  // Added when it was never there.
  const untitled = '---\ntype: entree\ndate: 2026-08-25T14:30\n---\n\nLe corps.\n'
  assert.match(setField(untitled, 'title', 'Enfin'), /^title: Enfin$/m)
  // And nothing to operate on is said, not guessed.
  assert.equal(setField('Pas de frontmatter.\n', 'title', 'X'), null)
})

test('the shortest entry the contract allows, and not a line more', () => {
  assert.equal(
    entryMarkdown({ when: '2026-08-25T14:30', body: '  Le guide dérivait.  ' }),
    '---\ntype: entree\ndate: 2026-08-25T14:30\n---\n\nLe guide dérivait.\n',
  )
  assert.match(entryMarkdown({ when: '2026-08-25', title: ' Guide ', body: 'x' }), /^title: Guide$/m)
})

test('a cover written by the app is a page like any other', () => {
  assert.equal(
    journalMarkdown({ title: "Carnet d'atelier", ico: '🪚' }),
    "---\ntitle: Carnet d'atelier\ntype: journal\nico: 🪚\n---\n",
  )
})

test('a folder name survives accents, punctuation and an empty title', () => {
  assert.equal(slugify("Carnet d'atelier"), 'carnet-d-atelier')
  assert.equal(slugify('Journée à l’établi !'), 'journee-a-l-etabli')
  assert.equal(slugify('...'), 'journal')
})

test('a plugin ships its own words, keyed by the English sentence', () => {
  assert.equal(words('fr')('New entry'), 'Nouvelle entrée')
  assert.equal(words('en')('New entry'), 'New entry')
  // A missing translation degrades to correct English, never to an identifier.
  assert.equal(words('de')('Show more'), 'Show more')
})
