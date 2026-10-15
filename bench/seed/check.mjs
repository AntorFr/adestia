#!/usr/bin/env node
/**
 * Does each seed show what docs/ecrans.md says it must? One launcher per seed,
 * a list of named measures, and a non-zero exit that names every measure that
 * failed — `check: base › mcp servers: …`.
 *
 *   node bench/seed/check.mjs [--seed <name>[,<name>…]]    (default: all of them)
 *
 * Needs a built server (`npm run build`). The measures read the product's own
 * API; nothing is mocked and nothing is written but through the routes.
 */
import { spawn } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { dirname, join } from 'node:path'
import { argv, execPath, exit } from 'node:process'
import { fileURLToPath } from 'node:url'

import { SESSION_SECRET, CONVERSATIONS } from './_base.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const launcher = join(here, '..', 'launch.mjs')
const SEEDS = ['base', 'empty', 'config-writable', 'config-readonly', 'oidc']

class Failure extends Error {}
const expect = (condition, message) => {
  if (!condition) throw new Failure(message)
}

const flag = argv.indexOf('--seed')
const wanted = flag === -1 ? SEEDS : (argv[flag + 1] ?? '').split(',').filter(Boolean)
for (const name of wanted) if (!SEEDS.includes(name)) (console.error(`check: no seed named ${name} (${SEEDS.join(', ')})`), exit(2))

