/**
 * `adestia-dossiers-fichier-reglages` (B-36, B-37; AD-40, AD-43), from the need and not from the diff:
 * a REAL instance (`start()`, real routes, real stores on disk) driven over HTTP, and the agent's
 * `folder_settings` / `find_pages` tools on real stores. Expectations are written by hand from the
 * criterion of the sheet and docs/parcours.md (B-36, B-37), docs/donnees.md (AD-40).
 *
 * Plan (need -> case -> proof):
 *   B-36 nominal   PUT {path:'cave', settings:{ico:'wine', couleur:'rouge'}} -> 200, `cave/.folder.md` on disk,
 *                  `GET /api/pages/index` carries it in `folderSettings.cave` with the response's revision
 *          bords   a folder with no file -> `folderSettings` has no key for it, and is `{}` on an empty instance
 *                  a known key not given is removed by the next write; an unknown key already on disk stays
 *                  a body found on disk is ignored (settings still read, the text is nowhere)
 *          échec   a body in the request (top level or in `settings`) -> 400, nothing written
 *                  an unknown settings key, a colour outside the palette, a `page` that is no page of the folder -> 400
 *                  stale revision -> 409, file byte for byte intact; revision given for a folder without file -> 409
 *                  read-only folder -> 403, unknown folder -> 404
 *          exclusion `.folder.md` is in no `entries`, no `GET /api/pages`, no `GET /api/files`, not served by
 *                  `GET /api/files/<path>` nor `GET /api/pages/<path>`; the search tool never finds it;
 *                  creating a folder writes no `.folder.md`
 *   B-37 nominal   `INDEX.md` and `cave/cave.md` are entries (cards), listed, and found by the search tool
 *          bords   `index.md` in lowercase too; an INDEX whose settings (`couleur`) are in the page dresses nothing
 *   AD-43 nominal  tool `set` then `get` reads a colour with its revision
 *          échec   stale revision refused, file intact; `page` absent from the folder refused
 *
 * Needs no engine binary and no credential.
 */
import { chmod, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ConversationStore } from '../src/conversations.js'
import { ShellToolsService } from '../src/shell-tools.js'
import { type StartedInstance, start } from '../src/start.js'
import { resolveStores } from '../src/stores.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

let root: string
let pages: string
let instance: StartedInstance | undefined
const locked: string[] = []
const closers: (() => Promise<void>)[] = []

afterEach(async () => {
  await instance?.close()
  instance = undefined
  for (const close of closers.splice(0)) await close()
  for (const dir of locked.splice(0)) await chmod(dir, 0o755).catch(() => undefined)
  await cleanTmp()
})
beforeEach(async () => {
  root = await tmpDir('adestia-reglages-')
  pages = join(root, 'workspace', 'pages')
})

const exists = (p: string) => stat(p).then(() => true, () => false)

async function boot(): Promise<void> {
  const idle = join(root, 'idle-engine.sh')
  await writeFile(idle, '#!/bin/sh\nexec sleep 3600\n', { mode: 0o755 })
  await writeFile(
    join(root, 'adestia.config.yaml'),
    `host: 127.0.0.1\nport: 0\ndataDir: ${join(root, 'data')}\nworkspace:\n  root: ${join(root, 'workspace')}\ndriver:\n  id: claude-code\n  command: ${idle}\n`,
  )
  instance = await start({ cwd: root, configPath: 'adestia.config.yaml', log: () => undefined })
}

