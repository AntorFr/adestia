/**
 * `adestia-decouverte-creer-dossier` (B-33; AD-38), second pass from the need, at the door of the effect:
 * a REAL instance driven over HTTP. It adds to `besoin-creer-dossier-ensemble.test.ts` the cases the
 * criterion implies and that file does not play.
 *
 * Plan (need -> case -> proof), every expected value written by hand:
 *   bords      a brand new instance                      -> `folders` is present and `[]`
 *              the same name asked twice                 -> 201 then 409, one directory
 *              a sub-folder                              -> `folders` lists the parent and the child
 *              parent read-only in the first store, writable in the second -> 201, made in the second store
 *   exclusion  a refused request (409, 403, 400) adds nothing to `folders`
 *   nominal    the folder is a directory: it is still listed after the instance restarts
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
  root = await tmpDir('adestia-creer-dossier-compl-')
})

const exists = (p: string) => stat(p).then(() => true, () => false)

async function boot(stores: string): Promise<void> {
  const idle = join(root, 'idle-engine.sh')
  await writeFile(idle, '#!/bin/sh\nexec sleep 3600\n', { mode: 0o755 })
  await writeFile(
    join(root, 'adestia.config.yaml'),
    `host: 127.0.0.1\nport: 0\ndataDir: ${join(root, 'data')}\nworkspace:\n  root: ${join(root, 'workspace')}\n${stores}driver:\n  id: claude-code\n  command: ${idle}\n`,
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
  return { status: response.status, json: text === '' ? undefined : JSON.parse(text) }
}
const post = (path: unknown) => api('POST', '/api/folders', { path })
const index = async () =>
  (await api('GET', '/api/pages/index')).json as { entries: unknown[]; folders: string[]; writableFolders: string[] }

describe('POST /api/folders, second pass', () => {
  it('a brand new instance lists `folders` as an empty array, not as a missing field', async () => {
    // red if the index omits `folders` until a folder exists
    await boot('')
    const listed = await index()
    expect(listed.folders).toEqual([])
    expect(listed.entries).toEqual([])
  })

  it('the same name asked twice: 201, then 409, and the folder is listed once', async () => {
    // red if the second call answers 201 or lists a duplicate
    await boot('')
    expect((await post('notes')).status).toBe(201)
    expect((await post('notes')).status).toBe(409)
    expect((await index()).folders).toEqual(['notes'])
  })

  it('a sub-folder is listed with its parent in `folders`', async () => {
    // red if only the leaf is listed, so the parent would not show as a tile
    await boot('')
    expect((await post('notes')).status).toBe(201)
    expect((await post('notes/idees')).status).toBe(201)
    expect((await index()).folders).toEqual(['notes', 'notes/idees'])
  })

  it('the folder is still there after the instance restarts', async () => {
    // red if the folder lives only in memory
    await boot('')
    expect((await post('durable')).status).toBe(201)
    await instance!.close()
    instance = undefined
    await boot('')
    expect((await index()).folders).toEqual(['durable'])
  })

  it('refused requests add nothing to `folders`', async () => {
    // red if a 409, a 400 or a 403 leaves a directory behind
    const perso = join(root, 'workspace', 'pages')
    const lecture = join(root, 'lecture')
    await mkdir(join(perso, 'projets'), { recursive: true })
    await mkdir(join(lecture, 'ancien'), { recursive: true })
    await chmod(join(lecture, 'ancien'), 0o555)
    await chmod(lecture, 0o555)
    locked.push(join(lecture, 'ancien'), lecture)
    await boot(
      `  stores:\n    - id: perso\n      path: pages\n      default: true\n    - id: lecture\n      path: ${lecture}\n      at: lecture\n`,
    )

    expect((await post('projets')).status).toBe(409)
    expect((await post('Bad Name')).status).toBe(400)
    expect((await post('lecture/ancien/dedans')).status).toBe(403)
    expect((await index()).folders).toEqual(['lecture', 'lecture/ancien', 'projets'])
  })

  it('a parent read-only in the first store and writable in the second gets the folder in the second', async () => {
    // red if the first store holding the parent is chosen without asking whether it can be written
    const perso = join(root, 'workspace', 'pages')
    const famille = join(root, 'famille')
    await mkdir(join(perso, 'projets'), { recursive: true })
    await mkdir(join(famille, 'projets'), { recursive: true })
    await chmod(join(perso, 'projets'), 0o555)
    locked.push(join(perso, 'projets'))
    await boot(
      `  stores:\n    - id: perso\n      path: pages\n      default: true\n    - id: famille\n      path: ${famille}\n`,
    )
    expect((await post('projets/neuf')).status).toBe(201)
    expect(await exists(join(famille, 'projets', 'neuf'))).toBe(true)
    expect(await exists(join(perso, 'projets', 'neuf'))).toBe(false)
    expect(await readdir(join(famille, 'projets'))).toEqual(['neuf'])
  })
})
