// `codex login` (no flag) with piped stdio: what does a server-side driver get?
// Killed after 12 s; no approval is ever given, so no credential is created.
import { spawn } from 'node:child_process'
import { writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const home = path.join(here, 'codex-home-login2')
rmSync(home, { recursive: true, force: true })
mkdirSync(home, { recursive: true })

const child = spawn(path.join(here, 'node_modules/.bin/codex'), ['login'], {
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
child.stdout.on('data', (d) => (out += `[stdout] ${d}`))
child.stderr.on('data', (d) => (out += `[stderr] ${d}`))
await new Promise((r) => setTimeout(r, 12000))
child.kill('SIGKILL')
writeFileSync(path.join(here, 'raw', 'login-default-flow.txt'), out)
console.log(out || '(nothing printed in 12 s)')
process.exit(0)
