/**
 * AD-40 (B-36, B-37): `PUT /api/folders/settings` writes `<folder>/.folder.md`,
 * `GET /api/pages/index` serves it as `folderSettings`, and the file is never
 * a page, a count, an attachment, a file or a search hit.
 */
import { chmod, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import Fastify from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'

import { ConversationStore } from '../src/conversations.js'
import { registerFiles } from '../src/routes/files.js'
import { registerPages } from '../src/routes/pages.js'
import { ShellToolsService } from '../src/shell-tools.js'
import { resolveStores } from '../src/stores.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

const locked: string[] = []
const closers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of closers.splice(0)) await close()
  for (const dir of locked.splice(0)) await chmod(dir, 0o755).catch(() => undefined)
  await cleanTmp()
})

const page = (title: string) => `---\ntitle: ${title}\n---\n\nCorps.\n`

async function instance() {
  const ws = await tmpDir('adestia-fset-')
  await mkdir(join(ws, 'perso', 'a'), { recursive: true })
  await mkdir(join(ws, 'perso', 'x'), { recursive: true })
  await mkdir(join(ws, 'archive', 'vieux'), { recursive: true })
  await writeFile(join(ws, 'perso', 'a', 'note.md'), page('Note'))
  await writeFile(join(ws, 'perso', 'a', 'INDEX.md'), page('Sommaire'))
  await writeFile(join(ws, 'perso', 'a', 'index.md'), page('Minuscule'))
  await writeFile(join(ws, 'perso', 'x', 'x.md'), page('Homonyme'))
  await writeFile(join(ws, 'archive', 'vieux', 'ancien.md'), page('Ancien'))
  await chmod(join(ws, 'archive', 'vieux'), 0o555)
  await chmod(join(ws, 'archive'), 0o555)
  locked.push(join(ws, 'archive', 'vieux'), join(ws, 'archive'))
  const stores = resolveStores(
    [
      { id: 'perso', path: 'perso' },
      { id: 'archive', path: 'archive', at: 'archive' },
    ],
    ws,
  ).stores
  const app = Fastify()
  registerPages(app, { stores, locale: 'fr', plugins: [] })
  registerFiles(app, { stores, locale: 'fr' })
  await app.ready()
  const put = (payload: unknown) => app.inject({ method: 'PUT', url: '/api/folders/settings', payload: payload as object })
  const index = async () =>
    (await app.inject({ url: '/api/pages/index' })).json() as {
      entries: { path: string }[]
      folderSettings: Record<string, Record<string, unknown>>
    }
  return { ws, app, put, index, stores }
}

const FILE = (ws: string, folder = 'a') => join(ws, 'perso', folder, '.folder.md')

