/**
 * Feature `adestia-plugins-reglages`, P-plugins-1 step 6 and B-plugins-1: the copy of a plugin that another
 * folder already provides is listed as refused with a reason and has no switch; the winner (the plugins
 * folder, which beats a source) stays a normal row. Expectations come from docs/parcours.md.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { parseConfig } from '../src/config.js'
import { discoverPlugins } from '../src/extensions.js'
import { ScriptedDriver } from './support/driver.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

afterEach(cleanTmp)

const plugin = async (root: string, id: string, description: string) => {
  await mkdir(join(root, id), { recursive: true })
  await writeFile(join(root, id, 'adestia-plugin.json'), JSON.stringify({ schemaVersion: 1, id, kind: 'tool', description }))
}

it('a copy of a plugin the plugins folder already provides is refused with a reason; the folder one stays listed', async () => {
  const dir = await tmpDir('adestia-plugins-doublon-')
  const plugins = join(dir, 'plugins')
  const depot = join(dir, 'depot')
  await plugin(plugins, 'loupe', 'Celle du dossier.')
  await plugin(depot, 'loupe', 'Celle du depot.')
  const source = `extensions:\n  pluginsDir: ${plugins}\n  sources:\n    - dir: ${depot}\n  tools: [loupe]\n`
  const file = join(dir, 'adestia.config.yaml')
  await writeFile(file, source, 'utf8')
  const config = parseConfig(source)
  const found = await discoverPlugins([plugins, depot], config.extensions, new Map([[depot, 'depot']]))
  const app = await buildApp({
    config: { ...config, dataDir: dir },
    driver: new ScriptedDriver([], { capabilities: [] }),
    plugins: found.plugins,
    pluginProblems: found.problems,
    configPath: file,
  })
  const body = (await app.inject({ method: 'GET', url: '/api/plugins' })).json() as {
    plugins: { id: string; description: string; origin: { kind: string } }[]
    refused: { id: string; reason: string }[]
  }
  const rows = body.plugins.filter((p) => p.id === 'loupe')
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ description: 'Celle du dossier.', origin: { kind: 'folder' } })
  const refused = body.refused.filter((r) => r.id === 'loupe')
  expect(refused).toHaveLength(1)
  expect(refused[0]!.reason.length).toBeGreaterThan(0)
})
