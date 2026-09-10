/**
 * The Codex driver, against a fake app-server.
 *
 * Spike 5 proved this is enough: the whole protocol path — events, sessions,
 * approvals, MCP wiring, sandbox denials — was exercised there by pointing the
 * real 0.154.0 binary at a local mock provider, with no OpenAI account and no
 * network, and a later pass against a real ChatGPT account confirmed the
 * notification stream is identical. Here the server itself is scripted, which
 * is faster and covers the same contract.
 */

import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'

import { describe, expect, it, vi } from 'vitest'

import { AskDesk } from '../src/asks.js'
import { checkConformance } from '../src/conformance.js'
import type { TurnEvent, TurnRequest } from '../src/contract.js'
import {
  apiKeyDocument,
  classifyAuthError,
  codexEnv,
  CREDENTIAL_KEY,
  looksLikeAuthDocument,
  normalizeCredential,
} from '../src/codex-cli/auth.js'
import { CodexDriver, quotaReportOf } from '../src/codex-cli/driver.js'
import { describeItem, newTranslationState, translate, usageOf } from '../src/codex-cli/events.js'
import { readPrompt, saidSuccess, stripAnsi } from '../src/codex-cli/login.js'
import type { SpawnImpl, SpawnedProcess } from '../src/codex-cli/protocol.js'

const home = async (): Promise<string> => mkdtemp(join(tmpdir(), 'adestia-codex-'))

// ---------------------------------------------------------------- credentials

describe('the credential, which is a file', () => {
  it('accepts a bare key and wraps it the way the CLI reads it', () => {
    const document = normalizeCredential('sk-abcdefghijklmnop')
    expect(document).toBeDefined()
    expect(JSON.parse(document as string)).toEqual({ auth_mode: 'apikey', OPENAI_API_KEY: 'sk-abcdefghijklmnop' })
  })

  it('accepts a whole ChatGPT document', () => {
    const document = JSON.stringify({
      auth_mode: 'chatgpt',
      tokens: { access_token: 'a'.repeat(40), refresh_token: 'r'.repeat(20) },
    })
    expect(normalizeCredential(document)).toBe(document)
  })

  it('refuses what the CLI would accept and then fail on 35 seconds later', () => {
    // The CLI answers "Successfully logged in" to nonsense; the shape check is
    // the only thing standing between a user and a turn that dies much later
    // for reasons nobody can read.
    expect(normalizeCredential('hunter2')).toBeUndefined()
    expect(normalizeCredential('{"auth_mode":"apikey"}')).toBeUndefined()
    expect(looksLikeAuthDocument('{')).toBe(false)
  })

  it('never puts the secret in the environment', async () => {
    const dir = await home()
    const driver = new CodexDriver({ home: dir, credentials: { [CREDENTIAL_KEY]: apiKeyDocument('sk-abcdefghijkl') } })
    const env = await driver.env()
    expect(env).toEqual({ CODEX_HOME: dir })
    expect(JSON.stringify(env)).not.toContain('sk-abcdefghijkl')
  })

  it('writes it where the CLI reads it, 0600', async () => {
    const dir = await home()
    const driver = new CodexDriver({ home: dir, credentials: { [CREDENTIAL_KEY]: apiKeyDocument('sk-abcdefghijkl') } })
    await driver.env()
    const written = await readFile(join(dir, 'auth.json'), 'utf8')
    expect(JSON.parse(written).OPENAI_API_KEY).toBe('sk-abcdefghijkl')
    expect(((await stat(join(dir, 'auth.json'))).mode & 0o777).toString(8)).toBe('600')
  })

  it('isolates the CLI in its own home', () => {
    expect(codexEnv({ PATH: '/usr/bin' }, '/data/codex-home')).toMatchObject({
      CODEX_HOME: '/data/codex-home',
      NO_COLOR: '1',
    })
  })

  it('reads the marker out of a late failure', () => {
    expect(classifyAuthError('401 Unauthorized … auth error code: invalid_api_key')).toBe('invalid')
    expect(classifyAuthError('Missing bearer or basic authentication in header')).toBe('absent')
    expect(classifyAuthError('the disk is full')).toBeUndefined()
  })
})

// ------------------------------------------------------------------ the login

