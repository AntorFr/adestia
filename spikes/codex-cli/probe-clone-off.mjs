// Can the startup marketplace clone be turned off? Same wait, two switches.
import { spawn } from 'node:child_process'
import { existsSync, rmSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))

async function run(label, extraArgs) {
  const home = path.join(here, 'codex-home-cloneoff')
  rmSync(home, { recursive: true, force: true })
  mkdirSync(home, { recursive: true })
  const child = spawn(path.join(here, 'node_modules/.bin/codex'), ['app-server', '--stdio', ...extraArgs], {
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
  await new Promise((r) => setTimeout(r, 25000))
  console.log(`  ${label}: clone = ${existsSync(path.join(home, '.tmp/plugins/.git')) ? 'PRESENT' : 'absent'}`)
  child.kill()
  await new Promise((r) => setTimeout(r, 500))
}

await run('--disable remote_plugin', ['--disable', 'remote_plugin'])
await run('-c marketplaces=[]  ', ['-c', 'marketplaces=[]'])
process.exit(0)
