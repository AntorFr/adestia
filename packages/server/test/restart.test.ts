/**
 * Restarting the instance without killing the process that runs it.
 *
 * Two halves, and the second is the one that earns the feature. The route
 * decides WHETHER to restart — and its one rule is that a turn in flight is
 * work somebody is waiting for. The boot loop decides whether a new instance
 * can actually follow the old one in the same process, which is the claim the
 * whole design rests on: if `close()` left the port or the tools socket
 * behind, the button would be a quit button after all.
 *
 * That second half is why this was built in-process rather than as a
 * supervised child: a leak fails this file, on every run, instead of being
 * discovered by somebody running containers by hand.
 */

import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import type { Driver, DriverDescriptor, TurnEvent } from '@antorfr/adestia-drivers'

import { buildApp, type AppDependencies } from '../src/app.js'
import { registerRestart } from '../src/routes/restart.js'
import { parseConfig } from '../src/config.js'
import { start } from '../src/start.js'

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

async function instance(extra: Partial<AppDependencies> = {}) {
  const asked: { count: number } = { count: 0 }
  const deps: AppDependencies = {
    config: { ...parseConfig('auth:\n  mode: none\n'), dataDir: await mkdtemp(join(tmpdir(), 'adestia-restart-')) },
    driver: new Bare(),
    plugins: [],
    pluginProblems: [],
    restart: () => {
      asked.count += 1
    },
    ...extra,
  }
  return { app: await buildApp(deps), asked }
}

describe('who may ask for a restart', () => {
  it('is not offered at all by an app nobody can restart', async () => {
    // Every test that builds the app bare is that instance, and so is an
    // embedder that owns no boot loop. A button promising a restart nobody
    // would perform is worse than no button.
    const { app } = await instance({ restart: undefined })
    expect((await app.inject({ method: 'POST', url: '/api/restart' })).statusCode).toBe(404)
  })

  it('accepts, and asks only after the answer has left', async () => {
    // A response written after the server is gone is a dropped connection —
    // which is exactly what a FAILED restart looks like. The screen could not
    // tell the two apart.
    const { app, asked } = await instance()
    const response = await app.inject({ method: 'POST', url: '/api/restart' })
    expect(response.statusCode).toBe(202)
    expect(response.json()).toEqual({ restarting: true })

    await new Promise((resolve) => setImmediate(resolve))
    expect(asked.count).toBe(1)
  })
})

describe('a turn in flight', () => {
  /**
   * The guard on its own, with a counter a test can move.
   *
   * `registerRestart` is where the rule lives, so this is where it is
   * asserted — driving a real turn through the limiter to reach the same
   * branch would test the limiter, and the rule would go along for the ride.
   */
  async function guarded(running: () => number) {
    const app = Fastify({ logger: false })
    let asked = 0
    registerRestart(app, { running, restart: () => { asked += 1 } })
    await app.ready()
    return { app, asked: () => asked }
  }

  it('refuses, and says how many are running', async () => {
    // A turn is work somebody is waiting for. Tearing the server down under
    // it loses that work with nothing to show for it.
    const { app, asked } = await guarded(() => 2)
    const response = await app.inject({ method: 'POST', url: '/api/restart' })
    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ error: '2 turns are running', running: 2 })

    await new Promise((resolve) => setImmediate(resolve))
    expect(asked()).toBe(0)
    await app.close()
  })

  it('counts in the singular when there is one', async () => {
    const { app } = await guarded(() => 1)
    expect((await app.inject({ method: 'POST', url: '/api/restart' })).json().error).toBe(
      '1 turn is running',
    )
    await app.close()
  })

  it('goes ahead when the operator overrules it, and says what it cut', async () => {
    // `force` is how somebody overrules the guard deliberately, rather than
    // by not knowing it was there.
    const { app, asked } = await guarded(() => 3)
    const response = await app.inject({
      method: 'POST',
      url: '/api/restart',
      payload: { force: true },
    })
    expect(response.statusCode).toBe(202)
    expect(response.json()).toEqual({ restarting: true, interrupted: 3 })

    await new Promise((resolve) => setImmediate(resolve))
    expect(asked()).toBe(1)
    await app.close()
  })
})

