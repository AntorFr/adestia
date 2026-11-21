/**
 * AD-38: `POST /api/folders` makes an empty folder; `GET /api/pages/index`
 * lists it in `folders` though no page exists there.
 */
import { chmod, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import Fastify from 'fastify'
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

async function instance(plugins: DiscoveredPlugin[] = []) {
  const ws = await tmpDir('adestia-folders-')
  await mkdir(join(ws, 'perso'), { recursive: true })
  await mkdir(join(ws, 'archive', 'vieux'), { recursive: true })
  await mkdir(join(ws, 'archive', 'Pas Slug'), { recursive: true })
  await chmod(join(ws, 'archive', 'vieux'), 0o555)
  await chmod(join(ws, 'archive'), 0o555)
  locked.push(join(ws, 'archive', 'vieux'), join(ws, 'archive'))
  const app = Fastify()
  registerPages(app, {
    stores: resolveStores(
      [
        { id: 'perso', path: 'perso' },
        { id: 'archive', path: 'archive', at: 'archive' },
      ],
      ws,
    ).stores,
    locale: 'fr',
    plugins,
  })
  await app.ready()
  const post = (path: unknown) => app.inject({ method: 'POST', url: '/api/folders', payload: { path } })
  const index = async () =>
    (await app.inject({ url: '/api/pages/index' })).json() as {
      entries: unknown[]
      folders: string[]
      writableFolders: string[]
    }
  return { ws, post, index, app }
}

const exists = (p: string) => stat(p).then(() => true, () => false)

describe('POST /api/folders', () => {
  it('creates a free name, lists it in folders with no page, then 409', async () => {
    const { ws, post, index } = await instance()
    const made = await post('notes')
    expect(made.statusCode).toBe(201)
    expect(made.json()).toEqual({ path: 'notes' })
    expect((await stat(join(ws, 'perso', 'notes'))).isDirectory()).toBe(true)
    const listed = await index()
    expect(listed.entries).toEqual([])
    expect(listed.folders).toContain('notes')
    expect(listed.writableFolders).toContain('notes')
    expect((await post('notes')).statusCode).toBe(409)
  })

  it('lists read-only folders too, in folders but not in writableFolders', async () => {
    const { index } = await instance()
    const listed = await index()
    expect(listed.folders).toEqual(expect.arrayContaining(['archive', 'archive/vieux']))
    expect(listed.writableFolders).not.toContain('archive/vieux')
  })

  it('409 when the name exists in the other store, 403 under a read-only parent, nothing written', async () => {
    const { ws, post } = await instance()
    expect((await post('archive/vieux')).statusCode).toBe(409)
    const refused = await post('archive/vieux/neuf')
    expect(refused.statusCode).toBe(403)
    expect(await readdir(join(ws, 'archive', 'vieux'))).toEqual([])
    expect((await post('archive/neuf')).statusCode).toBe(403)
    expect(await exists(join(ws, 'archive', 'neuf'))).toBe(false)
    expect(await exists(join(ws, 'perso', 'archive'))).toBe(false)
  })

  it('409 when a page file takes the name', async () => {
    const { ws, post } = await instance()
    await writeFile(join(ws, 'perso', 'idee.md'), '---\ntitle: I\n---\n')
    expect((await post('idee')).statusCode).toBe(409)
  })

  it('creates a sub-folder of an empty folder', async () => {
    const { ws, post, index } = await instance()
    expect((await post('a')).statusCode).toBe(201)
    const sub = await post('a/b')
    expect(sub.statusCode).toBe(201)
    expect(sub.json()).toEqual({ path: 'a/b' })
    expect((await stat(join(ws, 'perso', 'a', 'b'))).isDirectory()).toBe(true)
    expect((await index()).folders).toEqual(expect.arrayContaining(['a', 'a/b']))
  })

  it('accepts an existing parent that is not a slug', async () => {
    const { ws, post } = await instance()
    await mkdir(join(ws, 'perso', 'Mes Notes'))
    expect((await post('Mes Notes/idees')).statusCode).toBe(201)
  })

  it.each([
    ['uppercase', 'Notes'],
    ['dot-dot', '..'],
    ['dot-dot inside', 'a/../b'],
    ['empty', ''],
    ['empty parent segment', 'a//b'],
    ['trailing slash', 'a/'],
    ['leading slash', '/a'],
    ['dot', '.'],
    ['dot parent', './a'],
    ['space', 'a b'],
    ['double dash', 'a--b'],
    ['leading dash', '-a'],
    ['trailing dash', 'a-'],
    ['underscore', 'a_b'],
    ['accent', 'été'],
    ['81 chars', 'a'.repeat(81)],
    ['NUL', 'a\0b'],
    ['number', 12],
    ['null', null],
  ])('400 for %s', async (_name, path) => {
    const { ws, post } = await instance()
    const before = await readdir(join(ws, 'perso'))
    expect((await post(path)).statusCode).toBe(400)
    expect(await readdir(join(ws, 'perso'))).toEqual(before)
  })

  it('400 without a body', async () => {
    const { app } = await instance()
    expect((await app.inject({ method: 'POST', url: '/api/folders' })).statusCode).toBe(400)
  })

  it('accepts exactly 80 characters, with inner dashes', async () => {
    const { post } = await instance()
    expect((await post('a'.repeat(80))).statusCode).toBe(201)
    expect((await post('un-nom-2')).statusCode).toBe(201)
  })

  it('403 for a parent that exists nowhere, or the logical parent of a mount', async () => {
    const { post } = await instance()
    expect((await post('absent/x')).statusCode).toBe(403)
  })

  it('403 under a folder an active app absorbs', async () => {
    const todo = { manifest: { id: 'todo', kind: 'app', description: 't', absorbs: ['todo'] }, dir: '/x', active: true } as unknown as DiscoveredPlugin
    const { ws, post } = await instance([todo])
    await mkdir(join(ws, 'perso', 'todo'))
    expect((await post('todo/x')).statusCode).toBe(403)
    expect(await exists(join(ws, 'perso', 'todo', 'x'))).toBe(false)
  })

  it('writes no page', async () => {
    const { ws, post } = await instance()
    await post('vide')
    expect(await readdir(join(ws, 'perso', 'vide'))).toEqual([])
  })
})
