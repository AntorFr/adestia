// Adestia hands each turn a FRESH token for its own tools, and relies on the
// engine respawning the stdio MCP bridge every turn to deliver it
// (shell-tools-config.ts: "true by construction for copilot, whose binary is
// spawned per turn"). app-server is a daemon — is it still true here?
//
// Measured, not assumed: the stand-in MCP server logs every `initialize` it
// receives, so one line per spawn. Two turns on one thread, then a resumed
// thread, and we count.
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const home = path.join(here, 'codex-home-perturn')
const mcpLog = path.join(here, 'raw', 'mcp-spawns.jsonl')
const port = 45194
rmSync(home, { recursive: true, force: true })
mkdirSync(home, { recursive: true })
writeFileSync(mcpLog, '')

const mock = spawn(process.execPath, [
  path.join(here, 'mock-provider.js'), '--port', String(port),
  '--log', path.join(here, 'raw', 'mock-requests-perturn.jsonl'), '--script', 'simple',
], { stdio: ['ignore', 'ignore', 'ignore'] })
await new Promise((r) => setTimeout(r, 800))

const child = spawn(path.join(here, 'node_modules/.bin/codex'), ['app-server', '--stdio'], {
  cwd: path.join(here, 'work'),
  stdio: ['pipe', 'pipe', 'ignore'],
  env: {
    HOME: path.join(here, 'isolated-home'),
    CODEX_HOME: home,
    PATH: '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    TERM: 'dumb', NO_COLOR: '1', CI: '1', MOCK_KEY: 'mock-secret',
  },
})

let id = 1
const pending = new Map()
let buf = ''
let turnDone
const seen = []
child.stdout.on('data', (d) => {
  buf += d
  let i
  while ((i = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    let m
    try { m = JSON.parse(line) } catch { continue }
    if (m.id !== undefined && m.method) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: m.id, result: {} })}\n`)
      continue
    }
    if (m.id !== undefined) { pending.get(m.id)?.(m.error ? { __error: m.error } : m.result); pending.delete(m.id); continue }
    if (/mcpServer/.test(m.method ?? '')) seen.push(`${m.params?.name}:${m.params?.status}`)
    if (m.method === 'turn/completed' || m.method === 'turn/failed') turnDone?.()
  }
})
const req = (method, params = {}) => new Promise((res) => {
  const myId = id++
  pending.set(myId, res)
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: myId, method, params })}\n`)
})

const spawns = () => readFileSync(mcpLog, 'utf8').split('\n').filter((l) => l.includes('"initialize"')).length

const providerCfg = {
  model_providers: { mock: { name: 'Mock', base_url: `http://127.0.0.1:${port}/v1`, wire_api: 'responses', env_key: 'MOCK_KEY' } },
}

await req('initialize', { clientInfo: { name: 'adestia-spike', title: 'spike', version: '0.0.0' } })
child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })}\n`)

const thread = await req('thread/start', {
  cwd: path.join(here, 'work'),
  model: 'mock-model',
  modelProvider: 'mock',
  config: {
    ...providerCfg,
    mcp_servers: {
      adestia: {
        command: process.execPath,
        args: [path.join(here, 'mock-mcp-server.js')],
        env: { MOCK_MCP_LOG: mcpLog, ADESTIA_TOOLS_TOKEN: 'token-for-turn-1' },
      },
    },
  },
})
const threadId = thread.thread?.id ?? thread.threadId

for (const n of [1, 2]) {
  const done = new Promise((r) => { turnDone = r })
  await req('turn/start', { threadId, input: [{ type: 'text', text: `turn ${n}` }] })
  await Promise.race([done, new Promise((r) => setTimeout(r, 30000))])
  await new Promise((r) => setTimeout(r, 1500))
  console.log(`  after turn ${n}: MCP server spawns = ${spawns()}   statuses = ${JSON.stringify(seen)}`)
}

// Now resume the same thread with a DIFFERENT token in the server's env.
const resumed = await req('thread/resume', {
  threadId,
  config: {
    ...providerCfg,
    mcp_servers: {
      adestia: {
        command: process.execPath,
        args: [path.join(here, 'mock-mcp-server.js')],
        env: { MOCK_MCP_LOG: mcpLog, ADESTIA_TOOLS_TOKEN: 'token-for-turn-3' },
      },
    },
  },
})
console.log('  thread/resume ->', JSON.stringify(resumed).slice(0, 160))
const done3 = new Promise((r) => { turnDone = r })
await req('turn/start', { threadId: resumed?.thread?.id ?? threadId, input: [{ type: 'text', text: 'turn 3' }] })
await Promise.race([done3, new Promise((r) => setTimeout(r, 30000))])
await new Promise((r) => setTimeout(r, 1500))
console.log(`  after resumed turn 3: MCP server spawns = ${spawns()}`)

const tokens = existsSync(mcpLog)
  ? [...new Set(readFileSync(mcpLog, 'utf8').split('\n').filter(Boolean).map((l) => {
      try { return JSON.parse(l).in?.params?.clientInfo?.name ?? '' } catch { return '' }
    }))]
  : []
console.log('  (client names seen by the MCP server:', JSON.stringify(tokens), ')')
child.kill(); mock.kill()
process.exit(0)
