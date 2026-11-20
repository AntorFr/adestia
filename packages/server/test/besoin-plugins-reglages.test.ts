/**
 * Feature `adestia-plugins-reglages`, the effects at their door (no browser), written from docs/parcours.md
 * (B-plugins-1, B-plugins-2, B-plugins-4, P-plugins-1) and the contracts of ARCHITECTURE.md (AD-plugins-1, AD-plugins-2):
 * `GET /api/plugins` and `PUT /api/plugins/:id` with `{ active, revision? }`, over the real app, the real discovery and
 * a real `adestia.config.yaml` in a temporary folder. Every expectation is written by hand from the need.
 * The restart that applies a change (B-plugins-3) and what the owner sees are in the browser test of the same name.
 */
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { buildApp } from '../src/app.js'
import { parseConfig } from '../src/config.js'
import { discoverPlugins } from '../src/extensions.js'
import { ScriptedDriver } from './support/driver.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

const locked: string[] = []
afterEach(async () => {
  for (const file of locked.splice(0)) await chmod(file, 0o644).catch(() => undefined)
  await cleanTmp()
})

const plugin = async (root: string, folder: string, manifest: Record<string, unknown>) => {
  await mkdir(join(root, folder), { recursive: true })
  await writeFile(join(root, folder, 'adestia-plugin.json'), JSON.stringify({ schemaVersion: 1, ...manifest }))
}

const configText = (plugins: string, depot: string) => `# Fichier du proprietaire: il reste tel quel.
name: Instance d'essai
auth:
  mode: none
extensions:
  pluginsDir: ${plugins}
  sources:
    - dir: ${depot}
  apps: [atlas]
  tools: [loupe]
`

interface Row {
  id: string
  kind: string
  description: string
  origin: { kind: string; name?: string }
  loaded: boolean
  wanted: boolean
}
interface Payload {
  plugins: Row[]
  refused: { id: string; reason: string }[]
  writable: boolean
  revision: string
}

async function instance(options: { withFile?: boolean; readOnly?: boolean } = {}) {
  const dir = await tmpDir('adestia-plugins-besoin-')
  const plugins = join(dir, 'plugins')
  const depot = join(dir, 'depot')
  await plugin(plugins, 'atlas', { id: 'atlas', kind: 'app', description: 'Atlas des lieux.', view: './web/app.js' })
  await plugin(plugins, 'boussole', { id: 'boussole', kind: 'app', description: 'Boussole du jardin.', view: './web/app.js' })
  await plugin(plugins, 'loupe', { id: 'loupe', kind: 'tool', description: 'Une loupe.' })
  await plugin(plugins, 'veille', { id: 'veille', kind: 'feature', description: 'Veille du soir.', chrome: './web/chrome.js' })
  await plugin(plugins, 'socle', { id: 'socle', kind: 'core', description: 'Le socle.' })
  await plugin(plugins, 'casse', { id: 'autre-nom', kind: 'app', description: 'Se trompe de nom.' })
  await plugin(depot, 'lointain', { id: 'lointain', kind: 'app', description: 'Vient du depot.', view: './web/app.js' })
  const source = configText(plugins, depot)
  const file = join(dir, 'adestia.config.yaml')
  if (options.withFile !== false) await writeFile(file, source, 'utf8')
  if (options.readOnly) {
    await chmod(file, 0o444)
    locked.push(file)
  }
  const config = parseConfig(source)
  const found = await discoverPlugins([plugins, depot], config.extensions, new Map([[depot, 'depot']]))
  const app = await buildApp({
    config: { ...config, dataDir: dir },
    driver: new ScriptedDriver([], { capabilities: [] }),
    plugins: found.plugins,
    pluginProblems: found.problems,
    ...(options.withFile === false ? {} : { configPath: file }),
  })
  const list = async () => (await app.inject({ method: 'GET', url: '/api/plugins' })).json() as Payload
  const put = (id: string, body: unknown) => app.inject({ method: 'PUT', url: `/api/plugins/${id}`, payload: body as object })
  const lists = async () => parse(await readFile(file, 'utf8')).extensions as Record<string, string[]>
  return { app, file, list, put, lists }
}