// ── launching ───────────────────────────────────────────────────────────────
function launch(seed) {
  const child = spawn(execPath, [launcher, '--engine', 'fake', '--seed', seed], { stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (chunk) => (stderr += chunk))
  const url = new Promise((resolve, reject) => {
    let out = ''
    child.stdout.on('data', (chunk) => {
      out += chunk
      const found = /listening on (\S+)/.exec(out)
      if (found) resolve(found[1])
    })
    child.once('exit', (code) => reject(new Failure(`the launcher exited (${code}) before answering: ${stderr.trim().split('\n').slice(-3).join(' | ')}`)))
  })
  const stop = () =>
    new Promise((done) => {
      if (child.exitCode !== null) return done()
      child.once('exit', done)
      child.kill('SIGTERM')
    })
  return { url, stop }
}

// ── reading ─────────────────────────────────────────────────────────────────
const get = async (base, path, init) => {
  const response = await fetch(`${base}${path}`, init)
  const text = await response.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { status: response.status, body }
}

/** Sends a message and returns the events the turn rendered (the SSE stream). */
async function turn(base, prompt, conversationId, { stopAfter } = {}) {
  const response = await fetch(`${base}/api/turn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt, conversationId }),
  })
  const events = []
  let buffer = ''
  const decoder = new TextDecoder()
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true })
    for (let end; (end = buffer.indexOf('\n\n')) !== -1; ) {
      const frame = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      const data = frame.split('\n').find((line) => line.startsWith('data: '))
      if (data) events.push(JSON.parse(data.slice(6)))
    }
    if (stopAfter && events.some(stopAfter) && !events.stopped) {
      events.stopped = true
      await get(base, '/api/turn/stop', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conversation: conversationId }),
      })
    }
  }
  return events
}

const newConversation = async (base, title) =>
  (await get(base, '/api/conversations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) })).body.id

const contextLevel = (tokens) => (tokens >= 120_000 ? 'hot' : tokens >= 60_000 ? 'warn' : 'calm')
const titles = (list) => list.map((entry) => entry.title)

// ── measures ────────────────────────────────────────────────────────────────
/** Every seed that has an engine answers these. */
const common = {
  'health answers ok': async (base) => expect((await get(base, '/api/health')).body?.status === 'ok', '/api/health did not answer ok'),
}

const chat = {
  'a finished turn renders text and a result': async (base) => {
    const events = await turn(base, 'fini', await newConversation(base, 'fini'))
    expect(events.some((e) => e.type === 'text-delta') && events.at(-1)?.type === 'result', `got ${events.map((e) => e.type)}`)
  },
  'a tool turn renders a successful and a failed outcome': async (base) => {
    const events = await turn(base, 'outil', await newConversation(base, 'outil'))
    const results = events.filter((e) => e.type === 'tool-result').map((e) => e.ok)
    expect(results.includes(true) && results.includes(false), `tool results were ${JSON.stringify(results)}`)
  },
  'an error turn renders an error': async (base) => {
    const events = await turn(base, 'erreur', await newConversation(base, 'erreur'))
    expect(events.some((e) => e.type === 'error'), `got ${events.map((e) => e.type)}`)
  },
  'a permission turn renders the question and waits until stopped': async (base) => {
    const id = await newConversation(base, 'permission')
    const events = await turn(base, 'permission', id, { stopAfter: (e) => e.type === 'permission-request' })
    expect(events.some((e) => e.type === 'permission-request' && e.title), 'no permission-request')
    expect(events.at(-1)?.type === 'result' && events.at(-1).stopped, 'the turn did not end stopped')
  },
  'a signature turn renders a consent and a grant, and files both cards': async (base) => {
    const id = await newConversation(base, 'signature')
    const events = await turn(base, 'signature', id)
    const kinds = events.filter((e) => e.type === 'signature-request').map((e) => e.kind)
    expect(kinds.includes('consent') && kinds.includes('grant'), `signature kinds were ${JSON.stringify(kinds)}`)
    const filed = (await get(base, `/api/conversations/${id}`)).body.messages.flatMap((m) => m.signatures ?? [])
    expect(filed.length === 2, `${filed.length} signature card(s) filed, wanted 2`)
  },
  'the « en cours » script holds a turn open until the check stops it': async (base) => {
    const id = await newConversation(base, 'tenu ouvert')
    const pending = turn(base, 'en cours', id, { stopAfter: () => true })
    // The stop is sent from inside the stream; the list is read before it by asking at the first event.
    const events = await pending
    expect(events.at(-1)?.type === 'result' && events.at(-1).stopped, 'the turn ended without being stopped')
  },
  'the « long contexte » and « contexte moyen » scripts fill the pill at hot and warn': async (base) => {
    const hot = (await turn(base, 'long contexte', await newConversation(base, 'long'))).at(-1)?.usage?.contextTokens
    const warn = (await turn(base, 'contexte moyen', await newConversation(base, 'moyen'))).at(-1)?.usage?.contextTokens
    expect(contextLevel(hot) === 'hot', `long contexte weighs ${hot}`)
    expect(contextLevel(warn) === 'warn', `contexte moyen weighs ${warn}`)
  },
}

const populated = {
  'at least 12 pages': async (base) => {
    const pages = (await get(base, '/api/pages')).body.pages
    expect(pages.length >= 12, `${pages.length} page(s)`)
    expect(new Set(pages.map((p) => p.store)).size >= 2, 'pages come from one store only')
  },
  'conversations: running, unread, idle, archived, long': async (base) => {
    const list = (await get(base, '/api/conversations')).body.conversations
    const running = list.find((c) => c.title === 'Conversation en cours')
    expect(running?.turn === 'running', `"Conversation en cours" is ${running?.turn ?? 'absent'}, not running`)
    for (const title of ['Réponse non lue', 'Au repos', 'Longue']) expect(titles(list).includes(title), `no conversation "${title}"`)
    const archived = (await get(base, `/api/conversations/${CONVERSATIONS.archived}`)).body
    expect(archived.archived === true, 'the archived conversation is not archived')
    expect(!titles(list).includes('Archivée'), 'the archived conversation is listed')
    const long = (await get(base, `/api/conversations/${CONVERSATIONS.long}`)).body
    expect(contextLevel(long.messages.at(-1).usage?.contextTokens ?? 0) === 'hot', 'the long conversation is not hot')
    const warn = (await get(base, `/api/conversations/${CONVERSATIONS.warn}`)).body
    expect(contextLevel(warn.messages.at(-1).usage?.contextTokens ?? 0) === 'warn', 'the medium conversation is not warn')
  },
  'a thread with every bubble state': async (base) => {
    const { messages } = (await get(base, `/api/conversations/${CONVERSATIONS.rich}`)).body
    expect(messages.some((m) => m.tools?.some((t) => t.ok === false)), 'no failed tool outcome')
    expect(messages.some((m) => m.stopped), 'no interrupted turn')
    expect(messages.some((m) => m.error), 'no error')
    expect(messages.some((m) => m.after), 'no held message')
    expect(messages.some((m) => m.signatures?.length), 'no signature cards')
  },
  'five MCP servers, one per health': async (base) => {
    const states = (await get(base, '/api/mcp/status')).body.servers.map((s) => s.state)
    for (const state of ['connected', 'failed', 'needs-auth', 'pending', 'disabled']) expect(states.includes(state), `no server ${state}`)
    const servers = (await get(base, '/api/mcp/servers')).body.servers
    expect(servers.some((s) => s.source === 'config'), 'no server declared in the config file')
    expect(servers.some((s) => s.shadowed), 'no shadowed server')
    const connections = (await get(base, '/api/mcp/connections')).body.connections
    expect(connections.some((c) => c.connected) && connections.some((c) => !c.connected), 'sign-in servers are not one connected and one not')
  },
  'four delegations from two callers: running, done, failed': async (base) => {
    const rows = (await get(base, '/api/delegations')).body.delegations
    expect(rows.length >= 4, `${rows.length} delegation(s)`)
    expect(new Set(rows.map((r) => r.caller)).size >= 2, 'one caller only')
    expect(rows.some((r) => r.turn === 'running'), 'none running')
    const states = await Promise.all(rows.filter((r) => !r.turn).map(async (r) => (await get(base, `/api/delegations/${r.caller}/${r.id}`)).body.messages.at(-1)))
    expect(states.some((m) => m.error), 'none failed')
    expect(states.some((m) => m.role === 'agent' && !m.error), 'none done')
  },
  'a refused plugin and a degraded one': async (base) => {
    const instance = (await get(base, '/api/instance')).body
    expect(instance.pluginProblems.some((p) => p.id === 'bench-refused'), `problems were ${JSON.stringify(instance.pluginProblems.map((p) => p.id))}`)
    expect(instance.plugins.some((p) => p.id === 'bench-degraded'), 'the plugin missing its secret is not loaded')
  },
  'the brief holds four items of four target types': async (base) => {
    const brief = (await get(base, '/api/home/brief')).body
    const items = brief.items ?? []
    expect(items.length === 4 && new Set(items.map((i) => i.target?.type)).size === 4, `brief: ${JSON.stringify(items.map((i) => i.target?.type))}`)
  },
  'instruction catalogues: importable, empty, unreachable': async (base) => {
    const items = (await get(base, '/api/instruction-catalogues/outils/items')).body.items
    expect(items.some((i) => i.importable && !i.imported), 'no importable item in « outils »')
    expect((await get(base, '/api/instruction-catalogues/vide/items')).body.items?.length === 0, '« vide » is not empty')
    expect((await get(base, '/api/instruction-catalogues/injoignable/items')).status === 502, '« injoignable » is reachable')
  },
  'an instruction file delivered by a plugin, and an imported one': async (base) => {
    const delivered = (await get(base, '/api/instructions/.claude/skills/bench-notes-notes/SKILL.md')).body
    expect(delivered.managed === true, 'the plugin skill is missing or not managed')
    const files = (await get(base, '/api/instructions')).body.files
    expect(files.some((f) => f.source?.catalogue === 'outils'), 'no imported file carries its source')
    expect(files.some((f) => !f.source), 'no hand-written file')
  },
}

const exposes = (writable) => ({
  'the configuration is exposed': async (base) => {
    const { status, body } = await get(base, '/api/settings')
    expect(status === 200 && typeof body.file === 'string', `/api/settings answered ${status}`)
    expect(body.writable === writable, `writable is ${body.writable}, wanted ${writable}`)
  },
})
const credential = (state) => ({
  [`the credential is ${state}`]: async (base) => {
    const seen = (await get(base, '/api/auth/driver')).body.state
    expect(seen === state, `the credential is ${seen}`)
  },
})

const oidcMeasures = {
  'no session is refused with 401 « not signed in »': async (base) => {
    const { status, body } = await get(base, '/api/instance')
    expect(status === 401 && /not signed in/.test(JSON.stringify(body)), `got ${status} ${JSON.stringify(body)}`)
  },
  'a real sign-in through the provider opens a session (200)': async (base) => {
    const login = await fetch(`${base}/auth/login`, { redirect: 'manual' })
    expect(login.status === 302, `/auth/login answered ${login.status}`)
    const cookies = [login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')]
    const authorize = await fetch(login.headers.get('location'), { redirect: 'manual' })
    expect(authorize.status === 302, `the provider answered ${authorize.status}`)
    const callback = await fetch(authorize.headers.get('location'), { redirect: 'manual', headers: { cookie: cookies[0] } })
    expect(callback.status === 302, `/auth/callback answered ${callback.status}`)
    const session = callback.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
    const { status } = await get(base, '/api/instance', { headers: { cookie: session } })
    expect(status === 200, `/api/instance with the session answered ${status}`)
  },
  'a session of a refused group is answered 403 « not a member of an allowed group »': async (base) => {
    const payload = Buffer.from(JSON.stringify({ userId: 'bench-visiteur', displayName: 'Visiteur', groups: ['invites'], expiresAt: Date.now() + 3_600_000 })).toString('base64url')
    const cookie = `adestia_session=${payload}.${createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url')}`
    const { status, body } = await get(base, '/api/instance', { headers: { cookie } })
    expect(status === 403 && /not a member of an allowed group/.test(JSON.stringify(body)), `got ${status} ${JSON.stringify(body)}`)
  },
}

const MEASURES = {
  base: { ...common, ...populated, ...chat, ...credential('armed'), 'no configuration is exposed (404)': async (base) => expect((await get(base, '/api/settings')).status === 404, '/api/settings answered') },
  empty: {
    ...common, ...credential('absent'), ...exposes(true),
    'no plugin and no page': async (base) => {
      expect((await get(base, '/api/instance')).body.plugins.length === 0, 'a plugin is loaded')
      expect((await get(base, '/api/pages')).body.pages.length === 0, 'a page is listed')
    },
    'no conversation, server, delegation or catalogue': async (base) => {
      expect((await get(base, '/api/conversations')).body.conversations.length === 0, 'a conversation is listed')
      expect((await get(base, '/api/mcp/servers')).body.servers.length === 0, 'a server is listed')
      expect((await get(base, '/api/delegations')).body.delegations.length === 0, 'a delegation is listed')
      expect((await get(base, '/api/instruction-catalogues')).body.catalogues.length === 0, 'a catalogue is listed')
    },
    // Last: these write conversations.
    ...chat,
  },
  'config-writable': { ...common, ...populated, ...credential('armed'), ...exposes(true) },
  'config-readonly': { ...common, ...populated, ...credential('invalid'), ...exposes(false) },
  oidc: { ...common, ...oidcMeasures },
}

// ── running ─────────────────────────────────────────────────────────────────
// The provider of the oidc seed is served over a self-signed certificate.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const failures = []
for (const seed of wanted) {
  const instance = launch(seed)
  try {
    const base = await instance.url
    for (const [name, measure] of Object.entries(MEASURES[seed])) {
      try {
        await measure(base)
        console.log(`ok   ${seed} › ${name}`)
      } catch (error) {
        const message = `${seed} › ${name}: ${error instanceof Failure ? error.message : (error?.stack ?? error)}`
        failures.push(message)
        console.log(`FAIL ${message}`)
      }
    }
  } catch (error) {
    failures.push(`${seed} › launch: ${error.message}`)
    console.log(`FAIL ${seed} › launch: ${error.message}`)
  } finally {
    await instance.stop()
  }
}
if (failures.length > 0) {
  console.error(`check: ${failures.length} measure(s) failed\n${failures.map((f) => `  - ${f}`).join('\n')}`)
  exit(1)
}
console.log(`check: ${wanted.join(', ')} — every measure holds`)
