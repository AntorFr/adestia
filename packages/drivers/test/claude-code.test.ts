/**
 * Driver conformance for `claude-code`, against a fake SDK.
 *
 * This is the pattern every Golem driver must follow: replay the message
 * sequence the real CLI produces, and assert the events the UI receives. No
 * account, no network, no CLI binary — otherwise driver behaviour is only ever
 * tested by accident, in production, by a user.
 */

import { describe, expect, it, vi } from 'vitest'

import { AskDesk } from '../src/asks.js'
import { ClaudeCodeDriver } from '../src/claude-code/driver.js'
import { toolTarget } from '../src/claude-code/events.js'
import { checkConformance } from '../src/conformance.js'
import type { TurnEvent, TurnRequest } from '../src/contract.js'
import type { QueryFn, SdkMessage } from '../src/claude-code/sdk-types.js'

/** The SDK's permission callback, as the driver hands it over. */
type CanUseToolFn = (
  tool: string,
  input: Record<string, unknown>,
  options: { suggestions?: unknown[]; title?: string; decisionReason?: string },
) => Promise<unknown>

type FakeSdk = QueryFn & { readonly interrupts: number }

/** A fake `query()` replaying a fixed script, with a spy on interrupt. */
function fakeSdk(script: readonly SdkMessage[], seen?: { params?: unknown }): FakeSdk {
  const state = { interrupts: 0 }
  const fn: QueryFn = (params) => {
    if (seen) seen.params = params
    return {
      async *[Symbol.asyncIterator]() {
        for (const message of script) yield message
      },
      interrupt() {
        state.interrupts += 1
        return Promise.resolve(undefined)
      },
    }
  }
  return Object.defineProperty(fn, 'interrupts', { get: () => state.interrupts }) as FakeSdk
}

const SESSION = 'sess-1'

function textStream(text: string): SdkMessage {
  return {
    type: 'stream_event',
    session_id: SESSION,
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
  }
}

function usageStream(outputTokens: number): SdkMessage {
  return {
    type: 'stream_event',
    session_id: SESSION,
    event: { type: 'message_delta', usage: { output_tokens: outputTokens } },
  }
}

const resultMessage: SdkMessage = {
  type: 'result',
  subtype: 'success',
  session_id: SESSION,
  duration_ms: 4200,
  total_cost_usd: 0.031,
  usage: {
    input_tokens: 1200,
    output_tokens: 340,
    cache_read_input_tokens: 8000,
    cache_creation_input_tokens: 500,
  },
  modelUsage: { 'claude-opus-5': { inputTokens: 9700, outputTokens: 340 } },
}

async function collect(
  driver: ClaudeCodeDriver,
  prompt = 'hi',
  extra: Partial<TurnRequest> = {},
): Promise<TurnEvent[]> {
  const events: TurnEvent[] = []
  for await (const event of driver.runTurn({ prompt, cwd: '/tmp', ...extra })) events.push(event)
  return events
}

