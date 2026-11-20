/**
 * `GET /api/plugins` and `PUT /api/plugins/:id`, end to end over the real app
 * and a real discovery.
 *
 * The properties that matter: the route says what was found, what booted
 * (`loaded`) and what the FILE wants (`wanted`); it writes exactly one entry
 * of one of the three activation lists, keeping everything else byte for byte;
 * and nothing it accepts can reach another key of the file.
 */

import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { parseConfig } from '../src/config.js'
import { discoverPlugins } from '../src/extensions.js'
import { ScriptedDriver } from './support/driver.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

afterEach(cleanTmp)

const CONFIG = `# Written by hand, and it stays that way.
auth:
  mode: none
driver:
  command: /usr/bin/claude # never from a browser
extensions:
  # Which apps to turn on.
  apps:
    - alpha
  sources:
    - dir: ./elsewhere
workspace:
  watch:
    enabled: true
`

async function put(dir: string, id: string, kind: string, extra: Record<string, unknown> = {}) {
  await mkdir(join(dir, id), { recursive: true })
  await writeFile(
    join(dir, id, 'adestia-plugin.json'),
    JSON.stringify({ schemaVersion: 1, id, kind, description: `The ${id}.`, ...extra }),
  )
}

async function instance(source = CONFIG, withFile = true, written = source) {
  const dir = await tmpDir('adestia-plugins-route-')
  const file = join(dir, 'adestia.config.yaml')
  if (withFile) await writeFile(file, written, 'utf8')
  const folder = join(dir, 'plugins')
  const source1 = join(dir, 'elsewhere')
  const sourceName = parseConfig(source).extensions.sources[0]?.name
  await put(folder, 'alpha', 'app', { version: '1.2.0' })
  await put(folder, 'beta', 'app')
  await put(folder, 'gamma', 'tool')
  await put(folder, 'notes', 'core')
  await mkdir(join(folder, 'broken'), { recursive: true })
  await writeFile(join(folder, 'broken', 'adestia-plugin.json'), '{ not json')
  await put(source1, 'delta', 'feature')
  // The loser of a duplicate id is refused, the folder one is kept.
  await put(source1, 'alpha', 'app')

  const config = parseConfig(source)
  const found = await discoverPlugins(
    [folder, source1],
    config.extensions,
    new Map([[source1, sourceName ?? 'x']]),
  )
  const app = await buildApp({
    config: { ...config, dataDir: dir },
    driver: new ScriptedDriver([], { capabilities: [] }),
    plugins: found.plugins,
    pluginProblems: found.problems,
    pluginsDir: folder,
    ...(withFile ? { configPath: file } : {}),
  })
  return { app, file, folder }
}

const get = async (app: Awaited<ReturnType<typeof instance>>['app']) =>
  (await app.inject({ method: 'GET', url: '/api/plugins' })).json()
const putOne = (
  app: Awaited<ReturnType<typeof instance>>['app'],
  id: string,
  body: unknown,
) => app.inject({ method: 'PUT', url: `/api/plugins/${id}`, payload: body as object })

describe('without a config file', () => {
  it('mounts no plugins route', async () => {
    const { app } = await instance(CONFIG, false)
    expect((await app.inject({ method: 'GET', url: '/api/plugins' })).statusCode).toBe(404)
    expect((await putOne(app, 'beta', { active: true })).statusCode).toBe(404)
  })
})

describe('GET /api/plugins', () => {
  it('lists what was found with kind, origin, loaded and wanted, and the refusal with its reason', async () => {
    const { app, file, folder } = await instance()
    const body = await get(app)
    const row = (id: string) => body.plugins.find((p: { id: string }) => p.id === id)

    expect(body.file).toBe(file)
    expect(body.pluginsDir).toBe(folder)
    expect(body.writable).toBe(true)
    expect(body.revision).not.toBe('')
    expect(body.plugins.map((p: { id: string }) => p.id).sort()).toEqual([
      'alpha', 'beta', 'delta', 'gamma', 'notes',
    ])

    expect(row('alpha')).toMatchObject({
      kind: 'app', version: '1.2.0', origin: { kind: 'folder' }, loaded: true, wanted: true,
    })
    expect(row('beta')).toMatchObject({ kind: 'app', loaded: false, wanted: false })
    expect(row('gamma')).toMatchObject({ kind: 'tool', loaded: false, wanted: false })
    expect(row('delta')).toMatchObject({
      kind: 'feature', origin: { kind: 'source', name: 'elsewhere' }, loaded: false, wanted: false,
    })
    expect(row('notes')).toMatchObject({ kind: 'core', wanted: true })

    const refusedIds = body.refused.map((r: { id: string }) => r.id)
    expect(refusedIds).toContain('broken')
    // the duplicate id's loser is a refusal, not a second row
    expect(refusedIds).toContain('alpha')
    expect(body.plugins.filter((p: { id: string }) => p.id === 'alpha')).toHaveLength(1)
    for (const r of body.refused) expect(r.reason).toBeTruthy()
  })

  it('reads wanted from the file, not from what booted', async () => {
    const { app, file } = await instance()
    await writeFile(file, CONFIG.replace('- alpha', '- beta'), 'utf8')
    const body = await get(app)
    const row = (id: string) => body.plugins.find((p: { id: string }) => p.id === id)
    expect(row('alpha')).toMatchObject({ loaded: true, wanted: false })
    expect(row('beta')).toMatchObject({ loaded: false, wanted: true })
  })

  it('falls back to loaded and says why when the file does not parse', async () => {
    const { app, file } = await instance()
    await writeFile(file, 'extensions: [unclosed\n  : :', 'utf8')
    const body = await get(app)
    expect(body.writable).toBe(false)
    expect(body.readOnlyReason).toBeTruthy()
    const alpha = body.plugins.find((p: { id: string }) => p.id === 'alpha')
    expect(alpha.wanted).toBe(alpha.loaded)
  })
})

