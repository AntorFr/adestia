/**
 * The Copilot driver, against a fake binary.
 *
 * Spike 3 proved this is enough: the whole JSONL path, the auth failures and
 * the session plumbing were exercised there with zero GitHub credentials, by
 * pointing the real CLI at a mock provider. Here the binary itself is faked,
 * which is faster and covers the same contract.
 */

import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { describe, expect, it, vi } from 'vitest'

import { checkConformance } from '../src/conformance.js'
import type { TurnEvent, TurnRequest } from '../src/contract.js'
import { CopilotDriver } from '../src/copilot-cli/driver.js'
import {
  classifyAuthError,
  copilotEnv,
  explainAuthProblem,
  looksLikeToken,
} from '../src/copilot-cli/auth.js'
import { newTranslationState, parseLine, toolTargetOf, translate } from '../src/copilot-cli/events.js'

describe('event parsing', () => {
  it('reads a JSONL line', () => {
    expect(parseLine('{"type":"result","data":{}}')?.type).toBe('result')
  })

  it('skips a malformed line rather than ending the turn', () => {
    // The CLI writes progress to the same stream; one unparseable line must
    // not end a turn that is otherwise fine.
    expect(parseLine('{broken')).toBeUndefined()
    expect(parseLine('   ')).toBeUndefined()
  })
})

describe('translation', () => {
  const run = (events: readonly Record<string, unknown>[]): TurnEvent[] => {
    const state = newTranslationState()
    return events.flatMap((event) => [...translate(event as never, state)])
  }

  it('streams text from deltas', () => {
    expect(
      run([
        { type: 'assistant.message_delta', data: { deltaContent: 'Bon' } },
        { type: 'assistant.message_delta', data: { deltaContent: 'jour' } },
      ]),
    ).toEqual([
      { type: 'text-delta', text: 'Bon' },
      { type: 'text-delta', text: 'jour' },
    ])
  })

  it('does not print the answer twice', () => {
    // `assistant.message` repeats in full what the deltas already carried.
    expect(
      run([
        { type: 'assistant.message_delta', data: { deltaContent: 'hello' } },
        { type: 'assistant.message', data: { content: 'hello' } },
      ]).filter((event) => event.type === 'text-delta'),
    ).toHaveLength(1)
  })

  it('pairs a tool call with its result by id', () => {
    // Ids matter here: Copilot runs tools in parallel, and matching by name
    // would label the wrong call.
    const state = newTranslationState()
    const events = [
      ...translate({ type: 'tool.execution_start', data: { toolCallId: '1', toolName: 'bash', arguments: { command: 'ls' } } } as never, state),
      ...translate({ type: 'tool.execution_start', data: { toolCallId: '2', toolName: 'bash', arguments: { command: 'pwd' } } } as never, state),
      ...translate({ type: 'tool.execution_complete', data: { toolCallId: '1', success: false } } as never, state),
    ]
    expect(events).toEqual([
      { type: 'tool-use', name: 'bash', target: 'ls' },
      { type: 'tool-use', name: 'bash', target: 'pwd' },
      { type: 'tool-result', name: 'bash', ok: false },
    ])
  })

  it('reports a failed MCP server instead of leaving a tool mysteriously absent', () => {
    const events = run([
      {
        type: 'session.mcp_server_status_changed',
        data: { serverName: 'rosetta', status: 'failed', error: 'connection refused' },
      },
    ])
    expect(events[0]).toMatchObject({ type: 'error', fatal: false })
    expect((events[0] as { message: string }).message).toContain('rosetta')
  })

  it('says nothing about an MCP server that started fine', () => {
    expect(run([{ type: 'session.mcp_server_status_changed', data: { status: 'ready' } }])).toEqual([])
  })

  it('ends on the result line and keeps the session id', () => {
    const events = run([{ type: 'result', data: { sessionId: 'sess-7', exitCode: 0 } }])
    expect(events[0]).toMatchObject({ type: 'result', sessionId: 'sess-7', stopped: false })
  })

  it('treats a non-zero exit as a stopped turn', () => {
    expect(run([{ type: 'result', data: { sessionId: 's', exitCode: 1 } }])[0]).toMatchObject({
      stopped: true,
    })
  })

  it('ignores event types it does not consume', () => {
    // The CLI emits far more than this driver reads, and gains more per release.
    expect(run([{ type: 'session.skills_loaded', data: {} }, { type: 'brand.new.event' }])).toEqual([])
  })
})

describe('tool targets', () => {
  it('prefers the telling argument', () => {
    expect(toolTargetOf({ arguments: { command: 'npm test', cwd: '/tmp' } })).toBe('npm test')
  })

  it('flattens and truncates', () => {
    const target = toolTargetOf({ arguments: { command: 'x'.repeat(200) } })
    expect(target).toHaveLength(78)
  })

  it('says nothing rather than guessing', () => {
    expect(toolTargetOf({ arguments: { unexpected: 1 } })).toBeUndefined()
    expect(toolTargetOf(undefined)).toBeUndefined()
  })
})