describe('conformance', () => {
  it('implements everything it declares', async () => {
    const driver = new ClaudeCodeDriver({
      query: fakeSdk([]),
      models: [{ id: 'claude-opus-5' }],
    })
    expect(checkConformance(driver, await driver.describe())).toEqual([])
  })

  it('does not declare modelSelection when no catalogue is configured', async () => {
    // An empty model selector is worse than none: it looks broken.
    const driver = new ClaudeCodeDriver({ query: fakeSdk([]) })
    const { capabilities } = await driver.describe()
    expect(capabilities).not.toContain('modelSelection')
    expect(capabilities).toContain('usageMetrics')
  })

  it('shows the subagent folder and skills as prose', () => {
    const driver = new ClaudeCodeDriver({ query: fakeSdk([]) })
    expect(driver.instructionPaths()).toContain('.claude/agents')
    expect(driver.instructionPaths()).toContain('.claude/skills')
  })

  it('spawns with the inherited environment, credentials on top', async () => {
    // The SDK REPLACES the subprocess environment with what it is given, so
    // passing credentials alone strips PATH and the CLI cannot launch — the
    // failure then blames the binary, which sends you debugging the wrong
    // thing entirely (observed 2026-08-21).
    const seen: { params?: unknown } = {}
    const driver = new ClaudeCodeDriver({
      query: fakeSdk([resultMessage], seen),
      baseEnv: { PATH: '/usr/bin', HOME: '/home/agent' },
      credentials: { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-secret' },
    })
    await collect(driver)

    const env = (seen.params as { options: { env: Record<string, string> } }).options.env
    expect(env).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/agent',
      CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-secret',
    })
  })

  it('lets a managed token override a stale one in the inherited env', async () => {
    const seen: { params?: unknown } = {}
    const driver = new ClaudeCodeDriver({
      query: fakeSdk([resultMessage], seen),
      baseEnv: { CLAUDE_CODE_OAUTH_TOKEN: 'stale-from-shared-home' },
      credentials: { CLAUDE_CODE_OAUTH_TOKEN: 'fresh' },
    })
    await collect(driver)
    const env = (seen.params as { options: { env: Record<string, string> } }).options.env
    expect(env['CLAUDE_CODE_OAUTH_TOKEN']).toBe('fresh')
  })

  it('hands credentials over as env, never as arguments', async () => {
    const driver = new ClaudeCodeDriver({
      query: fakeSdk([]),
      credentials: { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-secret' },
    })
    expect(await driver.env()).toEqual({ CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-secret' })
  })
})

describe('turn streaming', () => {
  it('emits text deltas as they arrive', async () => {
    const driver = new ClaudeCodeDriver({
      query: fakeSdk([textStream('Bon'), textStream('jour'), resultMessage]),
    })
    const events = await collect(driver)
    expect(events.filter((e) => e.type === 'text-delta')).toEqual([
      { type: 'text-delta', text: 'Bon' },
      { type: 'text-delta', text: 'jour' },
    ])
  })

  it('reports a tool call with a short target, never the full input', async () => {
    const driver = new ClaudeCodeDriver({
      query: fakeSdk([
        {
          type: 'assistant',
          session_id: SESSION,
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'Read',
                input: { file_path: '/workspace/notes.md', content: 'SECRET PAYLOAD' },
              },
            ],
          },
        },
        resultMessage,
      ]),
    })
    const [event] = await collect(driver)
    expect(event).toEqual({ type: 'tool-use', name: 'Read', target: '/workspace/notes.md' })
    expect(JSON.stringify(event)).not.toContain('SECRET')
  })

  it('marks a failed tool result as failed', async () => {
    const driver = new ClaudeCodeDriver({
      query: fakeSdk([
        {
          type: 'user',
          session_id: SESSION,
          message: { content: [{ type: 'tool_result', name: 'Bash', is_error: true }] },
        },
        resultMessage,
      ]),
    })
    expect((await collect(driver))[0]).toEqual({ type: 'tool-result', name: 'Bash', ok: false })
  })
})

describe('live usage counter', () => {
  it('never goes backwards across tool steps', async () => {
    // The SDK reports output tokens per message; a turn spans several. Passing
    // the raw number through would make the counter reset visibly mid-turn.
    const driver = new ClaudeCodeDriver({
      query: fakeSdk([
        usageStream(10),
        usageStream(25),
        { type: 'stream_event', session_id: SESSION, event: { type: 'message_stop' } },
        usageStream(5),
        usageStream(12),
        resultMessage,
      ]),
    })
    const counts = (await collect(driver))
      .filter((e): e is Extract<TurnEvent, { type: 'usage-delta' }> => e.type === 'usage-delta')
      .map((e) => e.outputTokens)

    expect(counts).toEqual([10, 25, 30, 37])
    expect([...counts].sort((a, b) => a - b)).toEqual(counts)
  })
})

describe('result', () => {
  it('reports context weight, not the turn total', async () => {
    const driver = new ClaudeCodeDriver({ query: fakeSdk([resultMessage]) })
    const [event] = await collect(driver)
    expect(event).toMatchObject({ type: 'result', sessionId: SESSION, stopped: false })
    if (event?.type !== 'result') throw new Error('expected a result event')
    // input + cache_read + cache_creation = what the next message re-pays.
    expect(event.usage?.contextTokens).toBe(9700)
    expect(event.usage?.outputTokens).toBe(340)
    expect(event.usage?.perModel).toEqual({ 'claude-opus-5': 10040 })
  })

  it('marks an interrupted turn as stopped', async () => {
    const driver = new ClaudeCodeDriver({
      query: fakeSdk([{ ...resultMessage, subtype: 'error_during_execution' }]),
    })
    const [event] = await collect(driver)
    expect(event).toMatchObject({ stopped: true })
  })

  it('keeps cost null-honest when the SDK reports none', async () => {
    const { total_cost_usd: _drop, ...noCost } = resultMessage as Record<string, unknown>
    const driver = new ClaudeCodeDriver({ query: fakeSdk([noCost as SdkMessage]) })
    const [event] = await collect(driver)
    if (event?.type !== 'result') throw new Error('expected a result event')
    expect(event.usage?.costUsd).toBeNull()
  })
})

