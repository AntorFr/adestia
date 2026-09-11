// Is the plugin-marketplace clone a property of the provider, or just a
// background fetch that short runs outlive? Fresh CODEX_HOME, long-lived
// app-server, no turn at all.
import { spawn } from 'node:child_process'
import { existsSync, rmSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const home = path.join(here, 'codex-home-clone')
rmSync(home, { recursive: true, force: true })
mkdirSync(home, { recursive: true })

const child = spawn(path.join(here, 'node_modules/.bin/codex'), ['app-server', '--stdio'], {
  cwd: path.join(here, 'work'),
  stdio: ['pipe', 'ignore', 'ignore'],
  env: {
    HOME: path.join(here, 'isolated-home'),
    CODEX_HOME: home,
    PATH: '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    TERM: 'dumb', NO_COLOR: '1', CI: '1',
  },
})
child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'adestia-spike', title: 'spike', version: '0.0.0' } } })}\n`)
child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })}\n`)

for (const s of [2, 5, 10, 20, 30]) {
  await new Promise((r) => setTimeout(r, s * 1000 - (s === 2 ? 0 : 0)))
  console.log(`  after ~${s}s cumulative wait: marketplace clone = ${existsSync(path.join(home, '.tmp/plugins/.git')) ? 'PRESENT' : 'absent'}`)
  if (existsSync(path.join(home, '.tmp/plugins/.git'))) break
}
child.kill()
process.exit(0)
