/**
 * The MCP wiring, as something a browser may read and — in one layer — write.
 *
 * Three properties are what this file exists to hold, and each was a decision
 * argued before it was code:
 *
 * - a secret NEVER leaves the server, and a masked value coming back means
 *   "the one you are holding" rather than six bullet characters;
 * - only the layer the shell wrote is writable, and a name already taken is
 *   refused rather than resolved by precedence;
 * - what is stored goes through the CONFIG's own grammar, so there is no
 *   looser second way into this instance's wiring.
 */

import { describe, expect, it } from 'vitest'
import type { Driver, DriverDescriptor, TurnEvent } from '@antorfr/adestia-drivers'

import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildApp, type AppDependencies } from '../src/app.js'
import { parseConfig } from '../src/config.js'
import { McpStore, MCP_MASK, maskServer, unmaskServer } from '../src/mcp-store.js'

/** A driver reduced to nothing: these routes never touch one. */
class Bare implements Driver {
  describe(): Promise<DriverDescriptor> {
    return Promise.resolve({
      id: 'bare',
      label: 'Bare',
      cliVersion: '0',
      capabilities: [],
    })
  }
  env(): Promise<Readonly<Record<string, string>>> {
    return Promise.resolve({})
  }
  listModels(): Promise<readonly { id: string }[]> {
    return Promise.resolve([])
  }
  // eslint-disable-next-line require-yield
  async *runTurn(): AsyncIterable<TurnEvent> {
    return
  }
  interrupt(): Promise<void> {
    return Promise.resolve()
  }
}

const CONFIG = `auth:
  mode: none
mcp:
  servers:
    - name: home-assistant
      url: https://ha.example/mcp
      headers:
        Authorization: Bearer hunter2
`

async function instance(source = CONFIG) {
  const dataDir = await mkdtemp(join(tmpdir(), 'adestia-mcp-'))
  const store = new McpStore(dataDir)
  const deps: AppDependencies = {
    config: { ...parseConfig(source), dataDir },
    driver: new Bare(),
    plugins: [
      {
        dir: '/nowhere',
        active: true,
        manifest: {
          id: 'todo',
          name: 'Todo',
          mcpServers: [{ name: 'todo-mcp', command: 'node', args: ['todo.js'] }],
        },
      } as unknown as AppDependencies['plugins'][number],
    ],
    pluginProblems: [],
    mcpStore: store,
  }
  return { app: await buildApp(deps), store, dataDir }
}

describe('what the browser is told', () => {
  it('names every layer, and which of them may be touched', async () => {
    const { app } = await instance()
    const body = (await app.inject({ method: 'GET', url: '/api/mcp/servers' })).json()
    expect(body.servers.map((server: { name: string; source: string; editable: boolean }) => [
      server.name,
      server.source,
      server.editable,
    ])).toEqual([
      ['home-assistant', 'config', false],
      ['todo-mcp', 'plugin', false],
    ])
  })

  it('never sends a credential, whatever it looks like', async () => {
    // Every env and header value goes, not the ones that look like a token:
    // which of them is a secret is the operator's knowledge, and guessing
    // wrong leaks the one that mattered.
    const { app } = await instance()
    const body = (await app.inject({ method: 'GET', url: '/api/mcp/servers' })).json()
    const shown = JSON.stringify(body)
    expect(shown).not.toContain('hunter2')
    expect(body.servers[0].config.headers.Authorization).toBe(MCP_MASK)
    // The KEY stays: a server is unreadable without it, and a key is wiring.
    expect(Object.keys(body.servers[0].config.headers)).toEqual(['Authorization'])
  })
})

describe('adding one from the shell', () => {
  it('stores it, and hands it to the driver without a restart', async () => {
    const { app, store } = await instance()
    const added = await app.inject({
      method: 'POST',
      url: '/api/mcp/servers',
      payload: { name: 'notion', command: 'npx', args: ['-y', 'notion-mcp'] },
    })
    expect(added.statusCode).toBe(200)
    // The very store the driver is asking, synchronously, at the spawn site.
    expect(store.current().map((server) => server.name)).toEqual(['notion'])

    const body = (await app.inject({ method: 'GET', url: '/api/mcp/servers' })).json()
    expect(body.servers.at(-1)).toMatchObject({ name: 'notion', source: 'ui', editable: true })
  })

  it('writes the file at 0600, because it can hold a bearer', async () => {
    const { app, dataDir } = await instance()
    await app.inject({
      method: 'POST',
      url: '/api/mcp/servers',
      payload: { name: 'hub', url: 'https://hub.example/mcp', headers: { Authorization: 'Bearer x' } },
    })
    const info = await stat(join(dataDir, 'mcp-servers.json'))
    expect(info.mode & 0o777).toBe(0o600)
    expect(await readFile(join(dataDir, 'mcp-servers.json'), 'utf8')).toContain('Bearer x')
  })

  it('refuses a name the config or a plugin already answers to', async () => {
    // A name is where the agent's tools live. Two servers answering to one is
    // a tool call going somewhere nobody chose.
    const { app } = await instance()
    for (const name of ['home-assistant', 'todo-mcp']) {
      const refused = await app.inject({
        method: 'POST',
        url: '/api/mcp/servers',
        payload: { name, command: 'node' },
      })
      expect(refused.statusCode).toBe(409)
      expect(refused.json().error).toContain('already declared')
    }
  })

  it('judges a proposal by the configuration file’s own grammar', async () => {
    const { app } = await instance()
    const bothTransports = await app.inject({
      method: 'POST',
      url: '/api/mcp/servers',
      payload: { name: 'confused', command: 'node', url: 'https://x.example' },
    })
    expect(bothTransports.statusCode).toBe(400)
    expect(bothTransports.json().error).toContain('pick one transport')

    const noTransport = await app.inject({
      method: 'POST',
      url: '/api/mcp/servers',
      payload: { name: 'empty' },
    })
    expect(noTransport.statusCode).toBe(400)
  })
})