describe('B-plugins-1: the owner reads every plugin the instance found', () => {
  it('lists active and inactive plugins with kind, description and where each was found', async () => {
    const { list } = await instance()
    const byId = Object.fromEntries((await list()).plugins.map((p) => [p.id, p]))
    expect(Object.keys(byId).sort()).toEqual(['atlas', 'boussole', 'lointain', 'loupe', 'socle', 'veille'])
    expect(byId['atlas']).toMatchObject({ kind: 'app', description: 'Atlas des lieux.', loaded: true, wanted: true, origin: { kind: 'folder' } })
    expect(byId['boussole']).toMatchObject({ kind: 'app', loaded: false, wanted: false })
    expect(byId['loupe']).toMatchObject({ kind: 'tool', loaded: true })
    expect(byId['veille']).toMatchObject({ kind: 'feature', loaded: false })
    expect(byId['socle']).toMatchObject({ kind: 'core', loaded: true, wanted: true })
    expect(byId['lointain']).toMatchObject({ kind: 'app', loaded: false, origin: { kind: 'source', name: 'depot' } })
  })

  it('names a refused plugin with its reason and does not list it among the plugins', async () => {
    const { list } = await instance()
    const payload = await list()
    expect(payload.plugins.map((p) => p.id)).not.toContain('casse')
    expect(payload.plugins.map((p) => p.id)).not.toContain('autre-nom')
    const refused = payload.refused.find((r) => r.id === 'casse' || r.id === 'autre-nom')
    expect(refused?.reason).toContain('but the folder is "casse"')
  })

  it('an instance with no plugin at all answers an empty list, not an error', async () => {
    const dir = await tmpDir('adestia-plugins-besoin-')
    const file = join(dir, 'adestia.config.yaml')
    await writeFile(file, `extensions:\n  pluginsDir: ${join(dir, 'vide')}\n`, 'utf8')
    const config = parseConfig(`extensions:\n  pluginsDir: ${join(dir, 'vide')}\n`)
    const app = await buildApp({ config: { ...config, dataDir: dir }, driver: new ScriptedDriver([], { capabilities: [] }), plugins: [], pluginProblems: [], configPath: file })
    const response = await app.inject({ method: 'GET', url: '/api/plugins' })
    expect(response.statusCode).toBe(200)
    expect((response.json() as Payload).plugins).toEqual([])
    expect((response.json() as Payload).refused).toEqual([])
  })
})

describe('B-plugins-2: turning a plugin on or off writes the config file, and nothing else', () => {
  it('turns an inactive app on: the file names it, the running state is unchanged until a restart', async () => {
    const { put, lists, list } = await instance()
    const response = await put('boussole', { active: true })
    expect(response.statusCode).toBe(200)
    expect((await lists())['apps']).toEqual(['atlas', 'boussole'])
    const row = (await list()).plugins.find((p) => p.id === 'boussole')
    expect(row).toMatchObject({ wanted: true, loaded: false })
  })

  it('turns an active app off: the file drops it, it stays loaded until a restart; the other lists are intact', async () => {
    const { put, lists, list } = await instance()
    expect((await put('atlas', { active: false })).statusCode).toBe(200)
    const after = await lists()
    expect(after['apps']).toEqual([])
    expect(after['tools']).toEqual(['loupe'])
    expect(await list().then((p) => p.plugins.find((r) => r.id === 'atlas'))).toMatchObject({ wanted: false, loaded: true })
  })

  it('writes the list of the plugin\'s own kind: a tool and a feature each go to their list', async () => {
    const { put, lists } = await instance()
    expect((await put('veille', { active: true })).statusCode).toBe(200)
    expect((await put('loupe', { active: false })).statusCode).toBe(200)
    const after = await lists()
    expect(after['features']).toEqual(['veille'])
    expect(after['tools']).toEqual([])
    expect(after['apps']).toEqual(['atlas'])
  })

  it('keeps the owner\'s comment and every other key of the file', async () => {
    const { put, file } = await instance()
    await put('boussole', { active: true })
    const text = await readFile(file, 'utf8')
    expect(text).toContain("# Fichier du proprietaire: il reste tel quel.")
    const doc = parse(text)
    expect(doc.name).toBe("Instance d'essai")
    expect(doc.auth).toEqual({ mode: 'none' })
    expect(doc.extensions.sources).toHaveLength(1)
  })

  it('turning a plugin on twice does not name it twice', async () => {
    const { put, lists } = await instance()
    await put('boussole', { active: true })
    await put('boussole', { active: true })
    expect((await lists())['apps']).toEqual(['atlas', 'boussole'])
  })

  it('turning it back before the restart makes wanted equal loaded again', async () => {
    const { put, list, lists } = await instance()
    await put('boussole', { active: true })
    await put('boussole', { active: false })
    expect((await list()).plugins.find((p) => p.id === 'boussole')).toMatchObject({ wanted: false, loaded: false })
    expect((await lists())['apps']).toEqual(['atlas'])
  })

  it('a plugin of a source repository is switched like one of the folder', async () => {
    const { put, lists } = await instance()
    expect((await put('lointain', { active: true })).statusCode).toBe(200)
    expect((await lists())['apps']).toEqual(['atlas', 'lointain'])
  })
})

