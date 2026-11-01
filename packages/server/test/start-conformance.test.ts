import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, expect, it } from 'vitest'

import { start } from '../src/start.js'
import { ScriptedDriver } from './support/driver.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

afterEach(cleanTmp)

// A driver whose descriptor promises a capability it has no method for stops
// the boot, naming the driver and the gap, before anything listens.
it('refuses to boot a driver that declares a capability it lacks the method of', async () => {
  const root = await tmpDir('adestia-boot-conformance-')
  await writeFile(join(root, 'config.yaml'), 'port: 0\ndataDir: ./data\nworkspace:\n  root: ./ws\n')
  const logs: string[] = []
  const attempt = start({
    cwd: root,
    configPath: 'config.yaml',
    driverFactory: async () => new ScriptedDriver([], { capabilities: ['subscriptionQuotas'] }),
    log: (m) => logs.push(m),
  })
  await expect(attempt).rejects.toThrow(/Driver "[^"]+" is not conformant:/)
  await expect(attempt).rejects.toThrow(/\[missing-method\] subscriptionQuotas requires subscriptionQuotas\(\)/)
  expect(logs.some((m) => m.startsWith('Adestia listening on '))).toBe(false)
})
