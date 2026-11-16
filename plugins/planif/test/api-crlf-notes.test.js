/**
 * What the planif screen tests of packages/web/test/besoin-pages-browser.test.ts and
 * besoin-pages-ensemble-browser.test.ts proved through a browser and that the plugin's API does:
 * a note whose lines end in \r\n is read as its \n twin — `at:`, `enabled: false`, `until:` and
 * `every:` — and a cadence under the floor comes back with its problem. The screen tests keep
 * what is drawn (the rows, the pills). See docs/tests-ecran/web-mcp-pages.md.
 */
import { strict as assert } from 'node:assert'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import api from '../api.mjs'

async function notesFor(files) {
  const root = await mkdtemp(join(tmpdir(), 'planif-crlf-notes-'))
  try {
    await mkdir(join(root, 'ws', 'planif'), { recursive: true })
    for (const [name, text] of Object.entries(files)) await writeFile(join(root, 'ws', 'planif', name), text)
    let handler
    await api({ get: (_path, fn) => { handler = fn } }, { workspaceRoot: join(root, 'ws'), dataDir: root, scheduleEnabled: true })
    const { notes } = await handler()
    return Object.fromEntries(notes.map((n) => [n.id, n]))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const crlf = (text) => text.replace(/\n/g, '\r\n')
const note = (front) => `---\n${front}\n---\n\nFais le point.\n`

/** the fields a screen row is drawn from, without the title (it differs by design) */
const read = (n) => Object.fromEntries(Object.entries(n).filter(([k]) => k !== 'title' && k !== 'id'))

test('planif API: at:, enabled: and until: of a CRLF note read as those of its LF twin', async () => {
  const cases = {
    at: 'at: 08:00',
    off: 'every: 2h\nenabled: false',
    until: 'every: 2h\nuntil: 2099-12-31',
  }
  const files = {}
  for (const [key, front] of Object.entries(cases)) {
    files[`${key}-lf.md`] = note(`title: ${key} LF\n${front}`)
    files[`${key}-crlf.md`] = crlf(note(`title: ${key} CRLF\n${front}`))
  }
  const notes = await notesFor(files)
  for (const key of Object.keys(cases)) {
    const lf = notes[`${key}-lf`]
    const cr = notes[`${key}-crlf`]
    assert.ok(lf && cr, `${key}: both notes are listed`)
    assert.deepEqual(read(cr), read(lf), `${key}: the CRLF note reads as its LF twin`)
  }
  assert.deepEqual(notes['at-crlf'].atMinutes, [480])
  assert.equal(notes['at-crlf'].problem, null)
  assert.equal(notes['until-crlf'].until, '2099-12-31')
  assert.equal(notes['off-crlf'].enabled, false)
  assert.notDeepEqual(read(notes['off-crlf']), read(notes['until-crlf']), 'a suspended note is not a running one')
})

test('planif API: a CRLF note valid at 2h has no problem, and one at 5m is refused for the 15-minute floor', async () => {
  const notes = await notesFor({
    'ok.md': crlf(note('title: ok\nevery: 2h')),
    'fast.md': crlf(note('title: fast\nevery: 5m')),
  })
  assert.equal(notes.ok.everyMinutes, 120)
  assert.equal(notes.ok.problem, null)
  assert.equal(notes.fast.everyMinutes, 5)
  assert.match(notes.fast.problem, /15/)
})
