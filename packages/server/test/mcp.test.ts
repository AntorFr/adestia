import Fastify, { type FastifyInstance } from 'fastify'
import { describe, expect, it, vi } from 'vitest'

import {
  JobRegistry,
  bearerOf,
  callbackUrlOf,
  callerOf,
  frameDelegated,
  pingBody,
  toolsFor,
  tokenMatches,
  type McpConfig,
} from '../src/mcp-in.js'
import { registerMcp, type DelegationPort } from '../src/mcp-routes.js'

const config = (overrides: Partial<McpConfig> = {}): McpConfig => ({
  enabled: true,
  token: 'a-shared-secret',
  agentName: 'skippy',
  maxPending: 2,
  ttlMs: 3_600_000,
  ...overrides,
})

const seed = (overrides: Partial<Parameters<JobRegistry['create']>[0]> = {}) => ({
  prompt: 'do a thing',
  from: 'alfred',
  taskId: 'thread-1',
  notify: false,
  ...overrides,
})

describe('the bearer', () => {
  it('reads a header', () => {
    expect(bearerOf('Bearer abc')).toBe('abc')
    expect(bearerOf('bearer abc')).toBe('abc')
  })

  it('reads nothing from anything else', () => {
    expect(bearerOf('Basic abc')).toBeUndefined()
    expect(bearerOf(undefined)).toBeUndefined()
  })

  it('compares in constant time and rejects a mismatch', () => {
    // A token compared byte by byte with an early exit is a token guessable
    // by anyone willing to measure.
    expect(tokenMatches('abc', 'abc')).toBe(true)
    expect(tokenMatches('abc', 'abd')).toBe(false)
    expect(tokenMatches('ab', 'abc')).toBe(false)
    expect(tokenMatches(undefined, 'abc')).toBe(false)
    expect(tokenMatches('abc', undefined)).toBe(false)
  })
})

describe('the caller name', () => {
  it('accepts what the agent-name grammar accepts', () => {
    expect(callerOf('alfred')).toBe('alfred')
    expect(callerOf('agent_2')).toBe('agent_2')
  })

  it('falls back rather than echoing an unsafe spelling', () => {
    // The name becomes a directory under the delegation store; an unvalidated
    // one would poison it.
    expect(callerOf('../etc')).toBe('agent')
    expect(callerOf('Alfred')).toBe('agent')
    expect(callerOf(undefined)).toBe('agent')
    expect(callerOf(['alfred'])).toBe('agent')
  })
})

describe('the callback address', () => {
  it('keeps a plain https URL, normalized', () => {
    expect(callbackUrlOf('https://skippy.example/callback')).toBe(
      'https://skippy.example/callback',
    )
  })

  it('refuses every scheme that is not http(s), and credentials in the URL', () => {
    expect(callbackUrlOf('file:///etc/passwd')).toBeUndefined()
    expect(callbackUrlOf('gopher://x')).toBeUndefined()
    expect(callbackUrlOf('https://user:pass@host/x')).toBeUndefined()
    expect(callbackUrlOf('not a url')).toBeUndefined()
    expect(callbackUrlOf(`https://x/${'a'.repeat(600)}`)).toBeUndefined()
    expect(callbackUrlOf(42)).toBeUndefined()
  })
})

describe('the ping', () => {
  it('carries the two identifiers and NOTHING else', () => {
    // Content-free by design: nothing a receiving model could read raw, so a
    // forged ping can at most make the receiver poll and find nothing.
    expect(pingBody('skippy', 'job-1')).toEqual({ from: 'skippy', job_id: 'job-1' })
  })
})