describe('interrupt', () => {
  it('reaches the running query', async () => {
    const query = fakeSdk([textStream('working'), resultMessage])
    const driver = new ClaudeCodeDriver({ query })
    // Interrupt mid-stream: the session must already be registered by then.
    for await (const event of driver.runTurn({ prompt: 'hi', cwd: '/tmp' })) {
      if (event.type === 'text-delta') await driver.interrupt(SESSION)
    }
    expect(query.interrupts).toBe(1)
  })

  it('refuses an unknown session loudly', async () => {
    const driver = new ClaudeCodeDriver({ query: fakeSdk([]) })
    await expect(driver.interrupt('ghost')).rejects.toThrow(/No running turn/)
  })
})

describe('toolTarget', () => {
  it('prefers the most telling field', () => {
    expect(toolTarget({ description: 'later', file_path: '/a/b.md' })).toBe('/a/b.md')
  })

  it('flattens newlines so input cannot mimic the interface', () => {
    expect(toolTarget({ command: 'ls\n\nrm -rf /' })).toBe('ls rm -rf /')
  })

  it('truncates to a trace-sized line', () => {
    const target = toolTarget({ command: 'x'.repeat(200) })
    expect(target).toHaveLength(78)
    expect(target?.endsWith('…')).toBe(true)
  })

  it('says nothing rather than guessing', () => {
    expect(toolTarget({ unexpected: 42 })).toBeUndefined()
    expect(toolTarget(null)).toBeUndefined()
  })
})

describe('outbound MCP servers', () => {
  const optionsOf = (seen: { params?: unknown }) =>
    (seen.params as { options: Record<string, unknown> }).options

  it('hands the SDK both transports, in its own shape', async () => {
    const seen: { params?: unknown } = {}
    const driver = new ClaudeCodeDriver({
      query: fakeSdk([resultMessage], seen),
      mcpServers: [
        { name: 'ha', url: 'https://ha/mcp', headers: { Authorization: 'Bearer x' } },
        { name: 'cutlist', command: 'node', args: ['./bin/x.js'], env: { LANG: 'fr' } },
      ],
    })
    await collect(driver)

    expect(optionsOf(seen)['mcpServers']).toEqual({
      ha: { type: 'http', url: 'https://ha/mcp', headers: { Authorization: 'Bearer x' } },
      cutlist: { type: 'stdio', command: 'node', args: ['./bin/x.js'], env: { LANG: 'fr' } },
    })
  })

  it('passes no key at all when the instance declares none', async () => {
    // Not an empty object: the CLI's own MCP config is the user's, and handing
    // the SDK an empty map where it expected nothing is a behaviour change for
    // every instance that never asked for this feature.
    const seen: { params?: unknown } = {}
    const driver = new ClaudeCodeDriver({ query: fakeSdk([resultMessage], seen) })
    await collect(driver)
    expect('mcpServers' in optionsOf(seen)).toBe(false)
  })
})