describe('PUT /api/folders/settings', () => {
  it('writes .folder.md and the index returns it with its revision', async () => {
    const { ws, put, index } = await instance()
    expect((await index()).folderSettings).toEqual({})
    const done = await put({ path: 'a', settings: { title: 'Mon A', ico: 'home', couleur: 'vert', attachments: false, page: 'note.md' } })
    expect(done.statusCode).toBe(200)
    const text = await readFile(FILE(ws), 'utf8')
    expect(text.startsWith('---\n')).toBe(true)
    expect(text).toContain('title: Mon A')
    expect(text).toContain('attachments: false')
    const body = done.json() as { settings: unknown; revision: string }
    expect(body.settings).toEqual({ title: 'Mon A', ico: 'home', couleur: 'vert', attachments: false, page: 'note.md' })
    const listed = (await index()).folderSettings
    expect(listed['a']).toEqual({ title: 'Mon A', ico: 'home', couleur: 'vert', attachments: false, page: 'note.md', revision: body.revision })
    expect(body.revision).not.toBe('')
  })

  it('400 with a body or any key outside path/settings/revision; nothing written', async () => {
    const { ws, put } = await instance()
    for (const extra of [{ body: 'x' }, { markdown: 'x' }, { content: 'x' }]) {
      const r = await put({ path: 'a', settings: { title: 'T' }, ...extra })
      expect(r.statusCode).toBe(400)
    }
    expect((await put({ path: 'a', settings: { title: 'T', body: 'x' } })).statusCode).toBe(400)
    expect((await put({ path: 'a', settings: { title: 'T', foo: 1 } })).statusCode).toBe(400)
    expect((await put({ path: 'a' })).statusCode).toBe(400)
    expect((await put({ settings: {} })).statusCode).toBe(400)
    expect(await readdir(join(ws, 'perso', 'a'))).not.toContain('.folder.md')
  })

  it('400 on a bad value: unknown hue, wrong type, empty, multi-line, page missing or not a .md', async () => {
    const { ws, put } = await instance()
    const bad: Record<string, unknown>[] = [
      { couleur: 'fuchsia-fluo' },
      { attachments: 'false' },
      { title: '' },
      { title: 'a\nb: c' },
      { ico: 42 },
      { page: 'absent.md' },
      { page: 'note' },
      { page: '../a/note.md' },
      { page: 'sub/x.md' },
    ]
    for (const settings of bad) {
      expect((await put({ path: 'a', settings })).statusCode, JSON.stringify(settings)).toBe(400)
    }
    expect(await readdir(join(ws, 'perso', 'a'))).not.toContain('.folder.md')
  })

  it('accepts page naming INDEX.md, a page like another', async () => {
    const { put } = await instance()
    expect((await put({ path: 'a', settings: { page: 'INDEX.md' } })).statusCode).toBe(200)
  })

  it('409 on a stale revision and the file is byte-identical; a fresh one passes', async () => {
    const { ws, put } = await instance()
    const first = (await put({ path: 'a', settings: { title: 'Un' } })).json() as { revision: string }
    const before = await readFile(FILE(ws), 'utf8')
    await writeFile(FILE(ws), '---\ntitle: Édité à la main\n---\n')
    const stale = await put({ path: 'a', settings: { title: 'Deux' }, revision: first.revision })
    expect(stale.statusCode).toBe(409)
    expect(await readFile(FILE(ws), 'utf8')).toBe('---\ntitle: Édité à la main\n---\n')
    expect(before).not.toBe(await readFile(FILE(ws), 'utf8'))
    // revision "" means "I read no file": stale once a file exists
    expect((await put({ path: 'a', settings: { title: 'Trois' }, revision: '' })).statusCode).toBe(409)
  })

  it('revision "" is accepted for a folder with no file yet', async () => {
    const { put } = await instance()
    expect((await put({ path: 'x', settings: { title: 'X' }, revision: '' })).statusCode).toBe(200)
  })

  it('keeps an unknown key already in the file, and removes a known key not given', async () => {
    const { ws, put, index } = await instance()
    await writeFile(FILE(ws), '---\ntitle: Ancien\nfoo: bar\nlist:\n  - 1\n  - 2\n---\n')
    const done = await put({ path: 'a', settings: { couleur: 'vert' } })
    expect(done.statusCode).toBe(200)
    const text = await readFile(FILE(ws), 'utf8')
    expect(text).toContain('foo: bar')
    expect(text).toMatch(/list:\n\s+- 1\n\s+- 2/)
    expect(text).toContain('couleur: vert')
    expect(text).not.toContain('title')
    const listed = (await index()).folderSettings['a']
    expect(listed).toMatchObject({ couleur: 'vert' })
    expect(listed).not.toHaveProperty('title')
    expect(listed).not.toHaveProperty('foo')
  })

  it('ignores a body found on disk and leaves no body after a write', async () => {
    const { ws, put, index } = await instance()
    await writeFile(FILE(ws), '---\ntitle: T\n---\n\nUn corps qui ne doit pas être là.\n')
    expect((await index()).folderSettings['a']).toMatchObject({ title: 'T' })
    await put({ path: 'a', settings: { title: 'U' } })
    expect(await readFile(FILE(ws), 'utf8')).not.toContain('corps')
  })

  it('leaves no temporary file behind', async () => {
    const { ws, put } = await instance()
    await put({ path: 'a', settings: { title: 'T' } })
    expect((await readdir(join(ws, 'perso', 'a'))).filter((n) => n.endsWith('.tmp'))).toEqual([])
  })

  it('404 for an unknown folder, nothing created', async () => {
    const { ws, put } = await instance()
    expect((await put({ path: 'nulle-part', settings: { title: 'T' } })).statusCode).toBe(404)
    expect(await stat(join(ws, 'perso', 'nulle-part')).then(() => true, () => false)).toBe(false)
  })

  it('refuses a path with a dotted or empty segment, never writing outside', async () => {
    const { ws, put } = await instance()
    for (const path of ['../a', 'a/../a', '.git', 'a/.hidden', '/a', 'a//b']) {
      const r = await put({ path, settings: { title: 'T' } })
      expect([400, 404], path).toContain(r.statusCode)
    }
    expect(await readdir(join(ws, 'perso'))).not.toContain('.folder.md')
  })

  it('403 for a folder no store can write; the file is not created', async () => {
    const { ws, put } = await instance()
    const r = await put({ path: 'archive/vieux', settings: { title: 'T' } })
    expect(r.statusCode).toBe(403)
    expect(await readdir(join(ws, 'archive', 'vieux'))).toEqual(['ancien.md'])
  })
})