describe('authentication', () => {
  it('recognises the three states the CLI actually prints', () => {
    // Captured from binary 1.0.80; pinned to a version, not to a documented API.
    expect(classifyAuthError('Error: No authentication information found.')).toBe('absent')
    expect(classifyAuthError('Error: Classic Personal Access Tokens (ghp_) are not supported')).toBe(
      'classic-pat',
    )
    expect(
      classifyAuthError('Error: Authentication token found but could not be validated.'),
    ).toBe('unvalidated')
  })

  it('does not see an auth problem in ordinary output', () => {
    expect(classifyAuthError('Error: file not found')).toBeUndefined()
  })

  it('does not claim revocation it cannot know', () => {
    // The CLI itself hedges ("your token may still be valid, check your
    // network"), so the driver must hedge too.
    expect(explainAuthProblem('unvalidated')).toMatch(/network may simply be down/)
  })

  it('rejects a classic PAT before it is ever stored', () => {
    expect(looksLikeToken('ghp_0123456789abcdefghij')).toBe(false)
    expect(looksLikeToken('github_pat_0123456789abcdefghij')).toBe(true)
    expect(looksLikeToken('gho_0123456789abcdefghij')).toBe(true)
    expect(looksLikeToken('not-a-token')).toBe(false)
  })
})

describe('the environment a run needs', () => {
  it('isolates state under the driver-owned home', () => {
    expect(copilotEnv({}, '/data/copilot').COPILOT_HOME).toBe('/data/copilot')
  })

  it('pins the binary against its own self-update', () => {
    // The CLI self-updates by default: a pinned version silently replaces
    // itself unless told not to.
    expect(copilotEnv({}, '/x').COPILOT_AUTO_UPDATE).toBe('false')
  })

  it('keeps the inherited environment', () => {
    expect(copilotEnv({ PATH: '/usr/bin' }, '/x').PATH).toBe('/usr/bin')
  })
})

/** A fake `copilot` binary. */
function fakeCopilot() {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const child = Object.assign(new EventEmitter(), { stdout, stderr, kill: vi.fn(() => true) })
  const spawns: { args: readonly string[]; env: NodeJS.ProcessEnv }[] = []
  const spawnImpl = ((_cmd: string, args: readonly string[], options: { env: NodeJS.ProcessEnv }) => {
    spawns.push({ args, env: options.env })
    return child
  }) as unknown as typeof import('node:child_process').spawn
  return { child, stdout, stderr, spawnImpl, spawns }
}

const collect = async (driver: CopilotDriver, request: TurnRequest = { prompt: 'hi', cwd: '/tmp' }) => {
  const events: TurnEvent[] = []
  for await (const event of driver.runTurn(request)) events.push(event)
  return events
}

