import { describe, expect, it, vi } from 'vitest'
import type { Driver, DriverDescriptor, TurnEvent, TurnRequest } from '@antorfr/golem-drivers'

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildApp, sseFrame, type AppDependencies } from '../src/app.js'
import { parseConfig } from '../src/config.js'
import { PermissionBroker } from '@antorfr/golem-drivers'

import { SecretStore } from '../src/secrets.js'

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

  const OIDC = `auth:
  mode: oidc
  oidc:
    issuer: https://auth.example
    clientId: golem
    clientSecret: s3cret
    redirectUri: https://golem.example/auth/callback
`

  it('sends a person to sign in instead of showing them JSON', async () => {
    // Never exercised while a reverse proxy authenticated on the instance's
    // behalf: it bounced the browser and Golem only saw requests that already
    // had an identity. Becoming an OIDC client means owning that bounce.
    const app = await buildApp(deps({ config: parseConfig(OIDC) }))
    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: { accept: 'text/html,application/xhtml+xml' },
    })
    expect(response.statusCode).toBe(302)
    expect(response.headers['location']).toBe('/auth/login?returnTo=%2F')
    await app.close()
  })

  it('keeps a deep link across the sign-in', async () => {
    const app = await buildApp(deps({ config: parseConfig(OIDC) }))
    const response = await app.inject({
      method: 'GET',
      url: '/#/page/sante/dietetique.md',
      headers: { accept: 'text/html' },
    })
    expect(response.headers['location']).toContain('returnTo=')
    await app.close()
  })

  it('still answers a fetch with JSON, never a login page', async () => {
    // The loaded shell must keep receiving its 401: handed a redirect, it
    // would parse a login page as data and report something absurd.
    const app = await buildApp(deps({ config: parseConfig(OIDC) }))
    const response = await app.inject({ method: 'GET', url: '/api/instance' })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'not signed in' })
    await app.close()
  })

  it('does not bounce in proxy mode, where the proxy owns the redirect', async () => {
    const app = await buildApp(deps({ config: parseConfig('auth:\n  mode: proxy\n') }))
    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: { accept: 'text/html' },
    })
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

  it('frames the screen the sender was watching', async () => {
    const driver = new ScriptedDriver([RESULT])
    const app = await buildApp(deps({ driver }))
    await app.inject({
      method: 'POST',
      url: '/api/turn',
      payload: {
        prompt: 'range ça',
        view: { route: '/page/trips/baden.md', title: 'Trips › Baden' },
      },
    })

    expect(driver.requests[0]?.prompt).toContain('(#/page/trips/baden.md)')
    expect(driver.requests[0]?.prompt.endsWith('\nrange ça')).toBe(true)
    await app.close()
  })

  it('sends nothing about a screen when none was being watched', async () => {
    const driver = new ScriptedDriver([RESULT])
    const app = await buildApp(deps({ driver }))
    await app.inject({ method: 'POST', url: '/api/turn', payload: { prompt: 'hi', view: { route: '' } } })
    expect(driver.requests[0]?.prompt).toBe('hi')
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

  it('stores the prompt as typed, not the framing sent with it', async () => {
    // The screen note addresses the agent; replaying it would show the sender
    // text they never wrote.
    const app = await withStore()
    const { id } = (await app.inject({ method: 'POST', url: '/api/conversations' })).json()
    await app.inject({
      method: 'POST',
      url: '/api/turn',
      payload: { prompt: 'range ça', conversationId: id, view: { route: '/parcours' } },
    })

    const conversation = (await app.inject({ url: `/api/conversations/${id}` })).json()
    expect(conversation.messages[0].text).toBe('range ça')
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

describe('arming a driver token', () => {
  const TOKEN = 'sk-ant-oat01-supersecretvaluenobodyshouldsee'

  /** A driver that can be armed, standing in for the real terminal flow. */
  class ArmableDriver extends ScriptedDriver {
    readonly credentialVar: string = 'SCRIPTED_TOKEN'
    credentials: Record<string, string> = {}
    savedAt: string | undefined
    cancelled = 0
    constructor(private readonly outcome: 'ok' | 'refuse' = 'ok') {
      super([RESULT], ['usageMetrics', 'authManagement'])
    }
    authStatus() {
      return Promise.resolve(
        Object.keys(this.credentials).length > 0
          ? { state: 'armed', source: 'managed', savedAt: this.savedAt }
          : { state: 'absent', source: 'cli-native' },
      )
    }
    beginAuth() {
      return Promise.resolve({
        sessionId: 'driver-side-id',
        mode: 'url+code',
        authorizeUrl: 'https://claude.ai/oauth/authorize?x=1',
        ttl: 600,
      })
    }
    completeAuth(_id: string, input: string) {
      if (this.outcome === 'refuse') return Promise.reject(new Error('code rejected upstream'))
      return Promise.resolve({ secret: `${TOKEN}-${input}` })
    }
    cancelAuth() {
      this.cancelled += 1
      return Promise.resolve()
    }
    setCredentials(credentials: Record<string, string>, savedAt?: string) {
      this.credentials = credentials
      this.savedAt = savedAt
    }
  }

  const armable = async (driver: ArmableDriver) => {
    const dataDir = await mkdtemp(join(tmpdir(), 'golem-arm-'))
    const app = await buildApp({
      ...deps({ driver }),
      config: { ...deps().config, dataDir },
      secrets: new SecretStore(dataDir),
    })
    return { app, dataDir }
  }

  it('404s the whole surface when the driver cannot be armed', async () => {
    // "Cannot be armed from here" and "has no token" are different facts; an
    // interface confusing them offers a button that can never work.
    const app = await buildApp(deps())
    expect((await app.inject({ url: '/api/auth/driver' })).statusCode).toBe(404)
    expect(
      (await app.inject({ method: 'POST', url: '/api/auth/driver/begin' })).statusCode,
    ).toBe(404)
    await app.close()
  })

  it('reports an unarmed driver as absent, not broken', async () => {
    // Living on credentials set up outside Golem is legitimate.
    const { app } = await armable(new ArmableDriver())
    expect((await app.inject({ url: '/api/auth/driver' })).json()).toMatchObject({
      state: 'absent',
      source: 'cli-native',
    })
    await app.close()
  })

  it('walks the whole flow and stores the token', async () => {
    const driver = new ArmableDriver()
    const { app, dataDir } = await armable(driver)

    const begun = (await app.inject({ method: 'POST', url: '/api/auth/driver/begin' })).json()
    expect(begun.mode).toBe('url+code')
    expect(begun.authorizeUrl).toContain('claude.ai')
    // Our session id, not the driver's: the browser holds a handle to OUR flow.
    expect(begun.sessionId).not.toBe('driver-side-id')

    const completed = await app.inject({
      method: 'POST',
      url: '/api/auth/driver/complete',
      payload: { sessionId: begun.sessionId, input: 'the-code' },
    })
    expect(completed.json()).toMatchObject({ armed: true })

    const stored = await new SecretStore(dataDir).read('scripted')
    expect(stored?.value).toContain('the-code')
    // Handed to the driver under the variable IT declared.
    expect(driver.credentials['SCRIPTED_TOKEN']).toContain('the-code')
    await app.close()
  })

  it('never sends the secret back to the browser', async () => {
    // The whole point of holding it server-side: no XSS in a plugin's view can
    // exfiltrate what the browser was never given.
    const { app } = await armable(new ArmableDriver())
    const begun = (await app.inject({ method: 'POST', url: '/api/auth/driver/begin' })).json()
    const completed = await app.inject({
      method: 'POST',
      url: '/api/auth/driver/complete',
      payload: { sessionId: begun.sessionId, input: 'code' },
    })
    expect(completed.body).not.toContain('sk-ant-oat01')

    const status = await app.inject({ url: '/api/auth/driver' })
    expect(status.body).not.toContain('sk-ant-oat01')
    await app.close()
  })

  it('refuses a code for a session that expired or never existed', async () => {
    const { app } = await armable(new ArmableDriver())
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/driver/complete',
      payload: { sessionId: 'made-up', input: 'code' },
    })
    expect(response.statusCode).toBe(409)
    await app.close()
  })

  it('reports an upstream refusal and ends the session', async () => {
    const { app } = await armable(new ArmableDriver('refuse'))
    const begun = (await app.inject({ method: 'POST', url: '/api/auth/driver/begin' })).json()
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/driver/complete',
      payload: { sessionId: begun.sessionId, input: 'wrong' },
    })
    expect(response.statusCode).toBe(502)
    expect(response.json().error).toContain('code rejected upstream')

    // The session is gone, so a retry starts cleanly rather than reusing a
    // flow whose terminal has already given up.
    const retry = await app.inject({
      method: 'POST',
      url: '/api/auth/driver/complete',
      payload: { sessionId: begun.sessionId, input: 'again' },
    })
    expect(retry.statusCode).toBe(409)
    await app.close()
  })

  it('cancels a flow the user abandoned', async () => {
    const driver = new ArmableDriver()
    const { app } = await armable(driver)
    const begun = (await app.inject({ method: 'POST', url: '/api/auth/driver/begin' })).json()
    await app.inject({
      method: 'POST',
      url: '/api/auth/driver/cancel',
      payload: { sessionId: begun.sessionId },
    })
    expect(driver.cancelled).toBe(1)
    await app.close()
  })

  it('clears a stored token', async () => {
    const { app, dataDir } = await armable(new ArmableDriver())
    const begun = (await app.inject({ method: 'POST', url: '/api/auth/driver/begin' })).json()
    await app.inject({
      method: 'POST',
      url: '/api/auth/driver/complete',
      payload: { sessionId: begun.sessionId, input: 'code' },
    })
    expect((await app.inject({ method: 'DELETE', url: '/api/auth/driver' })).statusCode).toBe(200)
    expect(await new SecretStore(dataDir).read('scripted')).toBeUndefined()
    await app.close()
  })

  it('refuses a driver that asks for a dangerous variable', async () => {
    // A token written into PATH turns an arming flow into arbitrary code
    // execution at the next spawn.
    class GreedyDriver extends ArmableDriver {
      override readonly credentialVar: string = 'PATH'
    }
    const { app } = await armable(new GreedyDriver())
    const begun = (await app.inject({ method: 'POST', url: '/api/auth/driver/begin' })).json()
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/driver/complete',
      payload: { sessionId: begun.sessionId, input: 'code' },
    })
    expect(response.statusCode).toBe(502)
    expect(response.json().error).toContain('may not store its secret in PATH')
    await app.close()
  })

  it('requires both a session and a code', async () => {
    const { app } = await armable(new ArmableDriver())
    expect(
      (await app.inject({ method: 'POST', url: '/api/auth/driver/complete', payload: {} }))
        .statusCode,
    ).toBe(400)
    await app.close()
  })
})

