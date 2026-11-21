/**
 * `adestia-decouverte-creer-dossier` (B-32, B-33; AD-38), from the need and not from the diff:
 * a REAL instance (`start()`, real routes, real stores on disk, real file modes) driven over HTTP.
 * The criterion: `POST /api/folders` makes an empty folder in the first store where its parent can
 * be written, answers 409 for a name taken in any store, 403 under a read-only parent, 400 for an
 * invalid name, and `GET /api/pages/index` lists it in `folders` without any page written.
 *
 * Plan (need -> case -> proof), every expected value written by hand:
 *   nominal   a free root name            -> 201 `{path}`, an empty directory in the default store, listed in `folders`
 *             a sub-folder                -> 201, made inside its parent, in the store that holds the parent
 *   bords     parent held only by the second writable store -> made there, not in the first
 *             exactly 80 characters       -> 201
 *             a fresh instance (no pages directory yet) -> 201 (B-32: « no documentation is needed to find it »)
 *   échec     name taken in the first store, in the second, under a read-only mount -> 409, nothing written
 *             under a read-only mount     -> 403, nothing written
 *             `Bad Name`, `Café`, `.caché`, empty, no body, a number -> 400, nothing written
 *   exclusion no page file is written; a `..` parent writes nothing outside the workspace;
 *             a read-only folder is listed in `folders` but not in `writableFolders`
 *
 * Needs no engine binary and no credential.
 */
import { chmod, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type StartedInstance, start } from '../src/start.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

let root: string
let instance: StartedInstance | undefined
const locked: string[] = []

afterEach(async () => {
  await instance?.close()
  instance = undefined
  for (const dir of locked.splice(0)) await chmod(dir, 0o755).catch(() => undefined)
  await cleanTmp()
})
beforeEach(async () => {
  root = await tmpDir('adestia-creer-dossier-')
})

const exists = (p: string) => stat(p).then(() => true, () => false)
const names = (p: string) => readdir(p)

async function boot(stores: string): Promise<void> {
  const idle = join(root, 'idle-engine.sh')
  await writeFile(idle, '#!/bin/sh\nexec sleep 3600\n', { mode: 0o755 })
  await writeFile(
    join(root, 'adestia.config.yaml'),
    `host: 127.0.0.1\nport: 0\ndataDir: ${join(root, 'data')}\nworkspace:\n  root: ${join(root, 'workspace')}\n${stores}driver:\n  id: claude-code\n  command: ${idle}\n`,
  )
  instance = await start({ cwd: root, configPath: 'adestia.config.yaml', log: () => undefined })
}

