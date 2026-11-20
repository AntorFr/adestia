import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { discoverPlugins, mcpServersFor } from '../src/extensions.js'
import { collectFiles, safeFilePath } from '../src/files.js'
import { pagesService, resolveStores } from '../src/stores.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

afterEach(cleanTmp)

const PLUGINS = resolve(__dirname, '../../../plugins')
const NONE = { apps: [], features: [], tools: [] }

describe('the web plugin, as the server discovers it', () => {
  it('is found with its manifest, and inactive until `web` is in extensions.tools', async () => {
    const { plugins, problems } = await discoverPlugins(PLUGINS, NONE)
    expect(problems.filter((p) => p.id === 'web')).toEqual([])
    const web = plugins.find((p) => p.manifest.id === 'web')
    expect(web?.manifest.kind).toBe('tool')
    expect(web?.active).toBe(false)
    expect(mcpServersFor([], plugins).servers.filter((s) => s.name === 'web')).toEqual([])
  })

  it('contributes one MCP server, anchored on the plugin folder, once activated', async () => {
    const { plugins } = await discoverPlugins(PLUGINS, { ...NONE, tools: ['web'] })
    const { servers } = mcpServersFor([], plugins)
    const web = servers.filter((s) => s.name === 'web')
    expect(web).toHaveLength(1)
    expect(web[0]?.command).toBe('node')
    expect(web[0]?.args).toEqual([join(PLUGINS, 'web', 'mcp', 'relais.mjs')])
  })
})

describe('the browser output folder', () => {
  it('is never shown by the file list, the page list or the file route path rule', async () => {
    const root = await tmpDir('adestia-web-out-')
    await mkdir(join(root, '.adestia-web'), { recursive: true })
    await writeFile(join(root, '.adestia-web', 'page-1.md'), '# captured')
    await writeFile(join(root, '.adestia-web', 'shot.png'), 'x')
    await writeFile(join(root, 'visible.pdf'), 'x')
    await writeFile(join(root, 'visible.md'), '# v')
    const store = resolveStores([{ id: 'perso', path: root }], root).stores[0]!

    expect((await collectFiles([store], '', true, false)).map((f) => f.path)).toEqual(['visible.pdf'])
    expect((await pagesService([store]).list()).map((p) => p.path).sort()).toEqual(['visible.md', 'visible.pdf'])
    expect(safeFilePath(store, '.adestia-web/shot.png')).toBeUndefined()
  })
})
