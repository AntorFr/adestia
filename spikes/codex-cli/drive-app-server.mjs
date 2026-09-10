// Drive `codex app-server` over stdio JSON-RPC, against the local mock provider.
//
// What it is trying to prove, in one run and with no OpenAI account:
//   - the protocol answers `initialize` and stays up
//   - `model/list`, `mcpServerStatus/list`, `account/read` return without auth
//   - a thread + turn run end to end, streaming notifications
//   - an escalated command produces a server->client APPROVAL REQUEST that the
//     turn waits on — the return channel `codex exec` does not have
//
// Usage: node drive-app-server.mjs [--script simple|escalate] [--deny]

import { spawn } from 'node:child_process'
import { appendFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i === -1 ? d : args[i + 1]
}
const script = opt('script', 'simple')
const deny = args.includes('--deny')
const port = 45189
const outPath = path.join(here, 'raw', `app-server-${script}${deny ? '-denied' : ''}.log`)
writeFileSync(outPath, '')
const log = (...a) => {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')
  appendFileSync(outPath, `${line}\n`)
  console.log(line)
}

// ---- the mock provider, in-process -----------------------------------------
const mock = spawn(process.execPath, [
  path.join(here, 'mock-provider.js'),
  '--port', String(port),
  '--log', path.join(here, 'raw', `mock-requests-appserver-${script}.jsonl`),
  '--script', script,
], { stdio: ['ignore', 'inherit', 'inherit'] })
await new Promise((r) => setTimeout(r, 800))

// ---- the app server --------------------------------------------------------
const codexHome = path.join(here, 'codex-home-appserver')
const child = spawn(
  path.join(here, 'node_modules/.bin/codex'),
  ['app-server', '--stdio'],
  {
    cwd: path.join(here, 'work'),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      HOME: path.join(here, 'isolated-home'),
      CODEX_HOME: codexHome,
      PATH: '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
      TERM: 'dumb',
      NO_COLOR: '1',
      CI: '1',
      MOCK_KEY: 'mock-secret',
    },
  },
)

child.stderr.on('data', (d) => log('[stderr]', String(d).trimEnd()))

let nextId = 1
const pending = new Map()
const notifications = []
let buf = ''

child.stdout.on('data', (d) => {
  buf += d
  let i
  while ((i = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      log('[unparsed]', line)
      continue
    }
    handle(msg)
  }
})

function send(obj) {
  child.stdin.write(`${JSON.stringify(obj)}\n`)
}

function request(method, params) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    send({ jsonrpc: '2.0', id, method, params })
  })
}

/** Server->client requests we answer, and how. */
function handle(msg) {
  if (msg.id !== undefined && msg.method) {
    log('<< SERVER REQUEST', msg.method, JSON.stringify(msg.params).slice(0, 400))
    // Vocabulary from CommandExecutionRequestApprovalResponse.json:
    // accept | acceptForSession | decline | cancel (+ two amendment shapes).
    const decision = deny ? 'decline' : 'accept'
    const result = msg.method.includes('equestApproval') || msg.method.endsWith('Approval') ? { decision } : {}
    log('>> answering', JSON.stringify(result))
    send({ jsonrpc: '2.0', id: msg.id, result })
    return
  }
  if (msg.id !== undefined) {
    const p = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) {
      log('<< ERROR for id', msg.id, JSON.stringify(msg.error).slice(0, 300))
      p?.reject(new Error(JSON.stringify(msg.error)))
    } else {
      p?.resolve(msg.result)
    }
    return
  }
  notifications.push(msg)
  log('<< notif', msg.method, JSON.stringify(msg.params ?? {}).slice(0, 300))
  if (msg.method === 'turn/completed' || msg.method === 'turn/failed') finished?.()
}

/** Resolved by the `turn/completed` notification. */
let finished

const done = (async () => {
  const init = await request('initialize', {
    clientInfo: { name: 'adestia-spike', title: 'Adestia spike', version: '0.0.0' },
  })
  log('== initialize result:', JSON.stringify(init).slice(0, 600))
  send({ jsonrpc: '2.0', method: 'initialized', params: {} })

  for (const m of ['model/list', 'mcpServerStatus/list', 'account/read', 'permissionProfile/list', 'account/rateLimits/read']) {
    try {
      const r = await request(m, {})
      log(`== ${m}:`, JSON.stringify(r).slice(0, 900))
    } catch (e) {
      log(`== ${m} FAILED:`, String(e).slice(0, 300))
    }
  }

  const thread = await request('thread/start', {
    cwd: path.join(here, 'work'),
    approvalPolicy: 'on-request',
    sandbox: 'read-only',
    model: 'mock-model',
    modelProvider: 'mock',
    config: {
      model_providers: {
        mock: { name: 'Mock', base_url: `http://127.0.0.1:${port}/v1`, wire_api: 'responses', env_key: 'MOCK_KEY' },
      },
    },
  })
  log('== thread/start:', JSON.stringify(thread).slice(0, 400))
  const threadId = thread.threadId ?? thread.thread_id ?? thread.thread?.id

  const turnDone = new Promise((resolve) => {
    finished = resolve
  })
  const turn = await request('turn/start', {
    threadId,
    input: [{ type: 'text', text: 'Say exactly: hello' }],
  })
  log('== turn/start returned:', JSON.stringify(turn).slice(0, 600))
  await turnDone
  log('== turn finished')
})()

const timeout = new Promise((r) => setTimeout(() => r('TIMEOUT'), 60000))
const outcome = await Promise.race([done.then(() => 'ok').catch((e) => `FAILED ${e}`), timeout])
log('== outcome:', String(outcome))
log('== notification methods seen:', JSON.stringify([...new Set(notifications.map((n) => n.method))]))
child.kill()
mock.kill()
process.exit(0)
