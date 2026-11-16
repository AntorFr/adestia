/**
 * Feature `adestia-pages-etat-projet`, the effects at their door (no browser), written from docs/donnees.md
 * ("Page name at creation", "Page index field") and AD-etat-projet-3 as the contract:
 * `GET /api/pages/index` carries `writableFolders`; creating a page is a `PUT /api/pages/*` WITHOUT a revision and
 * with `?store=`; a file that already exists answers 409 and is never overwritten.
 */
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'

import { registerPages } from '../src/routes/pages.js'
import { resolveStores } from '../src/stores.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

const locked: string[] = []
afterEach(async () => {
  for (const dir of locked.splice(0)) await chmod(dir, 0o755).catch(() => undefined)
  await cleanTmp()
})

async function boot(ws: string, stores: Parameters<typeof resolveStores>[0]): Promise<FastifyInstance> {
  const app = Fastify()
  registerPages(app, { stores: resolveStores(stores, ws).stores, locale: 'en', plugins: [] })
  await app.ready()
  return app
}
const index = async (app: FastifyInstance) =>
  (await app.inject({ url: '/api/pages/index' })).json() as { writableFolders: string[]; entries: { path: string; store?: string }[] }
const create = (app: FastifyInstance, path: string, markdown: string, store: string) =>
  app.inject({ method: 'PUT', url: `/api/pages/${path}?store=${store}`, payload: { markdown } })

const PAGE = '---\ntype: project-management\ntitle: Point\n---\n\nUne ligne de synthèse.\n'

describe('creating a page from a template, at the server door', () => {
  it('a folder of the writable default store is offered, and a page created there without revision is written and indexed', async () => {
    const ws = await tmpDir('adestia-besoin-')
    await mkdir(join(ws, 'perso', 'projet'), { recursive: true })
    await writeFile(join(ws, 'perso', 'projet', 'cadrage.md'), '---\ntitle: Cadrage\n---\nx\n')
    const app = await boot(ws, [{ id: 'perso', path: 'perso' }])
    expect((await index(app)).writableFolders).toContain('projet')
    const response = await create(app, 'projet/point.md', PAGE, 'perso')
    expect(response.statusCode).toBe(200)
    expect(await readFile(join(ws, 'perso', 'projet', 'point.md'), 'utf8')).toContain('title: Point')
    expect((await index(app)).entries.map((e) => e.path)).toContain('projet/point.md')
  })

  it('a name already taken answers 409 and the existing file is not overwritten', async () => {
    const ws = await tmpDir('adestia-besoin-')
    await mkdir(join(ws, 'perso', 'projet'), { recursive: true })
    await writeFile(join(ws, 'perso', 'projet', 'point.md'), '---\ntitle: Original\n---\nGarde moi\n')
    const app = await boot(ws, [{ id: 'perso', path: 'perso' }])
    const response = await create(app, 'projet/point.md', PAGE, 'perso')
    expect(response.statusCode).toBe(409)
    expect(await readFile(join(ws, 'perso', 'projet', 'point.md'), 'utf8')).toBe('---\ntitle: Original\n---\nGarde moi\n')
  })

  it('a folder held only by a read-only store is not offered; the writable store alone is', async () => {
    const ws = await tmpDir('adestia-besoin-')
    await mkdir(join(ws, 'perso', 'projet'), { recursive: true })
    await mkdir(join(ws, 'archive', 'gele'), { recursive: true })
    await writeFile(join(ws, 'archive', 'gele', 'a.md'), '---\ntitle: A\n---\n')
    await chmod(join(ws, 'archive', 'gele'), 0o555)
    await chmod(join(ws, 'archive'), 0o555)
    locked.push(join(ws, 'archive', 'gele'), join(ws, 'archive'))
    const app = await boot(ws, [{ id: 'perso', path: 'perso', default: true }, { id: 'archive', path: 'archive' }] as never)
    const folders = (await index(app)).writableFolders
    expect(folders).toContain('projet')
    expect(folders).not.toContain('gele')
  })

  it('a folder that exists in no store is not offered, and the field is always present', async () => {
    const ws = await tmpDir('adestia-besoin-')
    await mkdir(join(ws, 'perso', 'projet'), { recursive: true })
    const app = await boot(ws, [{ id: 'perso', path: 'perso' }])
    const folders = (await index(app)).writableFolders
    expect(Array.isArray(folders)).toBe(true)
    expect(folders).not.toContain('inconnu')
  })
})
