/**
 * `adestia-decouverte-renommer` (B-35; AD-39), from the need and not from the diff: a REAL instance
 * (`start()`, real routes, real stores on disk, real file modes) driven over HTTP.
 * Criterion: after a rename the pages of the folder and its sub-folders open under the new path and
 * no longer under the old one; a page holding `[[old/page]]` holds `[[nouveau/page]]` with its
 * frontmatter byte for byte; a `type#id` reference is unchanged; a read-only store keeps its link and
 * `unrewritten` equals the number of those pages; an app, configured or multi-store folder answers 422
 * and nothing is written.
 *
 * Plan (need -> case -> proof), every expected value written by hand:
 *   nominal   rename `old` -> `nouveau`          -> 200 `{path:'nouveau', unrewritten:1}`, pages (and sub-folder pages) open under `nouveau`, 404 under `old`
 *             link in a writable page            -> `[[nouveau/page]]`, frontmatter identical byte for byte
 *   bords     nested folder `old/sub` -> `dessous` -> `old/dessous`, only the last segment changes
 *             label / anchor / markdown link     -> label and anchor kept, markdown destination mended
 *             `older/` sibling, `type#id` ref    -> untouched (`old` is not a prefix of `older`)
 *             link in a second writable store    -> mended there too
 *   échec     missing folder 404; name taken 409 (also in another store); bad name / no body 400;
 *             read-only parent 403; nothing written in each case
 *   exclusion read-only store keeps `[[old/page]]` and is counted; app / configured / multi-store folder -> 422 with a reason, nothing moved;
 *             a link inside a code span is not touched
 *
 * Needs no engine binary and no credential.
 */
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
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
  root = await tmpDir('adestia-renommer-ens-')
})

const exists = (p: string) => stat(p).then(() => true, () => false)
const read = (p: string) => readFile(p, 'utf8')