describe('closing while somebody is watching', () => {
  it('finishes, instead of waiting on a stream that never ends', async () => {
    // The defect the restart button exposed, and it predates it. The change
    // feed is a response that stays open for as long as a shell is looking,
    // and Fastify waits for requests in flight — so `close()` never returned,
    // the new instance never booted, and `docker stop` left with code 137,
    // killed. Measured against the image on 2026-09-23.
    const dir = await mkdtemp(join(tmpdir(), 'adestia-close-'))
    const file = join(dir, 'adestia.config.yaml')
    await writeFile(
      file,
      `host: 127.0.0.1\nport: 0\ndataDir: ${dir}/data\nauth:\n  mode: none\nworkspace:\n  root: ${dir}/ws\n`,
      'utf8',
    )
    const running = await start({
      configPath: file,
      cwd: dir,
      driverFactory: () => new Bare(),
      log: () => undefined,
    })

    const stream = await fetch(`${running.url}/api/events`)
    expect(stream.ok).toBe(true)
    const reader = stream.body!.getReader()
    await reader.read() // the ": connected" frame — now it is really subscribed

    // A deadline rather than a bare await: a hang here is the failure, and a
    // test that hangs reports nothing at all.
    const outcome = await Promise.race([
      running.close().then(() => 'closed' as const),
      new Promise<'hung'>((resolve) => setTimeout(() => resolve('hung'), 5000)),
    ])
    expect(outcome).toBe('closed')
    await reader.cancel().catch(() => undefined)
  }, 30_000)
})

describe('the boot loop, which is the whole claim', () => {
  it('closes and starts again in the same process, three times over', async () => {
    // If `close()` left the listening socket or the tools socket behind, the
    // second boot would fail with EADDRINUSE and the button would be a quit
    // button. Three cycles rather than one: a leak that only bites on the
    // second reuse is the kind that ships.
    const dir = await mkdtemp(join(tmpdir(), 'adestia-reboot-'))
    const file = join(dir, 'adestia.config.yaml')
    await writeFile(
      file,
      // Port 0 asks the OS for a free one, so this never collides with
      // whatever else the machine is running — including another copy of
      // this suite.
      `host: 127.0.0.1\nport: 0\ndataDir: ${dir}/data\nauth:\n  mode: none\nworkspace:\n  root: ${dir}/ws\n`,
      'utf8',
    )
    const boot = () =>
      start({ configPath: file, cwd: dir, driverFactory: () => new Bare(), log: () => undefined })

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const running = await boot()
      const health = await fetch(`${running.url}/api/health`)
      expect(health.ok).toBe(true)
      await running.close()
    }
  }, 60_000)

  it('serves the config as it reads AFTER the restart, not as it booted', async () => {
    // The point of the button: a value written by the settings screen is
    // what the next instance runs. Read back through the running server
    // rather than from the file, which would prove nothing.
    const dir = await mkdtemp(join(tmpdir(), 'adestia-reboot-conf-'))
    const file = join(dir, 'adestia.config.yaml')
    const conf = (polling: boolean) =>
      `host: 127.0.0.1\nport: 0\ndataDir: ${dir}/data\nauth:\n  mode: none\nworkspace:\n  root: ${dir}/ws\n  watch:\n    polling: ${polling}\n`

    await writeFile(file, conf(false), 'utf8')
    const boot = () =>
      start({ configPath: file, cwd: dir, driverFactory: () => new Bare(), log: () => undefined })

    let running = await boot()
    expect(running.config.workspace.watch.polling).toBe(false)
    await running.close()

    await writeFile(file, conf(true), 'utf8')
    running = await boot()
    expect(running.config.workspace.watch.polling).toBe(true)
    await running.close()
  }, 60_000)
})