async function api(method: string, path: string, body?: unknown) {
  const response = await fetch(new URL(path, instance!.url), {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  let json: any
  try { json = JSON.parse(text) } catch { json = undefined }
  return { status: response.status, json, text }
}
const put = (body: unknown) => api('PUT', '/api/folders/settings', body)
type Index = {
  entries: { path: string; title: string }[]
  folders: string[]
  folderSettings: Record<string, Record<string, unknown>>
}
const index = async () => (await api('GET', '/api/pages/index')).json as Index
const paths = async () => (await index()).entries.map((e) => e.path).sort()
const page = (title: string) => `---\ntitle: ${title}\n---\n\nTexte.\n`

/** A folder `cave` with two pages and a PDF, an empty folder `vide`, a folder `maison` with `INDEX.md` and `maison/maison.md`. */
async function populated(): Promise<void> {
  await mkdir(join(pages, 'cave'), { recursive: true })
  await mkdir(join(pages, 'vide'), { recursive: true })
  await mkdir(join(pages, 'maison', 'maison'), { recursive: true })
  await writeFile(join(pages, 'cave', 'vins.md'), page('Vins'))
  await writeFile(join(pages, 'cave', 'resume.md'), page('Resume'))
  await writeFile(join(pages, 'cave', 'facture.pdf'), 'pdf')
  await writeFile(join(pages, 'maison', 'INDEX.md'), '---\ntitle: Sommaire maison\ncouleur: rouge\n---\n\nTexte.\n')
  await writeFile(join(pages, 'maison', 'maison.md'), page('Maison homonyme'))
  await writeFile(join(pages, 'maison', 'plan.md'), page('Plan'))
  await boot()
}

describe('B-36 PUT /api/folders/settings, the nominal', () => {
  it('writes <folder>/.folder.md and the index returns it in folderSettings with the revision of the answer', async () => {
    // red if the route writes elsewhere, writes nothing, or the index does not carry what was written
    await populated()
    const res = await put({ path: 'cave', settings: { ico: 'wine', couleur: 'rouge' } })
    expect(res.status).toBe(200)
    expect(res.json.settings).toEqual({ ico: 'wine', couleur: 'rouge' })
    expect(typeof res.json.revision).toBe('string')
    expect(res.json.revision).not.toBe('')
    const disk = await readFile(join(pages, 'cave', '.folder.md'), 'utf8')
    expect(disk).toMatch(/^---\n/)
    expect(disk).toContain('ico: wine')
    expect(disk).toContain('couleur: rouge')
    const fs = (await index()).folderSettings
    expect(fs['cave']).toEqual({ ico: 'wine', couleur: 'rouge', revision: res.json.revision })
  })

  it('a folder without a file has no entry in folderSettings, an empty instance answers {}', async () => {
    // red if the index invents settings or omits the key
    await populated()
    const idx = await index()
    expect(idx.folderSettings).toEqual({})
  })

  it('creating a folder writes no .folder.md', async () => {
    // red if folder creation drops a settings file (AD-38 unchanged)
    await populated()
    const res = await api('POST', '/api/folders', { path: 'neuf' })
    expect(res.status).toBe(201)
    expect(await readdir(join(pages, 'neuf'))).toEqual([])
  })
})

describe('B-36 writes: what is kept, what is removed', () => {
  it('a known key not given is removed by the next write', async () => {
    // red if the six keys are merged instead of written as a whole
    await populated()
    const first = await put({ path: 'cave', settings: { ico: 'wine', couleur: 'rouge' } })
    const second = await put({ path: 'cave', settings: { couleur: 'vert' }, revision: first.json.revision })
    expect(second.status).toBe(200)
    expect(second.json.settings).toEqual({ couleur: 'vert' })
    expect((await index()).folderSettings['cave']).toEqual({ couleur: 'vert', revision: second.json.revision })
    expect(await readFile(join(pages, 'cave', '.folder.md'), 'utf8')).not.toContain('ico')
  })

  it('an unknown key already in the file stays after a write', async () => {
    // red if the write rebuilds the file from the six keys only
    await populated()
    await writeFile(join(pages, 'cave', '.folder.md'), '---\ncouleur: rouge\nrangement: etagere 3\n---\n')
    const res = await put({ path: 'cave', settings: { ico: 'wine' } })
    expect(res.status).toBe(200)
    const disk = await readFile(join(pages, 'cave', '.folder.md'), 'utf8')
    expect(disk).toContain('rangement: etagere 3')
    expect(disk).toContain('ico: wine')
    expect(disk).not.toContain('couleur')
  })

  it('a body found on disk is ignored: the settings are read, the text is nowhere', async () => {
    // red if a body in .folder.md makes the file unreadable as settings, or leaks as a page / in the index
    await populated()
    await writeFile(join(pages, 'cave', '.folder.md'), '---\ncouleur: vert\n---\n\nTexte secret du corps.\n')
    const idx = await index()
    expect(idx.folderSettings['cave']?.['couleur']).toBe('vert')
    expect(JSON.stringify(idx)).not.toContain('Texte secret')
    expect((await api('GET', '/api/pages')).text).not.toContain('Texte secret')
  })
})

describe('B-36 refusals', () => {
  it('a body at the top of the request answers 400 and writes nothing', async () => {
    // red if the route accepts a body
    await populated()
    const res = await put({ path: 'cave', settings: { ico: 'wine' }, body: 'du texte' })
    expect(res.status).toBe(400)
    expect(await exists(join(pages, 'cave', '.folder.md'))).toBe(false)
  })

  it('a body inside settings answers 400 and writes nothing', async () => {
    await populated()
    const res = await put({ path: 'cave', settings: { ico: 'wine', body: 'du texte' } })
    expect(res.status).toBe(400)
    expect(await exists(join(pages, 'cave', '.folder.md'))).toBe(false)
  })

  it('an unknown settings key, a colour outside the palette, a number as icon: 400, nothing written', async () => {
    await populated()
    for (const settings of [{ rangement: 'x' }, { couleur: 'chartreuse-fluo' }, { attachments: 'peut-etre' }, { ico: 42 }]) {
      expect((await put({ path: 'cave', settings })).status).toBe(400)
    }
    expect(await exists(join(pages, 'cave', '.folder.md'))).toBe(false)
  })

  it('a page that is no .md of the folder answers 400, and one that is answers 200', async () => {
    // red if `page` is stored unchecked
    await populated()
    for (const bad of ['absente.md', 'facture.pdf', '../maison/plan.md']) {
      expect((await put({ path: 'cave', settings: { page: bad } })).status).toBe(400)
    }
    expect(await exists(join(pages, 'cave', '.folder.md'))).toBe(false)
    const ok = await put({ path: 'cave', settings: { page: 'resume.md' } })
    expect(ok.status).toBe(200)
    expect((await index()).folderSettings['cave']?.['page']).toBe('resume.md')
  })

  it('a stale revision answers 409 and leaves the file byte for byte', async () => {
    // red if the revision is not compared
    await populated()
    const first = await put({ path: 'cave', settings: { couleur: 'rouge' } })
    await writeFile(join(pages, 'cave', '.folder.md'), '---\ncouleur: vert\n---\n') // someone else wrote
    const before = await readFile(join(pages, 'cave', '.folder.md'), 'utf8')
    const res = await put({ path: 'cave', settings: { ico: 'wine' }, revision: first.json.revision })
    expect(res.status).toBe(409)
    expect(await readFile(join(pages, 'cave', '.folder.md'), 'utf8')).toBe(before)
  })

  it('a revision given for a folder that has no file yet answers 409 and writes nothing', async () => {
    await populated()
    const res = await put({ path: 'cave', settings: { ico: 'wine' }, revision: 'inventee' })
    expect(res.status).toBe(409)
    expect(await exists(join(pages, 'cave', '.folder.md'))).toBe(false)
  })

  it('the current revision is accepted', async () => {
    // bord of the 409: the fresh revision passes
    await populated()
    const first = await put({ path: 'cave', settings: { couleur: 'rouge' } })
    const res = await put({ path: 'cave', settings: { couleur: 'vert' }, revision: first.json.revision })
    expect(res.status).toBe(200)
  })

  it('an unknown folder answers 404 and creates nothing', async () => {
    await populated()
    const res = await put({ path: 'fantome', settings: { ico: 'wine' } })
    expect(res.status).toBe(404)
    expect(await exists(join(pages, 'fantome'))).toBe(false)
  })

  it('a folder that cannot be written answers 403 and writes nothing', async () => {
    // red if the route writes into a read-only mount
    await populated()
    await chmod(join(pages, 'vide'), 0o555)
    locked.push(join(pages, 'vide'))
    const res = await put({ path: 'vide', settings: { ico: 'wine' } })
    expect(res.status).toBe(403)
    expect(await readdir(join(pages, 'vide'))).toEqual([])
  })
})

describe('B-36 .folder.md is excluded everywhere', () => {
  it('is in no page list, no entry, no file list, and its path is served by neither route', async () => {
    // red if the dotted file leaks into any listing or is served
    await populated()
    await put({ path: 'cave', settings: { title: 'Ma cave a vin', couleur: 'rouge' } })
    expect(await exists(join(pages, 'cave', '.folder.md'))).toBe(true)
    const idx = await index()
    expect(JSON.stringify(idx.entries)).not.toContain('.folder')
    expect(JSON.stringify(idx.entries)).not.toContain('Ma cave a vin')
    expect((await api('GET', '/api/pages')).text).not.toContain('.folder')
    const files = await api('GET', '/api/files')
    expect(files.status).toBe(200)
    expect(files.text).not.toContain('.folder')
    expect(files.text).toContain('cave/facture.pdf') // the neighbouring file is still listed
    const served = await api('GET', '/api/files/cave/.folder.md')
    expect(served.status).toBeGreaterThanOrEqual(400)
    expect(served.text).not.toContain('couleur')
    const asPage = await api('GET', '/api/pages/cave/.folder.md')
    expect(asPage.status).toBeGreaterThanOrEqual(400)
    expect(asPage.text).not.toContain('couleur')
  })

  it('the folder`s pages are the same with and without the file (nothing is counted for it)', async () => {
    // red if the settings file adds a card to the folder
    await populated()
    const before = await paths()
    await put({ path: 'cave', settings: { couleur: 'rouge' } })
    expect(await paths()).toEqual(before)
    expect(before.filter((p) => p.startsWith('cave/'))).toEqual(['cave/resume.md', 'cave/vins.md'])
  })

  it('a page route cannot write or delete the settings file', async () => {
    await populated()
    await put({ path: 'cave', settings: { couleur: 'rouge' } })
    const before = await readFile(join(pages, 'cave', '.folder.md'), 'utf8')
    const write = await api('PUT', '/api/pages/cave/.folder.md', { content: '---\ncouleur: vert\n---\n\nPirate\n' })
    expect(write.status).toBeGreaterThanOrEqual(400)
    const del = await api('DELETE', '/api/pages/cave/.folder.md')
    expect(del.status).toBeGreaterThanOrEqual(400)
    expect(await readFile(join(pages, 'cave', '.folder.md'), 'utf8')).toBe(before)
  })
})

describe('B-37 INDEX.md and x/x.md are ordinary pages', () => {
  it('INDEX.md and the homonymous page are entries of their folder, with their own title', async () => {
    // red if the index page is hidden or the homonymous page is folded into the folder
    await populated()
    const idx = await index()
    const maison = idx.entries.filter((e) => e.path.startsWith('maison/')).sort((a, b) => a.path.localeCompare(b.path))
    expect(maison.map((e) => [e.path, e.title])).toEqual([
      ['maison/INDEX.md', 'Sommaire maison'],
      ['maison/maison.md', 'Maison homonyme'],
      ['maison/plan.md', 'Plan'],
    ])
    const list = (await api('GET', '/api/pages')).json.pages.map((p: { path: string }) => p.path)
    expect(list).toContain('maison/INDEX.md')
    expect(list).toContain('maison/maison.md')
  })

  it('an index in lowercase is a page too', async () => {
    await populated()
    await writeFile(join(pages, 'cave', 'index.md'), page('Index minuscule'))
    expect(await paths()).toContain('cave/index.md')
  })

  it('the settings an INDEX page carries dress nothing: folderSettings stays empty for its folder', async () => {
    // red if the old couleur of the index page is still read ("no legacy support")
    await populated()
    expect((await index()).folderSettings['maison']).toBeUndefined()
  })

  it('INDEX.md is opened like any page', async () => {
    await populated()
    const res = await api('GET', '/api/pages/maison/INDEX.md')
    expect(res.status).toBe(200)
    expect(res.text).toContain('Sommaire maison')
  })
})

describe('AD-43 and search: the agent`s tools on real stores', () => {
  async function tools() {
    await mkdir(join(pages, 'a'), { recursive: true })
    await writeFile(join(pages, 'a', 'note.md'), page('Note'))
    await writeFile(join(pages, 'a', 'INDEX.md'), page('Sommaire rangement'))
    await writeFile(join(pages, 'a', '.folder.md'), '---\ntitle: Titre unique zorglub\n---\n')
    const stores = resolveStores([{ id: 'perso', path: 'pages' }], join(root, 'workspace')).stores
    const data = await tmpDir('adestia-reglages-data-')
    const service = new ShellToolsService({ dataDir: data, conversations: new ConversationStore(data), stores })
    closers.push(() => service.close())
    const call = (name: string, args: Record<string, string>) => service.dispatch({ userId: 'chloe', conversationId: 'c' }, name, args)
    return { call, file: join(pages, 'a', '.folder.md') }
  }

  it('set then get writes and reads back a colour, with its revision', async () => {
    // red if the tool writes nowhere, or get does not read what set wrote
    const { call, file } = await tools()
    const set = await call('folder_settings', { action: 'set', folder: 'a', couleur: 'vert' })
    expect(set.ok).toBe(true)
    expect(await readFile(file, 'utf8')).toContain('couleur: vert')
    const got = await call('folder_settings', { action: 'get', folder: 'a' })
    expect(got.ok).toBe(true)
    const body = JSON.parse((got as { text: string }).text)
    expect(body.settings.couleur).toBe('vert')
    expect(typeof body.revision).toBe('string')
    expect(body.revision).not.toBe('')
  })

  it('a set with a stale revision is refused and the file is untouched', async () => {
    const { call, file } = await tools()
    const before = await readFile(file, 'utf8')
    const out = await call('folder_settings', { action: 'set', folder: 'a', couleur: 'vert', revision: 'perimee' })
    expect(out.ok).toBe(false)
    expect(await readFile(file, 'utf8')).toBe(before)
  })

  it('a page that is not in the folder is refused', async () => {
    const { call, file } = await tools()
    const before = await readFile(file, 'utf8')
    const out = await call('folder_settings', { action: 'set', folder: 'a', page: 'absente.md' })
    expect(out.ok).toBe(false)
    expect(await readFile(file, 'utf8')).toBe(before)
  })

  it('an unknown folder is refused', async () => {
    const { call } = await tools()
    expect((await call('folder_settings', { action: 'set', folder: 'fantome', couleur: 'vert' })).ok).toBe(false)
    expect(await exists(join(pages, 'fantome'))).toBe(false)
  })

  it('the search finds INDEX.md as any page and never finds .folder.md by its title or its name', async () => {
    // red if the dotted file is searchable, or INDEX.md is hidden from the search
    const { call } = await tools()
    const index = await call('find_pages', { what: 'Sommaire' })
    expect(index.ok).toBe(true)
    expect((index as { text: string }).text).toContain('a/INDEX.md')
    const byTitle = await call('find_pages', { what: 'zorglub' })
    expect((byTitle as { text: string }).text).toContain('No page matches')
    const byName = await call('find_pages', { what: 'folder' })
    expect((byName as { text: string }).text).toContain('No page matches')
  })
})