describe('driver', () => {
  it('implements everything it declares', async () => {
    const driver = new CopilotDriver({ home: '/data/copilot', models: [{ id: 'gpt-5.6-sol' }] })
    expect(checkConformance(driver, await driver.describe())).toEqual([])
  })

  it('promises no per-turn cost or live counter', async () => {
    // Copilot bills AI credits, aggregated daily by an API; the stream carries
    // no running token count. Declaring either would put a number in the UI
    // that means something else entirely.
    const { capabilities } = await new CopilotDriver({ home: '/x' }).describe()
    expect(capabilities).not.toContain('cost')
    expect(capabilities).not.toContain('liveTurnUsage')
    expect(capabilities).not.toContain('subscriptionQuotas')
  })

  it('runs the documented headless flags', async () => {
    const fake = fakeCopilot()
    const driver = new CopilotDriver({ home: '/x', spawnImpl: fake.spawnImpl })
    const turn = collect(driver, { prompt: 'salut', cwd: '/w' })

    fake.stdout.write('{"type":"result","data":{"sessionId":"s1","exitCode":0}}\n')
    fake.child.emit('close', 0)
    await turn

    expect(fake.spawns[0]?.args).toEqual([
      '--prompt',
      'salut',
      '--output-format',
      'json',
      '--allow-all-tools',
      '--no-auto-update',
    ])
  })

  it('resumes a session and selects a model when asked', async () => {
    const fake = fakeCopilot()
    const driver = new CopilotDriver({ home: '/x', spawnImpl: fake.spawnImpl })
    const turn = collect(driver, { prompt: 'x', cwd: '/w', sessionId: 's9', model: 'gpt-5.6-sol' })
    fake.stdout.write('{"type":"result","data":{"sessionId":"s9","exitCode":0}}\n')
    fake.child.emit('close', 0)
    await turn

    expect(fake.spawns[0]?.args).toContain('--resume')
    expect(fake.spawns[0]?.args).toContain('s9')
    expect(fake.spawns[0]?.args).toContain('gpt-5.6-sol')
  })

  it('streams a whole turn', async () => {
    const fake = fakeCopilot()
    const driver = new CopilotDriver({ home: '/x', spawnImpl: fake.spawnImpl })
    const turn = collect(driver)

    fake.stdout.write('{"type":"assistant.message_delta","data":{"deltaContent":"Bon"}}\n')
    fake.stdout.write('{"type":"assistant.message_delta","data":{"deltaContent":"jour"}}\n')
    fake.stdout.write('{"type":"result","data":{"sessionId":"s1","exitCode":0}}\n')
    fake.child.emit('close', 0)

    expect(await turn).toEqual([
      { type: 'text-delta', text: 'Bon' },
      { type: 'text-delta', text: 'jour' },
      // No `usage`, because the CLI reported none: an empty usage object would
      // make the UI show a zero it has no basis for.
      { type: 'result', sessionId: 's1', stopped: false },
    ])
  })

  it('reports the duration when the CLI gives one, and no token count', async () => {
    // `premiumRequests` is a REQUEST count. Reporting it as tokens would put a
    // number in the context pill that means something entirely different.
    const fake = fakeCopilot()
    const driver = new CopilotDriver({ home: '/x', spawnImpl: fake.spawnImpl })
    const turn = collect(driver)

    fake.stdout.write(
      '{"type":"result","data":{"sessionId":"s1","exitCode":0,"usage":{"premiumRequests":3,"sessionDurationMs":4200}}}\n',
    )
    fake.child.emit('close', 0)

    const [event] = await turn
    if (event?.type !== 'result') throw new Error('expected a result event')
    expect(event.usage).toMatchObject({ durationMs: 4200, costUsd: null })
    expect(event.usage?.outputTokens).toBeUndefined()
    expect(event.usage?.contextTokens).toBeUndefined()
  })

  it('reassembles a JSONL line split across chunks', async () => {
    // A pipe read has no relationship to a line boundary.
    const fake = fakeCopilot()
    const driver = new CopilotDriver({ home: '/x', spawnImpl: fake.spawnImpl })
    const turn = collect(driver)

    fake.stdout.write('{"type":"assistant.message_delta","data":{"delta')
    fake.stdout.write('Content":"split"}}\n{"type":"result","data":{"sessionId":"s","exitCode":0}}\n')
    fake.child.emit('close', 0)

    expect((await turn)[0]).toEqual({ type: 'text-delta', text: 'split' })
  })

  it('reports a missing credential, which never appears in the JSON stream', async () => {
    // The single most common failure, and a driver reading only JSONL reports
    // nothing at all for it: stdout is empty, the message is prose on stderr.
    const fake = fakeCopilot()
    const driver = new CopilotDriver({ home: '/x', spawnImpl: fake.spawnImpl })
    const turn = collect(driver)

    fake.stderr.write('Error: No authentication information found.\n')
    fake.child.emit('close', 1)

    const events = await turn
    expect(events[0]).toMatchObject({ type: 'error', fatal: true })
    expect((events[0] as { message: string }).message).toContain('arm a fine-grained token')
    // And the driver now knows it is unarmed.
    expect(await driver.authStatus()).toMatchObject({ state: 'invalid' })
  })

  it('surfaces an unexplained crash with whatever the CLI said', async () => {
    const fake = fakeCopilot()
    const driver = new CopilotDriver({ home: '/x', spawnImpl: fake.spawnImpl })
    const turn = collect(driver)
    fake.stderr.write('Segmentation fault\n')
    fake.child.emit('close', 139)
    expect((await turn)[0]).toMatchObject({ type: 'error', message: 'Segmentation fault' })
  })

  it('refuses a classic PAT with the reason people get wrong twice', async () => {
    const driver = new CopilotDriver({ home: '/x' })
    expect(() => driver.completeAuth('s', 'ghp_0123456789abcdefghij')).toThrow(/classic PAT/)
  })

  it('accepts a fine-grained token', async () => {
    const driver = new CopilotDriver({ home: '/x' })
    expect(await driver.completeAuth('s', ' github_pat_0123456789abcdefghij ')).toEqual({
      secret: 'github_pat_0123456789abcdefghij',
    })
  })

  it('hands the token over through the variable it declares', async () => {
    const fake = fakeCopilot()
    const driver = new CopilotDriver({ home: '/x', spawnImpl: fake.spawnImpl })
    driver.setCredentials({ [driver.credentialVar]: 'github_pat_x' }, '2026-06-01')

    const turn = collect(driver)
    fake.stdout.write('{"type":"result","data":{"sessionId":"s","exitCode":0}}\n')
    fake.child.emit('close', 0)
    await turn

    expect(fake.spawns[0]?.env['COPILOT_GITHUB_TOKEN']).toBe('github_pat_x')
    expect(await driver.authStatus()).toMatchObject({ state: 'armed', savedAt: '2026-06-01' })
  })

  it('refuses to interrupt a session that is not running', async () => {
    const driver = new CopilotDriver({ home: '/x' })
    expect(() => driver.interrupt('ghost')).toThrow(/No running turn/)
  })
})
