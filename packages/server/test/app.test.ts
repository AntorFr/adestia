import { describe, expect, it } from 'vitest'
import type { Driver, DriverDescriptor, TurnEvent, TurnRequest } from '@antorfr/golem-drivers'

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildApp, sseFrame, type AppDependencies } from '../src/app.js'
import { parseConfig } from '../src/config.js'

/** A driver reduced to a script, so the server is tested without any CLI. */
class ScriptedDriver implements Driver {
  interrupted: string[] = []
  requests: TurnRequest[] = []

  constructor(
    private readonly script: readonly TurnEvent[],
    private readonly capabilities: DriverDescriptor['capabilities'] = ['usageMetrics'],
    private readonly hold?: Promise<void>,
  ) {}

  describe(): Promise<DriverDescriptor> {
    return Promise.resolve({
      id: 'scripted',
      label: 'Scripted CLI',
      cliVersion: '1.2.3',
      capabilities: this.capabilities,
    })
  }

  env(): Promise<Readonly<Record<string, string>>> {
    return Promise.resolve({})
  }

  listModels(): Promise<readonly { id: string }[]> {
    return Promise.resolve([{ id: 'model-a' }])
  }

  async *runTurn(request: TurnRequest): AsyncIterable<TurnEvent> {
    this.requests.push(request)
    if (this.hold) await this.hold
    for (const event of this.script) yield event
  }

  interrupt(sessionId: string): Promise<void> {
    if (sessionId === 'ghost') return Promise.reject(new Error('No running turn'))
    this.interrupted.push(sessionId)
    return Promise.resolve()
  }
}

const RESULT: TurnEvent = { type: 'result', sessionId: 's1', stopped: false }

function deps(overrides: Partial<AppDependencies> = {}): AppDependencies {
  return {
    config: parseConfig('auth:\n  mode: none\n'),
    driver: new ScriptedDriver([{ type: 'text-delta', text: 'hi' }, RESULT]),
    plugins: [],
    pluginProblems: [],
    ...overrides,
  }
}

describe('sseFrame', () => {
  it('emits a named event with JSON data', () => {
    expect(sseFrame({ type: 'text-delta', text: 'salut' })).toBe(
      'event: text-delta\ndata: {"type":"text-delta","text":"salut"}\n\n',
    )
  })

  it('keeps a multi-line payload inside one data line', () => {
    // A raw newline in the payload would split the frame and desynchronise the
    // whole stream — JSON escaping is what prevents it.
    const frame = sseFrame({ type: 'text-delta', text: 'line1\nline2' })
    expect(frame.split('\n').filter((l) => l.startsWith('data:'))).toHaveLength(1)
  })
})

describe('/api/instance', () => {
  it('describes the driver by capability, never by name', async () => {
    const app = await buildApp(deps())
    const body = (await app.inject({ method: 'GET', url: '/api/instance' })).json()

    expect(body.driver).toEqual({
      label: 'Scripted CLI',
      cliVersion: '1.2.3',
      capabilities: ['usageMetrics'],
    })
    // The UI must be buildable without knowing which CLI is underneath.
    expect(JSON.stringify(body.driver)).not.toContain('scripted')
    await app.close()
  })

  it('surfaces refused plugins instead of burying them in a log', async () => {
    const problems = [{ id: 'broken', reason: 'manifest is not valid JSON' }]
    const app = await buildApp(deps({ pluginProblems: problems }))
    expect((await app.inject({ url: '/api/instance' })).json().pluginProblems).toEqual(problems)
    await app.close()
  })
})

describe('authentication', () => {
  it('refuses an unauthenticated request in proxy mode', async () => {
    const app = await buildApp(deps({ config: parseConfig('auth:\n  mode: proxy\n') }))
    const response = await app.inject({ method: 'GET', url: '/api/instance' })
    expect(response.statusCode).toBe(401)
    await app.close()
  })

  it('lets a proxied identity through and reports it', async () => {
    const app = await buildApp(deps({ config: parseConfig('auth:\n  mode: proxy\n') }))
    const response = await app.inject({
      url: '/api/instance',
      headers: { 'remote-user': 'chloe' },
    })
    expect(response.json().user).toMatchObject({ userId: 'chloe' })
    await app.close()
  })

  it('keeps health public so a probe never needs credentials', async () => {
    const app = await buildApp(deps({ config: parseConfig('auth:\n  mode: proxy\n') }))
    expect((await app.inject({ url: '/api/health' })).statusCode).toBe(200)
    await app.close()
  })

  it('gates the turn endpoint too', async () => {
    const app = await buildApp(deps({ config: parseConfig('auth:\n  mode: proxy\n') }))
    const response = await app.inject({
      method: 'POST',
      url: '/api/turn',
      payload: { prompt: 'hi' },
    })
    expect(response.statusCode).toBe(401)
    await app.close()
  })
})