describe('the tools offered', () => {
  it('names the agent, so two connected instances are distinguishable', () => {
    // A generic `ask` would make them identical in a calling agent's tool list.
    expect(toolsFor(config()).map((t) => t.name)).toEqual(['ask_skippy', 'ask_skippy_status'])
  })

  it('tells the caller the answer does not come back on this call', () => {
    expect(toolsFor(config())[0]!.description).toContain('IMMEDIATELY')
    expect(toolsFor(config())[0]!.description).toContain('ask_skippy_status')
  })

  it('teaches the resume contract on both tools', () => {
    // The predecessor's client-facing promise: the status result carries a
    // task_id, and passing it back continues the same conversation.
    expect(toolsFor(config())[0]!.description).toContain('task_id')
    expect(toolsFor(config())[1]!.description).toContain('task_id')
    const properties = toolsFor(config())[0]!.inputSchema['properties'] as Record<string, unknown>
    expect(Object.keys(properties)).toEqual(['prompt', 'task_id', 'notify'])
  })

  it('lets the operator say what the agent is FOR', () => {
    // The description is how a calling model picks the right colleague.
    const described = toolsFor(config({ description: 'The household butler.' }))
    expect(described[0]!.description).toContain('The household butler.')
    expect(described[0]!.description).not.toContain('Delegate a task to skippy')
  })
})

describe('the job registry', () => {
  it('tracks a job through to its answer', () => {
    const jobs = new JobRegistry(config())
    const job = jobs.create(seed())
    if ('refused' in job) throw new Error('unexpected refusal')

    expect(jobs.pending()).toBe(1)
    jobs.finish(job.id, 'done that')
    expect(jobs.get(job.id)).toMatchObject({ state: 'done', result: 'done that', taskId: 'thread-1' })
    expect(jobs.pending()).toBe(0)
  })

  it('refuses rather than queueing past its limit', () => {
    // A refusal is information the caller can act on; silence behind a lock
    // that may not release for an hour is not.
    const jobs = new JobRegistry(config({ maxPending: 1 }))
    jobs.create(seed())
    expect(jobs.create(seed())).toMatchObject({ refused: expect.stringContaining('busy') })
  })

  it('frees a slot when a job finishes', () => {
    const jobs = new JobRegistry(config({ maxPending: 1 }))
    const first = jobs.create(seed())
    if ('refused' in first) throw new Error('unexpected refusal')
    jobs.finish(first.id, 'ok')
    expect(jobs.create(seed())).not.toHaveProperty('refused')
  })

  it('records a failure as a failure, not an empty answer', () => {
    const jobs = new JobRegistry(config())
    const job = jobs.create(seed())
    if ('refused' in job) throw new Error('unexpected refusal')
    jobs.fail(job.id, 'the CLI died')
    expect(jobs.get(job.id)).toMatchObject({ state: 'failed', error: 'the CLI died' })
  })

  it('keeps an undelivered ping beside the job, not instead of it', () => {
    const jobs = new JobRegistry(config())
    const job = jobs.create(seed())
    if ('refused' in job) throw new Error('unexpected refusal')
    jobs.finish(job.id, 'ok')
    jobs.noteNotifyError(job.id, 'connection refused')
    expect(jobs.get(job.id)).toMatchObject({
      state: 'done',
      result: 'ok',
      notifyError: 'connection refused',
    })
  })
})

describe('the delegation frame', () => {
  it('says nobody is reading and questions cannot be answered', () => {
    // Otherwise the agent asks something that reaches a machine whose only job
    // is to poll for a result.
    const framed = frameDelegated('review the diff', 'alfred')
    expect(framed).toContain('alfred')
    expect(framed).toContain('cannot answer questions')
    expect(framed).toContain('review the diff')
  })
})

/**
 * A channel with no desk and no disk: fresh threads get counted ids, run() is
 * whatever the test needs it to be.
 */
function fakeChannel(
  run: DelegationPort['run'] = async () => ({ text: 'the answer' }),
  overrides: Partial<DelegationPort> = {},
): DelegationPort & { runs: { caller: string; threadId: string; request: string }[] } {
  const runs: { caller: string; threadId: string; request: string }[] = []
  let created = 0
  return {
    runs,
    open: async (_caller, _request, taskId) =>
      taskId === undefined ? { threadId: `thread-${++created}` } : { unknown: true as const },
    busy: () => false,
    run: async (caller, threadId, request) => {
      runs.push({ caller, threadId, request })
      return run(caller, threadId, request)
    },
    ...overrides,
  }
}

const build = async (
  overrides: Partial<McpConfig> = {},
  channel: DelegationPort = fakeChannel(),
  fetchImpl?: typeof fetch,
) => {
  const app = Fastify()
  registerMcp(app, { config: config(overrides), channel, ...(fetchImpl ? { fetchImpl } : {}) })
  await app.ready()
  return { app }
}