describe('a folder held by several stores', () => {
  it('reads the first store having a file and writes into that same store', async () => {
    const ws = await tmpDir('adestia-fset-multi-')
    await mkdir(join(ws, 's1', 'd'), { recursive: true })
    await mkdir(join(ws, 's2', 'd'), { recursive: true })
    await writeFile(join(ws, 's2', 'd', '.folder.md'), '---\ntitle: Du second\n---\n')
    const stores = resolveStores([{ id: 's1', path: 's1' }, { id: 's2', path: 's2' }], ws).stores
    const app = Fastify()
    registerPages(app, { stores, locale: 'fr', plugins: [] })
    await app.ready()
    const idx = async () => ((await app.inject({ url: '/api/pages/index' })).json() as { folderSettings: Record<string, { title?: string; revision: string }> }).folderSettings
    expect((await idx())['d']?.title).toBe('Du second')
    const done = await app.inject({ method: 'PUT', url: '/api/folders/settings', payload: { path: 'd', settings: { title: 'Modifié' }, revision: (await idx())['d']!.revision } })
    expect(done.statusCode).toBe(200)
    expect(await readFile(join(ws, 's2', 'd', '.folder.md'), 'utf8')).toContain('Modifié')
    expect(await readdir(join(ws, 's1', 'd'))).toEqual([])
    expect((await idx())['d']?.title).toBe('Modifié')
  })

  it('without a file anywhere, writes into the first writable store', async () => {
    const ws = await tmpDir('adestia-fset-multi2-')
    await mkdir(join(ws, 's1', 'd'), { recursive: true })
    await mkdir(join(ws, 's2', 'd'), { recursive: true })
    await chmod(join(ws, 's1', 'd'), 0o555)
    locked.push(join(ws, 's1', 'd'))
    const stores = resolveStores([{ id: 's1', path: 's1' }, { id: 's2', path: 's2' }], ws).stores
    const app = Fastify()
    registerPages(app, { stores, locale: 'fr', plugins: [] })
    await app.ready()
    const done = await app.inject({ method: 'PUT', url: '/api/folders/settings', payload: { path: 'd', settings: { title: 'T' } } })
    expect(done.statusCode).toBe(200)
    expect(await readdir(join(ws, 's1', 'd'))).toEqual([])
    expect(await readdir(join(ws, 's2', 'd'))).toEqual(['.folder.md'])
  })
})