describe('/api/models', () => {
  it('answers 404 when the driver cannot enumerate', async () => {
    // "Cannot enumerate" and "has no models" are different facts; an empty
    // list would tell the UI the wrong one.
    const app = await buildApp(deps())
    expect((await app.inject({ url: '/api/models' })).statusCode).toBe(404)
    await app.close()
  })

  it('lists models when the capability is declared', async () => {
    const driver = new ScriptedDriver([], ['usageMetrics', 'modelSelection'])
    const app = await buildApp(deps({ driver }))
    expect((await app.inject({ url: '/api/models' })).json()).toEqual({
      models: [{ id: 'model-a' }],
    })
    await app.close()
  })
})

describe('/api/turn', () => {
  it('streams the driver events as SSE frames', async () => {
    const app = await buildApp(deps())
    const response = await app.inject({
      method: 'POST',
      url: '/api/turn',
      payload: { prompt: 'bonjour' },
    })

    expect(response.headers['content-type']).toContain('text/event-stream')
    expect(response.body).toContain('event: text-delta')
    expect(response.body).toContain('event: result')
    await app.close()
  })

  it('disables proxy buffering, or the stream arrives all at once', async () => {
    const app = await buildApp(deps())
    const response = await app.inject({ method: 'POST', url: '/api/turn', payload: { prompt: 'x' } })
    expect(response.headers['x-accel-buffering']).toBe('no')
    await app.close()
  })

  it('passes the workspace root and options to the driver', async () => {
    const driver = new ScriptedDriver([RESULT])
    const app = await buildApp(deps({ driver }))
    await app.inject({
      method: 'POST',
      url: '/api/turn',
      payload: { prompt: 'hi', sessionId: 's9', model: 'model-a' },
    })
    expect(driver.requests[0]).toMatchObject({
      prompt: 'hi',
      sessionId: 's9',
      model: 'model-a',
      cwd: './workspace',
    })
    await app.close()
  })

  it('rejects an empty prompt', async () => {
    const app = await buildApp(deps())
    const response = await app.inject({ method: 'POST', url: '/api/turn', payload: {} })
    expect(response.statusCode).toBe(400)
    await app.close()
  })

  it('reports a driver failure in-band instead of dropping the stream', async () => {
    const driver = new ScriptedDriver([])
    driver.runTurn = async function* () {
      yield { type: 'text-delta', text: 'partial' } as TurnEvent
      throw new Error('CLI died')
    }
    const app = await buildApp(deps({ driver }))
    const response = await app.inject({ method: 'POST', url: '/api/turn', payload: { prompt: 'x' } })
    expect(response.body).toContain('event: error')
    expect(response.body).toContain('CLI died')
    await app.close()
  })

  it('refuses a turn beyond the concurrency cap rather than queueing it', async () => {
    // Subscription limits are real. A refusal is information; a silent wait
    // behind a lock that may not release for an hour is not.
    let release: () => void = () => {}
    const hold = new Promise<void>((resolve) => {
      release = resolve
    })
    const driver = new ScriptedDriver([RESULT], ['usageMetrics'], hold)
    const app = await buildApp(
      deps({ driver, config: parseConfig('maxConcurrentTurns: 1\n') }),
    )

    const first = app.inject({ method: 'POST', url: '/api/turn', payload: { prompt: 'a' } })
    // Let the first turn reach the driver before the second arrives.
    await new Promise((resolve) => setImmediate(resolve))
    const second = await app.inject({ method: 'POST', url: '/api/turn', payload: { prompt: 'b' } })

    expect(second.statusCode).toBe(429)
    expect(second.json()).toMatchObject({ max: 1 })

    release()
    await first
    await app.close()
  })

  it('frees a slot once the turn ends', async () => {
    const app = await buildApp(deps({ config: parseConfig('maxConcurrentTurns: 1\n') }))
    await app.inject({ method: 'POST', url: '/api/turn', payload: { prompt: 'a' } })
    const second = await app.inject({ method: 'POST', url: '/api/turn', payload: { prompt: 'b' } })
    expect(second.statusCode).toBe(200)
    await app.close()
  })
})

