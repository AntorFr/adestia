// Read-only app-server queries, captured in full (no truncation, no mock needed).
// Proves which capability sources answer WITHOUT an OpenAI account.
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
    CODEX_HOME: path.join(here, 'codex-home-appserver'),
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
      const p = pending.get(m.id)
      pending.delete(m.id)
      p?.(m.error ? { __error: m.error } : m.result)
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
for (const m of [
  'model/list', 'account/read', 'mcpServerStatus/list', 'permissionProfile/list',
  'config/read', 'skills/list', 'experimentalFeature/list', 'thread/list',
  'modelProvider/capabilities/read', 'configRequirements/read', 'hooks/list',
  'account/usage/read', 'account/rateLimits/read',
]) {
  out[m] = await req(m, {})
}
writeFileSync(path.join(here, 'raw', 'app-server-queries.json'), `${JSON.stringify(out, null, 2)}\n`)
console.log('written raw/app-server-queries.json')
child.kill()
process.exit(0)
