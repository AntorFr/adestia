/**
 * The Copilot driver, against a fake binary.
 *
 * Spike 3 proved this is enough: the whole JSONL path, the auth failures and
 * the session plumbing were exercised there with zero GitHub credentials, by
 * pointing the real CLI at a mock provider. Here the binary itself is faked,
 * which is faster and covers the same contract.
 */

import { EventEmitter } from 'node:events'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
import { harvestToken, ptyLogin, startDeviceCodeLogin, type DeviceCodeLogin } from '../src/copilot-cli/login.js'

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

  it('reads the session id from the result top level, where the CLI puts it', () => {
    // `result` is the one event the CLI does not wrap in `data` — every
    // capture in spikes/copilot-cli/raw has sessionId, exitCode and usage as
    // siblings of `type`, and no `data` key at all. Missing this resumed
    // nothing, so every turn started a fresh session.
    const events = run([
      { type: 'result', sessionId: 'sess-top', exitCode: 0 } as never,
    ])
    expect(events[0]).toMatchObject({ type: 'result', sessionId: 'sess-top', stopped: false })
  })

  it('keeps the session id it already knows when the result states a blank one', () => {
    // The failure was a thread with no past, and an empty string is how it
    // looked. `??` does not skip one, so a CLI sending the key empty would
    // overwrite a good id and bring the bug straight back.
    const events = run([
      { type: 'result', sessionId: 'sess-known', exitCode: 0 } as never,
      { type: 'result', sessionId: '   ', exitCode: 0 } as never,
    ])
    expect(events[1]).toMatchObject({ type: 'result', sessionId: 'sess-known' })
  })

  it('still reads a result that wraps its fields in data', () => {
    // No capture proves that shape never existed, so it stays readable —
    // dropping it would be trading one silent regression for another.
    const events = run([{ type: 'result', data: { sessionId: 'sess-wrapped', exitCode: 0 } }])
    expect(events[0]).toMatchObject({ type: 'result', sessionId: 'sess-wrapped', stopped: false })
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

describe('the device-code login flow', () => {
  /** A fake `copilot login` child with a writable stdin we can inspect. */
  function fakeLogin() {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const child = Object.assign(new EventEmitter(), { stdin, stdout, stderr, kill: vi.fn(() => true) })
    let toStdin = ''
    stdin.on('data', (chunk: Buffer) => {
      toStdin += chunk.toString('utf8')
    })
    const spawnImpl = (() => child) as unknown as typeof import('node:child_process').spawn
    return { child, stdout, stderr, spawnImpl, stdinText: () => toStdin }
  }

  /** Stdin is a stream: let its `data` events land before asserting on them. */
  const flush = () => new Promise((resolve) => setImmediate(resolve))

  function storedToken(home: string, token = 'gho_harvested0123456789'): void {
    writeFileSync(
      join(home, 'config.json'),
      `// managed automatically\n{"copilotTokens":{"https://github.com:me":"${token}"}}`,
    )
  }

  it('announces the code the CLI prints, then harvests the stored token', async () => {
    const home = mkdtempSync(join(tmpdir(), 'copilot-login-'))
    storedToken(home)
    const fake = fakeLogin()

    // The listeners attach synchronously, so writing after the call is safe.
    const flowPromise = startDeviceCodeLogin({ command: 'copilot', home, baseEnv: {}, spawnImpl: fake.spawnImpl })
    fake.stdout.write('To authenticate, visit https://github.com/login/device and enter code ABCD-1234\n')
    const flow = await flowPromise
    expect(flow).toMatchObject({ userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device' })

    fake.stdout.write('System keychain unavailable. Store token in plaintext config file? (y/N) ')
    flow.consentToPlaintextStorage()
    fake.child.emit('close', 0)
    expect(await flow.completed).toBe('gho_harvested0123456789')
    expect(fake.stdinText()).toBe('y\n')
  })

  it('leaves the plaintext question unanswered until the user consents', async () => {
    // The whole bug: the CLI blocks on a human question. Answering it in the
    // user's name would write their OAuth token unencrypted without asking.
    const home = mkdtempSync(join(tmpdir(), 'copilot-login-'))
    const fake = fakeLogin()
    const flowPromise = startDeviceCodeLogin({ command: 'copilot', home, baseEnv: {}, spawnImpl: fake.spawnImpl })
    fake.stdout.write('enter code ABCD-1234\n')
    const flow = await flowPromise

    fake.stdout.write('Store token in plaintext config file? (y/N) ')
    await flush()
    expect(fake.stdinText()).toBe('')

    flow.consentToPlaintextStorage()
    await flush()
    expect(fake.stdinText()).toBe('y\n')
  })

  it('consents blind, then says what is stuck when the question is worded otherwise', async () => {
    // The question's exact wording is inferred, not captured. If it moves, the
    // consent still goes out and the flow fails with a reason — rather than
    // hanging silently until the device code expires, which is what shipped.
    const home = mkdtempSync(join(tmpdir(), 'copilot-login-'))
    const fake = fakeLogin()
    const flowPromise = startDeviceCodeLogin({
      command: 'copilot',
      home,
      baseEnv: {},
      spawnImpl: fake.spawnImpl,
      afterConsentMs: 10,
    })
    fake.stdout.write('enter code ABCD-1234\n')
    const flow = await flowPromise

    fake.stdout.write('Signed in successfully\nWhere should the token live? [1] vault [2] file ')
    flow.consentToPlaintextStorage()
    await flush()
    expect(fake.stdinText()).toBe('y\n')
    await expect(flow.completed).rejects.toThrow(/did not recognise/)
    expect(fake.child.kill).toHaveBeenCalled()
  })

  it('names the system keychain when the login stored nothing readable', async () => {
    // Exit 0, no question asked, no file: the token went to the OS credential
    // store. "Stored no token" would read like the login failed; it did not.
    const home = mkdtempSync(join(tmpdir(), 'copilot-login-'))
    const fake = fakeLogin()
    const flowPromise = startDeviceCodeLogin({ command: 'copilot', home, baseEnv: {}, spawnImpl: fake.spawnImpl })
    fake.stdout.write('enter code WXYZ-9999\n')
    const flow = await flowPromise
    fake.child.emit('close', 0)
    await expect(flow.completed).rejects.toThrow(/system credential store/)
  })

  it('reports the plain failure when the question was asked and answered', async () => {
    const home = mkdtempSync(join(tmpdir(), 'copilot-login-'))
    const fake = fakeLogin()
    const flowPromise = startDeviceCodeLogin({ command: 'copilot', home, baseEnv: {}, spawnImpl: fake.spawnImpl })
    fake.stdout.write('enter code WXYZ-9999\n')
    const flow = await flowPromise
    fake.stdout.write('Store token in plaintext config file? (y/N) ')
    flow.consentToPlaintextStorage()
    fake.child.emit('close', 0) // exit 0 but no config.json written
    await expect(flow.completed).rejects.toThrow(/stored no token/)
  })

  it('never lets a token ride out on an error message', async () => {
    // These strings are rendered in the browser, which is never given a secret.
    const home = mkdtempSync(join(tmpdir(), 'copilot-login-'))
    const fake = fakeLogin()
    const flowPromise = startDeviceCodeLogin({ command: 'copilot', home, baseEnv: {}, spawnImpl: fake.spawnImpl })
    fake.stdout.write('enter code WXYZ-9999\n')
    const flow = await flowPromise
    fake.stderr.write('failed while writing gho_leakedsecret0123456789\n')
    fake.child.emit('close', 1)
    await expect(flow.completed).rejects.toThrow(/gh\*_\*\*\*/)
  })

  it('pins the binary for the login too', async () => {
    // A login that lets the CLI self-update swaps out the version every other
    // spawn in this driver is pinned to.
    const home = mkdtempSync(join(tmpdir(), 'copilot-login-'))
    const spawned: { env?: NodeJS.ProcessEnv }[] = []
    const fake = fakeLogin()
    const spy = ((_cmd: string, _args: string[], options: { env?: NodeJS.ProcessEnv }) => {
      spawned.push(options)
      return fake.child
    }) as unknown as typeof import('node:child_process').spawn
    const flowPromise = startDeviceCodeLogin({ command: 'copilot', home, baseEnv: {}, spawnImpl: spy })
    fake.stdout.write('enter code ABCD-1234\n')
    await flowPromise
    expect(spawned[0]?.env).toMatchObject({ COPILOT_AUTO_UPDATE: 'false', COPILOT_HOME: home })
    // CI would be read as "do not ask", and the question is the point.
    expect(spawned[0]?.env?.CI).toBeUndefined()
  })

  it('says the CLI declined for us when it was never given a terminal', async () => {
    // Measured against 1.0.80 in a container: with piped stdio the CLI answers
    // its own question with "no" and calls the login a success. Reading that
    // as a keychain would send someone to fix a keychain that is not there.
    const home = mkdtempSync(join(tmpdir(), 'copilot-login-'))
    const fake = fakeLogin()
    const flowPromise = startDeviceCodeLogin({ command: 'copilot', home, baseEnv: {}, spawnImpl: fake.spawnImpl })
    fake.stdout.write('enter code ABCD-1234\n')
    const flow = await flowPromise
    fake.stderr.write(
      'Login succeeded, but the token was not saved. Install a system keychain or rerun login and accept plaintext storage.\n',
    )
    fake.child.emit('close', 1)
    await expect(flow.completed).rejects.toThrow(/never asked|did not get one/)
  })

  it('runs the login under a pty, because the question is TTY-gated', async () => {
    // Verified in 1.0.80's bundle: the prompt sits behind
    // `process.stdin.isTTY && process.stdout.isTTY`. Piped, it is skipped.
    expect(ptyLogin('/usr/local/bin/copilot', 'linux')).toEqual({
      file: 'script',
      args: ['-qec', "'/usr/local/bin/copilot' login --device-code", '/dev/null'],
    })
    // BSD script takes an argv, not a shell string; passing one to the other
    // silently runs the wrong thing.
    expect(ptyLogin('copilot', 'darwin')).toEqual({
      file: 'script',
      args: ['-q', '/dev/null', 'copilot', 'login', '--device-code'],
    })
  })

  it('quotes a binary path a shell would otherwise split', async () => {
    expect(ptyLogin("/opt/my copilot/bin/it's", 'linux').args[1]).toBe(
      "'/opt/my copilot/bin/it'\\''s' login --device-code",
    )
  })

  it('reads the token out of the commented config the CLI writes', async () => {
    const home = mkdtempSync(join(tmpdir(), 'copilot-harvest-'))
    writeFileSync(join(home, 'config.json'), '// a comment\n// another\n{"copilotTokens":{"x":"gho_abc"}}')
    expect(await harvestToken(home)).toBe('gho_abc')
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

  it('reads its prose zones, including the custom-agent folder', () => {
    const paths = new CopilotDriver({ home: '/x' }).instructionPaths()
    expect(paths).toContain('.github/agents')
    expect(paths).toContain('.github/copilot-instructions.md')
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

  it('starts with the configured custom agent', async () => {
    const fake = fakeCopilot()
    const driver = new CopilotDriver({ home: '/x', agent: 'q', spawnImpl: fake.spawnImpl })
    const turn = collect(driver)

    fake.stdout.write('{"type":"result","data":{"sessionId":"s1","exitCode":0}}\n')
    fake.child.emit('close', 0)
    await turn

    expect(fake.spawns[0]?.args).toContain('--agent')
    expect(fake.spawns[0]?.args).toContain('q')
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

  it('arms through a relayed device code, harvesting the token the CLI stored', async () => {
    const home = mkdtempSync(join(tmpdir(), 'copilot-arm-'))
    const consent = vi.fn()
    const login: DeviceCodeLogin = {
      verificationUri: 'https://github.com/login/device',
      userCode: 'ABCD-1234',
      completed: Promise.resolve('gho_0123456789abcdefghij'),
      consentToPlaintextStorage: consent,
      cancel: vi.fn(),
    }
    const driver = new CopilotDriver({ home, startLoginImpl: () => Promise.resolve(login) })

    const prompt = await driver.beginAuth()
    expect(prompt).toMatchObject({ mode: 'device-code', userCode: 'ABCD-1234' })
    // The panel cannot finish before the user accepts this, and the CLI's
    // question is not answered before they do.
    expect(prompt.consent).toMatch(/unencrypted/)
    expect(consent).not.toHaveBeenCalled()

    // The pasted input is ignored: a device code is approved in a browser, not
    // copied back.
    expect(await driver.completeAuth(prompt.sessionId, 'sentinel')).toEqual({
      secret: 'gho_0123456789abcdefghij',
    })
    expect(consent).toHaveBeenCalled()
  })

  it('refuses a login that stored a credential Copilot would reject', async () => {
    const home = mkdtempSync(join(tmpdir(), 'copilot-arm-'))
    const driver = new CopilotDriver({
      home,
      startLoginImpl: () =>
        Promise.resolve({
          verificationUri: 'u',
          userCode: 'c',
          completed: Promise.resolve('ghp_classic0123456789'),
          consentToPlaintextStorage: () => undefined,
          cancel: () => undefined,
        }),
    })
    await driver.beginAuth()
    await expect(driver.completeAuth('s', 'x')).rejects.toThrow(/will not accept/)
  })

  it('cancels a device-code login in flight', async () => {
    const home = mkdtempSync(join(tmpdir(), 'copilot-arm-'))
    const cancel = vi.fn()
    const driver = new CopilotDriver({
      home,
      startLoginImpl: () =>
        Promise.resolve({
          verificationUri: 'u',
          userCode: 'c',
          completed: new Promise<string>(() => undefined),
          consentToPlaintextStorage: () => undefined,
          cancel,
        }),
    })
    await driver.beginAuth()
    await driver.cancelAuth('s')
    expect(cancel).toHaveBeenCalled()
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

describe('outbound MCP servers', () => {
  it('writes a side file and points the CLI at it, never at argv', async () => {
    // Inline JSON would have worked and would have put every
    // `Authorization: Bearer …` in `ps` output, readable by any process.
    const home = await mkdtemp(join(tmpdir(), 'demeura-copilot-'))
    const fake = fakeCopilot()
    const driver = new CopilotDriver({
      home,
      spawnImpl: fake.spawnImpl,
      mcpServers: [
        { name: 'ha', url: 'https://ha/mcp', headers: { Authorization: 'Bearer x' } },
        { name: 'cutlist', command: 'node', args: ['./bin/x.js'] },
      ],
    })
    const turn = collect(driver, { prompt: 'salut', cwd: '/w' })
    await vi.waitFor(() => expect(fake.spawns.length).toBe(1))
    fake.stdout.write('{"type":"result","data":{"sessionId":"s1","exitCode":0}}\n')
    fake.child.emit('close', 0)
    await turn

    const path = join(home, 'demeura-mcp.json')
    expect(fake.spawns[0]?.args).toContain('--additional-mcp-config')
    expect(fake.spawns[0]?.args).toContain(`@${path}`)
    // Nothing on argv carries the header.
    expect(fake.spawns[0]?.args.join(' ')).not.toContain('Bearer x')

    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
      mcpServers: {
        // `local`, not `stdio`: the CLI's own word, captured from what
        // `copilot mcp add` actually writes rather than from the flag's help.
        cutlist: { type: 'local', command: 'node', args: ['./bin/x.js'], tools: ['*'] },
        ha: { type: 'http', url: 'https://ha/mcp', headers: { Authorization: 'Bearer x' }, tools: ['*'] },
      },
    })
    // Readable by its owner alone: it holds whatever tokens the servers need.
    expect((await stat(path)).mode & 0o777).toBe(0o600)
  })

  it('leaves the user\'s own config alone', async () => {
    // `mcp-config.json` is written by `copilot mcp add`. Demeura does not own it,
    // so Demeura does not rewrite it.
    const home = await mkdtemp(join(tmpdir(), 'demeura-copilot-'))
    await writeFile(join(home, 'mcp-config.json'), '{"mcpServers":{"mine":{}}}')
    const fake = fakeCopilot()
    const driver = new CopilotDriver({
      home,
      spawnImpl: fake.spawnImpl,
      mcpServers: [{ name: 'ha', url: 'https://ha/mcp' }],
    })
    const turn = collect(driver, { prompt: 'x', cwd: '/w' })
    await vi.waitFor(() => expect(fake.spawns.length).toBe(1))
    fake.stdout.write('{"type":"result","data":{"sessionId":"s1","exitCode":0}}\n')
    fake.child.emit('close', 0)
    await turn

    expect(await readFile(join(home, 'mcp-config.json'), 'utf8')).toBe('{"mcpServers":{"mine":{}}}')
  })

  it('adds no flag when the instance declares no server', async () => {
    const fake = fakeCopilot()
    const driver = new CopilotDriver({ home: '/x', spawnImpl: fake.spawnImpl })
    const turn = collect(driver, { prompt: 'x', cwd: '/w' })
    fake.stdout.write('{"type":"result","data":{"sessionId":"s1","exitCode":0}}\n')
    fake.child.emit('close', 0)
    await turn
    expect(fake.spawns[0]?.args).not.toContain('--additional-mcp-config')
  })
})

describe('MCP health', () => {
  const run = async (lines: readonly string[], servers: { name: string; command?: string; url?: string }[]) => {
    const fake = fakeCopilot()
    const driver = new CopilotDriver({
      home: mkdtempSync(join(tmpdir(), 'demeura-copilot-')),
      spawnImpl: fake.spawnImpl,
      mcpServers: servers,
    })
    const turn = collect(driver, { prompt: 'x', cwd: '/w' })
    await vi.waitFor(() => expect(fake.spawns.length).toBe(1))
    for (const line of lines) fake.stdout.write(`${line}\n`)
    fake.stdout.write('{"type":"result","data":{"sessionId":"s1","exitCode":0}}\n')
    fake.child.emit('close', 0)
    await turn
    return driver
  }

  it('reported an empty list while declaring it could report — it no longer does', async () => {
    // A method that answers "nothing" is worse than one that is absent,
    // because the panel believes it.
    const driver = await run(
      [
        '{"type":"session.mcp_servers_loaded","data":{"servers":[{"name":"ha","status":"connected"},{"name":"notion","status":"needs-auth"}]}}',
      ],
      [{ name: 'ha', url: 'https://ha/mcp' }],
    )
    expect(await driver.mcpStatus()).toEqual([
      { name: 'ha', state: 'connected' },
      { name: 'notion', state: 'needs-auth' },
    ])
  })

  it('amends one server without forgetting the rest', async () => {
    // The CLI announces the whole set once, then changes them one at a time.
    // Replacing on the second kind would leave the panel reporting one server.
    const driver = await run(
      [
        '{"type":"session.mcp_servers_loaded","data":{"servers":[{"name":"ha","status":"pending"},{"name":"cutlist","status":"connected"}]}}',
        '{"type":"session.mcp_server_status_changed","data":{"serverName":"ha","status":"failed","error":"connect ECONNREFUSED"}}',
      ],
      [{ name: 'ha', url: 'https://ha/mcp' }],
    )
    expect(await driver.mcpStatus()).toEqual([
      { name: 'ha', state: 'failed', error: 'connect ECONNREFUSED' },
      { name: 'cutlist', state: 'connected' },
    ])
  })

  it('says unknown for a declared server no session has spoken about', async () => {
    const fake = fakeCopilot()
    const driver = new CopilotDriver({
      home: '/x',
      spawnImpl: fake.spawnImpl,
      mcpServers: [{ name: 'ha', url: 'https://ha/mcp' }],
    })
    expect(await driver.mcpStatus()).toEqual([{ name: 'ha', state: 'unknown' }])
  })

  it('does not declare the capability when it wired nothing', async () => {
    const bare = new CopilotDriver({ home: '/x' })
    expect((await bare.describe()).capabilities).not.toContain('mcpStatus')
  })
})

describe('an MCP server that authenticates itself', () => {
  const HUB = {
    name: 'maps',
    url: 'https://hub.example/maps',
    auth: {
      tokenUrl: 'https://auth.example/token',
      clientId: 'agent-demeura',
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
        // Short-lived on purpose in these tests: the point is that the file
        // follows the token, not that a token lasts.
        json: () => Promise.resolve({ access_token: token, expires_in: 3600 }),
      } as unknown as Response)
    }) as unknown as typeof fetch
  }

  const turn = async (driver: CopilotDriver, fake: ReturnType<typeof fakeCopilot>) => {
    const running = collect(driver, { prompt: 'x', cwd: '/w' })
    await vi.waitFor(() => expect(fake.spawns.length).toBeGreaterThan(0))
    fake.stdout.write('{"type":"result","data":{"sessionId":"s1","exitCode":0}}\n')
    fake.child.emit('close', 0)
    await running
  }

  it('writes the bearer into the side file, never onto argv', async () => {
    const home = await mkdtemp(join(tmpdir(), 'demeura-copilot-'))
    const fake = fakeCopilot()
    const driver = new CopilotDriver({
      home,
      spawnImpl: fake.spawnImpl,
      mcpServers: [HUB],
      fetchImpl: minting(['abc']),
    })
    await turn(driver, fake)

    const written = JSON.parse(await readFile(join(home, 'demeura-mcp.json'), 'utf8'))
    expect(written.mcpServers.maps).toMatchObject({
      type: 'http',
      url: 'https://hub.example/maps',
      headers: { Authorization: 'Bearer abc' },
      tools: ['*'],
    })
    expect(fake.spawns[0]?.args.join(' ')).not.toContain('abc')
  })

  it('rewrites the file on every turn, because the token rotates', async () => {
    // Written once was right until a server could carry a token: a file
    // produced at the first turn authenticates nothing by the second morning.
    const home = await mkdtemp(join(tmpdir(), 'demeura-copilot-'))
    const path = join(home, 'demeura-mcp.json')

    const first = fakeCopilot()
    const driver = new CopilotDriver({
      home,
      spawnImpl: first.spawnImpl,
      mcpServers: [HUB],
      // A token that is already stale, so the second turn must mint again.
      fetchImpl: (() => {
        let index = 0
        const answers = ['one', 'two']
        return vi.fn(() =>
          Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({ access_token: answers[Math.min(index++, 1)], expires_in: 1 }),
          } as unknown as Response),
        ) as unknown as typeof fetch
      })(),
    })

    await turn(driver, first)
    expect(JSON.parse(await readFile(path, 'utf8')).mcpServers.maps.headers.Authorization).toBe('Bearer one')

    // A second turn, with a driver whose cache has nothing live left.
    const second = fakeCopilot()
    const again = new CopilotDriver({
      home,
      spawnImpl: second.spawnImpl,
      mcpServers: [HUB],
      fetchImpl: minting(['two']),
    })
    await turn(again, second)
    expect(JSON.parse(await readFile(path, 'utf8')).mcpServers.maps.headers.Authorization).toBe('Bearer two')
  })

  it('drops the flag entirely when no server could be authenticated', async () => {
    // No file rather than an empty one: an empty `mcpServers` map would make
    // the CLI load nothing while looking configured.
    const home = await mkdtemp(join(tmpdir(), 'demeura-copilot-'))
    const fake = fakeCopilot()
    const driver = new CopilotDriver({
      home,
      spawnImpl: fake.spawnImpl,
      mcpServers: [HUB],
      fetchImpl: minting([undefined]),
    })
    await turn(driver, fake)
    expect(fake.spawns[0]?.args).not.toContain('--additional-mcp-config')
  })
})

describe('a server that serves somebody’s own data', () => {
  const USER_SRV = { name: 'google', url: 'https://hub.example/google/', identity: 'user' as const }
  const MACHINE_SRV = {
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

  const runTurn = async (extra: Record<string, unknown>) => {
    const home = mkdtempSync(join(tmpdir(), 'demeura-copilot-'))
    const fake = fakeCopilot()
    const driver = new CopilotDriver({
      home,
      spawnImpl: fake.spawnImpl,
      mcpServers: [USER_SRV, MACHINE_SRV],
      fetchImpl: minting(),
    })
    const running = collect(driver, { prompt: 'x', cwd: '/w', ...extra })
    await vi.waitFor(() => expect(fake.spawns.length).toBeGreaterThan(0))
    fake.stdout.write('{"type":"result","data":{"sessionId":"s1","exitCode":0}}\n')
    fake.child.emit('close', 0)
    await running
    return JSON.parse(await readFile(join(home, 'demeura-mcp.json'), 'utf8')).mcpServers
  }

  it('acts as the caller, and keeps the machine identity where it belongs', async () => {
    const servers = await runTurn({ callerToken: 'jeton-de-sebastien' })
    expect(servers.google.headers.Authorization).toBe('Bearer jeton-de-sebastien')
    expect(servers.maps.headers.Authorization).toBe('Bearer machine-tok')
  })

  it('is absent from a turn that has no caller', async () => {
    // A scheduled turn has nobody to act as; it must not reach into an
    // account on the instance's own authority.
    const servers = await runTurn({})
    expect(servers.google).toBeUndefined()
    expect(servers.maps).toBeDefined()
  })
})
