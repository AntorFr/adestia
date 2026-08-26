import { mkdtemp, mkdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Driver, DriverDescriptor, TurnEvent } from '@antorfr/golem-drivers'

import { start, loadConfigFile, type StartedInstance } from '../src/start.js'

class StubDriver implements Driver {
  describe(): Promise<DriverDescriptor> {
    return Promise.resolve({
      id: 'stub',
      label: 'Stub',
      cliVersion: '0',
      capabilities: [],
    })
  }
  env(): Promise<Readonly<Record<string, string>>> {
    return Promise.resolve({})
  }
  // eslint-disable-next-line require-yield
  async *runTurn(): AsyncIterable<TurnEvent> {
    return
  }
  interrupt(): Promise<void> {
    return Promise.resolve()
  }
}

let root: string
let started: StartedInstance | undefined
let logs: string[]

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'golem-start-'))
  logs = []
})

afterEach(async () => {
  await started?.close()
  started = undefined
})

/** Port 0 lets the OS pick a free one, so tests never collide. */
const boot = async (config: string, file = 'golem.config.yaml') => {
  await writeFile(join(root, file), `${config}\nport: 0\n`)
  started = await start({
    cwd: root,
    configPath: file,
    driverFactory: () => new StubDriver(),
    log: (message) => logs.push(message),
  })
  return started
}

describe('configuration loading', () => {
  it('runs on defaults when no config file exists', async () => {
    // A missing file is a legitimate first run, not an error to fix.
    const config = await loadConfigFile(join(root, 'absent.yaml'))
    expect(config.auth.mode).toBe('none')
    expect(config.host).toBe('127.0.0.1')
  })

  it('surfaces a malformed config instead of starting half-configured', async () => {
    await writeFile(join(root, 'bad.yaml'), 'prt: 8080\n')
    await expect(
      start({ cwd: root, configPath: 'bad.yaml', driverFactory: () => new StubDriver() }),
    ).rejects.toThrow(/unknown setting "prt"/)
  })

  it('refuses an unavailable driver rather than falling back', async () => {
    // Silently running a different CLI than the operator configured is
    // indefensible: they would debug the wrong engine.
    await writeFile(join(root, 'other.yaml'), 'driver:\n  id: gemini-cli\nport: 0\n')
    await expect(start({ cwd: root, configPath: 'other.yaml' })).rejects.toThrow(
      /is not available in this build \(have: claude-code, copilot-cli\)/,
    )
  })

  it('starts on the copilot driver without needing its binary present', async () => {
    // Building the driver must not run the CLI: an instance configured for an
    // engine that is not installed yet should still come up and say so, rather
    // than refusing to boot.
    await writeFile(join(root, 'copilot.yaml'), 'driver:\n  id: copilot-cli\nport: 0\n')
    started = await start({ cwd: root, configPath: 'copilot.yaml', log: () => undefined })
    const instance = (await started.app.inject({ url: '/api/instance' })).json()
    expect(instance.driver.label).toBe('GitHub Copilot CLI')
    expect(instance.driver.capabilities).toContain('authManagement')
  })
})

describe('startup', () => {
  it('listens and answers health', async () => {
    const instance = await boot('auth:\n  mode: none')
    const response = await instance.app.inject({ url: '/api/health' })
    expect(response.json()).toEqual({ status: 'ok' })
  })

  it('reports where it listens and how it authenticates', async () => {
    await boot('auth:\n  mode: proxy')
    expect(logs.join('\n')).toMatch(/listening on http:\/\/127\.0\.0\.1:\d+ \(auth: proxy\)/)
  })

  it('shouts when an ungated instance is not on loopback', async () => {
    // The one warning worth shouting: an ungated agent reachable from the
    // network is a shell anyone can drive.
    await boot('host: 0.0.0.0\nauth:\n  mode: none')
    expect(logs.join('\n')).toContain('WARNING: auth is disabled')
  })

  it('stays quiet about loopback with auth disabled', async () => {
    await boot('auth:\n  mode: none')
    expect(logs.join('\n')).not.toContain('WARNING')
  })
})

describe('workspace', () => {
  it('creates the agent home on a first run', async () => {
    // Spawning a CLI into a missing directory fails with a message blaming the
    // BINARY, which sends the operator debugging their platform instead of
    // their path. Creating it costs one line.
    const instance = await boot('workspace:\n  root: ./ws')
    expect((await stat(join(root, 'ws'))).isDirectory()).toBe(true)
    expect(logs.join('\n')).toContain('created workspace at')
    expect(instance.config.workspace.root).toBe(join(root, 'ws'))
  })

  it('resolves the workspace to an absolute path', async () => {
    // A relative cwd at spawn time would depend on where the server was
    // started from, which is not a property anyone should have to know.
    const instance = await boot('workspace:\n  root: ./ws')
    expect(instance.config.workspace.root.startsWith('/')).toBe(true)
  })

  it('refuses a workspace root that is a file', async () => {
    await writeFile(join(root, 'notadir'), 'x')
    await expect(boot('workspace:\n  root: ./notadir')).rejects.toThrow(/is not a directory/)
  })
})

