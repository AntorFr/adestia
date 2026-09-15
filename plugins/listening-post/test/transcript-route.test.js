/**
 * The transcript route, through the host's pages service.
 *
 * It used to call an `exists` nobody had defined and a bare readFile on the
 * logical path: a ReferenceError, answered as a 500, on every transcript the
 * screen asked for — and no test read the route, so nothing said so.
 */

import { strict as assert } from 'node:assert'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import api from '../api.mjs'

function memory(files) {
  const store = new Map(Object.entries(files))
  return {
    read: async (path) => store.get(path),
    write: async (path, text) => void store.set(path, text),
    exists: async (path) => store.has(path),
    list: async () => [...store.keys()].filter((path) => path.endsWith('.md')).map((path) => ({ path })),
  }
}

async function routes(pages) {
  const handlers = {}
  await api(
    {
      get: (path, handler) => void (handlers[`GET ${path}`] = handler),
      post: (path, handler) => void (handlers[`POST ${path}`] = handler),
      delete: (path, handler) => void (handlers[`DELETE ${path}`] = handler),
    },
    { pages, dataDir: await mkdtemp(join(tmpdir(), 'lp-')) },
  )
  return async (key, request) => {
    let status = 200
    const reply = {
      code(value) {
        status = value
        return this
      },
      send(body) {
        return { status, body }
      },
    }
    const body = await handlers[key](request, reply)
    return body && 'status' in body && 'body' in body ? body : { status, body }
  }
}

test('a transcript is read where the page keeps it, through the pages service', async () => {
  const call = await routes(
    memory({
      'veille/moteur-audio.md': '---\ntitle: Le moteur audio\ntype: ecoute\n---\n',
      'veille/assets/moteur-audio.transcript.txt': '[00:04:12] Le filtre passe-bas donne une couleur.\n',
    }),
  )
  const { status, body } = await call('GET /transcript', { query: { page: 'veille/moteur-audio.md' } })
  assert.equal(status, 200)
  assert.equal(body.path, 'veille/assets/moteur-audio.transcript.txt')
  assert.equal(body.lines.length, 1)
  assert.match(body.lines[0].texte ?? body.lines[0].text ?? JSON.stringify(body.lines[0]), /passe-bas/)
})

test('a page without a transcript answers 404, naming the file it looked for', async () => {
  const call = await routes(memory({ 'veille/sans.md': '---\ntype: ecoute\n---\n' }))
  const { status, body } = await call('GET /transcript', { query: { page: 'veille/sans.md' } })
  assert.equal(status, 404)
  assert.equal(body.expected, 'veille/assets/sans.transcript.txt')
})