describe('MCP health', () => {
  const initMessage = {
    type: 'system' as const,
    subtype: 'init',
    mcpServers: [
      { name: 'ha', status: 'connected' },
      { name: 'notion', status: 'needs-auth' },
      { name: 'broken', status: 'failed', error: 'spawn ENOENT' },
    ],
  }

  it('reports every declared server as unknown before a turn has run', async () => {
    // True, and better than an empty list: "you have no servers" is what an
    // empty list says to somebody who just configured two.
    const driver = new ClaudeCodeDriver({
      query: fakeSdk([resultMessage]),
      mcpServers: [{ name: 'ha', url: 'https://ha/mcp' }, { name: 'cutlist', command: 'node' }],
    })
    expect(await driver.mcpStatus()).toEqual([
      { name: 'ha', state: 'unknown' },
      { name: 'cutlist', state: 'unknown' },
    ])
  })

  it('reads what the session said, states and reasons alike', async () => {
    const driver = new ClaudeCodeDriver({
      query: fakeSdk([initMessage, resultMessage]),
      mcpServers: [{ name: 'ha', url: 'https://ha/mcp' }],
    })
    await collect(driver)
    expect(await driver.mcpStatus()).toEqual([
      // needs-auth survives as itself: it is a job for a person, not a failure.
      { name: 'ha', state: 'connected' },
      { name: 'notion', state: 'needs-auth' },
      { name: 'broken', state: 'failed', error: 'spawn ENOENT' },
    ])
  })

  it('calls a state it has never met unknown, not failed', async () => {
    // A word the CLI invents is not evidence a server is down, and saying
    // "down" about a working server is the more expensive mistake.
    const driver = new ClaudeCodeDriver({
      query: fakeSdk([
        { type: 'system' as const, subtype: 'init', mcpServers: [{ name: 'x', status: 'reticulating' }] },
        resultMessage,
      ]),
      mcpServers: [{ name: 'x', command: 'node' }],
    })
    await collect(driver)
    expect(await driver.mcpStatus()).toEqual([{ name: 'x', state: 'unknown' }])
  })

  it('learns its version from the session that announces it', async () => {
    // There is no probe to run: the SDK owns the binary. The CLI says what it
    // is when a session opens, and nothing was reading it — so the header
    // read "Claude Code unknown" forever.
    const driver = new ClaudeCodeDriver({
      query: fakeSdk([
        { type: 'system' as const, subtype: 'init', claude_code_version: '2.1.220' },
        resultMessage,
      ]),
    })
    expect((await driver.describe()).cliVersion).toBe('unknown')
    await collect(driver)
    expect((await driver.describe()).cliVersion).toBe('2.1.220')
  })

  it('does not declare the capability when it wired nothing', async () => {
    // A panel offering to report the health of nothing looks broken.
    const bare = new ClaudeCodeDriver({ query: fakeSdk([]) })
    expect((await bare.describe()).capabilities).not.toContain('mcpStatus')
    const wired = new ClaudeCodeDriver({
      query: fakeSdk([]),
      mcpServers: [{ name: 'ha', url: 'https://ha/mcp' }],
    })
    expect((await wired.describe()).capabilities).toContain('mcpStatus')
  })
})

describe('an MCP server that authenticates itself', () => {
  const HUB = {
    name: 'maps',
    url: 'https://hub.example/maps',
    auth: {
      tokenUrl: 'https://auth.example/token',
      clientId: 'agent-golem',
      clientSecret: 's3cret',
      scope: 'mcp',
    },
  }

  const minting = (answers: readonly (string | undefined)[]) => {
    let index = 0
    return vi.fn(() => {
      const token = answers[Math.min(index++, answers.length - 1)]
      return Promise.resolve({
        ok: token !== undefined,
        status: token === undefined ? 401 : 200,
        json: () => Promise.resolve({ access_token: token, expires_in: 3600 }),
      } as unknown as Response)
    }) as unknown as typeof fetch
  }

  it('puts a freshly minted bearer in the header', async () => {
    const seen: { params?: unknown } = {}
    const driver = new ClaudeCodeDriver({
      query: fakeSdk([resultMessage], seen),
      mcpServers: [HUB],
      fetchImpl: minting(['abc']),
    })
    await collect(driver)

    const servers = (seen.params as { options: { mcpServers: Record<string, { headers: Record<string, string> }> } })
      .options.mcpServers
    expect(servers['maps']).toMatchObject({
      type: 'http',
      url: 'https://hub.example/maps',
      headers: { Authorization: 'Bearer abc' },
    })
  })

  it('drops the server rather than calling a hub unauthenticated', async () => {
    // A wall of 401s reads to an agent as "this tool is broken". One tool
    // fewer reads as one tool fewer.
    const seen: { params?: unknown } = {}
    const driver = new ClaudeCodeDriver({
      query: fakeSdk([resultMessage], seen),
      mcpServers: [HUB, { name: 'local', command: 'node' }],
      fetchImpl: minting([undefined]),
    })
    await collect(driver)

    const servers = (seen.params as { options: { mcpServers: Record<string, unknown> } }).options.mcpServers
    expect(servers['maps']).toBeUndefined()
    // And the servers that need no token are untouched by the hub's outage.
    expect(servers['local']).toMatchObject({ type: 'stdio', command: 'node' })
  })
})