describe('B-plugins-4: the page changes nothing it should not', () => {
  it('refuses a name the instance did not find, and leaves the file byte for byte', async () => {
    const { put, file } = await instance()
    const before = await readFile(file, 'utf8')
    const response = await put('inconnu', { active: true })
    expect(response.statusCode).toBe(404)
    expect(await readFile(file, 'utf8')).toBe(before)
  })

  it('refuses to switch a refused plugin, under its folder name or its manifest name', async () => {
    const { put, file } = await instance()
    const before = await readFile(file, 'utf8')
    for (const id of ['casse', 'autre-nom']) expect((await put(id, { active: true })).statusCode).toBeGreaterThanOrEqual(400)
    expect(await readFile(file, 'utf8')).toBe(before)
  })

  it('a core plugin cannot be turned off, and the file is untouched', async () => {
    const { put, file } = await instance()
    const before = await readFile(file, 'utf8')
    const response = await put('socle', { active: false })
    expect(response.statusCode).toBe(409)
    expect(await readFile(file, 'utf8')).toBe(before)
  })

  it('a body that is not { active: boolean } is refused and writes nothing', async () => {
    const { put, file } = await instance()
    const before = await readFile(file, 'utf8')
    for (const body of [{}, { active: 'yes' }, { active: 1 }]) expect((await put('boussole', body)).statusCode).toBe(400)
    expect(await readFile(file, 'utf8')).toBe(before)
  })

  it('a stale revision is refused with 409 and writes nothing; the current revision is accepted', async () => {
    const { put, list, file } = await instance()
    const { revision } = await list()
    expect((await put('boussole', { active: true })).statusCode).toBe(200)
    const before = await readFile(file, 'utf8')
    const stale = await put('veille', { active: true, revision })
    expect(stale.statusCode).toBe(409)
    expect(await readFile(file, 'utf8')).toBe(before)
    const fresh = (await list()).revision
    expect((await put('veille', { active: true, revision: fresh })).statusCode).toBe(200)
  })

  it('a read-only file: everything is still listed, says it is not writable, and the write is refused', async () => {
    const { list, put, file } = await instance({ readOnly: true })
    const payload = await list()
    expect(payload.writable).toBe(false)
    expect(payload.plugins).toHaveLength(6)
    const before = await readFile(file, 'utf8')
    expect((await put('boussole', { active: true })).statusCode).toBe(503)
    expect(await readFile(file, 'utf8')).toBe(before)
  })

  it('an instance started without a config file exposes no plugins route', async () => {
    const { app } = await instance({ withFile: false })
    expect((await app.inject({ method: 'GET', url: '/api/plugins' })).statusCode).toBe(404)
    expect((await app.inject({ method: 'PUT', url: '/api/plugins/boussole', payload: { active: true } })).statusCode).toBe(404)
  })
})
