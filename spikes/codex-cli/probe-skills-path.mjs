// Adestia delivers plugin agent-contracts as FILES in a folder the driver names
// (`skillsPath()`): `.github/skills` for Copilot. Which folder does codex read
// in a WORKSPACE? Candidates planted, then `skills/list` asked.
import { spawn } from 'node:child_process'
import { rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const ws = path.join(here, 'work-skills')
const home = path.join(here, 'codex-home-skills')
rmSync(ws, { recursive: true, force: true })
rmSync(home, { recursive: true, force: true })
mkdirSync(home, { recursive: true })

const CANDIDATES = ['.codex/skills', 'skills', '.agents/skills', '.github/skills', '.codex/plugins/skills']
for (const [i, dir] of CANDIDATES.entries()) {
  const p = path.join(ws, dir, `probe${i}`)
  mkdirSync(p, { recursive: true })
  writeFileSync(path.join(p, 'SKILL.md'), `---\nname: probe${i}\ndescription: planted in ${dir}\n---\n\nMarker for ${dir}.\n`)
}

const child = spawn(path.join(here, 'node_modules/.bin/codex'), ['app-server', '--stdio'], {
  cwd: ws,
  stdio: ['pipe', 'pipe', 'ignore'],
  env: {
    HOME: path.join(here, 'isolated-home'), CODEX_HOME: home,
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
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1)
    if (!line) continue
    let m
    try { m = JSON.parse(line) } catch { continue }
    if (m.id !== undefined && !m.method) { pending.get(m.id)?.(m.error ? { __error: m.error } : m.result); pending.delete(m.id) }
  }
})
const req = (method, params = {}) => new Promise((res) => {
  const myId = id++
  pending.set(myId, res)
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: myId, method, params })}\n`)
})

await req('initialize', { clientInfo: { name: 'adestia-spike', title: 'spike', version: '0.0.0' } })
child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })}\n`)
await new Promise((r) => setTimeout(r, 1500))

const listed = await req('skills/list', {})
const found = new Set()
for (const group of listed?.data ?? []) {
  for (const skill of group.skills ?? []) {
    if (/^probe\d$/.test(skill.name ?? '')) found.add(`${skill.name} <- ${skill.path ?? skill.dir ?? '?'}`)
  }
}
console.log('planted:', CANDIDATES.join(', '))
console.log('picked up by codex:', found.size ? [...found].join('\n  ') : 'NONE of them')
console.log()
console.log('all skills codex sees (names):', (listed?.data ?? []).flatMap((g) => (g.skills ?? []).map((s) => s.name)).join(', '))

// Second question: can a folder be declared at runtime instead?
const extra = await req('skills/extraRoots/set', { roots: [path.join(ws, 'skills')] })
console.log('\nskills/extraRoots/set ->', JSON.stringify(extra).slice(0, 200))
await new Promise((r) => setTimeout(r, 1200))
const after = await req('skills/list', {})
const names = (after?.data ?? []).flatMap((g) => (g.skills ?? []).map((s) => s.name))
console.log('after extraRoots, probe skills visible:', names.filter((n) => /^probe\d$/.test(n)).join(', ') || 'none')
child.kill()
process.exit(0)
