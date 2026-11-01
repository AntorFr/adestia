/**
 * Ensemble tests for the feature `adestia-correctifs-serveur`, written from the
 * need (B-13, B-15, P-10 step 4, P-14 step 5, the feature's exit criterion)
 * and run through `start()`, the entry point of the server.
 *
 * Expectations are literals taken from the need, never read back from the code.
 */

import { chmod, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Driver } from '@antorfr/adestia-drivers'

import { start, type StartedInstance } from '../src/start.js'
import { UserTokens } from '../src/user-tokens.js'
import { ScriptedDriver, driverWith } from './support/driver.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

afterEach(cleanTmp)

let root: string
let started: StartedInstance | undefined

beforeEach(async () => {
  root = await tmpDir('adestia-ensemble-serveur-')
})
afterEach(async () => {
  await started?.close()
  started = undefined
})

const CONFIG = `# kept by hand
auth:
  mode: none
port: 0
workspace:
  # polling comment
  watch:
    enabled: true
    polling: false
`

async function boot(driverFactory: () => Driver, config = CONFIG, mode = 0o600) {
  const file = join(root, 'adestia.config.yaml')
  await writeFile(file, config)
  await chmod(file, mode)
  started = await start({ cwd: root, configPath: 'adestia.config.yaml', driverFactory, log: () => undefined })
  return { file, instance: started }
}

/** A driver by hand: the descriptor says what it says, the methods are what we give. */
const driverNamed = (id: string, capabilities: string[], overrides: Partial<Driver> = {}) =>
  driverWith({
    describe: () => Promise.resolve({ id, label: id, cliVersion: '1', capabilities: capabilities as never }),
    ...overrides,
  })

async function bootError(driver: Driver): Promise<string> {
  try {
    await boot(() => driver)
  } catch (error) {
    return (error as Error).message
  }
  return ''
}

describe('P-14 step 5 — the boot checks the driver against its own descriptor', () => {
  it('stops the boot naming the driver and the gap when a declared capability lacks its method', async () => {
    // Breaks if start() stops calling the conformance check.
    const message = await bootError(driverNamed('gap-driver', ['modelSelection']))
    expect(message).toContain('Driver "gap-driver" is not conformant:')
    expect(message).toContain('modelSelection requires listModels()')
  })

  it('lists every gap, one line each, not only the first', async () => {
    const message = await bootError(driverNamed('multi-gap', ['modelSelection', 'mcpStatus', 'subscriptionQuotas']))
    expect(message).toContain('Driver "multi-gap" is not conformant:')
    expect(message).toContain('modelSelection requires listModels()')
    expect(message).toContain('mcpStatus requires mcpStatus()')
    expect(message).toContain('subscriptionQuotas requires subscriptionQuotas()')
  })

  it('names a missing core method', async () => {
    const driver: Partial<Driver> = driverNamed('no-env', [])
    delete driver.env
    const message = await bootError(driver as Driver)
    expect(message).toContain('Driver "no-env" is not conformant:')
    expect(message).toContain('env')
  })

  it('names an unknown capability', async () => {
    const message = await bootError(driverNamed('odd-one', ['teleportation']))
    expect(message).toContain('Driver "odd-one" is not conformant:')
    expect(message).toContain('teleportation')
  })

  it('names a capability declared without its prerequisite', async () => {
    const message = await bootError(driverNamed('no-usage', ['cost']))
    expect(message).toContain('Driver "no-usage" is not conformant:')
    expect(message).toContain('cost')
  })

  it('delivers nothing to the engine folders when the driver is refused', async () => {
    // The check comes BEFORE the delivery of skills (P-14 step 5).
    const skills = join(root, 'engine-skills')
    await mkdir(skills, { recursive: true })
    const message = await bootError(driverNamed('gap-driver', ['modelSelection'], { skillsPath: () => skills }))
    expect(message).toContain('not conformant')
    expect(await readdir(skills)).toEqual([])
  })

  it('boots a conformant driver that declares capabilities with their methods', async () => {
    const { instance } = await boot(() =>
      driverNamed('good', ['usageMetrics', 'modelSelection'], { listModels: () => Promise.resolve([{ id: 'm' }]) } as Partial<Driver>),
    )
    expect((await instance.app.inject({ url: '/api/health' })).statusCode).toBe(200)
  })

  it('boots a driver that declares no capability at all', async () => {
    const { instance } = await boot(() => new ScriptedDriver([], { capabilities: [] }))
    expect((await instance.app.inject({ url: '/api/health' })).statusCode).toBe(200)
  })

  it('still runs a turn after the hardened boot', async () => {
    // Exit criterion: a turn passes after the boot is hardened (scripted engine, not the real one).
    const driver = new ScriptedDriver(
      [
        { type: 'text-delta', text: 'bonjour' },
        { type: 'result', sessionId: 's1' },
      ] as never,
      { capabilities: ['usageMetrics'] },
    )
    const { instance } = await boot(() => driver)
    const response = await instance.app.inject({ method: 'POST', url: '/api/turn', payload: { prompt: 'salut' } })
    expect(response.statusCode).toBe(200)
    expect(response.body).toContain('event: text-delta')
    expect(response.body).toContain('bonjour')
    expect(response.body).toContain('event: result')
    expect(driver.requests[0]?.prompt).toBe('salut')
  })
})

