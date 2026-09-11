// If one app-server per THREAD leaves a stale tools token (probe-mcp-per-turn),
// does one app-server per TURN restore the property Adestia relies on — and
// what does it cost in wall time?
//
// Each iteration: fresh process, thread/resume the SAME thread with a NEW token
// in the MCP server's env, one turn. Then count how many server processes were
// spawned: one per turn is the property; fewer means a stale token survives.
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const home = path.join(here, 'codex-home-freshturn')
const mcpLog = path.join(here, 'raw', 'mcp-spawns-fresh.jsonl')
const port = 45195
rmSync(home, { recursive: true, force: true })
mkdirSync(home, { recursive: true })
writeFileSync(mcpLog, '')

const mock = spawn(process.execPath, [
  path.join(here, 'mock-provider.js'), '--port', String(port),
  '--log', path.join(here, 'raw', 'mock-requests-freshturn.jsonl'), '--script', 'simple',
], { stdio: ['ignore', 'ignore', 'ignore'] })
await new Promise((r) => setTimeout(r, 800))

const providerCfg = {
  model_providers: { mock: { name: 'Mock', base_url: `http://127.0.0.1:${port}/v1`, wire_api: 'responses', env_key: 'MOCK_KEY' } },
}
const mcpCfg = (token) => ({
  mcp_servers: {
    adestia: {
      command: process.execPath,
      args: [path.join(here, 'mock-mcp-server.js')],
      env: { MOCK_MCP_LOG: mcpLog, ADESTIA_TOOLS_TOKEN: token },
    },
  },
})

const spawnsSoFar = () => readFileSync(mcpLog, 'utf8').split('\n').filter((l) => l.includes('"initialize"')).length

async function oneTurn(n, threadId) {
  const t0 = Date.now()
  const child = spawn(path.join(here, 'node_modules/.bin/codex'), ['app-server', '--stdio'], {
    cwd: path.join(here, 'work'),
    stdio: ['pipe', 'pipe', 'ignore'],
    env: {
      HOME: path.join(here, 'isolated-home'), CODEX_HOME: home,
      PATH: '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
      TERM: 'dumb', NO_COLOR: '1', CI: '1', MOCK_KEY: 'mock-secret',
    },
  })
  let id = 1
  const pending = new Map()
  let buf = ''
  let done
  const finished = new Promise((r) => { done = r })
  child.stdout.on('data', (d) => {
    buf += d
    let i
    while ((i = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1)
      if (!line) continue
      let m
      try { m = JSON.parse(line) } catch { continue }
      if (m.id !== undefined && m.method) {
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: m.id, result: {} })}\n`)
        continue
      }
      if (m.id !== undefined) { pending.get(m.id)?.(m.error ? { __error: m.error } : m.result); pending.delete(m.id); continue }
      if (m.method === 'turn/completed' || m.method === 'turn/failed') done()
    }
  })
  const req = (method, params = {}) => new Promise((res) => {
    const myId = id++
    pending.set(myId, res)
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: myId, method, params })}\n`)
  })

  await req('initialize', { clientInfo: { name: 'adestia-spike', title: 'spike', version: '0.0.0' } })
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })}\n`)
  const booted = Date.now() - t0

  const cfg = { ...providerCfg, ...mcpCfg(`token-for-turn-${n}`) }
  const t = threadId
    ? await req('thread/resume', { threadId, config: cfg })
    : await req('thread/start', { cwd: path.join(here, 'work'), model: 'mock-model', modelProvider: 'mock', config: cfg })
  const realId = t.thread?.id ?? t.threadId ?? threadId
  await req('turn/start', { threadId: realId, input: [{ type: 'text', text: `turn ${n}` }] })
  await Promise.race([finished, new Promise((r) => setTimeout(r, 30000))])
  await new Promise((r) => setTimeout(r, 1200))
  console.log(`  turn ${n}: boot ${booted} ms, whole turn ${Date.now() - t0} ms, MCP spawns so far = ${spawnsSoFar()}`)
  child.kill()
  await new Promise((r) => setTimeout(r, 400))
  return realId
}

let threadId
for (const n of [1, 2, 3]) threadId = await oneTurn(n, threadId)

console.log('  distinct MCP server processes:', spawnsSoFar(), '(3 = one token per turn, the property holds)')
mock.kill()
process.exit(0)
