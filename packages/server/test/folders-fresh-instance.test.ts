/**
 * B-32: on a fresh instance the default store's directory does not exist yet.
 * It counts as writable when its nearest existing ancestor is; the first
 * folder creates it. A read-only ancestor, or a non-default absent store, does not.
 */
import { chmod, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import Fastify from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'

import { registerPages } from '../src/routes/pages.js'
import { resolveStores } from '../src/stores.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

const locked: string[] = []
afterEach(async () => {
  for (const dir of locked.splice(0)) await chmod(dir, 0o755).catch(() => undefined)
  await cleanTmp()
})

async function fresh(declared: { id: string; path: string; at?: string }[], lock = false) {
  const ws = await tmpDir('adestia-fresh-')
  if (lock) {
    await chmod(ws, 0o555)
    locked.push(ws)
  }
  const app = Fastify()
  registerPages(app, { stores: resolveStores(declared, ws).stores, locale: 'fr', plugins: [] })
  await app.ready()
  const post = (path: unknown) => app.inject({ method: 'POST', url: '/api/folders', payload: { path } })
  const index = async () =>
    (await app.inject({ url: '/api/pages/index' })).json() as { entries: unknown[]; folders: string[]; writableFolders: string[] }
  return { ws, post, index }
}
const exists = (p: string) => stat(p).then(() => true, () => false)

describe('a fresh instance, default store directory absent', () => {
  it('lists the root as writable and creates the first folder, then its sub-folder', async () => {
    const { ws, post, index } = await fresh([{ id: 'pages', path: 'pages' }])
    expect(await exists(join(ws, 'pages'))).toBe(false)
    expect((await index()).writableFolders).toContain('')
    const made = await post('notes')
    expect(made.statusCode).toBe(201)
    expect(made.json()).toEqual({ path: 'notes' })
    expect((await stat(join(ws, 'pages', 'notes'))).isDirectory()).toBe(true)
    expect((await post('notes')).statusCode).toBe(409)
    expect((await post('notes/sous')).statusCode).toBe(201)
    const listed = await index()
    expect(listed.entries).toEqual([])
    expect(listed.folders).toEqual(expect.arrayContaining(['notes', 'notes/sous']))
  })

  it('still refuses a bad name and a missing parent without creating the store directory', async () => {
    const { ws, post } = await fresh([{ id: 'pages', path: 'pages' }])
    expect((await post('Notes')).statusCode).toBe(400)
    expect((await post('absent/x')).statusCode).toBe(403)
    expect(await exists(join(ws, 'pages'))).toBe(false)
  })

  it('403 and not writable when the nearest existing ancestor is read-only; nothing created', async () => {
    const { ws, post, index } = await fresh([{ id: 'pages', path: 'pages' }], true)
    expect((await index()).writableFolders).toEqual([])
    expect((await post('notes')).statusCode).toBe(403)
    expect(await exists(join(ws, 'pages'))).toBe(false)
  })

  it('an absent NON-default store is not created by a post', async () => {
    const { ws, post } = await fresh([
      { id: 'pages', path: 'pages' },
      { id: 'autre', path: 'autre', at: 'autre' },
    ])
    expect((await post('autre/x')).statusCode).toBe(403)
    expect(await exists(join(ws, 'autre'))).toBe(false)
  })
})