describe('P-10 step 4 — saving the configuration keeps the file mode', () => {
  const save = async (instance: StartedInstance, polling: boolean) => {
    const read = (await instance.app.inject({ url: '/api/settings' })).json() as { revision: string }
    return instance.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { revision: read.revision, changes: [{ path: ['workspace', 'watch', 'polling'], value: polling }] },
    })
  }
  const modeOf = async (file: string) => (await stat(file)).mode & 0o777

  it('a file at 0600 is still 0600 after a save, and the value is written', async () => {
    const { file, instance } = await boot(() => new ScriptedDriver([], { capabilities: [] }))
    expect(await modeOf(file)).toBe(0o600)
    const response = await save(instance, true)
    expect(response.statusCode).toBe(200)
    expect(await modeOf(file)).toBe(0o600)
    const text = await readFile(file, 'utf8')
    expect(text).toMatch(/polling: true/)
    expect(text).toContain('# polling comment')
    expect(text).toContain('# kept by hand')
  })

  it('still 0600 after two saves in a row', async () => {
    const { file, instance } = await boot(() => new ScriptedDriver([], { capabilities: [] }))
    expect((await save(instance, true)).statusCode).toBe(200)
    expect((await save(instance, false)).statusCode).toBe(200)
    expect(await modeOf(file)).toBe(0o600)
  })

  it('a file at 0640 stays 0640: the mode is kept, not forced', async () => {
    const { file, instance } = await boot(() => new ScriptedDriver([], { capabilities: [] }), CONFIG, 0o640)
    expect((await save(instance, true)).statusCode).toBe(200)
    expect(await modeOf(file)).toBe(0o640)
  })

  it('a refused save (stale revision) leaves the mode and the content alone', async () => {
    const { file, instance } = await boot(() => new ScriptedDriver([], { capabilities: [] }))
    const response = await instance.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { revision: 'not-the-revision', changes: [{ path: ['workspace', 'watch', 'polling'], value: true }] },
    })
    expect(response.statusCode).toBe(409)
    expect(await modeOf(file)).toBe(0o600)
    expect(await readFile(file, 'utf8')).toBe(CONFIG)
  })

  it('no stray temporary file is left beside the config after a save', async () => {
    const { instance } = await boot(() => new ScriptedDriver([], { capabilities: [] }))
    await save(instance, true)
    expect((await readdir(root)).filter((name) => name.startsWith('adestia.config.yaml'))).toEqual([
      'adestia.config.yaml',
    ])
  })
})

