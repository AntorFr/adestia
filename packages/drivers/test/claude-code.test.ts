/**
 * Driver conformance for `claude-code`, against a fake SDK.
 *
 * This is the pattern every Golem driver must follow: replay the message
 * sequence the real CLI produces, and assert the events the UI receives. No
 * account, no network, no CLI binary — otherwise driver behaviour is only ever
 * tested by accident, in production, by a user.
 */

import { describe, expect, it } from 'vitest'

import { ClaudeCodeDriver } from '../src/claude-code/driver.js'
import { toolTarget } from '../src/claude-code/events.js'
import { checkConformance } from '../src/conformance.js'
import type { TurnEvent } from '../src/contract.js'
import type { QueryFn, SdkMessage } from '../src/claude-code/sdk-types.js'

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

async function collect(driver: ClaudeCodeDriver, prompt = 'hi'): Promise<TurnEvent[]> {
  const events: TurnEvent[] = []
  for await (const event of driver.runTurn({ prompt, cwd: '/tmp' })) events.push(event)
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
