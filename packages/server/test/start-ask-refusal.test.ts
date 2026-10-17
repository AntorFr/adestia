import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, expect, it } from 'vitest'

import { ConfigError } from '../src/config.js'
import { start } from '../src/start.js'
import { ScriptedDriver } from './support/driver.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

afterEach(cleanTmp)

// `ask` on an engine that cannot be asked is refused out loud: the boot throws
// a ConfigError, after the tools socket is up and BEFORE anything listens.
it('refuses permissions.mode ask for a driver without interactivePermissions, before listening', async () => {
  const root = await tmpDir('adestia-boot-ask-')
  await writeFile(join(root, 'config.yaml'), 'port: 0\ndataDir: ./data\nworkspace:\n  root: ./ws\npermissions:\n  mode: ask\n')
  const logs: string[] = []
  const attempt = start({
    cwd: root,
    configPath: 'config.yaml',
    driverFactory: async () => new ScriptedDriver([], { capabilities: ['usageMetrics'] }),
    log: (m) => logs.push(m),
  })
  await expect(attempt).rejects.toBeInstanceOf(ConfigError)
  await expect(attempt).rejects.toThrow(/cannot ask/)
  expect(logs.some((m) => m.startsWith('shell tools ready '))).toBe(true)
  expect(logs.some((m) => m.startsWith('Adestia listening on '))).toBe(false)
})