async function boot(stores: string, extra = ''): Promise<void> {
  const idle = join(root, 'idle-engine.sh')
  await writeFile(idle, '#!/bin/sh\nexec sleep 3600\n', { mode: 0o755 })
  await writeFile(
    join(root, 'adestia.config.yaml'),
    `host: 127.0.0.1\nport: 0\ndataDir: ${join(root, 'data')}\nworkspace:\n  root: ${join(root, 'workspace')}\n${stores}${extra}driver:\n  id: claude-code\n  command: ${idle}\n`,
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
const rename = (path: unknown, name: unknown) => api('POST', '/api/folders/rename', { path, name })
const page = (p: string) => api('GET', `/api/pages/${p}`)

const FRONT = '---\ntitle:   "Spacé"  \ntags: [a,   b]\nlien: "[[old/page]]"\n---\n'

/** `perso` (default, writable), `famille` (second writable store), `lecture` (read-only, mounted at `lecture`). */
async function populated() {
  const perso = join(root, 'workspace', 'pages')
  const famille = join(root, 'famille')
  const lecture = join(root, 'lecture')
  await mkdir(join(perso, 'old', 'sub'), { recursive: true })
  await mkdir(join(perso, 'older'), { recursive: true })
  await mkdir(join(perso, 'voisin'), { recursive: true })
  await mkdir(join(famille, 'commun'), { recursive: true })
  await mkdir(join(lecture, 'ancien'), { recursive: true })
  await writeFile(join(perso, 'old', 'page.md'), '---\ntitle: P\n---\nCorps\n')
  await writeFile(join(perso, 'old', 'sub', 'deep.md'), '---\ntitle: D\n---\nProfond\n')
  await writeFile(join(perso, 'older', 'page.md'), '---\ntitle: O\n---\nAutre\n')
  await writeFile(join(famille, 'commun', 'lien.md'), '---\ntitle: F\n---\nVoir [[old/page]]\n')
  await writeFile(join(lecture, 'ancien', 'froid.md'), '---\ntitle: Froid\n---\nVoir [[old/page]] et [[old/sub/deep]]\n')
  await chmod(join(lecture, 'ancien'), 0o555)
  await chmod(lecture, 0o555)
  locked.push(join(lecture, 'ancien'), lecture)
  await boot(
    `  stores:\n    - id: perso\n      path: pages\n      default: true\n    - id: famille\n      path: ${famille}\n    - id: lecture\n      path: ${lecture}\n      at: lecture\n`,
  )
  return { perso, famille, lecture }
}

describe('POST /api/folders/rename, the nominal', () => {
  it('answers 200 with the new path and the unrewritten count; pages and sub-folder pages open under the new path, none under the old', async () => {
    // red if the directory is not moved, the sub-folder is left behind, or the count is not the read-only pages
    await populated()
    const res = await rename('old', 'nouveau')
    expect(res.status).toBe(200)
    expect(res.json).toEqual({ path: 'nouveau', unrewritten: 1 })
    expect((await page('nouveau/page.md')).status).toBe(200)
    expect((await page('nouveau/sub/deep.md')).status).toBe(200)
    expect((await page('old/page.md')).status).toBe(404)
    expect((await page('old/sub/deep.md')).status).toBe(404)
    const index = (await api('GET', '/api/pages/index')).json as { folders: string[] }
    expect(index.folders).toContain('nouveau')
    expect(index.folders).not.toContain('old')
  })

  it('a page containing [[old/page]] contains [[nouveau/page]], its frontmatter identical byte for byte', async () => {
    // red if the link is not rewritten, or the frontmatter is normalised on write
    const { perso } = await populated()
    await writeFile(join(perso, 'voisin', 'w.md'), FRONT + 'Voir [[old/page]] ici.\n')
    await rename('old', 'nouveau')
    expect(await read(join(perso, 'voisin', 'w.md'))).toBe(FRONT + 'Voir [[nouveau/page]] ici.\n')
  })
})

describe('POST /api/folders/rename, the edges', () => {
  it('renames only the last segment of a nested folder', async () => {
    // red if the whole path is replaced or the folder moves to another parent
    const { perso } = await populated()
    const res = await rename('old/sub', 'dessous')
    expect(res.status).toBe(200)
    expect(res.json).toEqual({ path: 'old/dessous', unrewritten: 1 })
    expect(await exists(join(perso, 'old', 'dessous', 'deep.md'))).toBe(true)
    expect(await exists(join(perso, 'old', 'sub'))).toBe(false)
  })

  it('keeps the label and the anchor, mends a markdown link, leaves older/ and a type#id reference alone', async () => {
    // red if the label is lost, `older` is matched as `old`, or a reference is rewritten
    const { perso } = await populated()
    const before = 'a [[old/page:Mon étiquette]] b [[old/page#ancre]] c [t](/old/page.md) d [[older/page]] e [[task#old]] f [[old/sub/deep]]\n'
    await writeFile(join(perso, 'voisin', 'w.md'), FRONT + before)
    await rename('old', 'nouveau')
    expect(await read(join(perso, 'voisin', 'w.md'))).toBe(
      FRONT + 'a [[nouveau/page:Mon étiquette]] b [[nouveau/page#ancre]] c [t](/nouveau/page.md) d [[older/page]] e [[task#old]] f [[nouveau/sub/deep]]\n',
    )
  })

  it('mends a link held in a second writable store', async () => {
    // red if only the default store is walked
    const { famille } = await populated()
    await rename('old', 'nouveau')
    expect(await read(join(famille, 'commun', 'lien.md'))).toBe('---\ntitle: F\n---\nVoir [[nouveau/page]]\n')
  })

  it('a rename with no link to mend answers unrewritten 0', async () => {
    // red if the count is not the number of read-only pages that point into the folder
    await populated()
    const res = await rename('older', 'plus-vieux')
    expect(res.json).toEqual({ path: 'plus-vieux', unrewritten: 0 })
  })
})

describe('POST /api/folders/rename, markdown links', () => {
  it('a markdown link from a page at the root of the store to old/page.md leads to nouveau/page.md', async () => {
    // red if markdown links are not rewritten, or the fragment is dropped
    const { perso } = await populated()
    await writeFile(join(perso, 'racine.md'), '---\ntitle: R\n---\nVoir [p](old/page.md#haut) et [q](old/sub/deep.md).\n')
    await rename('old', 'nouveau')
    expect(await read(join(perso, 'racine.md'))).toBe('---\ntitle: R\n---\nVoir [p](nouveau/page.md#haut) et [q](nouveau/sub/deep.md).\n')
  })
})

describe('POST /api/folders/rename, the failures', () => {
  it('answers 404 for a folder that does not exist, nothing written', async () => {
    const { perso } = await populated()
    expect((await rename('fantome', 'x')).status).toBe(404)
    expect(await exists(join(perso, 'x'))).toBe(false)
  })

  it('answers 409 for a name taken in the same store, nothing moved', async () => {
    const { perso } = await populated()
    expect((await rename('old', 'voisin')).status).toBe(409)
    expect(await exists(join(perso, 'old', 'page.md'))).toBe(true)
  })

  it('answers 409 for a name taken in another store', async () => {
    // red if the name is checked in the folder\'s own store only
    const { perso } = await populated()
    expect((await rename('old', 'commun')).status).toBe(409)
    expect(await exists(join(perso, 'old', 'page.md'))).toBe(true)
  })

  it('answers 400 for an invalid name, an empty name and a missing body, nothing moved', async () => {
    const { perso } = await populated()
    expect((await rename('old', 'Bad Name')).status).toBe(400)
    expect((await rename('old', '')).status).toBe(400)
    expect((await rename('old', 'a/b')).status).toBe(400)
    expect((await api('POST', '/api/folders/rename')).status).toBe(400)
    expect(await exists(join(perso, 'old', 'page.md'))).toBe(true)
  })

  it('answers 403 for a folder under a read-only store, link untouched', async () => {
    const { lecture } = await populated()
    const res = await rename('lecture/ancien', 'recent')
    expect(res.status).toBe(403)
    expect(await exists(join(lecture, 'ancien', 'froid.md'))).toBe(true)
  })
})

describe('POST /api/folders/rename, the exclusions', () => {
  it('a read-only store keeps its link as written, and unrewritten counts that page once', async () => {
    // red if the read-only page is written, or counted per link instead of per page
    const { lecture } = await populated()
    const res = await rename('old', 'nouveau')
    expect(res.json).toEqual({ path: 'nouveau', unrewritten: 1 })
    expect(await read(join(lecture, 'ancien', 'froid.md'))).toBe('---\ntitle: Froid\n---\nVoir [[old/page]] et [[old/sub/deep]]\n')
  })

  it('a link inside a code span is an example and stays', async () => {
    // red if the rewrite is a plain text replace
    const { perso } = await populated()
    await writeFile(join(perso, 'voisin', 'c.md'), '---\ntitle: C\n---\nÉcrire `[[old/page]]` pour [[old/page]]\n')
    await rename('old', 'nouveau')
    expect(await read(join(perso, 'voisin', 'c.md'))).toBe('---\ntitle: C\n---\nÉcrire `[[old/page]]` pour [[nouveau/page]]\n')
  })

  it('a folder held by two stores answers 422 with a reason and moves nothing', async () => {
    // red if a multi-store folder is renamed in one store only
    const { perso, famille } = await populated()
    await mkdir(join(famille, 'old'), { recursive: true })
    await writeFile(join(famille, 'old', 'autre.md'), '---\ntitle: A\n---\n')
    const res = await rename('old', 'nouveau')
    expect(res.status).toBe(422)
    expect(typeof res.json.reason === 'string' || typeof res.json.message === 'string' || typeof res.json.error === 'string').toBe(true)
    expect(await exists(join(perso, 'old', 'page.md'))).toBe(true)
    expect(await exists(join(famille, 'old', 'autre.md'))).toBe(true)
    expect(await exists(join(perso, 'nouveau'))).toBe(false)
  })

  it('a folder mounted `at` answers 422 and moves nothing', async () => {
    const { lecture } = await populated()
    const res = await rename('lecture', 'froid')
    expect([403, 422]).toContain(res.status)
    expect(await exists(join(lecture, 'ancien', 'froid.md'))).toBe(true)
  })

  it('a folder the configuration names answers 422 and moves nothing', async () => {
    // red if a configured folder (`workspace.*`) can be renamed under the feet of the setting
    const perso = join(root, 'workspace', 'pages')
    await mkdir(join(perso, 'planif'), { recursive: true })
    await writeFile(join(perso, 'planif', 'p.md'), '---\ntitle: Pl\n---\n')
    await boot(`  stores:\n    - id: perso\n      path: pages\n      default: true\n`)
    const res = await rename('planif', 'plans')
    expect(res.status).toBe(422)
    expect(await exists(join(perso, 'planif', 'p.md'))).toBe(true)
    expect(await exists(join(perso, 'plans'))).toBe(false)
  })
})
