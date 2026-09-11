// The authenticated pass, over app-server. Closes report §11.2, .3, .4, .5.
//
// Runs against the REAL account armed in codex-home-real, with the user's
// explicit go-ahead. Deliberately cheap: one short turn per question, the
// smallest model on the lowest effort. Output goes to raw-auth/ (gitignored)
// because it carries account identifiers and plan data.
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
mkdirSync(path.join(here, 'raw-auth'), { recursive: true })
mkdirSync(path.join(here, 'work-real'), { recursive: true })

const child = spawn(path.join(here, 'node_modules/.bin/codex'), ['app-server', '--stdio'], {
  cwd: path.join(here, 'work-real'),
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    HOME: path.join(here, 'isolated-home'),
    CODEX_HOME: path.join(here, 'codex-home-real'),
    PATH: '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    TERM: 'dumb', NO_COLOR: '1', CI: '1',
  },
})

const stderrLines = []
child.stderr.on('data', (d) => stderrLines.push(String(d).trimEnd()))

let nextId = 1
const pending = new Map()
const notifications = []
const serverRequests = []
let buf = ''
let finished

child.stdout.on('data', (d) => {
  buf += d
  let i
  while ((i = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    let m
    try {
      m = JSON.parse(line)
    } catch {
      continue
    }
    if (m.id !== undefined && m.method) {
      serverRequests.push(m)
      console.log('  << SERVER REQUEST', m.method)
      // Approve command execution so the turn can finish; anything else gets {}.
      const decision = /equestApproval|Approval$/.test(m.method) ? { decision: 'accept' } : {}
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: m.id, result: decision })}\n`)
      continue
    }
    if (m.id !== undefined) {
      const p = pending.get(m.id)
      pending.delete(m.id)
      p?.(m.error ? { __error: m.error } : m.result)
      continue
    }
    notifications.push(m)
    if (m.method === 'turn/completed' || m.method === 'turn/failed') finished?.()
  }
})

const req = (method, params = {}) =>
  new Promise((res) => {
    const id = nextId++
    pending.set(id, res)
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  })

const out = {}
out.initialize = await req('initialize', { clientInfo: { name: 'adestia-spike', title: 'Adestia spike', version: '0.0.0' } })
child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })}\n`)

// §11.4 — the cheapest "am I armed?" question, and §11.2/.3.
for (const m of ['account/read', 'account/rateLimits/read', 'account/usage/read', 'model/list', 'modelProvider/capabilities/read']) {
  const t0 = Date.now()
  out[m] = await req(m, {})
  out[`${m} __ms`] = Date.now() - t0
  console.log(`  ${m}: ${Date.now() - t0} ms${out[m]?.__error ? ' ERROR' : ''}`)
}

// §11.1 + §11.5 — one real turn, read-only sandbox, asked to run a write that
// the sandbox must refuse. Does the client stream show the refusal?
const thread = await req('thread/start', {
  cwd: path.join(here, 'work-real'),
  approvalPolicy: 'never',
  sandbox: 'read-only',
})
out.threadStart = thread
const threadId = thread.thread?.id ?? thread.threadId
console.log('  thread', threadId)

const done = new Promise((r) => {
  finished = r
})
out.turnStart = await req('turn/start', {
  threadId,
  effort: 'low',
  input: [{
    type: 'text',
    text: 'Run exactly this shell command, nothing else, then tell me in one short sentence what happened: echo hi > sandbox-probe.txt',
  }],
})
await Promise.race([done, new Promise((r) => setTimeout(r, 180000))])
out.notifications = notifications
out.serverRequests = serverRequests
out.stderr = stderrLines
out.notificationMethods = [...new Set(notifications.map((n) => n.method))]

writeFileSync(path.join(here, 'raw-auth', 'real-appserver.json'), `${JSON.stringify(out, null, 2)}\n`)
console.log('  notification methods:', JSON.stringify(out.notificationMethods))
console.log('written raw-auth/real-appserver.json')
child.kill()
process.exit(0)