describe('a server that serves somebody’s own data', () => {
  const HUB_USER = { name: 'google', url: 'https://hub.example/google/', identity: 'user' as const }
  const HUB_MACHINE = {
    name: 'maps',
    url: 'https://hub.example/maps/',
    auth: { tokenUrl: 'https://auth.example/token', clientId: 'agent', clientSecret: 's' },
  }

  const minting = () =>
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ access_token: 'machine-tok', expires_in: 3600 }),
      } as unknown as Response),
    ) as unknown as typeof fetch

  const serversOf = (seen: { params?: unknown }) =>
    (seen.params as { options: { mcpServers?: Record<string, { headers?: Record<string, string> }> } })
      .options.mcpServers ?? {}

  it('acts as the caller, never as the instance', async () => {
    const seen: { params?: unknown } = {}
    const driver = new ClaudeCodeDriver({
      query: fakeSdk([resultMessage], seen),
      mcpServers: [HUB_USER, HUB_MACHINE],
      fetchImpl: minting(),
    })
    await collect(driver, 'hi', { callerToken: 'jeton-de-sebastien' })

    const servers = serversOf(seen)
    expect(servers['google']?.headers?.['Authorization']).toBe('Bearer jeton-de-sebastien')
    // And the machine server keeps the machine identity: one turn, two
    // identities, each where it belongs.
    expect(servers['maps']?.headers?.['Authorization']).toBe('Bearer machine-tok')
  })

  it('is absent from a turn that has no caller', async () => {
    // THE property this exists for: the clock and an inbound delegation have
    // nobody to act as, so nothing that runs while you sleep can write in
    // your calendar. Not a limitation — the point.
    const seen: { params?: unknown } = {}
    const driver = new ClaudeCodeDriver({
      query: fakeSdk([resultMessage], seen),
      mcpServers: [HUB_USER, HUB_MACHINE],
      fetchImpl: minting(),
    })
    await collect(driver)

    const servers = serversOf(seen)
    expect(servers['google']).toBeUndefined()
    expect(servers['maps']).toBeDefined()
  })

  it('never sends the caller’s token to a machine server', async () => {
    const seen: { params?: unknown } = {}
    const driver = new ClaudeCodeDriver({
      query: fakeSdk([resultMessage], seen),
      mcpServers: [HUB_MACHINE],
      fetchImpl: minting(),
    })
    await collect(driver, 'hi', { callerToken: 'jeton-de-sebastien' })
    expect(JSON.stringify(serversOf(seen))).not.toContain('jeton-de-sebastien')
  })
})

