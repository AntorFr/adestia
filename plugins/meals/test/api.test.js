/**
 * The server side end to end: the boundary, and the bargain.
 *
 * The BOUNDARY first. Every route takes a PAGE and reaches a data file only
 * through what that page declares, so a request cannot name a file directly.
 * That is what makes a plugin which writes JSON into the memory safe to mount;
 * a suffix check on a caller-supplied path would not be.
 *
 * The BARGAIN second, and it is the whole reason the overlay is gone: one
 * document, two authors, and a write that states the revision it read. A stale
 * write is refused with the current document attached — the loser of a race
 * has to redo one gesture, never to lose a week.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import api from '../api.mjs'

const PAGE = 'sante/septembre.md'
const DATA = 'sante/assets/septembre.meals.json'

const markdown = `---
title: Semaine type
type: meals
debut: 2026-09-01
fin: 2026-09-04
sections: [matin, midi, soir]
data: assets/septembre.meals.json
---

Deux semaines pesées.
`

/** The core's page service, reduced to what this API touches. */
function memory(files) {
  const store = new Map(Object.entries(files))
  return {
    store,
    read: async (path) => store.get(path),
    write: async (path, text) => void store.set(path, text),
    exists: async (path) => store.has(path),
  }
}

/** A Fastify stand-in that keeps the handlers and the last status. */
async function routes(pages) {
  const handlers = {}
  await api(
    {
      get: (path, handler) => void (handlers[`GET ${path}`] = handler),
      post: (path, handler) => void (handlers[`POST ${path}`] = handler),
    },
    { pages },
  )
  const call = async (key, request) => {
    let status = 200
    const reply = {
      code(value) {
        status = value
        return reply
      },
      send: (body) => body,
    }
    const body = await handlers[key](request, reply)
    return { status, body }
  }
  return call
}

test('a period is read through its page, shape and cards together', async () => {
  const pages = memory({
    [PAGE]: markdown,
    [DATA]: JSON.stringify({ version: 1, items: [{ id: 'a', titre: 'Yaourt', statut: 'suggestion' }] }),
  })
  const call = await routes(pages)
  const { status, body } = await call('GET /period', { query: { page: PAGE } })
  assert.equal(status, 200)
  assert.equal(body.data, DATA)
  assert.deepEqual(body.shape.sections, ['matin', 'midi', 'soir'])
  assert.equal(body.items.length, 1)
  assert.equal(typeof body.revision, 'string')
})

test('a page with no data file yet is an empty period, not an error', async () => {
  const call = await routes(memory({ [PAGE]: markdown }))
  const { status, body } = await call('GET /period', { query: { page: PAGE } })
  // A page framed a minute ago deserves a live tray, not a diagnostic.
  assert.equal(status, 200)
  assert.deepEqual(body.items, [])
})

test('nothing reaches a data file except through a page that claims it', async () => {
  const call = await routes(memory({ [PAGE]: markdown }))
  assert.equal((await call('GET /period', { query: { page: '../../etc/passwd.md' } })).status, 400)
  // Not a page at all.
  assert.equal((await call('GET /period', { query: { page: DATA } })).status, 400)
  // A page that exists but is not one of ours.
  const other = await routes(memory({ 'notes/x.md': '---\ntype: fiche\n---\n' }))
  assert.equal((await other('GET /period', { query: { page: 'notes/x.md' } })).status, 422)
})

test('a write states the revision it read, and a stale one is refused', async () => {
  const pages = memory({ [PAGE]: markdown })
  const call = await routes(pages)
  const { body: first } = await call('GET /period', { query: { page: PAGE } })

  const added = await call('POST /period', {
    query: { page: PAGE },
    body: { revision: first.revision, op: { op: 'add', item: { id: 'a', titre: 'Yaourt' } } },
  })
  assert.equal(added.status, 200)
  assert.equal(added.body.items.length, 1)
  assert.notEqual(added.body.revision, first.revision)

  // The second author was holding the FIRST revision: refused, with the
  // current document attached so they can redo rather than ask again.
  const stale = await call('POST /period', {
    query: { page: PAGE },
    body: { revision: first.revision, op: { op: 'add', item: { id: 'b', titre: 'Pomme' } } },
  })
  assert.equal(stale.status, 409)
  assert.equal(stale.body.items.length, 1)
  assert.equal(stale.body.revision, added.body.revision)
  // And nothing was written: the file still holds exactly one card.
  assert.equal(JSON.parse(pages.store.get(DATA)).items.length, 1)

  // Omitting it altogether is the same refusal — a caller with no revision
  // never read the document, which is exactly the write to refuse.
  assert.equal(
    (await call('POST /period', { query: { page: PAGE }, body: { op: { op: 'tray', id: 'a' } } })).status,
    409,
  )
})

test('an operation the page forbids is refused, and writes nothing', async () => {
  const pages = memory({ [PAGE]: markdown })
  const call = await routes(pages)
  const { body } = await call('GET /period', { query: { page: PAGE } })
  await call('POST /period', {
    query: { page: PAGE },
    body: { revision: body.revision, op: { op: 'add', item: { id: 'a', titre: 'Yaourt' } } },
  })
  const { body: now } = await call('GET /period', { query: { page: PAGE } })

  const outside = await call('POST /period', {
    query: { page: PAGE },
    body: { revision: now.revision, op: { op: 'place', id: 'a', jour: '2026-12-25' } },
  })
  assert.equal(outside.status, 400)
  assert.match(outside.body.error, /outside/)
  assert.equal(JSON.parse(pages.store.get(DATA)).items[0].jour, undefined)
})

test('a data file that is not JSON is named, never overwritten', async () => {
  const call = await routes(memory({ [PAGE]: markdown, [DATA]: '{ oops' }))
  const { status, body } = await call('GET /period', { query: { page: PAGE } })
  // Treating it as empty is how a screen offers to erase somebody's data.
  assert.equal(status, 422)
  assert.match(body.error, /not valid JSON/)
})
