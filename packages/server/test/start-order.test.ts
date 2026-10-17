import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, expect, it, vi } from 'vitest'

import { start, type StartedInstance } from '../src/start.js'
import { ScriptedDriver } from './support/driver.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

// Observe the real boundaries, keeping discovery, storage and the listening
// server real. This trace must survive moving the boot's internal steps.
const observed = vi.hoisted(() => ({ events: [] as string[], roots: [] as (readonly string[])[] }))

vi.mock('../src/stores.js', async (original) => {
  const actual = await original<typeof import('../src/stores.js')>()
  return {
    ...actual,
    resolveStores: (...args: Parameters<typeof actual.resolveStores>) => {
      observed.events.push('memory resolved')
      return actual.resolveStores(...args)
    },
  }
})

vi.mock('../src/sources.js', async (original) => {
  const actual = await original<typeof import('../src/sources.js')>()
  return {
    ...actual,
    fetchSources: async (...args: Parameters<typeof actual.fetchSources>) => {
      const result = await actual.fetchSources(...args)
      observed.events.push('extensions fetched')
      return result
    },
  }
})

vi.mock('../src/extensions.js', async (original) => {
  const actual = await original<typeof import('../src/extensions.js')>()
  return {
    ...actual,
    discoverPlugins: async (...args: Parameters<typeof actual.discoverPlugins>) => {
      observed.events.push('plugins discovered')
      observed.roots.push([...args[0]])
      return actual.discoverPlugins(...args)
    },
    discoverSkins: async (...args: Parameters<typeof actual.discoverSkins>) => {
      observed.events.push('skins discovered')
      observed.roots.push([...args[0]])
      return actual.discoverSkins(...args)
    },
  }
})

let instance: StartedInstance | undefined

afterEach(async () => {
  await instance?.close()
  instance = undefined
  await cleanTmp()
  observed.events.length = 0
  observed.roots.length = 0
})

it.skipIf(process.platform === 'win32')('keeps creation, memory, fetched extensions, contracts and listening in boot order', async () => {
  const root = await tmpDir('adestia-boot-order-')
  const source = join(root, 'source')
  await mkdir(join(source, 'extra'), { recursive: true })
  await writeFile(join(source, 'extra', 'adestia-plugin.json'), JSON.stringify({
    schemaVersion: 1, id: 'extra', kind: 'app', description: 'Fetched extension.',
  }))
  await writeFile(join(root, 'config.yaml'), `
port: 0
dataDir: ./data
workspace:
  root: ./ws
  umask: "002"
extensions:
  apps: [extra]
  sources:
    - dir: ${source}
`)
  const before = process.umask()
  try {
    instance = await start({
      cwd: root,
      configPath: 'config.yaml',
      driverFactory: async () => {
        observed.events.push('driver built')
        expect((await stat(join(root, 'ws'))).mode & 0o777).toBe(0o775)
        return new ScriptedDriver([], { skillsPath: '.claude/skills' })
      },
      log: (message) => {
        if (message === 'umask 0002') observed.events.push('umask applied')
        if (message.startsWith('created workspace at ')) observed.events.push('workspace created')
        if (message.startsWith('shell tools ready ')) observed.events.push('tools started')
        if (message.includes('agent contract(s) delivered')) observed.events.push('contracts delivered')
        if (message.startsWith('Adestia listening on ')) observed.events.push('listening')
      },
    })
    // App construction also resolves its stores; pin that second resolution
    // after contract delivery, before the server accepts requests.
    expect(observed.events).toEqual([
      'umask applied', 'workspace created', 'memory resolved',
      'extensions fetched', 'plugins discovered', 'skins discovered',
      'driver built', 'tools started', 'contracts delivered', 'memory resolved', 'listening',
    ])
    expect(observed.roots).toEqual([
      [join(root, 'plugins'), source],
      [join(root, 'skins'), source],
    ])
    const contract = await readFile(join(root, 'ws', '.claude/skills/this-instance/SKILL.md'), 'utf8')
    expect(contract).toContain('extra')
    expect(contract).toContain(join(root, 'ws'))
    expect((await fetch(`${instance.url}/api/health`)).status).toBe(200)
  } finally {
    process.umask(before)
  }
})