describe('.folder.md is never content', () => {
  async function withFile() {
    const env = await instance()
    await writeFile(FILE(env.ws), '---\ntitle: Réglé\nico: home\n---\n')
    await writeFile(join(env.ws, 'perso', 'a', 'plan.pdf'), 'pdf')
    return env
  }

  it('is not a page, and not in the page counts of its folder', async () => {
    const { index } = await withFile()
    const paths = (await index()).entries.map((e) => e.path)
    expect(paths.some((p) => p.includes('.folder'))).toBe(false)
    expect([...paths].sort()).toEqual(['a/INDEX.md', 'a/index.md', 'a/note.md', 'archive/vieux/ancien.md', 'x/x.md'])
  })

  it('INDEX.md, index.md and x/x.md are plain pages of their folder', async () => {
    const { index } = await instance()
    const entries = (await index()).entries
    const inA = entries.filter((e) => e.path.startsWith('a/')).map((e) => e.path).sort()
    expect(inA).toEqual(['a/INDEX.md', 'a/index.md', 'a/note.md'])
    expect(entries.map((e) => e.path)).toContain('x/x.md')
    expect(entries.find((e) => e.path === 'a/INDEX.md')).toMatchObject({ title: 'Sommaire' })
  })

  it('GET /api/files lists no .folder.md, under or per page; the file route refuses it', async () => {
    const { app } = await withFile()
    for (const url of ['/api/files', '/api/files?under=a', '/api/files?page=a/note.md']) {
      const names = ((await app.inject({ url })).json() as { files: { path: string }[] }).files.map((f) => f.path)
      expect(names.some((n) => n.includes('.folder')), url).toBe(false)
    }
    const listed = ((await app.inject({ url: '/api/files?under=a' })).json() as { files: { path: string }[] }).files
    expect(listed.map((f) => f.path)).toContain('a/plan.pdf')
    const got = await app.inject({ url: '/api/files/a/.folder.md' })
    expect(got.statusCode).toBeGreaterThanOrEqual(400)
    expect(got.body).not.toContain('Réglé')
  })

  it('GET and PUT /api/pages/<folder>/.folder.md are refused, at any depth, and PUT writes nothing', async () => {
    const { app, ws } = await withFile()
    const before = await readFile(FILE(ws), 'utf8')
    for (const path of ['a/.folder.md', '.folder.md']) {
      const got = await app.inject({ url: `/api/pages/${path}` })
      expect(got.statusCode, path).toBe(400)
      expect(got.body).not.toContain('Réglé')
      const put = await app.inject({ method: 'PUT', url: `/api/pages/${path}`, payload: { markdown: '---\ntitle: Pirate\n---\n' } })
      expect(put.statusCode, path).toBe(400)
    }
    expect(await readFile(FILE(ws), 'utf8')).toBe(before)
    expect(await stat(join(ws, 'perso', '.folder.md')).then(() => true, () => false)).toBe(false)
  })

  it('find_pages does not find it, by title, ico value or without a filter; it finds INDEX.md', async () => {
    const { ws, stores } = await withFile()
    const service = new ShellToolsService({ dataDir: await tmpDir('adestia-fset-data-'), conversations: new ConversationStore(await tmpDir('adestia-fset-conv-')), stores, locale: 'fr' })
    closers.push(() => service.close())
    const run = async (args: Record<string, string>) => {
      const o = await service.dispatch({ userId: 'u', conversationId: 'c' }, 'find_pages', args)
      if (!o.ok) throw new Error(o.error)
      return o.text
    }
    void ws
    expect(await run({})).not.toContain('.folder.md')
    expect(await run({ what: 'Réglé' })).not.toContain('.folder')
    expect(await run({ what: 'folder' })).not.toContain('.folder.md')
    expect(await run({ what: 'Sommaire' })).toContain('a/INDEX.md')
  })
})