/**
 * `payload` is typed rather than `unknown`: an untyped one makes `inject`
 * fall through to its chainable overload, and every caller then reads
 * properties off a builder instead of a response.
 */
async function call(
  app: FastifyInstance,
  body: Record<string, unknown>,
  token = 'a-shared-secret',
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: 'POST',
    url: '/mcp',
    headers: { authorization: `Bearer ${token}`, ...headers },
    payload: body,
  })
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

describe('the endpoint', () => {
  it('is not mounted when disabled', async () => {
    const app = Fastify()
    registerMcp(app, { config: config({ enabled: false }), channel: fakeChannel() })
    await app.ready()
    expect((await call(app, { method: 'tools/list', id: 1 })).statusCode).toBe(404)
  })

  it('refuses to mount without a token', () => {
    // An unauthenticated endpoint that runs agent turns is a remote shell.
    expect(() =>
      registerMcp(Fastify(), { config: config({ token: undefined }), channel: fakeChannel() }),
    ).toThrow(/requires mcp.token/)
  })

  it('rejects a wrong token', async () => {
    const { app } = await build()
    expect((await call(app, { method: 'tools/list', id: 1 }, 'wrong')).statusCode).toBe(401)
    await app.close()
  })

  it('answers initialize and tools/list', async () => {
    const { app } = await build()
    // The agent's name alone: what answers here is skippy, and the shell it
    // happens to run on is not part of its identity.
    expect((await call(app, { method: 'initialize', id: 1 })).json().result.serverInfo.name).toBe(
      'skippy',
    )
    expect((await call(app, { method: 'tools/list', id: 2 })).json().result.tools).toHaveLength(2)
    await app.close()
  })

  it('accepts notifications/initialized in silence, per the spec', async () => {
    // Every conforming client sends it right after initialize. Refusing it
    // with -32601 broke the handshake of every stock MCP client — the
    // predecessor's SDK had quietly swallowed it.
    const { app } = await build()
    const response = await call(app, { method: 'notifications/initialized' })
    expect(response.statusCode).toBe(202)
    expect(response.body).toBe('')
    await app.close()
  })

  it('still gates notifications behind the token', async () => {
    const { app } = await build()
    expect((await call(app, { method: 'notifications/initialized' }, 'wrong')).statusCode).toBe(401)
    await app.close()
  })

  it('refuses a GET with 405 rather than letting the page be served', async () => {
    // A client opening MCP's server-to-client stream must get a refusal it can
    // act on. Without this route the SPA catch-all answers `200 text/html`, the
    // client parses a web page as SSE, and fails somewhere that names neither.
    const { app } = await build()
    const response = await app.inject({ method: 'GET', url: '/mcp' })
    expect(response.statusCode).toBe(405)
    expect(response.headers['allow']).toBe('POST')
    await app.close()
  })

  it('answers the trailing-slash spelling too, and gates it the same', async () => {
    // The predecessor's gateway required `/mcp/` exactly, so a client carried
    // over keeps that URL. Fastify treats it as a different path and the auth
    // hook runs BEFORE routing: unlisted, it answered `401 not signed in` —
    // accusing the token while the fault was a slash.
    const { app } = await build()
    const answered = await app.inject({
      method: 'POST',
      url: '/mcp/',
      headers: { authorization: 'Bearer a-shared-secret', 'content-type': 'application/json' },
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    })
    expect(answered.statusCode).toBe(200)
    expect(answered.json().result.tools).toHaveLength(2)

    // Et la garde reste entière sur les deux orthographes.
    const refused = await app.inject({
      method: 'POST',
      url: '/mcp/',
      headers: { 'content-type': 'application/json' },
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    })
    expect(refused.json().error.message).toBe('unauthorized')
    await app.close()
  })

  it('returns a job id immediately and runs the turn behind it', async () => {
    // The whole reason this is asynchronous: a delegated task takes minutes,
    // and an MCP call held open that long times out between the two agents.
    let release: (value: { text: string }) => void = () => {}
    const channel = fakeChannel(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const { app } = await build({}, channel)

    const started = await call(app, {
      method: 'tools/call',
      id: 1,
      params: { name: 'ask_skippy', arguments: { prompt: 'review the diff' } },
    })
    const text = started.json().result.content[0].text as string
    expect(text).toContain('ask_skippy_status')
    const jobId = /job_id "([^"]+)"/.exec(text)?.[1]
    expect(jobId).toBeTruthy()

    // Still running: the caller polls rather than waits.
    const polled = await call(app, {
      method: 'tools/call',
      id: 2,
      params: { name: 'ask_skippy_status', arguments: { job_id: jobId } },
    })
    expect(polled.json().result.content[0].text).toContain('still running')

    release({ text: 'the review' })
    await settle()

    const collected = await call(app, {
      method: 'tools/call',
      id: 3,
      params: { name: 'ask_skippy_status', arguments: { job_id: jobId } },
    })
    expect(collected.json().result.content[0].text).toContain('the review')
    await app.close()
  })

  it('hands back a task_id with the answer, for the next ask to continue on', async () => {
    const { app } = await build()
    const started = await call(app, {
      method: 'tools/call',
      id: 1,
      params: { name: 'ask_skippy', arguments: { prompt: 'step one' } },
    })
    const jobId = /job_id "([^"]+)"/.exec(started.json().result.content[0].text as string)?.[1]
    await settle()

    const collected = await call(app, {
      method: 'tools/call',
      id: 2,
      params: { name: 'ask_skippy_status', arguments: { job_id: jobId } },
    })
    const text = collected.json().result.content[0].text as string
    expect(text).toContain('task_id: "thread-1"')
    expect(text).toContain('ask_skippy')
    await app.close()
  })

  it('refuses a task_id that names no conversation, before any job exists', async () => {
    // Expired store, another caller's thread, a typo: all one answer, and no
    // job to poll for it.
    const { app } = await build()
    const response = await call(app, {
      method: 'tools/call',
      id: 1,
      params: { name: 'ask_skippy', arguments: { prompt: 'more', task_id: 'nope' } },
    })
    expect(response.json().result).toMatchObject({ isError: true })
    expect(response.json().result.content[0].text).toContain('no such conversation')
    await app.close()
  })

  it('refuses a second ask while the thread still works the first', async () => {
    // One job per thread at a time: two asks merged into one turn would owe
    // two answers and hold one.
    const channel = fakeChannel(async () => ({ text: 'ok' }), {
      open: async (_caller, _request, taskId) => ({ threadId: taskId ?? 'fresh' }),
      busy: () => true,
    })
    const { app } = await build({}, channel)
    const response = await call(app, {
      method: 'tools/call',
      id: 1,
      params: { name: 'ask_skippy', arguments: { prompt: 'more', task_id: 'thread-9' } },
    })
    expect(response.json().result).toMatchObject({ isError: true })
    expect(response.json().result.content[0].text).toContain('still working')
    await app.close()
  })

  it('runs the raw request through the channel — framing is the channel’s', async () => {
    const channel = fakeChannel()
    const { app } = await build({}, channel)
    await call(app, {
      method: 'tools/call',
      id: 1,
      params: { name: 'ask_skippy', arguments: { prompt: 'do it' } },
    })
    await settle()
    expect(channel.runs[0]).toMatchObject({ caller: 'agent', request: 'do it' })
    await app.close()
  })

  it('names the caller from its header, sanitized', async () => {
    const channel = fakeChannel()
    const { app } = await build({}, channel)
    await call(
      app,
      { method: 'tools/call', id: 1, params: { name: 'ask_skippy', arguments: { prompt: 'x' } } },
      'a-shared-secret',
      { 'x-adestia-caller': 'alfred' },
    )
    await settle()
    expect(channel.runs[0]!.caller).toBe('alfred')
    await app.close()
  })

  it('reports a failed task as failed rather than as an empty answer', async () => {
    const channel = fakeChannel(async () => ({ text: '', failure: 'the CLI died' }))
    const { app } = await build({}, channel)
    const started = await call(app, {
      method: 'tools/call',
      id: 1,
      params: { name: 'ask_skippy', arguments: { prompt: 'x' } },
    })
    const jobId = /job_id "([^"]+)"/.exec(started.json().result.content[0].text as string)?.[1]
    await settle()

    const collected = await call(app, {
      method: 'tools/call',
      id: 2,
      params: { name: 'ask_skippy_status', arguments: { job_id: jobId } },
    })
    expect(collected.json().result).toMatchObject({ isError: true })
    expect(collected.json().result.content[0].text).toContain('the CLI died')
    await app.close()
  })

  it('refuses a task when it is already full', async () => {
    const channel = fakeChannel(() => new Promise(() => {}))
    const { app } = await build({ maxPending: 1 }, channel)
    await call(app, {
      method: 'tools/call',
      id: 1,
      params: { name: 'ask_skippy', arguments: { prompt: 'one' } },
    })
    const second = await call(app, {
      method: 'tools/call',
      id: 2,
      params: { name: 'ask_skippy', arguments: { prompt: 'two' } },
    })
    expect(second.json().result).toMatchObject({ isError: true })
    expect(second.json().result.content[0].text).toContain('busy')
    await app.close()
  })

  it('says so when a job id means nothing', async () => {
    const { app } = await build()
    const response = await call(app, {
      method: 'tools/call',
      id: 1,
      params: { name: 'ask_skippy_status', arguments: { job_id: 'made-up' } },
    })
    expect(response.json().result.content[0].text).toContain('may have expired')
    await app.close()
  })

  it('requires a prompt', async () => {
    const { app } = await build()
    const response = await call(app, {
      method: 'tools/call',
      id: 1,
      params: { name: 'ask_skippy', arguments: {} },
    })
    expect(response.json().result).toMatchObject({ isError: true })
    await app.close()
  })
})

