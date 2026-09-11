// MCP health as the app-server reports it: one server that works, one that
// cannot possibly handshake — both injected at START TIME (thread/start.config),
// never written into config.toml. That is the per-turn materialization Adestia
// needs, and this proves the CLI accepts it.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const child = spawn(path.join(here, 'node_modules/.bin/codex'), ['app-server', '--stdio'], {
  cwd: path.join(here, 'work'),
  stdio: ['pipe', 'pipe', 'inherit'],
  env: {
    HOME: path.join(here, 'isolated-home'),
    CODEX_HOME: path.join(here, 'codex-home-mcpstatus'),
    PATH: '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    TERM: 'dumb', NO_COLOR: '1', CI: '1',
  },
})

let id = 1
const pending = new Map()
const notifs = []
let buf = ''
child.stdout.on('data', (d) => {
  buf += d
  let i
  while ((i = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    const m = JSON.parse(line)
    if (m.id !== undefined && !m.method) {
      const p = pending.get(m.id)
      pending.delete(m.id)
      p?.(m.error ? { __error: m.error } : m.result)
    } else if (!m.id) {
      notifs.push(m)
    }
  }
})
const req = (method, params = {}) =>
  new Promise((res) => {
    const myId = id++
    pending.set(myId, res)
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: myId, method, params })}\n`)
  })

const out = {}
out.initialize = await req('initialize', { clientInfo: { name: 'adestia-spike', title: 'spike', version: '0.0.0' } })
child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })}\n`)

out.beforeThread = await req('mcpServerStatus/list', {})

out.threadStart = await req('thread/start', {
  cwd: path.join(here, 'work'),
  config: {
    mcp_servers: {
      good: { command: process.execPath, args: [path.join(here, 'mock-mcp-server.js')] },
      broken: { command: '/bin/echo', args: ['not-an-mcp-server'] },
    },
  },
})

// Startup is asynchronous; give the servers a moment, then ask.
await new Promise((r) => setTimeout(r, 4000))
out.afterThread = await req('mcpServerStatus/list', {})
out.notifications = notifs.filter((n) => /mcp/i.test(n.method ?? ''))

writeFileSync(path.join(here, 'raw', 'mcp-status.json'), `${JSON.stringify(out, null, 2)}\n`)
console.log('written raw/mcp-status.json')
child.kill()
process.exit(0)