async function api(method: string, path: string, body?: unknown, raw?: string) {
  const response = await fetch(new URL(path, instance!.url), {
    method,
    headers: body === undefined && raw === undefined ? {} : { 'content-type': 'application/json' },
    ...(raw !== undefined ? { body: raw } : body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  return { status: response.status, json: text === '' ? undefined : JSON.parse(text) }
}
const post = (path: unknown) => api('POST', '/api/folders', { path })
const index = async () =>
  (await api('GET', '/api/pages/index')).json as { entries: unknown[]; folders: string[]; writableFolders: string[] }

/** Two writable stores (`perso` is the default, `famille` is outside the workspace) and a read-only one mounted at `lecture`. */
async function populated(): Promise<{ perso: string; famille: string; lecture: string }> {
  const perso = join(root, 'workspace', 'pages')
  const famille = join(root, 'famille')
  const lecture = join(root, 'lecture')
  await mkdir(join(perso, 'projets'), { recursive: true })
  await mkdir(join(famille, 'commun'), { recursive: true })
  await mkdir(join(lecture, 'ancien'), { recursive: true })
  await writeFile(join(perso, 'fiche.md'), '---\ntitle: Fiche\n---\n\nTexte.\n')
  await chmod(join(lecture, 'ancien'), 0o555)
  await chmod(lecture, 0o555)
  locked.push(join(lecture, 'ancien'), lecture)
  await boot(
    `  stores:\n    - id: perso\n      path: pages\n      default: true\n    - id: famille\n      path: ${famille}\n    - id: lecture\n      path: ${lecture}\n      at: lecture\n`,
  )
  return { perso, famille, lecture }
}

describe('POST /api/folders, the nominal', () => {
  it('a free root name answers 201 with its path, makes an empty directory in the default store and lists it in `folders`', async () => {
    // red if the route does not create the directory, or creates it with something inside, or the index does not list it
    const { perso } = await populated()
    const made = await post('notes')
    expect(made.status).toBe(201)
    expect(made.json).toEqual({ path: 'notes' })
    expect(await exists(join(perso, 'notes'))).toBe(true)
    expect(await names(join(perso, 'notes'))).toEqual([])
    const listed = await index()
    expect(listed.folders).toContain('notes')
    expect(listed.writableFolders).toContain('notes')
  })

  it('no page is written: the entries of the index are the same before and after', async () => {
    // red if creating a folder also writes a page (a placeholder, an index file)
    const { perso } = await populated()
    const before = (await index()).entries
    expect(before).toHaveLength(1)
    await post('notes')
    expect((await index()).entries).toEqual(before)
    expect(await names(perso)).toEqual(['fiche.md', 'notes', 'projets'])
  })

  it('a sub-folder is made inside its parent', async () => {
    // red if the parent segment is dropped or the folder is made at the root
    const { perso } = await populated()
    const made = await post('projets/2026')
    expect(made.status).toBe(201)
    expect(made.json).toEqual({ path: 'projets/2026' })
    expect(await exists(join(perso, 'projets', '2026'))).toBe(true)
    expect(await exists(join(perso, '2026'))).toBe(false)
    expect((await index()).folders).toContain('projets/2026')
  })

  it('a sub-folder of a new empty folder works at once', async () => {
    // red if a new folder is not a folder yet for the next call (index or parent check)
    await populated()
    expect((await post('notes')).status).toBe(201)
    expect((await post('notes/idees')).status).toBe(201)
    expect((await index()).folders).toEqual(expect.arrayContaining(['notes', 'notes/idees']))
  })
})

describe('POST /api/folders, the store choice (bords)', () => {
  it('a parent held only by the second writable store gets the folder there, not in the first', async () => {
    // red if the folder is always made in the default store
    const { perso, famille } = await populated()
    const made = await post('commun/photos')
    expect(made.status).toBe(201)
    expect(await exists(join(famille, 'commun', 'photos'))).toBe(true)
    expect(await exists(join(perso, 'commun'))).toBe(false)
  })

  it('exactly 80 characters is accepted', async () => {
    // red if the name length limit is lower than the 80 characters of the name rule
    await populated()
    const name = `${'a'.repeat(39)}-${'b'.repeat(40)}`
    expect(name).toHaveLength(80)
    expect((await post(name)).status).toBe(201)
  })

  it('a fresh instance, whose pages directory does not exist yet, can create its first folder', async () => {
    // red if the folder cannot be made until a first page exists: B-32 promises New folder on a new instance with only the core's functions
    await boot('')
    expect((await index()).folders).toEqual([])
    const made = await post('notes')
    expect(made.status).toBe(201)
    expect(made.json).toEqual({ path: 'notes' })
    expect((await index()).folders).toEqual(['notes'])
  })
})

describe('POST /api/folders, refusals (échec)', () => {
  it('409 for a name taken in the default store, nothing more written', async () => {
    // red if a taken name is answered 201 or the folder content is touched
    const { perso } = await populated()
    expect((await post('projets')).status).toBe(409)
    expect(await names(perso)).toEqual(['fiche.md', 'projets'])
  })

  it('409 for a name taken only in another writable store, and nothing is made in the default store', async () => {
    // red if the collision is judged in the first store only
    const { perso } = await populated()
    expect((await post('commun')).status).toBe(409)
    expect(await exists(join(perso, 'commun'))).toBe(false)
  })

  it('409 for a name taken in a read-only store', async () => {
    // red if the collision ignores read-only stores
    await populated()
    expect((await post('lecture/ancien')).status).toBe(409)
  })

  it('403 under a read-only parent, nothing written there', async () => {
    // red if the write check is skipped or the directory is made anyway
    const { lecture, perso } = await populated()
    const refused = await post('lecture/nouveau')
    expect(refused.status).toBe(403)
    expect(await names(lecture)).toEqual(['ancien'])
    expect(await exists(join(perso, 'lecture'))).toBe(false)
    expect(await names(join(lecture, 'ancien'))).toEqual([])
    expect((await post('lecture/ancien/dedans')).status).toBe(403)
  })

  it.each([
    ['uppercase and a space', 'Bad Name'],
    ['an accent', 'café'],
    ['a leading dot', '.cache'],
    ['an underscore', 'a_b'],
    ['empty', ''],
    ['an empty last segment', 'projets/'],
    ['a number', 12],
    ['a null', null],
  ])('400 for an invalid name: %s', async (_label, path) => {
    // red if an invalid last segment is created or answered by something else than 400
    const { perso } = await populated()
    expect((await post(path)).status).toBe(400)
    expect(await names(perso)).toEqual(['fiche.md', 'projets'])
  })

  it('400 for a body without a path, and for no body at all', async () => {
    // red if a missing path becomes a folder or a server error
    const { perso } = await populated()
    expect((await api('POST', '/api/folders', {})).status).toBe(400)
    expect((await api('POST', '/api/folders')).status).toBe(400)
    expect(await names(perso)).toEqual(['fiche.md', 'projets'])
  })
})

describe('POST /api/folders, exclusions', () => {
  it('a `..` parent never writes outside the workspace stores', async () => {
    // red if the path is joined to the store without being kept inside it
    const { perso } = await populated()
    const refused = await post('../evade')
    expect(refused.status).toBeGreaterThanOrEqual(400)
    expect(refused.status).toBeLessThan(500)
    expect(await exists(join(root, 'workspace', 'evade'))).toBe(false)
    expect(await exists(join(perso, '..', 'evade'))).toBe(false)
    expect(await exists(join(root, 'evade'))).toBe(false)
  })

  it('a read-only folder is listed in `folders` but not offered in `writableFolders`', async () => {
    // red if the index hides read-only folders (the home must show them) or offers them for writing
    await populated()
    const listed = await index()
    expect(listed.folders).toEqual(expect.arrayContaining(['lecture/ancien', 'projets', 'commun']))
    expect(listed.writableFolders).not.toContain('lecture/ancien')
    expect(listed.writableFolders).toEqual(expect.arrayContaining(['projets', 'commun']))
  })
})
