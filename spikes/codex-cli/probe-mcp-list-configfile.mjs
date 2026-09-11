// Does mcpServerStatus/list report servers that live in config.toml?
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const child = spawn(path.join(here, 'node_modules/.bin/codex'), ['app-server', '--stdio'], {
  cwd: path.join(here, 'work'),
  stdio: ['pipe', 'pipe', 'inherit'],
  env: {
    HOME: path.join(here, 'isolated-home'),
    CODEX_HOME: path.join(here, 'codex-home-mcp'),
    PATH: '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    TERM: 'dumb', NO_COLOR: '1', CI: '1',
  },
})
let id = 1
const pending = new Map()
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
      pending.get(m.id)?.(m.error ? { __error: m.error } : m.result)
      pending.delete(m.id)
    }
  }
})
const req = (method, params = {}) =>
  new Promise((res) => {
    const myId = id++
    pending.set(myId, res)
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: myId, method, params })}\n`)
  })

await req('initialize', { clientInfo: { name: 'adestia-spike', title: 'spike', version: '0.0.0' } })
child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })}\n`)
await new Promise((r) => setTimeout(r, 3000))
console.log('mcpServerStatus/list =', JSON.stringify(await req('mcpServerStatus/list', {}), null, 1))
child.kill()
process.exit(0)