describe('editing and removing', () => {
  it('keeps a secret the screen never saw', async () => {
    // The whole point of the mask travelling both ways: somebody fixes a typo
    // in a URL without being asked to re-type a token they may not have.
    const { app, store } = await instance()
    await app.inject({
      method: 'POST',
      url: '/api/mcp/servers',
      payload: { name: 'hub', url: 'https://hub.example/mcp', headers: { Authorization: 'Bearer real' } },
    })
    const saved = await app.inject({
      method: 'PUT',
      url: '/api/mcp/servers/hub',
      payload: {
        name: 'hub',
        url: 'https://hub.example/v2/mcp',
        headers: { Authorization: MCP_MASK },
      },
    })
    expect(saved.statusCode).toBe(200)
    expect(store.current()[0]).toMatchObject({
      url: 'https://hub.example/v2/mcp',
      headers: { Authorization: 'Bearer real' },
    })
  })

  it('refuses a mask standing in for nothing', async () => {
    // Bullets stored as a value would be a header sent to a server as six
    // bullet characters — a 401 blaming the server for a mistake made here.
    const { app } = await instance()
    const refused = await app.inject({
      method: 'POST',
      url: '/api/mcp/servers',
      payload: { name: 'hub', url: 'https://hub.example/mcp', headers: { Authorization: MCP_MASK } },
    })
    expect(refused.statusCode).toBe(400)
    expect(refused.json().error).toContain('no stored value')
  })

  it('will not touch a server it did not write', async () => {
    const { app } = await instance()
    for (const name of ['home-assistant', 'todo-mcp']) {
      expect(
        (await app.inject({ method: 'PUT', url: `/api/mcp/servers/${name}`, payload: { name, command: 'node' } }))
          .statusCode,
      ).toBe(404)
      expect((await app.inject({ method: 'DELETE', url: `/api/mcp/servers/${name}` })).statusCode).toBe(404)
    }
  })

  it('removes one it did write', async () => {
    const { app, store } = await instance()
    await app.inject({ method: 'POST', url: '/api/mcp/servers', payload: { name: 'notion', command: 'npx' } })
    expect((await app.inject({ method: 'DELETE', url: '/api/mcp/servers/notion' })).statusCode).toBe(200)
    expect(store.current()).toEqual([])
  })

  it('accepts a rename, and still refuses a collision', async () => {
    const { app, store } = await instance()
    await app.inject({ method: 'POST', url: '/api/mcp/servers', payload: { name: 'notion', command: 'npx' } })
    expect(
      (await app.inject({
        method: 'PUT',
        url: '/api/mcp/servers/notion',
        payload: { name: 'notion-v2', command: 'npx' },
      })).statusCode,
    ).toBe(200)
    expect(store.current().map((server) => server.name)).toEqual(['notion-v2'])

    expect(
      (await app.inject({
        method: 'PUT',
        url: '/api/mcp/servers/notion-v2',
        payload: { name: 'home-assistant', command: 'npx' },
      })).statusCode,
    ).toBe(409)
  })
})

describe('the store on its own', () => {
  it('yields the entries that parse rather than throwing', async () => {
    // An instance must boot. A server that cannot be read is a server that is
    // absent, which the screen can say; an exception is a screen that is not.
    const dataDir = await mkdtemp(join(tmpdir(), 'adestia-mcp-'))
    const store = new McpStore(dataDir)
    await store.save([{ name: 'good', command: 'node' }])
    const { writeFile } = await import('node:fs/promises')
    await writeFile(
      join(dataDir, 'mcp-servers.json'),
      JSON.stringify({ servers: [{ name: 'good', command: 'node' }, { nonsense: true }] }),
    )
    expect((await store.list()).map((server) => server.name)).toEqual(['good'])
  })

  it('reads an absent file as an empty list', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'adestia-mcp-'))
    expect(await new McpStore(dataDir).list()).toEqual([])
  })
})

describe('masking, on its own', () => {
  it('covers the three places a credential can hide', () => {
    const masked = maskServer({
      name: 'hub',
      url: 'https://hub.example/mcp',
      env: { TOKEN: 'secret' },
      headers: { Authorization: 'Bearer secret' },
      auth: {
        tokenUrl: 'https://hub.example/token',
        clientId: 'adestia',
        clientSecret: 'secret',
        scope: 'read',
      },
    })
    expect(JSON.stringify(masked)).not.toContain('secret')
    // What is NOT a credential stays readable: a screen that hid the scope
    // and the client id would be a screen nobody can check.
    expect(masked['auth']).toMatchObject({ clientId: 'adestia', scope: 'read' })
  })

  it('puts back only what came back as a mask', () => {
    const issues: string[] = []
    const filled = unmaskServer(
      { name: 'hub', env: { TOKEN: MCP_MASK, OTHER: 'typed' } },
      { name: 'hub', command: 'node', env: { TOKEN: 'secret', OTHER: 'old' } },
      issues,
    )
    expect(filled['env']).toEqual({ TOKEN: 'secret', OTHER: 'typed' })
    expect(issues).toEqual([])
  })
})