describe('the two postures', () => {
  it('bypasses permissions when no desk is configured', async () => {
    // `open`. And the bypass is EXPLICIT: removing the prompt surface without
    // it makes the SDK deny what it meant to ask (measured 2026-08-26), which
    // is silent failure rather than freedom.
    const seen: { params?: unknown } = {}
    const driver = new ClaudeCodeDriver({ query: fakeSdk([resultMessage], seen) })
    await collect(driver)
    const options = (seen.params as { options: Record<string, unknown> }).options
    expect(options['permissionMode']).toBe('bypassPermissions')
    expect(options['allowDangerouslySkipPermissions']).toBe(true)
    expect(options['canUseTool']).toBeUndefined()
    expect((await driver.describe()).capabilities).not.toContain('interactivePermissions')
  })

  it('lets the engine decide, and asks a person for its residue', async () => {
    // `ask`. Deliberately NOT the SDK's `auto` mode: its classifier approved a
    // `rm -rf` without ever calling back (measured), so it is a bypass wearing
    // a gate's name.
    const seen: { params?: unknown } = {}
    const driver = new ClaudeCodeDriver({
      query: fakeSdk([resultMessage], seen),
      asks: new AskDesk(),
    })
    await collect(driver)
    const options = (seen.params as { options: Record<string, unknown> }).options
    expect(options['permissionMode']).toBe('default')
    expect(typeof options['canUseTool']).toBe('function')
    expect((await driver.describe()).capabilities).toContain('interactivePermissions')
  })

  it('hands the engine back its OWN suggestion, untouched, on "always"', async () => {
    // How a durable answer is kept without Golem keeping a list: the engine
    // writes the rule into its own file in the workspace and reads it back on
    // every later turn. Untouched is deliberate — an earlier version pinned
    // these to `destination: 'session'`, which dies with the turn's process,
    // so the answer had to be given again at the very next message.
    const desk = new AskDesk()
    const seen: { params?: unknown } = {}
    // Held open until the question is answered: a turn that ended would have
    // released its questions with a refusal, which is the other behaviour.
    let releaseTurn: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      releaseTurn = resolve
    })
    const query: QueryFn = (params) => {
      seen.params = params
      return {
        async *[Symbol.asyncIterator]() {
          await held
          yield resultMessage
        },
        interrupt: () => Promise.resolve(undefined),
      }
    }

    const driver = new ClaudeCodeDriver({ query, asks: desk })
    const turn = (async () => {
      for await (const _ of driver.runTurn({ prompt: 'x', cwd: '/tmp' })) {
        // drain
      }
    })()

    await vi.waitFor(() => expect(seen.params).toBeDefined())
    const { canUseTool } = (seen.params as { options: { canUseTool: CanUseToolFn } }).options
    // As the real SDK hands them over: destined for a file on disk, which is
    // exactly what makes the answer outlive the turn.
    const suggestions = [
      { type: 'addRules', rules: [{ toolName: 'WebFetch' }], destination: 'localSettings' },
    ]
    const decision = canUseTool(
      'WebFetch',
      { url: 'https://example.com' },
      { suggestions, title: 'Claude wants to fetch example.com' },
    )

    await vi.waitFor(() => expect(desk.outstanding()).toHaveLength(1))
    expect(desk.outstanding()[0]).toMatchObject({
      tool: 'WebFetch',
      // The engine's own sentence, carried through untouched.
      title: 'Claude wants to fetch example.com',
      remembering: true,
    })
    desk.answer(desk.outstanding()[0]!.id, 'always')

    expect(await decision).toEqual({
      behavior: 'allow',
      updatedInput: { url: 'https://example.com' },
      updatedPermissions: suggestions,
    })
    releaseTurn()
    await turn
  })

  it('offers no "this conversation" when the engine gave nothing to remember', async () => {
    // A button that promises silence and does not deliver it is worse than one
    // more question, so the option is HIDDEN rather than shown and inert.
    const desk = new AskDesk()
    const seen: { params?: unknown } = {}
    let releaseTurn: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      releaseTurn = resolve
    })
    const query: QueryFn = (params) => {
      seen.params = params
      return {
        async *[Symbol.asyncIterator]() {
          await held
          yield resultMessage
        },
        interrupt: () => Promise.resolve(undefined),
      }
    }
    const driver = new ClaudeCodeDriver({ query, asks: desk })
    const turn = (async () => {
      for await (const _ of driver.runTurn({ prompt: 'x', cwd: '/tmp' })) {
        // drain
      }
    })()

    await vi.waitFor(() => expect(seen.params).toBeDefined())
    const { canUseTool } = (seen.params as { options: { canUseTool: CanUseToolFn } }).options
    const decision = canUseTool('Bash', { command: 'rm -rf build' }, {})

    await vi.waitFor(() => expect(desk.outstanding()).toHaveLength(1))
    const [ask] = desk.outstanding()
    expect(ask!.remembering).toBe(false)
    // No engine sentence either: the tool and its target, never elided.
    expect(ask!.title).toBe('Bash — rm -rf build')

    desk.answer(ask!.id, 'once')
    // `once` allows this call and nothing more — no rule goes back.
    expect(await decision).toEqual({
      behavior: 'allow',
      updatedInput: { command: 'rm -rf build' },
    })
    releaseTurn()
    await turn
  })

  it('refuses without asking when nobody is watching', async () => {
    // A scheduled note or a delegation: the question would hold a turn slot
    // for five minutes waiting on a screen that does not exist.
    const seen: { params?: unknown } = {}
    const driver = new ClaudeCodeDriver({
      query: fakeSdk([resultMessage], seen),
      asks: new AskDesk(),
    })
    for await (const _ of driver.runTurn({ prompt: 'x', cwd: '/tmp', unattended: true })) {
      // drain
    }
    const canUseTool = (seen.params as { options: { canUseTool: Function } }).options.canUseTool
    expect(await canUseTool('WebFetch', {}, { suggestions: [] })).toEqual({
      behavior: 'deny',
      message: 'refused by the user',
    })
  })
})