describe('conversations', () => {
  const withStore = async (overrides: Partial<AppDependencies> = {}) => {
    const dataDir = await mkdtemp(join(tmpdir(), 'golem-app-conv-'))
    return buildApp({
      ...deps(overrides),
      config: { ...deps(overrides).config, dataDir },
    })
  }

  it('creates, lists and reads a thread', async () => {
    const app = await withStore()
    const created = (await app.inject({ method: 'POST', url: '/api/conversations' })).json()
    expect(created.id).toBeTruthy()

    const listed = (await app.inject({ url: '/api/conversations' })).json()
    expect(listed.conversations.map((c: { id: string }) => c.id)).toEqual([created.id])

    const read = (await app.inject({ url: `/api/conversations/${created.id}` })).json()
    expect(read.messages).toEqual([])
    await app.close()
  })

  it('names a thread at creation, not in a second call', async () => {
    // A thread that exists for one round trip as "New conversation" keeps
    // that name whenever the second call is lost.
    const app = await withStore()
    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/conversations',
        payload: { title: 'Ranger le garage' },
      })
    ).json()
    expect(created.title).toBe('Ranger le garage')

    const listed = (await app.inject({ url: '/api/conversations' })).json()
    expect(listed.conversations[0].title).toBe('Ranger le garage')
    await app.close()
  })

  it('renames an existing thread', async () => {
    const app = await withStore()
    const { id } = (await app.inject({ method: 'POST', url: '/api/conversations' })).json()
    expect(
      (await app.inject({ method: 'PATCH', url: `/api/conversations/${id}`, payload: { title: 'Renamed' } }))
        .statusCode,
    ).toBe(200)
    expect((await app.inject({ url: `/api/conversations/${id}` })).json().title).toBe('Renamed')
    await app.close()
  })

  it('refuses to rename a thread that is not there', async () => {
    const app = await withStore()
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/conversations/00000000-0000-4000-8000-000000000000',
      payload: { title: 'x' },
    })
    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('404s a conversation that is not there', async () => {
    // "not yours" and "empty" must not look the same to the UI.
    const app = await withStore()
    const response = await app.inject({ url: '/api/conversations/00000000-0000-4000-8000-000000000000' })
    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('records the whole exchange, tool trace included', async () => {
    const driver = new ScriptedDriver([
      { type: 'text-delta', text: 'Bonjour' },
      { type: 'tool-use', name: 'Read', target: '/a.md' },
      { type: 'tool-result', name: 'Read', ok: true },
      { type: 'result', sessionId: 's1', stopped: false, usage: { contextTokens: 4200 } },
    ])
    const app = await withStore({ driver })
    const { id } = (await app.inject({ method: 'POST', url: '/api/conversations' })).json()

    await app.inject({
      method: 'POST',
      url: '/api/turn',
      payload: { prompt: 'salut', conversationId: id },
    })

    const conversation = (await app.inject({ url: `/api/conversations/${id}` })).json()
    expect(conversation.messages.map((m: { role: string; text: string }) => [m.role, m.text])).toEqual([
      ['user', 'salut'],
      ['agent', 'Bonjour'],
    ])
    expect(conversation.messages[1].tools).toEqual([{ name: 'Read', target: '/a.md', ok: true }])
    expect(conversation.messages[1].usage.contextTokens).toBe(4200)
    // And the thread remembers which CLI session to resume.
    expect(conversation.sessionId).toBe('s1')
    await app.close()
  })

  it('stores the partial answer of a turn that failed', async () => {
    // A thread that silently drops what the agent did produce is worse than
    // one that shows it broke.
    const driver = new ScriptedDriver([])
    driver.runTurn = async function* () {
      yield { type: 'text-delta', text: 'half' } as TurnEvent
      throw new Error('CLI died')
    }
    const app = await withStore({ driver })
    const { id } = (await app.inject({ method: 'POST', url: '/api/conversations' })).json()
    await app.inject({ method: 'POST', url: '/api/turn', payload: { prompt: 'x', conversationId: id } })

    const conversation = (await app.inject({ url: `/api/conversations/${id}` })).json()
    expect(conversation.messages[1]).toMatchObject({ text: 'half', error: 'CLI died' })
    await app.close()
  })

  it('runs a turn without a conversation just as well', async () => {
    // Nothing forces a thread: an ephemeral question should not have to
    // create one to be answered.
    const app = await withStore()
    const response = await app.inject({ method: 'POST', url: '/api/turn', payload: { prompt: 'hi' } })
    expect(response.statusCode).toBe(200)
    await app.close()
  })

  it('deletes a thread', async () => {
    const app = await withStore()
    const { id } = (await app.inject({ method: 'POST', url: '/api/conversations' })).json()
    expect((await app.inject({ method: 'DELETE', url: `/api/conversations/${id}` })).statusCode).toBe(200)
    expect((await app.inject({ url: `/api/conversations/${id}` })).statusCode).toBe(404)
    await app.close()
  })
})

describe('/api/turn/stop', () => {
  it('interrupts the named session', async () => {
    const driver = new ScriptedDriver([RESULT])
    const app = await buildApp(deps({ driver }))
    const response = await app.inject({
      method: 'POST',
      url: '/api/turn/stop',
      payload: { sessionId: 's1' },
    })
    expect(response.json()).toEqual({ stopped: true })
    expect(driver.interrupted).toEqual(['s1'])
    await app.close()
  })

  it('reports a session that is not running', async () => {
    const app = await buildApp(deps())
    const response = await app.inject({
      method: 'POST',
      url: '/api/turn/stop',
      payload: { sessionId: 'ghost' },
    })
    expect(response.statusCode).toBe(409)
    await app.close()
  })

  it('requires a session id', async () => {
    const app = await buildApp(deps())
    expect(
      (await app.inject({ method: 'POST', url: '/api/turn/stop', payload: {} })).statusCode,
    ).toBe(400)
    await app.close()
  })
})