describe('interactive permissions', () => {
  it('answers a waiting request', async () => {
    const permissions = new PermissionBroker()
    const app = await buildApp(deps({ permissions }))

    const decision = permissions.ask('Bash', 'rm -rf build', () => true)
    const [waiting] = permissions.outstanding()

    const response = await app.inject({
      method: 'POST',
      url: '/api/permission',
      payload: { id: waiting!.id, allow: false },
    })
    expect(response.json()).toEqual({ answered: true })
    expect(await decision).toBe('deny')
    await app.close()
  })

  it('reports a request that is no longer waiting', async () => {
    // 409 rather than 404: it existed, it simply timed out or was already
    // answered — "unknown" would suggest the user clicked something that never
    // was.
    const app = await buildApp(deps({ permissions: new PermissionBroker() }))
    const response = await app.inject({
      method: 'POST',
      url: '/api/permission',
      payload: { id: 'gone', allow: true },
    })
    expect(response.statusCode).toBe(409)
    await app.close()
  })

  it('lists what is pending so a reconnecting UI can re-ask', async () => {
    const permissions = new PermissionBroker()
    const app = await buildApp(deps({ permissions }))
    const asked: { id: string }[] = []
    void permissions.ask('Write', '/etc/passwd', (r) => {
      asked.push(r)
      return true
    })
    await vi.waitFor(() => expect(asked).toHaveLength(1))
    // Claimed, as a real turn's request is: the listing is narrowed to its
    // owner, so an unclaimed one belongs to nobody.
    permissions.attach(asked[0]!.id, { userId: 'local' })

    const response = await app.inject({ url: '/api/permission' })
    expect(response.json().pending).toHaveLength(1)
    expect(response.json().pending[0]).toMatchObject({ tool: 'Write' })
    await app.close()
  })

  it('does not hand one person what another is waiting on', async () => {
    // One broker serves the whole instance. Unfiltered, this route reads out
    // somebody else's tool names and file paths to whoever asks first.
    const permissions = new PermissionBroker()
    const app = await buildApp(deps({ permissions }))
    const asked: { id: string }[] = []
    void permissions.ask('Write', '/w/pages/prive.md', (r) => {
      asked.push(r)
      return true
    })
    await vi.waitFor(() => expect(asked).toHaveLength(1))
    permissions.attach(asked[0]!.id, { userId: 'emilie' })

    // The default instance identifies its single user as `local`.
    expect((await app.inject({ url: '/api/permission' })).json().pending).toEqual([])
    // And cannot answer for her either.
    const answer = await app.inject({
      method: 'POST',
      url: '/api/permission',
      payload: { id: asked[0]!.id, allow: true },
    })
    expect(answer.statusCode).toBe(409)
    await app.close()
  })

  it('requires both an id and a decision', async () => {
    const app = await buildApp(deps({ permissions: new PermissionBroker() }))
    expect(
      (await app.inject({ method: 'POST', url: '/api/permission', payload: { id: 'x' } })).statusCode,
    ).toBe(400)
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