describe('PUT /api/plugins/:id', () => {
  it('names the plugin in its own list, keeping every other byte', async () => {
    const { app, file } = await instance()
    const res = await putOne(app, 'beta', { active: true })
    expect(res.statusCode).toBe(200)
    const after = await readFile(file, 'utf8')
    // The only difference is the one new entry.
    expect(after).toBe(CONFIG.replace('    - alpha\n', '    - alpha\n    - beta\n'))

    const body = await get(app)
    const beta = body.plugins.find((p: { id: string }) => p.id === 'beta')
    expect(beta).toMatchObject({ wanted: true, loaded: false })
    expect(res.json().revision).toBe(body.revision)
  })

  it('removes the entry, leaves an empty list rather than a missing key, and loaded stays', async () => {
    const { app, file } = await instance()
    expect((await putOne(app, 'alpha', { active: false })).statusCode).toBe(200)
    const after = await readFile(file, 'utf8')
    expect(after).toMatch(/apps: \[\]/)
    expect(after).toContain('# Which apps to turn on.')
    expect(after).toContain('command: /usr/bin/claude # never from a browser')
    const alpha = (await get(app)).plugins.find((p: { id: string }) => p.id === 'alpha')
    expect(alpha).toMatchObject({ wanted: false, loaded: true })
  })

  it('creates the list of the plugin kind when absent, and writes tools and features to their own', async () => {
    const { app, file } = await instance()
    expect((await putOne(app, 'gamma', { active: true })).statusCode).toBe(200)
    expect((await putOne(app, 'delta', { active: true })).statusCode).toBe(200)
    const after = await readFile(file, 'utf8')
    expect(after).toMatch(/tools:\s*\n\s+- gamma/)
    expect(after).toMatch(/features:\s*\n\s+- delta/)
    expect(after).toMatch(/apps:\s*\n\s+- alpha\n/)
    expect(after).not.toMatch(/apps:[\s\S]*gamma[\s\S]*tools:/)
  })

  it('is idempotent: no duplicate entry, no rewrite of an absent one', async () => {
    const { app, file } = await instance()
    await putOne(app, 'alpha', { active: true })
    await putOne(app, 'beta', { active: false })
    expect(await readFile(file, 'utf8')).toBe(CONFIG)
  })

  it('answers 404 for an id nobody discovered, and 404 for a refused one, without writing', async () => {
    const { app, file } = await instance()
    for (const id of ['nope', 'broken', '..%2Fsources', 'sources', 'driver']) {
      const res = await putOne(app, id, { active: true })
      expect(res.statusCode).toBe(404)
    }
    expect(await readFile(file, 'utf8')).toBe(CONFIG)
  })

  it('answers 409 for core, without writing', async () => {
    const { app, file } = await instance()
    const res = await putOne(app, 'notes', { active: false })
    expect(res.statusCode).toBe(409)
    expect(await readFile(file, 'utf8')).toBe(CONFIG)
  })

  it('answers 409 stale for an old revision, and accepts the current one', async () => {
    const { app, file } = await instance()
    const { revision } = await get(app)
    await writeFile(file, CONFIG + '# edited by hand\n', 'utf8')
    const stale = await putOne(app, 'beta', { active: true, revision })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().kind).toBe('stale')
    expect(await readFile(file, 'utf8')).toBe(CONFIG + '# edited by hand\n')

    const fresh = (await get(app)).revision
    expect((await putOne(app, 'beta', { active: true, revision: fresh })).statusCode).toBe(200)
  })

  it('answers 503 for a read-only file, without writing', async () => {
    const { app, file } = await instance()
    await chmod(file, 0o444)
    const asRoot = process.getuid?.() === 0
    const res = await putOne(app, 'beta', { active: true })
    if (asRoot) return // root writes through a read-only mode; the 503 cannot be shown here
    expect(res.statusCode).toBe(503)
    expect(await readFile(file, 'utf8')).toBe(CONFIG)
    expect((await get(app)).writable).toBe(false)
  })

  it('refuses a body that is not { active: boolean }', async () => {
    const { app, file } = await instance()
    for (const body of [{}, { active: 'yes' }, { active: 1 }, { active: true, revision: 5 }]) {
      expect((await putOne(app, 'beta', body)).statusCode).toBe(400)
    }
    expect(await readFile(file, 'utf8')).toBe(CONFIG)
  })

  it('cannot reach another key: extra fields in the body change nothing', async () => {
    const { app, file } = await instance()
    await putOne(app, 'beta', {
      active: true,
      list: 'sources',
      path: ['driver', 'command'],
      value: '/bin/sh',
      extensions: { sources: [] },
    })
    const after = await readFile(file, 'utf8')
    expect(after).toBe(CONFIG.replace('    - alpha\n', '    - alpha\n    - beta\n'))
  })

  it('leaves a list that is not a list alone', async () => {
    const { app, file } = await instance(CONFIG, true, CONFIG.replace('  apps:\n    - alpha\n', '  apps: alpha\n'))
    const before = await readFile(file, 'utf8')
    const res = await putOne(app, 'beta', { active: true })
    expect(res.statusCode).toBe(400)
    expect(await readFile(file, 'utf8')).toBe(before)
  })
})
