import { chmod, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Fastify from 'fastify'
import { beforeEach, describe, expect, it } from 'vitest'

import type { DiscoveredPlugin } from '../src/extensions.js'
import { mountPluginApis, runSetups } from '../src/plugin-host.js'

let root: string
const logs: string[] = []
const log = (message: string) => void logs.push(message)

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'golem-host-'))
  logs.length = 0
})

async function plugin(
  id: string,
  manifest: Partial<DiscoveredPlugin['manifest']> = {},
  active = true,
): Promise<DiscoveredPlugin> {
  const dir = join(root, id)
  await mkdir(dir, { recursive: true })
  return {
    manifest: { schemaVersion: 1, id, kind: 'app', description: 'x', ...manifest },
    dir,
    active,
  }
}

const writeScript = async (dir: string, name: string, body: string, executable = true) => {
  const path = join(dir, name)
  await writeFile(path, `#!/bin/sh\n${body}\n`)
  if (executable) await chmod(path, 0o755)
  return path
}

const writeApi = async (dir: string, body: string) => {
  await writeFile(join(dir, 'api.mjs'), body)
}

describe('setup scripts', () => {
  it('runs one that an active plugin declares', async () => {
    const p = await plugin('workbench', { setup: './setup' })
    await writeScript(p.dir, 'setup', 'echo "wired up"')

    expect(await runSetups([p], log)).toEqual([])
    expect(logs.join('\n')).toContain('wired up')
  })

  it('never runs an inactive plugin', async () => {
    // Consistent with having no tile and shipping no code: presence on disk
    // was never activation, and running a command is the worst place to get
    // that wrong.
    const p = await plugin('off', { setup: './setup' }, false)
    await writeScript(p.dir, 'setup', 'echo "should not run"')

    expect(await runSetups([p], log)).toEqual([])
    expect(logs.join('\n')).not.toContain('should not run')
  })

  it('runs at every boot, so scripts must be idempotent', async () => {
    const p = await plugin('counter', { setup: './setup' })
    await writeScript(p.dir, 'setup', `echo x >> ${join(root, 'runs.txt')}`)

    await runSetups([p], log)
    await runSetups([p], log)
    expect((await readFile(join(root, 'runs.txt'), 'utf8')).trim().split('\n')).toHaveLength(2)
  })

  it('distinguishes "not executable" from "failed"', async () => {
    // Very different fixes, and a permission bit is the more common one.
    const p = await plugin('x', { setup: './setup' })
    await writeScript(p.dir, 'setup', 'true', false)

    const problems = await runSetups([p], log)
    expect(problems[0]?.reason).toContain('not executable')
  })

  it('reports a failing setup without refusing to boot', async () => {
    // An instance held hostage by its least important part is worse than one
    // missing a plugin.
    const p = await plugin('x', { setup: './setup' })
    await writeScript(p.dir, 'setup', 'exit 3')

    const problems = await runSetups([p], log)
    expect(problems[0]).toMatchObject({ id: 'x' })
    expect(problems[0]?.reason).toContain('setup failed')
  })

  it('ignores a plugin that declares none', async () => {
    expect(await runSetups([await plugin('quiet')], log)).toEqual([])
  })
})

describe('plugin APIs', () => {
  const build = async (plugins: readonly DiscoveredPlugin[]) => {
    const app = Fastify()
    const problems = await mountPluginApis(app, plugins, {
      workspaceRoot: join(root, 'workspace'),
      dataDir: join(root, 'data'),
      scheduleEnabled: false,
    })
    await app.ready()
    return { app, problems }
  }

  it('mounts an active plugin under its own prefix', async () => {
    const p = await plugin('workbench', { api: './api.mjs' })
    await writeApi(
      p.dir,
      `export default async function (app) { app.get('/cutlist', async () => ({ ok: true })) }`,
    )

    const { app, problems } = await build([p])
    expect(problems).toEqual([])
    expect((await app.inject({ url: '/api/plugin/workbench/cutlist' })).json()).toEqual({ ok: true })
    await app.close()
  })

  it('cannot shadow the product’s own routes', async () => {
    // A plugin registering /api/turn would break the chat, and the failure
    // would look like the product breaking rather than a plugin misbehaving.
    const p = await plugin('greedy', { api: './api.mjs' })
    await writeApi(
      p.dir,
      `export default async function (app) { app.post('/api/turn', async () => ({ hijacked: true })) }`,
    )

    const { app } = await build([p])
    // It landed under the prefix, not at the root.
    expect((await app.inject({ method: 'POST', url: '/api/turn' })).statusCode).toBe(404)
    expect(
      (await app.inject({ method: 'POST', url: '/api/plugin/greedy/api/turn' })).json(),
    ).toEqual({ hijacked: true })
    await app.close()
  })

  it('mounts nothing for an inactive plugin', async () => {
    const p = await plugin('off', { api: './api.mjs' }, false)
    await writeApi(p.dir, `export default async function (app) { app.get('/x', async () => 'x') }`)

    const { app } = await build([p])
    expect((await app.inject({ url: '/api/plugin/off/x' })).statusCode).toBe(404)
    await app.close()
  })

  it('keeps serving when a plugin’s API will not import', async () => {
    const broken = await plugin('broken', { api: './api.mjs' })
    await writeApi(broken.dir, 'this is not javascript {{{')
    const good = await plugin('good', { api: './api.mjs' })
    await writeApi(good.dir, `export default async function (app) { app.get('/ok', async () => 'ok') }`)

    const { app, problems } = await build([broken, good])
    expect(problems.map((p) => p.id)).toEqual(['broken'])
    expect((await app.inject({ url: '/api/plugin/good/ok' })).statusCode).toBe(200)
    await app.close()
  })

  it('names the shape it expected when the export is wrong', async () => {
    const p = await plugin('odd', { api: './api.mjs' })
    await writeApi(p.dir, 'export default { notAFunction: true }')

    const { problems } = await build([p])
    expect(problems[0]?.reason).toContain('default-export a Fastify plugin')
  })

  it('hands a plugin paths, and nothing that reaches the engine', async () => {
    // Enough to find files; nothing that reaches the driver, the secret store
    // or another plugin's data.
    const p = await plugin('aware', { api: './api.mjs' })
    await writeApi(
      p.dir,
      `export default async function (app, opts) {
         app.get('/who', async () => ({
           id: opts.pluginId,
           keys: Object.keys(opts).filter((k) => k !== 'prefix').sort(),
         }))
       }`,
    )

    const { app } = await build([p])
    const body = (await app.inject({ url: '/api/plugin/aware/who' })).json()
    expect(body.id).toBe('aware')
    expect(body.keys).toEqual([
      'dataDir',
      'pluginDir',
      'pluginId',
      'scheduleEnabled',
      'workspaceRoot',
    ])
    await app.close()
  })
})
