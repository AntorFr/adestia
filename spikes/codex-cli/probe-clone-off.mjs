// Can the startup marketplace clone be turned off?
//
// The first version of this probe concluded "yes, `-c marketplaces=[]`" and was
// WRONG: that value makes codex refuse its own config ("invalid type: sequence,
// expected a map"), the process dies, and a dead process clones nothing. The
// absence of the clone was the absence of codex. So this version PROVES THE
// PROCESS IS ALIVE before it believes anything — it asks the running server for
// its config and only then looks at the disk.
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
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      HOME: path.join(here, 'isolated-home'),
      CODEX_HOME: home,
      PATH: '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
      TERM: 'dumb', NO_COLOR: '1', CI: '1',
    },
  })
  let out = ''
  let err = ''
  child.stdout.on('data', (d) => (out += d))
  child.stderr.on('data', (d) => (err += d))

  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'adestia-spike', title: 'spike', version: '0.0.0' } } })}\n`)
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })}\n`)
  await new Promise((r) => setTimeout(r, 3000))

  const alive = out.includes('"result"') && child.exitCode === null
  if (!alive) {
    console.log(`  ${label}: SERVER DID NOT START — ${err.trim().split('\n')[0] || 'no answer to initialize'}`)
    child.kill()
    await new Promise((r) => setTimeout(r, 300))
    return
  }
  await new Promise((r) => setTimeout(r, 22000))
  console.log(`  ${label}: server alive, clone = ${existsSync(path.join(home, '.tmp/plugins/.git')) ? 'PRESENT' : 'absent'}`)
  child.kill()
  await new Promise((r) => setTimeout(r, 400))
}

await run('no switch (control)      ', [])
await run('-c marketplaces=[]       ', ['-c', 'marketplaces=[]'])
await run('-c marketplaces={}       ', ['-c', 'marketplaces={}'])
await run('--disable remote_plugin  ', ['--disable', 'remote_plugin'])
await run('-c plugins={}            ', ['-c', 'plugins={}'])
process.exit(0)
