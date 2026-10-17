// Whole-system tests of `adestia-qualite-serveur` ("without a behaviour
// changed", B-1, P-13, docs/donnees.md), written from the need. The instance is
// launched as a developer launches it (`node bench/launch.mjs --engine fake`,
// the base seed: MCP on with token `bench-mcp-token-0000000000`, agent
// `alfred`), and driven through HTTP, MCP and a real browser. The files the
// gestures leave in dataDir are read back and compared with the formats of
// docs/donnees.md. Real Claude is not run here (no token in a container).
//
// Plan (need -> case -> proof):
//   B-1       the routes of the product answer                 -> HTTP statuses
//   turn      "ping" on the fake engine answers "pong"         -> stream + conversation jsonl
//   page      a page written on disk by the agent shows up     -> /api/pages, browser
//   P-13      /mcp: wrong or no token 401; ask_alfred -> job ->
//             status -> answer + task_id; a task_id continues; the caller
//             folder rule; a long request title is cut at 60  -> MCP + delegations jsonl
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { cleanTmp, tmpDir } from './support/tmp.js'

const launch = fileURLToPath(new URL('../../../bench/launch.mjs', import.meta.url))
const built =
  existsSync(fileURLToPath(new URL('../dist/src/start.js', import.meta.url))) &&
  existsSync(fileURLToPath(new URL('../../web/dist-web/index.html', import.meta.url)))
const TOKEN = 'bench-mcp-token-0000000000'

let child: ChildProcess | undefined
let url = ''
let base = ''

beforeAll(async () => {
  if (!built) return
  base = await tmpDir('qualite-serveur-')
  child = spawn(process.execPath, [launch, '--engine', 'fake', '--data', base], {
    env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: undefined },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  child.stdout!.on('data', (d: Buffer) => (out += d))
  child.stderr!.on('data', (d: Buffer) => (out += d))
  url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no "listening on" in 40s:\n${out}`)), 40_000)
    const tick = setInterval(() => {
      const m = /^listening on (http:\/\/\S+)$/m.exec(out)
      if (m) {
        clearInterval(tick)
        clearTimeout(timer)
        resolve(m[1]!)
      }
    }, 50)
    child!.on('exit', (c) => {
      clearInterval(tick)
      clearTimeout(timer)
      reject(new Error(`launcher exited ${c}:\n${out}`))
    })
  })
}, 60_000)

afterAll(async () => {
  if (child) {
    const exited = new Promise((r) => child!.on('exit', r))
    child.kill('SIGTERM')
    await exited
  }
  await cleanTmp()
})

const json = (path: string, body?: unknown, init: RequestInit = {}) =>
  fetch(`${url}${path}`, {
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
  })

const mcp = (body: unknown, headers: Record<string, string> = {}, token: string | null = TOKEN) =>
  fetch(`${url}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: JSON.stringify(body),
  })

const call = async (name: string, args: Record<string, unknown>, headers: Record<string, string> = {}) => {
  const res = await mcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, headers)
  const body = (await res.json()) as { result?: { content: { text: string }[] } }
  return body.result!.content[0]!.text
}

/** Asks alfred, polls the status tool until the answer comes; returns the answer text and the task id. */
const ask = async (args: Record<string, unknown>, headers: Record<string, string>) => {
  const started = await call('ask_alfred', { notify: false, ...args }, headers)
  const jobId = /job_id "([^"]+)"/.exec(started)![1]!
  for (let i = 0; i < 100; i++) {
    const status = await call('ask_alfred_status', { job_id: jobId })
    const task = /task_id: "([^"]+)"/.exec(status)
    if (task) return { started, answer: status.split('\n')[0]!, taskId: task[1]! }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('no answer in 10 s')
}

const jsonl = (file: string) =>
  readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as Record<string, unknown>)