describe('user-tokens.json — the note says what the file holds', () => {
  it('the module comment cites the access token and its expiry', async () => {
    const source = await readFile(fileURLToPath(new URL('../src/user-tokens.ts', import.meta.url)), 'utf8')
    const note = source.slice(0, source.indexOf('*/'))
    expect(note).toMatch(/access token/i)
    expect(note).toMatch(/expir/i)
  })

  it('the file really holds the access token and its expiry, at 0600', async () => {
    const fetchImpl = ((url: unknown) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            String(url).includes('.well-known')
              ? { token_endpoint: 'https://auth.example/token' }
              : { access_token: 'access-1', expires_in: 3600 },
          ),
      })) as unknown as typeof fetch
    const tokens = new UserTokens(root, { issuer: 'https://auth.example', clientId: 'a', clientSecret: 's' }, fetchImpl)
    await tokens.remember('lea', 'refresh-1')
    expect(await tokens.accessToken('lea')).toBe('access-1')
    const path = join(root, 'user-tokens.json')
    const onDisk = JSON.parse(await readFile(path, 'utf8'))
    expect(onDisk.lea.refreshToken).toBe('refresh-1')
    expect(onDisk.lea.accessToken).toBe('access-1')
    expect(typeof onDisk.lea.expiresAt).toBe('number')
    expect((await stat(path)).mode & 0o777).toBe(0o600)
  })
})

describe('B-13 — no old file re-exports register*', () => {
  const srcDir = fileURLToPath(new URL('../src/', import.meta.url))

  it('no source file carries an `export … from` that mentions register', async () => {
    const files = [
      ...(await readdir(srcDir)).filter((n) => n.endsWith('.ts')).map((n) => join(srcDir, n)),
      ...(await readdir(join(srcDir, 'routes'))).filter((n) => n.endsWith('.ts')).map((n) => join(srcDir, 'routes', n)),
    ]
    const offenders: string[] = []
    for (const file of files) {
      const text = await readFile(file, 'utf8')
      for (const match of text.matchAll(/export\s+(?:type\s+)?(?:\{[^}]*\}|\*(?:\s+as\s+\w+)?)\s+from\s+['"][^'"]+['"]/g)) {
        if (/register/i.test(match[0])) offenders.push(`${file}: ${match[0]}`)
      }
      for (const match of text.matchAll(/export\s*\{[^}]*\bregister\w*[^}]*\}/g)) offenders.push(`${file}: ${match[0]}`)
    }
    expect(offenders).toEqual([])
  })

  it('no module outside routes/ exports a register* function that routes/ defines', async () => {
    const routeFiles = (await readdir(join(srcDir, 'routes'))).filter((n) => n.endsWith('.ts'))
    const owned = new Map<unknown, string>()
    for (const name of routeFiles) {
      const mod = (await import(join(srcDir, 'routes', name))) as Record<string, unknown>
      for (const [key, value] of Object.entries(mod)) if (key.startsWith('register')) owned.set(value, `routes/${name}:${key}`)
    }
    expect(owned.size).toBeGreaterThan(10)
    const offenders: string[] = []
    for (const name of (await readdir(srcDir)).filter((n) => n.endsWith('.ts'))) {
      const mod = (await import(join(srcDir, name))) as Record<string, unknown>
      for (const [key, value] of Object.entries(mod)) {
        if (key.startsWith('register') && owned.has(value)) offenders.push(`${name} re-exports ${key}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('B-15 — the CHANGELOG names the changed behaviours', () => {
  it('mentions the driver check at boot and the configuration file mode', async () => {
    const changelog = await readFile(fileURLToPath(new URL('../../../CHANGELOG.md', import.meta.url)), 'utf8')
    expect(changelog).toMatch(/not conformant|conformance/i)
    expect(changelog).toMatch(/0600/)
  })
})