describe('the settled-job ping', () => {
  const askWithCallback = (app: FastifyInstance, args: Record<string, unknown> = {}) =>
    call(
      app,
      {
        method: 'tools/call',
        id: 1,
        params: { name: 'ask_skippy', arguments: { prompt: 'x', ...args } },
      },
      'a-shared-secret',
      { 'x-adestia-caller': 'alfred', 'x-adestia-callback-url': 'https://alfred.example/callback' },
    )

  it('knocks on the caller’s callback with the two identifiers, nothing more', async () => {
    const sent: { url: string; body: unknown }[] = []
    const fetchImpl = vi.fn(async (url: unknown, init?: RequestInit) => {
      sent.push({ url: String(url), body: JSON.parse(String(init?.body)) })
      return new Response('{}', { status: 202 })
    }) as unknown as typeof fetch
    const { app } = await build({}, fakeChannel(), fetchImpl)

    const started = await askWithCallback(app)
    const jobId = /job_id "([^"]+)"/.exec(started.json().result.content[0].text as string)?.[1]
    await settle()
    await settle()

    expect(sent).toHaveLength(1)
    expect(sent[0]!.url).toBe('https://alfred.example/callback')
    expect(sent[0]!.body).toEqual({ from: 'skippy', job_id: jobId })
    await app.close()
  })

  it('sends nothing when the caller declared no door, or said notify false', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}')) as unknown as typeof fetch
    const { app } = await build({}, fakeChannel(), fetchImpl)

    await call(app, {
      method: 'tools/call',
      id: 1,
      params: { name: 'ask_skippy', arguments: { prompt: 'no door' } },
    })
    await askWithCallback(app, { notify: false })
    await settle()
    await settle()

    expect(fetchImpl).not.toHaveBeenCalled()
    await app.close()
  })

  it('is fail-soft: a dead door costs a status line, never the answer', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('connection refused')
    }) as unknown as typeof fetch
    const { app } = await build({}, fakeChannel(), fetchImpl)

    const started = await askWithCallback(app)
    const jobId = /job_id "([^"]+)"/.exec(started.json().result.content[0].text as string)?.[1]
    await settle()
    await settle()

    const collected = await call(app, {
      method: 'tools/call',
      id: 2,
      params: { name: 'ask_skippy_status', arguments: { job_id: jobId } },
    })
    const text = collected.json().result.content[0].text as string
    expect(text).toContain('the answer')
    expect(text).toContain('callback ping failed')
    expect(text).toContain('connection refused')
    await app.close()
  })
})