describe.skipIf(!built)('B-1 · the routes of the product still answer', () => {
  it.each([
    '/api/health',
    '/api/instance',
    '/api/models',
    '/api/pages',
    '/api/pages/index',
    '/api/conversations',
    '/api/delegations',
    '/api/mcp/status',
    '/api/mcp/servers',
    '/api/mcp/connections',
    '/api/instructions',
    '/api/instruction-catalogues',
    '/api/home/brief',
  ])('GET %s answers 200', async (path) => {
    expect((await fetch(`${url}${path}`)).status).toBe(200)
  })

  it('GET /api/health says {"status":"ok"}', async () => {
    expect(await (await fetch(`${url}/api/health`)).json()).toEqual({ status: 'ok' })
  })

  it('an unknown API route is still a 404', async () => {
    expect((await fetch(`${url}/api/nothing-here`)).status).toBe(404)
  })
})

describe.skipIf(!built)('a real turn answers, and its conversation file has the documented shape', () => {
  it('"ping" gets "pong" and the jsonl holds meta, user message, agent message, session', async () => {
    const conv = (await (await json('/api/conversations', {})).json()) as { id: string }
    const res = await json('/api/turn', { prompt: 'ping', conversationId: conv.id })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('pong')

    const userhash = createHash('sha256').update('local').digest('hex').slice(0, 16)
    const file = join(base, 'data', 'conversations', userhash, `${conv.id}.jsonl`)
    const lines = jsonl(file)
    const types = lines.map((l) => l.type)
    expect(types[0]).toBe('meta')
    expect(lines[0]).toMatchObject({ type: 'meta', id: conv.id })
    expect(typeof lines[0]!.title).toBe('string')
    expect(typeof lines[0]!.updatedAt).toBe('string')
    const messages = lines.filter((l) => l.type === 'message')
    expect(messages.map((m) => [m.role, m.text])).toEqual([
      ['user', 'ping'],
      ['agent', 'pong'],
    ])
    for (const m of messages) {
      expect(typeof m.id).toBe('string')
      expect(typeof m.at).toBe('string')
    }
    expect(lines.filter((l) => l.type === 'session')).toHaveLength(1)
    expect(typeof lines.find((l) => l.type === 'session')!.sessionId).toBe('string')
  })
})

describe.skipIf(!built)('a page written by the agent appears', () => {
  const pagePath = 'agent/page-ecrite.md'
  const markdown = '---\ntitle: Page écrite par l’agent\n---\n\n# Page écrite par l’agent\n\nContenu posé hors de l’écran.\n'
  beforeAll(() => {
    if (!built) return
    mkdirSync(join(base, 'workspace', 'pages', 'agent'), { recursive: true })
    writeFileSync(join(base, 'workspace', 'pages', pagePath), markdown)
  })

  it('is listed by /api/pages with its store and title, and readable by path', async () => {
    const list = (await (await fetch(`${url}/api/pages`)).json()) as { pages: { path: string; store: string; title: string }[] }
    expect(list.pages.find((p) => p.path === pagePath)).toMatchObject({
      path: pagePath,
      store: 'perso',
      title: 'Page écrite par l’agent',
    })
    const page = (await (await fetch(`${url}/api/pages/${pagePath}`)).json()) as { markdown: string; editable: boolean }
    expect(page.markdown).toBe(markdown)
    expect(page.editable).toBe(true)
  })

  it('a path with no page is a 404', async () => {
    expect((await fetch(`${url}/api/pages/agent/absente.md`)).status).toBe(404)
  })

  it('shows on screen: the browser opens the page and reads its text', async () => {
    const requireHere = createRequire(import.meta.url)
    let playwright: any
    try {
      playwright = requireHere('playwright')
    } catch {
      const root = (await import('node:child_process')).execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
      playwright = createRequire(`${root}/`)('playwright')
    }
    const browser = await playwright.chromium.launch()
    try {
      const page = await browser.newPage()
      await page.goto(`${url}/#/page/${pagePath}`)
      await page.getByText('Contenu posé hors de l’écran.').waitFor({ timeout: 15_000 })
      expect(await page.getByText('Contenu posé hors de l’écran.').count()).toBe(1)
      const shots = process.env.QUALITE_SHOTS
      if (shots) await page.screenshot({ path: join(shots, 'page-ecrite.png') })
    } finally {
      await browser.close()
    }
  }, 60_000)
})

