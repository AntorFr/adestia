/**
 * What the pages screens of bench/tests/pages-*.test.mjs and page-suivie-*.test.mjs proved
 * through a browser and that the server does: what an editor save leaves on disk, what an
 * agent's write does to a save and to a read, and the events that tell a shell the page moved.
 * Each test goes through the route; the screen tests keep what is drawn.
 * See docs/tests-ecran/bench-pages.md.
 */
import { mkdir, readFile, rename, stat, unlink, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'

import { watch as chokidar } from 'chokidar'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { registerEvents } from '../src/routes/watch.js'
import { registerPages } from '../src/routes/pages.js'
import { resolveStores } from '../src/stores.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

afterEach(cleanTmp)

let root: string
let app: FastifyInstance

beforeEach(async () => {
  root = await tmpDir('adestia-pages-hors-ecran-')
  app = Fastify()
  registerPages(app, { stores: resolveStores([{ id: 'perso', path: root }], root).stores })
  await app.ready()
})
afterEach(async () => {
  await app.close()
})

const doc = (title: string, body: string) => `---\ntitle: ${title}\ntype: fiche\n---\n\n${body}\n`
const put = async (path: string, text: string) => {
  await mkdir(join(root, path, '..'), { recursive: true })
  await writeFile(join(root, path), text)
}
/** what the agent does: write, on a modification time that surely differs */
const agentWrites = async (path: string, text: string) => {
  const before = await stat(join(root, path)).catch(() => undefined)
  await put(path, text)
  const t = new Date((before?.mtimeMs ?? Date.now()) + 10_000)
  await utimes(join(root, path), t, t)
}
const read = (path: string) => app.inject({ url: `/api/pages/${path}` })
const save = (path: string, markdown: string, revision?: string) =>
  app.inject({ method: 'PUT', url: `/api/pages/${path}`, payload: { markdown, ...(revision ? { revision } : {}) } })

describe('an editor saving through the route', () => {
  it('leaves on disk the text it sent, and lets the next save follow on the revision it got back', async () => {
    await put('notes/a.md', doc('A', 'Avant.'))
    const opened = (await read('notes/a.md')).json()
    const first = await save('notes/a.md', doc('A', 'Frappé une fois.'), opened.revision)
    expect(first.statusCode).toBe(200)
    expect(await readFile(join(root, 'notes/a.md'), 'utf8')).toBe(doc('A', 'Frappé une fois.'))
    const second = await save('notes/a.md', doc('A', 'Frappé deux fois.'), first.json().revision)
    expect(second.statusCode).toBe(200)
    expect(await readFile(join(root, 'notes/a.md'), 'utf8')).toBe(doc('A', 'Frappé deux fois.'))
  })

  it('refuses when the agent wrote meanwhile, and keeps the agent’s file whole', async () => {
    await put('notes/b.md', doc('B', 'Avant.'))
    const { revision } = (await read('notes/b.md')).json()
    await agentWrites('notes/b.md', doc('B', 'Version de l’agent.'))
    const refused = await save('notes/b.md', doc('B', 'Ma frappe.'), revision)
    expect(refused.statusCode).toBe(409)
    expect(await readFile(join(root, 'notes/b.md'), 'utf8')).toBe(doc('B', 'Version de l’agent.'))
    // asking again on the new revision, as Reload then typing would, goes through
    const { revision: current } = (await read('notes/b.md')).json()
    expect((await save('notes/b.md', doc('B', 'Ma frappe.'), current)).statusCode).toBe(200)
  })
})

describe('a page the agent rewrites, deletes or moves', () => {
  it('reads the last text written, with a revision that changed each time, and leaves a neighbour alone', async () => {
    await put('suivi/p.md', doc('P', 'Premier état.'))
    await put('suivi/voisine.md', doc('V', 'Voisine.'))
    const first = (await read('suivi/p.md')).json()
    await agentWrites('suivi/p.md', doc('P', 'Deuxième état.'))
    const second = (await read('suivi/p.md')).json()
    await agentWrites('suivi/p.md', doc('P', 'Troisième état.'))
    const third = (await read('suivi/p.md')).json()
    expect(third.markdown).toContain('Troisième état.')
    expect(third.markdown).not.toContain('Deuxième état.')
    expect(new Set([first.revision, second.revision, third.revision]).size).toBe(3)
    expect((await read('suivi/voisine.md')).json().markdown).toContain('Voisine.')
  })

  it('answers 404 for a page deleted and for a page moved away, and finds it at its new path', async () => {
    await put('suivi/d.md', doc('D', 'Bientôt supprimée.'))
    await put('suivi/m.md', doc('M', 'Bientôt déplacée.'))
    await unlink(join(root, 'suivi/d.md'))
    await mkdir(join(root, 'suivi/ailleurs'), { recursive: true })
    await rename(join(root, 'suivi/m.md'), join(root, 'suivi/ailleurs/m.md'))
    expect((await read('suivi/d.md')).statusCode).toBe(404)
    expect((await read('suivi/m.md')).statusCode).toBe(404)
    expect((await read('suivi/ailleurs/m.md')).json().markdown).toContain('Bientôt déplacée.')
  })

  it('reads a page of the second store only with its store named', async () => {
    const family = await tmpDir('adestia-pages-famille-')
    await mkdir(join(family, 'suivi'), { recursive: true })
    await writeFile(join(family, 'suivi/partagee.md'), doc('Partagée', 'Avant, chez la famille.'))
    const both = Fastify()
    registerPages(both, { stores: resolveStores([{ id: 'perso', path: root }, { id: 'famille', path: family }], root).stores })
    await both.ready()
    try {
      const url = '/api/pages/suivi/partagee.md?store=famille'
      expect((await both.inject({ url })).json().markdown).toContain('Avant, chez la famille.')
      await writeFile(join(family, 'suivi/partagee.md'), doc('Partagée', 'Après, chez la famille.'))
      expect((await both.inject({ url })).json().markdown).toContain('Après, chez la famille.')
    } finally {
      await both.close()
    }
  })
})

describe('the events a shell follows a page by', () => {
  /** reads the stream until a batch names every path asked, or the deadline */
  async function batchesNaming(reader: ReadableStreamDefaultReader<Uint8Array>, wanted: readonly string[], timeoutMs = 8000) {
    const decoder = new TextDecoder()
    const seen = new Set<string>()
    let buffer = ''
    const deadline = Date.now() + timeoutMs
    while (!wanted.every((w) => seen.has(w))) {
      const left = deadline - Date.now()
      if (left <= 0) throw new Error(`no event naming ${wanted.join(', ')}; saw ${[...seen].join(', ')}`)
      const chunk = await Promise.race([reader.read(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no event within ${timeoutMs}ms; saw ${[...seen].join(', ')}`)), left))])
      if (chunk.done) throw new Error('the stream ended')
      buffer += decoder.decode(chunk.value, { stream: true })
      for (const m of buffer.matchAll(/event: pages-changed\ndata: (.*)\n/g)) for (const p of (JSON.parse(m[1] as string) as { paths: string[] }).paths) seen.add(p)
    }
    return seen
  }

  it('names the page when it is rewritten, deleted, or moved (the old path and the new)', async () => {
    const watched = await tmpDir('adestia-pages-events-')
    await mkdir(join(watched, 'suivi'), { recursive: true })
    await writeFile(join(watched, 'suivi/r.md'), doc('R', 'Avant.'))
    await writeFile(join(watched, 'suivi/d.md'), doc('D', 'Avant.'))
    await writeFile(join(watched, 'suivi/m.md'), doc('M', 'Avant.'))

    let ready!: () => void
    const scanned = new Promise<void>((resolve) => { ready = resolve })
    const server = Fastify()
    registerEvents(server, {
      stores: resolveStores([{ id: 'perso', path: watched }], watched).stores,
      watch: { enabled: true, polling: true, intervalMs: 100 },
      quietMs: 10,
      maxWaitMs: 100,
      lingerMs: 0,
      watcherFactory: (dir, report) => {
        const watcher = chokidar(dir, { ignoreInitial: true, usePolling: true, interval: 100 })
        watcher.on('ready', ready)
        watcher.on('add', report)
        watcher.on('change', report)
        watcher.on('unlink', report)
        return { close: () => watcher.close() }
      },
    })
    await server.listen({ port: 0, host: '127.0.0.1' })
    const controller = new AbortController()
    try {
      const response = await fetch(`http://127.0.0.1:${(server.server.address() as AddressInfo).port}/api/events`, { signal: controller.signal })
      const reader = response.body!.getReader()
      await scanned
      await writeFile(join(watched, 'suivi/r.md'), doc('R', 'Réécrite par l’agent, plus longue.'))
      await unlink(join(watched, 'suivi/d.md'))
      await rename(join(watched, 'suivi/m.md'), join(watched, 'suivi/m-deplacee.md'))
      const seen = await batchesNaming(reader, ['suivi/r.md', 'suivi/d.md', 'suivi/m.md', 'suivi/m-deplacee.md'])
      expect([...seen].sort()).toEqual(expect.arrayContaining(['suivi/d.md', 'suivi/m-deplacee.md', 'suivi/m.md', 'suivi/r.md']))
    } finally {
      controller.abort()
      await server.close()
    }
  }, 15_000)
})
