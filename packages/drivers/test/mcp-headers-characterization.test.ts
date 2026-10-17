/** Pins the three engines' outbound configurations before R-1's extraction. */
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { PassThrough } from 'node:stream'

import { afterEach, describe, expect, it } from 'vitest'

import { ClaudeCodeDriver } from '../src/claude-code/driver.js'
import { CodexDriver } from '../src/codex-cli/driver.js'
import type { SpawnImpl } from '../src/codex-cli/protocol.js'
import { CopilotDriver } from '../src/copilot-cli/driver.js'
import type { Driver, McpServer, TurnRequest } from '../src/contract.js'

const auth = { tokenUrl: 'https://auth.example/token', clientId: 'instance' }
const declared: readonly McpServer[] = [
  { name: 'public', url: 'https://public.example/mcp' },
  { name: 'static', url: 'https://static.example/mcp', headers: { Authorization: 'fixed', 'X-Extra': 'kept' } },
  { name: 'user', url: 'https://user.example/mcp', identity: 'user', auth, headers: { Authorization: 'old', 'X-Extra': 'kept' } },
  { name: 'signed', url: 'https://signed.example/mcp', identity: 'user', signIn: 'oauth', auth, headers: { Authorization: 'old' } },
  { name: 'machine', url: 'https://machine.example/mcp', identity: 'machine', auth, headers: { Authorization: 'old', 'X-Extra': 'kept' } },
  { name: 'default-machine', url: 'https://default.example/mcp', auth },
  { name: 'unavailable', url: 'https://unavailable.example/mcp', auth: { ...auth, tokenUrl: 'https://auth.example/refused' }, headers: { Authorization: 'old' } },
  // Token selection is HTTP-only, even if a stdio declaration carries auth.
  { name: 'local', command: 'node', identity: 'user', signIn: 'oauth', auth, headers: { Authorization: 'unused' } },
]

type Servers = Record<string, { headers?: Record<string, string>; http_headers?: Record<string, string> }>
type Headers = Record<string, Record<string, string> | undefined>
type TurnTokens = Pick<TurnRequest, 'callerToken' | 'serverTokens'>

const homes: string[] = []
afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

async function collect(driver: Driver, request: TurnRequest): Promise<void> {
  for await (const _event of driver.runTurn(request)) { /* Drive the entire turn. */ }
}

/** Observe the SDK options, JSON-RPC thread config, or CLI side file. */
async function configuration(engine: string, tokens: TurnTokens): Promise<{ headers: Headers; minted: string[] }> {
  const home = await mkdtemp(join(tmpdir(), 'adestia-mcp-headers-'))
  homes.push(home)
  const request = { prompt: 'hi', cwd: home, ...tokens }
  const minted: string[] = []
  const fetchImpl: typeof fetch = async (url) => {
    minted.push(String(url))
    return String(url) === auth.tokenUrl
      ? new Response(JSON.stringify({ access_token: 'instance-token', expires_in: 3600 }))
      : new Response('', { status: 401 })
  }
  const options = { mcpServers: declared, fetchImpl }
  let servers: Servers = {}

  if (engine === 'claude-code') {
    const driver = new ClaudeCodeDriver({
      ...options,
      query: ({ options }) => {
        servers = options?.['mcpServers'] as Servers
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: 'result', subtype: 'success', session_id: 's1' }
          },
          interrupt: async () => undefined,
        }
      },
    })
    await collect(driver, request)
  } else if (engine === 'codex-cli') {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const child = Object.assign(new EventEmitter(), { stdin, stdout, stderr: new PassThrough(), kill() {} })
    const lines = createInterface({ input: stdin })
    lines.on('line', (line) => {
      const message = JSON.parse(line)
      if (message.id === undefined) return
      if (message.method === 'thread/start') servers = message.params.config.mcp_servers
      const result = message.method === 'thread/start' ? { thread: { id: 's1' } } : {}
      stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n`)
      if (message.method === 'turn/start') {
        setImmediate(() => stdout.write(`${JSON.stringify({
          jsonrpc: '2.0', method: 'turn/completed', params: { turn: { status: 'completed' } },
        })}\n`))
      }
    })
    const spawnImpl: SpawnImpl = () => child
    try {
      await collect(new CodexDriver({ ...options, home, spawnImpl }), request)
    } finally {
      lines.close()
    }
  } else {
    const stdout = new PassThrough()
    const child = Object.assign(new EventEmitter(), { stdout, stderr: new PassThrough(), kill() {} })
    let started!: () => void
    const spawned = new Promise<void>((resolve) => { started = resolve })
    const spawnImpl = (() => { started(); return child }) as unknown as typeof import('node:child_process').spawn
    const turn = collect(new CopilotDriver({ ...options, home, spawnImpl }), request)
    await spawned
    stdout.write('{"type":"result","data":{"sessionId":"s1","exitCode":0}}\n')
    child.emit('close', 0)
    await turn
    servers = JSON.parse(await readFile(join(home, 'adestia-mcp.json'), 'utf8')).mcpServers
  }

  return {
    headers: Object.fromEntries(Object.entries(servers).map(([name, server]) => [name, server.headers ?? server.http_headers])),
    minted,
  }
}

const common: Headers = {
  public: undefined,
  static: { Authorization: 'fixed', 'X-Extra': 'kept' },
  machine: { Authorization: 'Bearer instance-token', 'X-Extra': 'kept' },
  'default-machine': { Authorization: 'Bearer instance-token' },
  local: undefined,
}

const cases: { name: string; tokens: TurnTokens; expected: Headers }[] = [
  { name: 'no person token: omit both user servers despite static headers and machine auth', tokens: {}, expected: common },
  {
    name: 'caller token: only the rebound user server receives it',
    tokens: { callerToken: 'caller-token' },
    expected: { ...common, user: { Authorization: 'Bearer caller-token', 'X-Extra': 'kept' } },
  },
  {
    name: 'background tokens: each user server takes only its named token',
    tokens: { serverTokens: { user: 'background-token', signed: 'proxy-token', machine: 'ignored' } },
    expected: { ...common, user: { Authorization: 'Bearer background-token', 'X-Extra': 'kept' }, signed: { Authorization: 'Bearer proxy-token' } },
  },
  {
    name: 'caller wins over background, while signIn takes its own token',
    tokens: { callerToken: 'caller-token', serverTokens: { user: 'background-token', signed: 'proxy-token' } },
    expected: { ...common, user: { Authorization: 'Bearer caller-token', 'X-Extra': 'kept' }, signed: { Authorization: 'Bearer proxy-token' } },
  },
  {
    name: 'an empty caller token does not fall back; an empty signIn token omits its server',
    tokens: { callerToken: '', serverTokens: { user: 'background-token', signed: '' } },
    expected: common,
  },
]

describe.each(['claude-code', 'codex-cli', 'copilot-cli'])('%s MCP header characterization', (engine) => {
  it.each(cases)('$name', async ({ tokens, expected }) => {
    const result = await configuration(engine, tokens)
    expect(result.headers).toEqual(expected)
    expect(result.minted).toEqual([auth.tokenUrl, 'https://auth.example/refused'])
    // The drivers must not replace the operator's original headers in place.
    expect(declared[2]?.headers).toEqual({ Authorization: 'old', 'X-Extra': 'kept' })
  })
})
