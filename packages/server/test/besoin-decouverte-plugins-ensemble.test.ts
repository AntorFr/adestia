/**
 * Feature `adestia-decouverte-plugins`, the effect at its door (no browser), written from the need only
 * (B-34, P-21 step 4, AD-37 plugin side): « par le chargeur, un manifeste dont `creations` est mal formee ou
 * declare `{folder: true}` refuse le plugin, et un plugin desactive n'offre aucune creation ».
 * Door: real discovery of real manifest files in a temporary folder, then `GET /api/instance` of the real app,
 * which carries `plugins[].creations` (what the shell loads) and `pluginProblems` (the refused ones).
 * Every expectation is a literal written by hand from docs/parcours.md and docs/donnees.md.
 * What the user sees (the + list, E-36, the page made) is in packages/web/test/besoin-decouverte-plugins-browser.test.ts.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { parseConfig } from '../src/config.js'
import { discoverPlugins } from '../src/extensions.js'
import { ScriptedDriver } from './support/driver.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

afterEach(cleanTmp)

const write = async (root: string, folder: string, manifest: Record<string, unknown>) => {
  await mkdir(join(root, folder), { recursive: true })
  await writeFile(join(root, folder, 'adestia-plugin.json'), JSON.stringify({ schemaVersion: 1, kind: 'feature', description: 'Un plugin.', ...manifest }))
}
const good = { id: 'notes', label: 'Notes', line: 'Une page de notes.', action: { template: 'templates/notes.md' } }

async function instance(manifests: Record<string, Record<string, unknown>>, activeIds: string[]) {
  const dir = await tmpDir('adestia-decouverte-plugins-')
  const plugins = join(dir, 'plugins')
  for (const [folder, m] of Object.entries(manifests)) await write(plugins, folder, { id: folder, ...m })
  const text = `auth:\n  mode: none\nextensions:\n  pluginsDir: ${plugins}\n  features: [${activeIds.join(', ')}]\n`
  const config = parseConfig(text)
  const found = await discoverPlugins([plugins], config.extensions, new Map())
  const app = await buildApp({
    config: { ...config, dataDir: dir },
    driver: new ScriptedDriver([], { capabilities: [] }),
    plugins: found.plugins,
    pluginProblems: found.problems,
  })
  const info = async () =>
    (await app.inject({ method: 'GET', url: '/api/instance' })).json() as {
      plugins: { id: string; creations?: unknown[] }[]
      pluginProblems: { id: string; reason: string }[]
    }
  return { info }
}

describe('B-34: the loader reads `creations` from the manifest of the enabled plugins', () => {
  it('nominal: an enabled plugin with a valid list sends its entries as declared', async () => {
    const { info } = await instance({ alpha: { creations: [good] } }, ['alpha'])
    const body = await info()
    expect(body.plugins.map((p) => p.id)).toEqual(['alpha'])
    expect(body.plugins[0]?.creations).toEqual([good])
    expect(body.pluginProblems).toEqual([])
  })

  it('a creations-only plugin (nothing else shipped) stays loaded; one without the key sends none', async () => {
    const { info } = await instance({ alpha: { creations: [good] }, beta: {} }, ['alpha', 'beta'])
    const byId = Object.fromEntries((await info()).plugins.map((p) => [p.id, p]))
    expect(Object.keys(byId).sort()).toEqual(['alpha', 'beta'])
    expect(byId['beta']).not.toHaveProperty('creations')
  })

  it('exclusion: the same plugin switched off offers no creation at all', async () => {
    const { info } = await instance({ alpha: { creations: [good] }, beta: { creations: [{ ...good, id: 'autre', label: 'Autre' }] } }, ['beta'])
    const body = await info()
    expect(body.plugins.map((p) => p.id)).toEqual(['beta'])
    expect(JSON.stringify(body.plugins)).not.toContain('Notes')
  })

  it('exclusion: with every plugin off, nothing is sent', async () => {
    const { info } = await instance({ alpha: { creations: [good] } }, [])
    expect((await info()).plugins).toEqual([])
  })
})

describe('B-34 failure: a malformed `creations` refuses the plugin, the others stay', () => {
  const bad: [string, unknown][] = [
    ['not a list (an object)', { id: 'notes', label: 'Notes' }],
    ['not a list (a string)', 'notes'],
    ['an entry without label', [{ id: 'notes', line: 'Une page.', action: { template: 'templates/notes.md' } }]],
    ['an entry without id', [{ label: 'Notes', line: 'Une page.', action: { template: 'templates/notes.md' } }]],
    ['an entry without line', [{ id: 'notes', label: 'Notes', action: { template: 'templates/notes.md' } }]],
    ['an entry without action', [{ id: 'notes', label: 'Notes', line: 'Une page.' }]],
    ['the core folder action', [{ id: 'dossier', label: 'Dossier', line: 'Un dossier.', action: { folder: true } }]],
    ['a good entry then a bad one', [good, { id: 'x', line: 'y', action: { template: 'templates/x.md' } }]],
  ]
  for (const [name, creations] of bad) {
    it(`refuses a plugin whose creations is ${name}`, async () => {
      const { info } = await instance({ cassee: { creations }, saine: { creations: [good] } }, ['cassee', 'saine'])
      const body = await info()
      expect(body.plugins.map((p) => p.id)).toEqual(['saine'])
      expect(body.pluginProblems.map((p) => p.id)).toEqual(['cassee'])
      expect(body.pluginProblems[0]?.reason.length).toBeGreaterThan(0)
    })
  }
})
