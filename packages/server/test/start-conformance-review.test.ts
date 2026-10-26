import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, expect, it } from 'vitest'

import { start } from '../src/start.js'
import { ScriptedDriver } from './support/driver.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

afterEach(cleanTmp)

async function boot(capabilities: unknown[], logs: string[] = []) {
  const root = await tmpDir('adestia-boot-conformance-r-')
  await writeFile(join(root, 'config.yaml'), 'port: 0\ndataDir: ./data\nworkspace:\n  root: ./ws\n')
  return start({
    cwd: root,
    configPath: 'config.yaml',
    driverFactory: async () => new ScriptedDriver([], { capabilities: capabilities as never }),
    log: (m) => logs.push(m),
  })
}

it('names the driver "scripted" and one line per gap', async () => {
  // quotas: no method; teleportation: unknown -> two gaps
  const err = await boot(['subscriptionQuotas', 'teleportation']).then(
    () => null,
    (e: Error) => e,
  )
  expect(err).not.toBeNull()
  const lines = err!.message.split('\n')
  expect(lines[0]).toBe('Driver "scripted" is not conformant:')
  expect(lines.filter((l) => l.startsWith('  - [')).length).toBeGreaterThanOrEqual(2)
})

it('refuses an unknown capability', async () => {
  await expect(boot(['teleportation'])).rejects.toThrow(/Driver "scripted" is not conformant:[\s\S]*teleportation/)
})

it('still boots a conformant driver', async () => {
  const logs: string[] = []
  const started = await boot(['usageMetrics'], logs)
  try {
    expect(logs.some((m) => m.startsWith('Adestia listening on '))).toBe(true)
  } finally {
    await (started as { close?: () => Promise<void> }).close?.()
  }
})