describe.skipIf(!built)('P-13 · an incoming delegation by ask_<name> comes through', () => {
  const dir = (caller: string) => join(base, 'data', 'delegations', 'conversations', caller)

  it('refuses a wrong token and a missing token with 401', async () => {
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/list' }
    expect((await mcp(body, {}, 'not-the-token')).status).toBe(401)
    expect((await mcp(body, {}, null)).status).toBe(401)
  })

  it('lists ask_alfred and ask_alfred_status', async () => {
    const res = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const names = ((await res.json()) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(['ask_alfred', 'ask_alfred_status']))
  })

  it('answers "pong" with a task_id, and the thread is stored under the caller folder', async () => {
    const { started, answer, taskId } = await ask({ prompt: 'ping' }, { 'x-adestia-caller': 'qa' })
    expect(started).toMatch(/^Started\. Collect the answer with ask_alfred_status and job_id "/)
    expect(answer).toBe('pong')
    const lines = jsonl(join(dir('qa'), `${taskId}.jsonl`))
    expect(lines[0]).toMatchObject({ type: 'meta', id: taskId, title: 'ping' })
    expect(lines.filter((l) => l.type === 'message').map((m) => [m.role, m.text])).toEqual([
      ['user', 'ping'],
      ['agent', 'pong'],
    ])
    const listed = (await (await fetch(`${url}/api/delegations`)).json()) as { delegations: { id: string; caller: string }[] }
    expect(listed.delegations.find((d) => d.id === taskId)).toMatchObject({ id: taskId, caller: 'qa' })
  })

  it('continues the same thread when the task_id is given back', async () => {
    const first = await ask({ prompt: 'ping' }, { 'x-adestia-caller': 'suite' })
    const second = await ask({ prompt: 'ping', task_id: first.taskId }, { 'x-adestia-caller': 'suite' })
    expect(second.taskId).toBe(first.taskId)
    const messages = jsonl(join(dir('suite'), `${first.taskId}.jsonl`)).filter((l) => l.type === 'message')
    expect(messages).toHaveLength(4)
  })

  it('cuts a long request title to at most 60 characters', async () => {
    const long = 'ping '.repeat(30).trim() // 149 characters on one line
    const { taskId } = await ask({ prompt: long }, { 'x-adestia-caller': 'longue' })
    const meta = jsonl(join(dir('longue'), `${taskId}.jsonl`))[0]!
    // The need says "cut at 60 characters": never longer than 60, still the start of the request.
    // Whether it breaks at a word or adds a mark is a hole (not asserted).
    const title = meta.title as string
    expect(title.length).toBeLessThanOrEqual(60)
    expect(long.startsWith(title.slice(0, 30))).toBe(true)
  })

  it('files a caller that does not match ^[a-z][a-z0-9_-]{0,31}$ under "agent"', async () => {
    const { taskId } = await ask({ prompt: 'ping' }, { 'x-adestia-caller': 'Mauvais Nom!' })
    expect(existsSync(join(dir('agent'), `${taskId}.jsonl`))).toBe(true)
    expect(readdirSync(join(base, 'data', 'delegations', 'conversations'))).not.toContain('Mauvais Nom!')
  })

  it('a caller of 32 characters is kept, one of 33 goes to "agent"', async () => {
    const c32 = 'a'.repeat(32)
    const c33 = 'a'.repeat(33)
    const ok = await ask({ prompt: 'ping' }, { 'x-adestia-caller': c32 })
    const over = await ask({ prompt: 'ping' }, { 'x-adestia-caller': c33 })
    expect(existsSync(join(dir(c32), `${ok.taskId}.jsonl`))).toBe(true)
    expect(existsSync(join(dir('agent'), `${over.taskId}.jsonl`))).toBe(true)
  })
})
