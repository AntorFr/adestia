import Fastify, { type FastifyInstance } from 'fastify'
import { describe, expect, it, vi } from 'vitest'

import {
  JobRegistry,
  bearerOf,
  frameDelegated,
  toolsFor,
  tokenMatches,
  type McpConfig,
} from '../src/mcp-in.js'
import { registerMcp } from '../src/mcp-routes.js'

const config = (overrides: Partial<McpConfig> = {}): McpConfig => ({
  enabled: true,
  token: 'a-shared-secret',
  agentName: 'skippy',
  maxPending: 2,
  ttlMs: 3_600_000,
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

describe('the tools offered', () => {
  it('names the agent, so two connected instances are distinguishable', () => {
    // A generic `ask` would make them identical in a calling agent's tool list.
    expect(toolsFor(config()).map((t) => t.name)).toEqual(['ask_skippy', 'ask_skippy_status'])
  })

  it('tells the caller the answer does not come back on this call', () => {
    expect(toolsFor(config())[0]!.description).toContain('IMMEDIATELY')
    expect(toolsFor(config())[0]!.description).toContain('ask_skippy_status')
  })
})

describe('the job registry', () => {
  it('tracks a job through to its answer', () => {
    const jobs = new JobRegistry(config())
    const job = jobs.create('do a thing', 'alfred')
    if ('refused' in job) throw new Error('unexpected refusal')

    expect(jobs.pending()).toBe(1)
    jobs.finish(job.id, 'done that')
    expect(jobs.get(job.id)).toMatchObject({ state: 'done', result: 'done that' })
    expect(jobs.pending()).toBe(0)
  })

  it('refuses rather than queueing past its limit', () => {
    // A refusal is information the caller can act on; silence behind a lock
    // that may not release for an hour is not.
    const jobs = new JobRegistry(config({ maxPending: 1 }))
    jobs.create('one', 'alfred')
    expect(jobs.create('two', 'alfred')).toMatchObject({ refused: expect.stringContaining('busy') })
  })

  it('frees a slot when a job finishes', () => {
    const jobs = new JobRegistry(config({ maxPending: 1 }))
    const first = jobs.create('one', 'alfred')
    if ('refused' in first) throw new Error('unexpected refusal')
    jobs.finish(first.id, 'ok')
    expect(jobs.create('two', 'alfred')).not.toHaveProperty('refused')
  })

  it('records a failure as a failure, not an empty answer', () => {
    const jobs = new JobRegistry(config())
    const job = jobs.create('x', 'alfred')
    if ('refused' in job) throw new Error('unexpected refusal')
    jobs.fail(job.id, 'the CLI died')
    expect(jobs.get(job.id)).toMatchObject({ state: 'failed', error: 'the CLI died' })
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

const build = async (
  overrides: Partial<McpConfig> = {},
  runTurn = vi.fn(async () => 'the answer'),
) => {
  const app = Fastify()
  registerMcp(app, { config: config(overrides), runTurn })
  await app.ready()
  return { app, runTurn }
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
) {
  return app.inject({
    method: 'POST',
    url: '/mcp',
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  })
}

describe('the endpoint', () => {
  it('is not mounted when disabled', async () => {
    const app = Fastify()
    registerMcp(app, { config: config({ enabled: false }), runTurn: vi.fn(async () => '') })
    await app.ready()
    expect((await call(app, { method: 'tools/list', id: 1 })).statusCode).toBe(404)
  })

  it('refuses to mount without a token', () => {
    // An unauthenticated endpoint that runs agent turns is a remote shell.
    expect(() =>
      registerMcp(Fastify(), {
        config: config({ token: undefined }),
        runTurn: vi.fn(async () => ''),
      }),
    ).toThrow(/requires mcp.token/)
  })

  it('rejects a wrong token', async () => {
    const { app } = await build()
    expect((await call(app, { method: 'tools/list', id: 1 }, 'wrong')).statusCode).toBe(401)
    await app.close()
  })

  it('answers initialize and tools/list', async () => {
    const { app } = await build()
    expect((await call(app, { method: 'initialize', id: 1 })).json().result.serverInfo.name).toBe(
      'demeura-skippy',
    )
    expect((await call(app, { method: 'tools/list', id: 2 })).json().result.tools).toHaveLength(2)
    await app.close()
  })

  it('returns a job id immediately and runs the turn behind it', async () => {
    // The whole reason this is asynchronous: a delegated task takes minutes,
    // and an MCP call held open that long times out between the two agents.
    let release: (value: string) => void = () => {}
    const runTurn = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve
        }),
    )
    const { app } = await build({}, runTurn)

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

    release('the review')
    await new Promise((resolve) => setImmediate(resolve))

    const collected = await call(app, {
      method: 'tools/call',
      id: 3,
      params: { name: 'ask_skippy_status', arguments: { job_id: jobId } },
    })
    expect(collected.json().result.content[0].text).toBe('the review')
    await app.close()
  })

  it('frames the prompt so the agent knows nobody is reading', async () => {
    const prompts: string[] = []
    const runTurn = vi.fn(async (prompt: string) => {
      prompts.push(prompt)
      return 'ok'
    })
    const { app } = await build({}, runTurn)
    await call(app, {
      method: 'tools/call',
      id: 1,
      params: { name: 'ask_skippy', arguments: { prompt: 'do it' } },
    })
    await new Promise((resolve) => setImmediate(resolve))
    expect(prompts[0]).toContain('cannot answer questions')
    await app.close()
  })

  it('reports a failed task as failed rather than as an empty answer', async () => {
    const runTurn = vi.fn(async () => {
      throw new Error('the CLI died')
    })
    const { app } = await build({}, runTurn)
    const started = await call(app, {
      method: 'tools/call',
      id: 1,
      params: { name: 'ask_skippy', arguments: { prompt: 'x' } },
    })
    const jobId = /job_id "([^"]+)"/.exec(started.json().result.content[0].text as string)?.[1]
    await new Promise((resolve) => setImmediate(resolve))

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
    const { app } = await build({ maxPending: 1 }, vi.fn(() => new Promise<string>(() => {})))
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
