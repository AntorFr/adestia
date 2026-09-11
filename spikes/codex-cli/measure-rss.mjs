// Resident memory of one codex process — the number that decided
// maxConcurrentTurns for Copilot (spike 4). Measured at idle, right after a
// turn, so it is a floor and not a peak.
import { spawn, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const child = spawn(path.join(here, 'node_modules/.bin/codex'), ['app-server', '--stdio'], {
  cwd: path.join(here, 'work'),
  stdio: ['pipe', 'pipe', 'ignore'],
  env: {
    HOME: path.join(here, 'isolated-home'),
    CODEX_HOME: path.join(here, 'codex-home-appserver'),
    PATH: '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    TERM: 'dumb', NO_COLOR: '1', CI: '1',
  },
})
child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'adestia-spike', title: 'spike', version: '0.0.0' } } })}\n`)
await new Promise((r) => setTimeout(r, 3000))

// The npm bin is a node loader that spawns the rust binary; measure both.
const out = execSync(`ps -o pid,rss,comm -p ${child.pid} ; pgrep -P ${child.pid} | xargs -I{} ps -o pid,rss,comm -p {}`, { encoding: 'utf8' })
for (const line of out.trim().split('\n')) {
  const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)
  if (m) console.log(`  pid ${m[1]}  ${(Number(m[2]) / 1024).toFixed(0)} MB  ${path.basename(m[3])}`)
  else console.log(`  ${line}`)
}
child.kill()
process.exit(0)