describe('the device-code prompt', () => {
  const captured =
    '[1mWelcome to Codex[0m\n\n1. Open this link\n   [94mhttps://auth.openai.com/codex/device[0m\n\n2. Enter this one-time code\n   [94m56T5-Y4YVY[0m\n'

  it('reads the url and the code through the escapes', () => {
    // They survive TERM=dumb and NO_COLOR=1 — measured against 0.154.0.
    expect(readPrompt(captured)).toEqual({
      verificationUri: 'https://auth.openai.com/codex/device',
      userCode: '56T5-Y4YVY',
    })
  })

  it('waits rather than guessing when only half has arrived', () => {
    expect(readPrompt('1. Open this link\n   https://auth.openai.com/codex/device\n')).toBeUndefined()
  })

  it('recognises the success sentence', () => {
    expect(saidSuccess('[32mSuccessfully logged in[0m')).toBe(true)
    expect(saidSuccess('the token was not saved')).toBe(false)
    expect(stripAnsi('[94mplain[0m')).toBe('plain')
  })
})

// ------------------------------------------------------------- the translation

describe('translation', () => {
  const run = (notifications: readonly Record<string, unknown>[]): TurnEvent[] => {
    const state = newTranslationState('thread-1')
    return notifications.flatMap((n) => [...translate(n, state)])
  }

  it('streams text from deltas', () => {
    expect(
      run([
        { method: 'item/agentMessage/delta', params: { delta: 'Bon' } },
        { method: 'item/agentMessage/delta', params: { delta: 'jour' } },
      ]),
    ).toEqual([
      { type: 'text-delta', text: 'Bon' },
      { type: 'text-delta', text: 'jour' },
    ])
  })

  it('does not print the answer twice', () => {
    // The completed agentMessage repeats in full what the deltas carried.
    expect(
      run([
        { method: 'item/agentMessage/delta', params: { delta: 'hello' } },
        { method: 'item/completed', params: { item: { type: 'agentMessage', id: 'm1', text: 'hello' } } },
      ]),
    ).toEqual([{ type: 'text-delta', text: 'hello' }])
  })

  it('pairs a command with its result, and strips the shell wrapper', () => {
    const events = run([
      {
        method: 'item/started',
        params: { item: { type: 'commandExecution', id: 'c1', command: "/bin/zsh -lc 'git status'" } },
      },
      {
        method: 'item/completed',
        params: { item: { type: 'commandExecution', id: 'c1', status: 'completed', exit_code: 0 } },
      },
    ])
    expect(events).toEqual([
      { type: 'tool-use', name: 'shell', target: 'git status', id: 'c1' },
      { type: 'tool-result', name: 'shell', ok: true, id: 'c1' },
    ])
  })

  it('calls a refused command a failure', () => {
    expect(
      run([
        { method: 'item/completed', params: { item: { type: 'commandExecution', id: 'c1', status: 'declined' } } },
      ]),
    ).toEqual([{ type: 'tool-result', name: 'shell', ok: false, id: 'c1' }])
  })

  it('turns a cumulative token count into a delta', () => {
    // The wire is cumulative; the climbing counter adds what it is given, so
    // sending the total twice would double it.
    const state = newTranslationState('t')
    const usage = (output: number) => ({
      method: 'thread/tokenUsage/updated',
      params: { tokenUsage: { total: { inputTokens: 10, outputTokens: output } } },
    })
    expect([...translate(usage(7), state)]).toEqual([{ type: 'usage-delta', outputTokens: 7 }])
    expect([...translate(usage(19), state)]).toEqual([{ type: 'usage-delta', outputTokens: 12 }])
  })

  it('says out loud when an MCP server refused to start', () => {
    const state = newTranslationState('t')
    const events = [
      ...translate(
        { method: 'mcpServer/startupStatus/updated', params: { name: 'calendar', status: 'failed', error: 'boom' } },
        state,
      ),
    ]
    expect(events).toEqual([
      { type: 'error', message: 'MCP server "calendar" failed to start: boom', fatal: false },
    ])
    expect(state.mcp.get('calendar')).toEqual({ name: 'calendar', state: 'failed', error: 'boom' })
  })

  it('maps the CLI startup words onto the contract, and invents nothing', () => {
    const state = newTranslationState('t')
    translate({ method: 'mcpServer/startupStatus/updated', params: { name: 'a', status: 'ready' } }, state)
    translate({ method: 'mcpServer/startupStatus/updated', params: { name: 'b', status: 'starting' } }, state)
    translate({ method: 'mcpServer/startupStatus/updated', params: { name: 'c', status: 'wat' } }, state)
    expect(state.mcp.get('a')?.state).toBe('connected')
    expect(state.mcp.get('b')?.state).toBe('pending')
    // A word this table has never met is not evidence a server is down.
    expect(state.mcp.get('c')?.state).toBe('unknown')
  })

  it('closes the turn with the thread id and its usage', () => {
    const state = newTranslationState('thread-9')
    translate(
      { method: 'thread/tokenUsage/updated', params: { tokenUsage: { total: { inputTokens: 11, outputTokens: 7 } } } },
      state,
    )
    expect([...translate({ method: 'turn/completed', params: { turn: { status: 'completed' } } }, state)]).toEqual([
      { type: 'result', sessionId: 'thread-9', stopped: false, usage: { inputTokens: 11, outputTokens: 7 } },
    ])
  })

  it('reports a failed turn as fatal, then closes it', () => {
    const state = newTranslationState('thread-9')
    expect([...translate({ method: 'turn/failed', params: { error: { message: 'upstream said no' } } }, state)]).toEqual(
      [
        { type: 'error', message: 'upstream said no', fatal: true },
        { type: 'result', sessionId: 'thread-9', stopped: true },
      ],
    )
  })

  it('ignores what it does not consume', () => {
    // The protocol has 81 notification kinds and this driver reads a dozen.
    expect(run([{ method: 'remoteControl/status/changed', params: { status: 'disabled' } }])).toEqual([])
  })

  it('strips the shell wrapper, quoted or not', () => {
    // `/bin/zsh -lc ls` is what a one-word command produces, and it is the row
    // with the most room to show something useful.
    expect(describeItem({ type: 'commandExecution', command: "/bin/zsh -lc 'git status'" }).target).toBe('git status')
    expect(describeItem({ type: 'commandExecution', command: '/bin/zsh -lc ls' }).target).toBe('ls')
    // Something that is not a wrapper is left alone.
    expect(describeItem({ type: 'commandExecution', command: 'rg --files' }).target).toBe('rg --files')
  })

  it('describes an item without inventing structure the engine lacks', () => {
    expect(describeItem({ type: 'commandExecution', command: 'ls' })).toEqual({ name: 'shell', target: 'ls' })
    expect(describeItem({ type: 'mcpToolCall', tool: 'ping', server: 'spike' })).toEqual({
      name: 'ping',
      target: 'spike',
    })
    expect(usageOf(undefined)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------- quotas

describe('subscription windows', () => {
  it('normalizes the two windows the engine pushes', () => {
    const report = quotaReportOf(
      {
        primary: { usedPercent: 2, windowDurationMins: 300, resetsAt: 1789051222 },
        secondary: { usedPercent: 0, windowDurationMins: 10080, resetsAt: 1789638022 },
      },
      false,
    )
    expect(report?.windows).toEqual([
      { id: 'primary', label: '5 hours', utilizationPct: 2, resetsAt: new Date(1789051222 * 1000).toISOString() },
      { id: 'secondary', label: 'Weekly', utilizationPct: 0, resetsAt: new Date(1789638022 * 1000).toISOString() },
    ])
    expect(report?.stale).toBe(false)
  })

  it('reports nothing rather than a lying zero', () => {
    expect(quotaReportOf({ primary: null }, false)).toBeUndefined()
    expect(quotaReportOf(undefined, false)).toBeUndefined()
  })
})

// ------------------------------------------------------------- a scripted turn

/**
 * A fake `codex app-server`: it reads JSON-RPC off stdin and answers with
 * whatever the script says, then pushes the notifications of a turn.
 */
function fakeServer(script: {
  readonly notifications?: readonly Record<string, unknown>[]
  readonly serverRequest?: Record<string, unknown>
  readonly modelList?: unknown
  readonly onCall?: (method: string, params: Record<string, unknown>) => void
}) {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const child = Object.assign(new EventEmitter(), {
    stdin,
    stdout,
    stderr,
    kill: vi.fn(() => true),
  }) as unknown as SpawnedProcess
  const answers: Record<string, unknown>[] = []

  const write = (payload: Record<string, unknown>): void => {
    stdout.write(`${JSON.stringify(payload)}\n`)
  }

  let buffer = ''
  stdin.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8')
    let index = buffer.indexOf('\n')
    while (index !== -1) {
      const line = buffer.slice(0, index)
      buffer = buffer.slice(index + 1)
      index = buffer.indexOf('\n')
      if (line.trim() === '') continue
      const message = JSON.parse(line) as Record<string, unknown>
      const method = String(message['method'] ?? '')
      const params = (message['params'] ?? {}) as Record<string, unknown>
      if (message['id'] !== undefined && method !== '') {
        script.onCall?.(method, params)
        const result =
          method === 'initialize'
            ? { userAgent: 'fake' }
            : method === 'thread/start' || method === 'thread/resume'
              ? { thread: { id: 'thread-42' } }
              : method === 'model/list'
                ? (script.modelList ?? { data: [] })
                : {}
        write({ jsonrpc: '2.0', id: message['id'], result })

        if (method === 'turn/start') {
          setImmediate(() => {
            if (script.serverRequest) write({ jsonrpc: '2.0', id: 9001, ...script.serverRequest })
            else for (const n of script.notifications ?? []) write({ jsonrpc: '2.0', ...n })
          })
        }
        continue
      }
      // An answer to a server->client request.
      if (message['id'] !== undefined) {
        answers.push(message)
        setImmediate(() => {
          for (const n of script.notifications ?? []) write({ jsonrpc: '2.0', ...n })
        })
      }
    }
  })

  const spawnImpl: SpawnImpl = () => child
  return { spawnImpl, answers }
}

const DONE = [
  { method: 'item/agentMessage/delta', params: { delta: 'bonjour' } },
  { method: 'thread/tokenUsage/updated', params: { tokenUsage: { total: { inputTokens: 11, outputTokens: 7 } } } },
  { method: 'turn/completed', params: { turn: { status: 'completed' } } },
]

const baseRequest = (cwd: string): TurnRequest => ({ prompt: 'salut', cwd })

async function collect(driver: CodexDriver, request: TurnRequest): Promise<TurnEvent[]> {
  const events: TurnEvent[] = []
  for await (const event of driver.runTurn(request)) events.push(event)
  return events
}

describe('a turn', () => {
  it('runs, streams and closes with the thread id', async () => {
    const dir = await home()
    const fake = fakeServer({ notifications: DONE })
    const driver = new CodexDriver({ home: dir, spawnImpl: fake.spawnImpl })
    const events = await collect(driver, baseRequest(dir))
    expect(events).toEqual([
      { type: 'text-delta', text: 'bonjour' },
      { type: 'usage-delta', outputTokens: 7 },
      { type: 'result', sessionId: 'thread-42', stopped: false, usage: { inputTokens: 11, outputTokens: 7 } },
    ])
  })

  it('resumes the thread it is given rather than opening a new one', async () => {
    const dir = await home()
    const calls: string[] = []
    const fake = fakeServer({ notifications: DONE, onCall: (method) => calls.push(method) })
    const driver = new CodexDriver({ home: dir, spawnImpl: fake.spawnImpl })
    await collect(driver, { ...baseRequest(dir), sessionId: 'thread-42' })
    expect(calls).toContain('thread/resume')
    expect(calls).not.toContain('thread/start')
  })

  it('hands the instance its own tools as an MCP server, with this turn\'s token', async () => {
    const dir = await home()
    let config: Record<string, unknown> | undefined
    const fake = fakeServer({
      notifications: DONE,
      onCall: (method, params) => {
        if (method === 'thread/start') config = params['config'] as Record<string, unknown>
      },
    })
    const driver = new CodexDriver({ home: dir, spawnImpl: fake.spawnImpl })
    await collect(driver, {
      ...baseRequest(dir),
      tools: {
        socketPath: '/tmp/sock',
        token: 'turn-token',
        bridgePath: '/tmp/bridge.mjs',
        tools: [],
        call: async () => ({ ok: true, text: '' }),
      },
    })
    const servers = config?.['mcp_servers'] as Record<string, Record<string, unknown>>
    expect(servers['adestia']).toMatchObject({ env: { ADESTIA_TOOLS_TOKEN: 'turn-token' } })
    // The version check is a network call a pinned deployment has no use for.
    expect(config?.['check_for_update_on_startup']).toBe(false)
  })

  it('omits a user-scoped server on a turn with no caller', async () => {
    const dir = await home()
    let config: Record<string, unknown> | undefined
    const fake = fakeServer({
      notifications: DONE,
      onCall: (method, params) => {
        if (method === 'thread/start') config = params['config'] as Record<string, unknown>
      },
    })
    const driver = new CodexDriver({
      home: dir,
      spawnImpl: fake.spawnImpl,
      mcpServers: [{ name: 'calendar', url: 'https://example.test/mcp', identity: 'user' }],
    })
    // A scheduled turn has nobody to act as, so it must not reach a server
    // that serves somebody's own data.
    await collect(driver, baseRequest(dir))
    expect(config?.['mcp_servers']).toBeUndefined()
  })
})

describe('the permission round trip', () => {
  const approval = {
    id: 9001,
    method: 'item/commandExecution/requestApproval',
    params: {
      command: '/bin/zsh -lc \'git pull --ff-only\'',
      reason: 'needs the network',
      proposedExecpolicyAmendment: ['git', 'pull'],
    },
  }

  it('asks a person, and sends back the engine\'s own prefix rule on "always"', async () => {
    const dir = await home()
    const desk = new AskDesk(1000)
    const fake = fakeServer({ serverRequest: approval, notifications: DONE })
    const driver = new CodexDriver({ home: dir, spawnImpl: fake.spawnImpl, asks: desk })

    const events: TurnEvent[] = []
    const running = (async () => {
      for await (const event of driver.runTurn(baseRequest(dir))) {
        events.push(event)
        if (event.type === 'permission-request') desk.answer(event.id, 'always')
      }
    })()
    await running

    const asked = events.find((event) => event.type === 'permission-request')
    expect(asked).toMatchObject({ tool: 'shell', remembering: true, reason: 'needs the network' })
    // The durable allowlist is the ENGINE's, in a file a person can open —
    // and the rule it proposes is a reusable prefix, not the exact command.
    expect(fake.answers[0]?.['result']).toEqual({
      decision: { acceptWithExecpolicyAmendment: { execpolicy_amendment: ['git', 'pull'] } },
    })
  })

  it('declines without asking when nobody is watching', async () => {
    const dir = await home()
    const desk = new AskDesk(1000)
    const fake = fakeServer({ serverRequest: approval, notifications: DONE })
    const driver = new CodexDriver({ home: dir, spawnImpl: fake.spawnImpl, asks: desk })
    const events = await collect(driver, { ...baseRequest(dir), unattended: true })
    expect(events.some((event) => event.type === 'permission-request')).toBe(false)
    expect(fake.answers[0]?.['result']).toEqual({ decision: 'decline' })
  })

  it('declines rather than blocking when the driver cannot ask at all', async () => {
    const dir = await home()
    const fake = fakeServer({ serverRequest: approval, notifications: DONE })
    // No desk: `open` posture. A question nobody can answer must not hold the
    // turn for five minutes.
    const driver = new CodexDriver({ home: dir, spawnImpl: fake.spawnImpl })
    await collect(driver, baseRequest(dir))
    expect(fake.answers[0]?.['result']).toEqual({ decision: 'decline' })
  })
})

describe('what the driver says about itself', () => {
  it('is conformant', async () => {
    const driver = new CodexDriver({ home: await home() })
    expect(checkConformance(driver, await driver.describe())).toEqual([])
  })

  it('declares the questions only when it can ask them', async () => {
    const dir = await home()
    const open = new CodexDriver({ home: dir })
    const asking = new CodexDriver({ home: dir, asks: new AskDesk(1000) })
    expect((await open.describe()).capabilities).not.toContain('interactivePermissions')
    expect((await asking.describe()).capabilities).toContain('interactivePermissions')
  })

  it('declares no cost, because nothing here reports money', async () => {
    const capabilities = (await new CodexDriver({ home: await home() }).describe()).capabilities
    expect(capabilities).not.toContain('cost')
    expect(capabilities).not.toContain('contextBreakdown')
    expect(capabilities).toContain('subscriptionQuotas')
    expect(capabilities).toContain('liveTurnUsage')
  })

  it('names the folders this CLI actually reads', async () => {
    const driver = new CodexDriver({ home: await home() })
    // Measured against 0.154.0: five candidates planted, these are the ones
    // codex picked up.
    expect(driver.skillsPath()).toBe('.codex/skills')
    expect(driver.instructionPaths()).toContain('AGENTS.md')
    expect(driver.acceptsRoots()).toBe(true)
  })

  it('enumerates the engine\'s own models, hidden ones excluded', async () => {
    const fake = fakeServer({
      modelList: {
        data: [
          { id: 'gpt-6-astra', displayName: 'GPT-6-Astra' },
          { id: 'secret', displayName: 'Secret', hidden: true },
        ],
      },
    })
    const driver = new CodexDriver({ home: await home(), spawnImpl: fake.spawnImpl })
    expect(await driver.listModels()).toEqual([{ id: 'gpt-6-astra', label: 'GPT-6-Astra' }])
  })

  it('falls back to the configured catalogue when the engine will not answer', async () => {
    const fake = fakeServer({ modelList: { data: [] } })
    const driver = new CodexDriver({
      home: await home(),
      spawnImpl: fake.spawnImpl,
      models: [{ id: 'from-config' }],
    })
    expect(await driver.listModels()).toEqual([{ id: 'from-config' }])
  })

  it('says it does not know yet rather than reporting an empty panel', async () => {
    const driver = new CodexDriver({
      home: await home(),
      mcpServers: [{ name: 'calendar', url: 'https://example.test/mcp' }],
    })
    expect(await driver.mcpStatus()).toEqual([{ name: 'calendar', state: 'unknown' }])
  })
})
