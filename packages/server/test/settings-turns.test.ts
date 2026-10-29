/**
 * The "Simultaneous turns" field (B-21, AD-25), tested from the criterion:
 * the catalogue and `config.ts` must agree on fallback and bounds, 5 saves and
 * is what the next boot reads, 0 and 17 are refused with the field's message.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { SETTING_GROUPS, type SettingSpec } from '@antorfr/adestia-schemas'

import { buildApp, type AppDependencies } from '../src/app.js'
import { parseConfig } from '../src/config.js'
import { ScriptedDriver } from './support/driver.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

afterEach(cleanTmp)

const CONFIG = `auth:
  mode: none
`

function field(): SettingSpec {
  const found = SETTING_GROUPS.flatMap((group) => group.settings).find(
    (spec) => spec.path.join('.') === 'maxConcurrentTurns',
  )
  if (!found) throw new Error('maxConcurrentTurns is not in the catalogue')
  return found
}

async function boot(source = CONFIG, file?: string) {
  const dir = file ? undefined : await tmpDir('adestia-settings-turns-')
  const path = file ?? join(dir!, 'adestia.config.yaml')
  if (!file) await writeFile(path, source, 'utf8')
  const config = parseConfig(await readFile(path, 'utf8'))
  const deps: AppDependencies = {
    config: { ...config, dataDir: dir ?? config.dataDir },
    driver: new ScriptedDriver([], { capabilities: [] }),
    plugins: [],
    pluginProblems: [],
    configPath: path,
  }
  return { app: await buildApp(deps), path }
}

async function put(app: Awaited<ReturnType<typeof boot>>['app'], value: unknown) {
  const before = (await app.inject({ method: 'GET', url: '/api/settings' })).json()
  return app.inject({
    method: 'PUT',
    url: '/api/settings',
    payload: { changes: [{ path: ['maxConcurrentTurns'], value }], revision: before.revision },
  })
}

describe('the catalogue entry against config.ts', () => {
  it('declares the numbers the owner was promised, in a group of its own', () => {
    const spec = field()
    expect(spec).toMatchObject({ kind: 'number', min: 1, max: 16, fallback: 3, applies: 'restart' })
    expect(spec.label).toBe('Simultaneous turns')
    const group = SETTING_GROUPS.find((g) => g.settings.includes(spec))
    expect(group?.id).toBe('turns')
    expect(group?.settings).toHaveLength(1)
  })

  it('falls back to what config.ts uses when nothing is written', () => {
    expect(parseConfig(CONFIG).maxConcurrentTurns).toBe(field().fallback)
  })

  it('accepts exactly the integers config.ts accepts inside its bounds', () => {
    const { min, max } = field() as { min: number; max: number }
    for (const ok of [min, max]) {
      expect(parseConfig(`${CONFIG}maxConcurrentTurns: ${ok}\n`).maxConcurrentTurns).toBe(ok)
    }
    // Below the catalogue's floor config.ts must refuse too, or the screen
    // would promise a value the next boot rejects.
    expect(() => parseConfig(`${CONFIG}maxConcurrentTurns: ${min - 1}\n`)).toThrow()
  })

  it('reports the same hand-edited file in the settings view as source file', async () => {
    const { app } = await boot(`${CONFIG}maxConcurrentTurns: 7\n`)
    const body = (await app.inject({ method: 'GET', url: '/api/settings' })).json()
    const view = body.values.find((v: { path: string[] }) => v.path[0] === 'maxConcurrentTurns')
    expect(view).toEqual({ path: ['maxConcurrentTurns'], value: 7, source: 'file' })
    const unset = await boot()
    const other = (await unset.app.inject({ method: 'GET', url: '/api/settings' })).json()
    expect(
      other.values.find((v: { path: string[] }) => v.path[0] === 'maxConcurrentTurns'),
    ).toEqual({ path: ['maxConcurrentTurns'], value: 3, source: 'default' })
  })
})

describe('saving the field', () => {
  it('writes 5, and an instance booted from that file reports turns.max 5', async () => {
    const { app, path } = await boot()
    const response = await put(app, 5)
    expect(response.statusCode).toBe(200)
    expect(await readFile(path, 'utf8')).toMatch(/maxConcurrentTurns: 5/)

    // Not live: the running limiter is still the old one (AD-25).
    const live = (await app.inject({ method: 'GET', url: '/api/instance' })).json()
    expect(live.turns.max).toBe(3)

    const restarted = await boot(undefined, path)
    const after = (await restarted.app.inject({ method: 'GET', url: '/api/instance' })).json()
    expect(after.turns.max).toBe(5)
  })

  it('accepts the two bounds', async () => {
    for (const value of [1, 16]) {
      const { app } = await boot()
      expect((await put(app, value)).statusCode).toBe(200)
    }
  })

  it('refuses 0 and 17 with the bound in the message, and leaves the file alone', async () => {
    for (const [value, message] of [
      [0, /at least 1/],
      [17, /at most 16/],
    ] as const) {
      const { app, path } = await boot()
      const before = await readFile(path, 'utf8')
      const response = await put(app, value)
      expect(response.statusCode).toBe(400)
      expect(response.json().error).toMatch(message)
      expect(await readFile(path, 'utf8')).toBe(before)
    }
  })

  it('refuses a fraction', async () => {
    for (const value of [2.5]) {
      const { app, path } = await boot()
      const before = await readFile(path, 'utf8')
      expect((await put(app, value)).statusCode).toBe(400)
      expect(await readFile(path, 'utf8')).toBe(before)
    }
  })
})
