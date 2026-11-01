/** The Planif screen reads a note's frontmatter the way the editor and the server do. */
import { strict as assert } from 'node:assert'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import api from '../api.mjs'

async function notesFor(files) {
  const root = await mkdtemp(join(tmpdir(), 'planif-api-'))
  try {
    await mkdir(join(root, 'ws', 'planif'), { recursive: true })
    for (const [name, text] of Object.entries(files)) {
      await writeFile(join(root, 'ws', 'planif', name), text)
    }
    let handler
    await api({ get: (_path, fn) => { handler = fn } }, {
      workspaceRoot: join(root, 'ws'), dataDir: root, scheduleEnabled: true,
    })
    return (await handler()).notes
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const BODY = 'Say hello.'

test('LF note: title, times, expired, disabled are read', async () => {
  const [n] = await notesFor({
    'a.md': `---\ntitle: crlf-proof\nat: 07:30, 12:30\nexpired: 2026-10-01\nenabled: false\n---\n${BODY}\n`,
  })
  assert.equal(n.title, 'crlf-proof')
  assert.equal(n.at, '07:30, 12:30')
  assert.deepEqual(n.atMinutes, [450, 750])
  assert.equal(n.expired, '2026-10-01')
  assert.equal(n.enabled, false)
  assert.equal(n.problem, null)
  assert.equal(n.body, BODY)
})

test('CRLF note reads the same fields as the LF note, with no stray \\r', async () => {
  const [n] = await notesFor({
    'a.md': `---\r\ntitle: crlf-proof\r\nat: 07:30, 12:30\r\nexpired: 2026-10-01\r\nenabled: false\r\n---\r\n${BODY}\r\n`,
  })
  assert.equal(n.title, 'crlf-proof')
  assert.equal(n.at, '07:30, 12:30')
  assert.deepEqual(n.atMinutes, [450, 750])
  assert.equal(n.expired, '2026-10-01')
  assert.equal(n.enabled, false)
  assert.equal(n.problem, null)
  assert.equal(n.body, BODY)
})

test('CRLF note with every: cadence read, no problem', async () => {
  const [n] = await notesFor({ 'a.md': `---\r\nevery: 2h\r\n---\r\n${BODY}` })
  assert.equal(n.everyMinutes, 120)
  assert.equal(n.problem, null)
})

test('closing fence with trailing spaces, and at end of file with no body', async () => {
  const [a, b] = await notesFor({
    'a.md': `---\ntitle: spaced\nevery: 1h\n---  \n${BODY}\n`,
    'b.md': `---\ntitle: bare\nevery: 1h\n---`,
  })
  assert.equal(a.title, 'spaced')
  assert.equal(a.body, BODY)
  assert.equal(b.title, 'bare')
  assert.equal(b.problem, 'the note is empty — its body is the prompt')
})

test('no frontmatter: the whole text is the body and the id the title', async () => {
  const [n] = await notesFor({ 'a.md': `---nope\r\n${BODY}\r\n` })
  assert.equal(n.title, 'a')
  assert.equal(n.every, null)
})

test('a fence the editor does not accept is no frontmatter here either', async () => {
  // packages/content opens a block with `---` then a line end, nothing between.
  const [n] = await notesFor({ 'a.md': `--- \ntitle: not-a-block\nevery: 1h\n---\n${BODY}\n` })
  assert.equal(n.title, 'a')
  assert.equal(n.every, null)
})