describe('extensions at boot', () => {
  const writePlugin = async (id: string, manifest: unknown | string) => {
    const dir = join(root, 'plugins', id)
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'golem-plugin.json'),
      typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
    )
  }

  it('counts what is active out of what was found', async () => {
    await writePlugin('a', { schemaVersion: 1, id: 'a', kind: 'app', description: 'A.' })
    await writePlugin('b', { schemaVersion: 1, id: 'b', kind: 'app', description: 'B.' })
    await boot('extensions:\n  apps: [a]')
    expect(logs.join('\n')).toContain('1 of 2 plugin(s) active')
  })

  it('reports a refused plugin before the port opens', async () => {
    await writePlugin('broken', '{ not json')
    const instance = await boot('extensions:\n  apps: [broken]')
    expect(logs.join('\n')).toMatch(/extension "broken" refused: .*not valid JSON/)
    // And the instance still serves — a broken plugin costs its view, not the server.
    expect((await instance.app.inject({ url: '/api/health' })).statusCode).toBe(200)
  })

  it('warns about a configured skin that is not installed', async () => {
    // Not fatal — the shell falls back — but silence would mean running under
    // another body's name and icon without ever being told.
    await boot('extensions:\n  skin: amber')
    expect(logs.join('\n')).toContain('skin "amber" is configured but was not found')
  })

  it('does not warn about the default skin', async () => {
    // The inventory line legitimately counts skins; what must not appear is
    // the "configured but not found" warning.
    await boot('auth:\n  mode: none')
    expect(logs.join('\n')).not.toContain('was not found')
  })
})

describe('what the instance installs as', () => {
  const writeSkin = async (id: string, fragment: unknown) => {
    await mkdir(join(root, 'skins', id), { recursive: true })
    await writeFile(
      join(root, 'skins', id, 'golem-skin.json'),
      JSON.stringify({ schemaVersion: 1, id, description: 'A body.', manifest: './web.manifest' }),
    )
    await writeFile(join(root, 'skins', id, 'web.manifest'), JSON.stringify(fragment))
  }

  const manifestOf = async (instance: StartedInstance) =>
    JSON.parse((await instance.app.inject({ url: '/manifest.webmanifest' })).body) as Record<
      string,
      unknown
    >

  it("wears the skin's name, so two instances are two installs", async () => {
    await writeSkin('amber', { name: 'Skippy', short_name: 'Skippy', theme_color: '#080a0d' })
    const manifest = await manifestOf(await boot('extensions:\n  skin: amber'))
    expect(manifest['name']).toBe('Skippy')
    expect(manifest['theme_color']).toBe('#080a0d')
  })

  it("keeps the product's own manifest when no skin is worn", async () => {
    const manifest = await manifestOf(await boot('auth:\n  mode: none'))
    expect(manifest['name']).toBe('Golem')
    expect(manifest['start_url']).toBe('/')
  })

  it('names the fields a skin declared off contract', async () => {
    // Read at BOOT rather than when a browser asks: a fragment half off
    // contract belongs beside the other extension problems, not swallowed
    // into a request nobody watches.
    await writeSkin('amber', { name: 'Skippy', start_url: '/hud' })
    const manifest = await manifestOf(await boot('extensions:\n  skin: amber'))
    expect(manifest['start_url']).toBe('/')
    expect(logs.join('\n')).toContain('off contract, ignored: start_url')
  })

  it("still installs when the skin's fragment is unreadable", async () => {
    // The product's manifest is the floor. A livery that ships a broken one
    // costs its name, never the install.
    await mkdir(join(root, 'skins', 'amber'), { recursive: true })
    await writeFile(
      join(root, 'skins', 'amber', 'golem-skin.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: 'amber',
        description: 'A body.',
        manifest: './web.manifest',
      }),
    )
    await writeFile(join(root, 'skins', 'amber', 'web.manifest'), '{ not json')
    const manifest = await manifestOf(await boot('extensions:\n  skin: amber'))
    expect(manifest['name']).toBe('Golem')
    expect(logs.join('\n')).toContain('web manifest not read')
  })
})
