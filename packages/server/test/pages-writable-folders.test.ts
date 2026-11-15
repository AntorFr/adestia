/**
 * AD-etat-projet-3: the page index says which folders accept a new page.
 * A HINT for the shell — the write stays the verdict — but a wrong hint draws
 * a button that fails, or hides one that would work.
 */
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'

import type { DiscoveredPlugin } from '../src/extensions.js'
import { registerPages } from '../src/routes/pages.js'
import { resolveStores } from '../src/stores.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

const locked: string[] = []
afterEach(async () => {
  for (const dir of locked.splice(0)) await chmod(dir, 0o755).catch(() => undefined)
  await cleanTmp()
})

const plugin = (id: string, absorbs: string[], active: boolean): DiscoveredPlugin =>
  ({ manifest: { id, kind: 'app', description: id, absorbs }, dir: '/x', active }) as unknown as DiscoveredPlugin

async function index(
  workspace: string,
  declared: Parameters<typeof resolveStores>[0],
  plugins: DiscoveredPlugin[] = [],
) {
  const app: FastifyInstance = Fastify()
  registerPages(app, { stores: resolveStores(declared, workspace).stores, locale: 'fr', plugins })
  await app.ready()
  return async () => (await app.inject({ url: '/api/pages/index' })).json() as { writableFolders?: string[] }
}

const dir = async (path: string) => mkdir(path, { recursive: true })
const lock = async (path: string) => {
  await chmod(path, 0o555)
  locked.push(path)
}

describe('writableFolders on the page index', () => {
  it('lists the writable store, not the read-only one, nor the logical parent of a mount', async () => {
    const ws = await tmpDir('adestia-wf-')
    await dir(join(ws, 'perso', 'notes'))
    await dir(join(ws, 'archive'))
    await lock(join(ws, 'archive'))
    await dir(join(ws, 'famille'))
    await writeFile(join(ws, 'perso', 'notes', 'a.md'), '---\ntitle: A\n---\n')
    const read = await index(ws, [
      { id: 'perso', path: 'perso' },
      { id: 'archive', path: 'archive', at: 'archive' },
      { id: 'famille', path: 'famille', at: 'partage/famille' },
    ])
    const folders = (await read()).writableFolders
    expect(folders).toContain('')
    expect(folders).toContain('notes')
    expect(folders).toContain('partage/famille')
    expect(folders).not.toContain('archive')
    expect(folders).not.toContain('partage')
  })

  it('leaves out a folder an active plugin absorbs, wherever it sits, but not a namesake', async () => {
    const ws = await tmpDir('adestia-wf-')
    await dir(join(ws, 'perso', 'todo', 'sous'))
    await dir(join(ws, 'perso', 'domaines', 'todo'))
    await dir(join(ws, 'perso', 'mes-todo'))
    const read = await index(ws, [{ id: 'perso', path: 'perso' }], [plugin('todo', ['todo'], true)])
    const folders = (await read()).writableFolders ?? []
    expect(folders).toContain('')
    expect(folders).toContain('domaines')
    expect(folders).toContain('mes-todo')
    expect(folders).not.toContain('todo')
    expect(folders).not.toContain('todo/sous')
    expect(folders).not.toContain('domaines/todo')
  })

  it('gives the folder back when the plugin is inactive', async () => {
    const ws = await tmpDir('adestia-wf-')
    await dir(join(ws, 'perso', 'todo'))
    const read = await index(ws, [{ id: 'perso', path: 'perso' }], [plugin('todo', ['todo'], false)])
    expect((await read()).writableFolders).toContain('todo')
  })

  it('is [] — present — when no store is writable', async () => {
    const ws = await tmpDir('adestia-wf-')
    await dir(join(ws, 'perso', 'notes'))
    await lock(join(ws, 'perso', 'notes'))
    await lock(join(ws, 'perso'))
    const body = await (await index(ws, [{ id: 'perso', path: 'perso' }]))()
    expect(body.writableFolders).toEqual([])
  })

  it('is recomputed on every call', async () => {
    const ws = await tmpDir('adestia-wf-')
    await dir(join(ws, 'perso', 'notes'))
    const read = await index(ws, [{ id: 'perso', path: 'perso' }])
    expect((await read()).writableFolders).toContain('notes')
    await lock(join(ws, 'perso', 'notes'))
    expect((await read()).writableFolders).not.toContain('notes')
  })

  it('ignores hidden folders and keeps entries and stores as before', async () => {
    const ws = await tmpDir('adestia-wf-')
    await dir(join(ws, 'perso', '.git'))
    await dir(join(ws, 'famille'))
    const read = await index(ws, [{ id: 'perso', path: 'perso' }, { id: 'famille', path: 'famille', at: 'f' }])
    const body = (await read()) as { writableFolders?: string[]; entries?: unknown; stores?: unknown }
    expect(body.writableFolders).not.toContain('.git')
    expect(Array.isArray(body.entries)).toBe(true)
    expect(Array.isArray(body.stores)).toBe(true)
  })
})
