/**
 * The settings screen's two routes, end to end over the real app.
 *
 * `settings-file.test.ts` holds the document surgery; this file holds what a
 * browser is entitled to. Three properties, each a decision rather than a
 * detail:
 *
 * - an instance with no config file behind it mounts NO route at all, rather
 *   than a form that would write somewhere invented;
 * - a key the catalogue does not declare is refused — `driver.command` is a
 *   binary this server spawns, and a browser is not the place that names it;
 * - the answer reads the FILE back rather than echoing the request, so what
 *   the screen shows after a save is what the next boot will read.
 */

import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import type { Driver, DriverDescriptor, TurnEvent } from '@antorfr/adestia-drivers'

import { buildApp, type AppDependencies } from '../src/app.js'
import { parseConfig } from '../src/config.js'

class Bare implements Driver {
  describe(): Promise<DriverDescriptor> {
    return Promise.resolve({ id: 'bare', label: 'Bare', cliVersion: '0', capabilities: [] })
  }
  env(): Promise<Readonly<Record<string, string>>> {
    return Promise.resolve({})
  }
  listModels(): Promise<readonly { id: string }[]> {
    return Promise.resolve([])
  }
  async *runTurn(): AsyncIterable<TurnEvent> {
    return
  }
  interrupt(): Promise<void> {
    return Promise.resolve()
  }
}

const CONFIG = `# Written by hand, and it stays that way.
auth:
  mode: none
workspace:
  # Set polling on a mount native file events cannot cross.
  watch:
    enabled: true
    polling: false
`

async function instance(source = CONFIG, withFile = true) {
  const dir = await mkdtemp(join(tmpdir(), 'adestia-settings-route-'))
  const file = join(dir, 'adestia.config.yaml')
  if (withFile) await writeFile(file, source, 'utf8')
  const deps: AppDependencies = {
    config: { ...parseConfig(source), dataDir: dir },
    driver: new Bare(),
    plugins: [],
    pluginProblems: [],
    ...(withFile ? { configPath: file } : {}),
  }
  return { app: await buildApp(deps), file }
}

describe('an instance with no config file behind it', () => {
  it('mounts no settings route at all', async () => {
    // Absent is a decision, not a gap: a form with no file behind it would
    // write somewhere invented.
    const { app } = await instance(CONFIG, false)
    const response = await app.inject({ method: 'GET', url: '/api/settings' })
    expect(response.statusCode).toBe(404)
  })
})

describe('what the browser is told', () => {
  it('names the file, the catalogue, and what is set in it', async () => {
    const { app, file } = await instance()
    const body = (await app.inject({ method: 'GET', url: '/api/settings' })).json()

    expect(body.file).toBe(file)
    expect(body.writable).toBe(true)
    expect(body.revision).not.toBe('')
    expect(body.groups.length).toBeGreaterThan(0)

    const values = Object.fromEntries(
      body.values.map((view: { path: string[]; value: unknown; source: string }) => [
        view.path.join('.'),
        [view.value, view.source],
      ]),
    )
    expect(values['workspace.watch.polling']).toEqual([false, 'file'])
    // Nobody wrote this one, so it is the instance's own answer rather than a
    // decision — and the screen has to be able to say which.
    expect(values['workspace.watch.intervalMs']).toEqual([2000, 'default'])
  })
})

describe('what a save is allowed to do', () => {
  it('writes the key and hands back the file as it now reads', async () => {
    const { app, file } = await instance()
    const before = (await app.inject({ method: 'GET', url: '/api/settings' })).json()

    const response = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: {
        changes: [{ path: ['workspace', 'watch', 'polling'], value: true }],
        revision: before.revision,
      },
    })
    expect(response.statusCode).toBe(200)

    const after = response.json()
    expect(after.revision).not.toBe(before.revision)
    const polling = after.values.find(
      (view: { path: string[] }) => view.path.join('.') === 'workspace.watch.polling',
    )
    expect(polling).toEqual({ path: ['workspace', 'watch', 'polling'], value: true, source: 'file' })

    // And on disk, with the operator's comments still theirs.
    const text = await readFile(file, 'utf8')
    expect(text).toMatch(/polling: true/)
    expect(text).toContain('# Written by hand, and it stays that way.')
    expect(text).toContain('native file events cannot cross')
  })

  it('refuses a key the catalogue does not declare, and leaves the file alone', async () => {
    const { app, file } = await instance()
    const before = await readFile(file, 'utf8')
    const response = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { changes: [{ path: ['driver', 'command'], value: '/bin/sh' }] },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toMatch(/not a setting this screen may change/)
    expect(await readFile(file, 'utf8')).toBe(before)
  })

  it('answers 409 when the file moved under the screen', async () => {
    // A distinct status because there is a distinct thing to do: reload, not
    // retry. Retrying would undo whatever the terminal just wrote.
    const { app, file } = await instance()
    const before = (await app.inject({ method: 'GET', url: '/api/settings' })).json()
    await writeFile(file, `${CONFIG}locale: fr\n`, 'utf8')

    const response = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: {
        changes: [{ path: ['workspace', 'watch', 'polling'], value: true }],
        revision: before.revision,
      },
    })
    expect(response.statusCode).toBe(409)
    expect(response.json().kind).toBe('stale')
    expect(await readFile(file, 'utf8')).toContain('locale: fr')
  })

  it('refuses a body that is not a list of changes', async () => {
    const { app } = await instance()
    const response = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { changes: 'polling' },
    })
    expect(response.statusCode).toBe(400)
  })
})
