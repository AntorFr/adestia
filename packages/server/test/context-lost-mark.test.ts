/**
 * B-22 / P-16 step 7 / AD-28 (issue b, rerun): Claude refuses a gone session, the
 * server reruns the turn once without it and the first agent message of that
 * turn carries `contextLost`. Only Claude can lose it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Driver, TurnEvent, TurnRequest } from '@antorfr/adestia-drivers'

import { buildApp } from '../src/app.js'
import { parseConfig } from '../src/config.js'
import { driverWith } from './support/driver.js'
import { cleanTmp, tmpDir } from './support/tmp.js'

afterEach(cleanTmp)

type Step = TurnEvent[] | Error
const gone = (id: string) => new Error(`Claude Code returned an error result: No conversation found with session ID: ${id}`)

/** A driver of the given engine id whose nth turn plays `steps[n]` (a throw, or events). */
function engine(id: string, steps: (Step | ((request: TurnRequest) => Step))[]) {
  const requests: TurnRequest[] = []
  const driver: Driver = driverWith({
    describe: () => Promise.resolve({ id, label: id, cliVersion: '0', capabilities: [] }),
    async *runTurn(request: TurnRequest) {
      requests.push(request)
      const raw = steps[requests.length - 1] ?? [{ type: 'result', sessionId: 'sN', stopped: false }]
      const step = typeof raw === 'function' ? raw(request) : raw
      if (step instanceof Error) throw step
      yield* step
    },
  })
  return { driver, requests }
}

const text = (t: string): TurnEvent => ({ type: 'text-delta', text: t })
const done = (sessionId: string): TurnEvent => ({ type: 'result', sessionId, stopped: false })

async function open(driver: Driver) {
  const dataDir = await tmpDir('adestia-lost-')
  const app = await buildApp({
    config: { ...parseConfig('auth:\n  mode: none\n'), dataDir },
    driver,
    plugins: [],
    pluginProblems: [],
  })
  const { id } = (await app.inject({ method: 'POST', url: '/api/conversations' })).json()
  const turn = (prompt: string) =>
    app.inject({ method: 'POST', url: '/api/turn', payload: { prompt, conversationId: id } })
  const read = async () => (await app.inject({ url: `/api/conversations/${id}` })).json()
  return { app, id, turn, read }
}
const agents = (c: { messages: { role: string; contextLost?: boolean; text: string; error?: string }[] }) =>
  c.messages.filter((m) => m.role === 'agent')

describe('contextLost on Claude: session resumed ≠ session returned', () => {
  it('marks only the first agent message of the turn, not the first turn nor a same-session turn', async () => {
    const { driver, requests } = engine('claude-code', [
      [text('un'), done('s1')],
      [text('deux'), { type: 'tool-use', name: 'Read', target: '/a' }, { type: 'tool-result', name: 'Read', ok: true }, text('trois'), done('s1')],
      [text('quatre'), { type: 'tool-use', name: 'Read', target: '/b' }, { type: 'tool-result', name: 'Read', ok: true }, text('cinq'), done('s2')],
    ])
    const { app, turn, read } = await open(driver)
    await turn('a')
    expect(agents(await read()).map((m) => m.contextLost)).toEqual([undefined]) // first turn: nothing resumed
    await turn('b')
    expect(agents(await read()).map((m) => m.contextLost)).toEqual([undefined, undefined, undefined]) // same session
    await turn('c')
    const marks = agents(await read()).map((m) => [m.text, m.contextLost])
    expect(marks.slice(3)).toEqual([['quatre', true], ['cinq', undefined]])
    expect(requests[2]!.sessionId).toBe('s1')
    await app.close()
  })

  it('keeps the mark on a reread of the conversation', async () => {
    const { driver } = engine('claude-code', [[text('a'), done('s1')], [text('b'), done('s2')]])
    const { app, turn, read } = await open(driver)
    await turn('1')
    await turn('2')
    expect(agents(await read())[1]!.contextLost).toBe(true)
    expect(agents(await read())[1]!.contextLost).toBe(true)
    await app.close()
  })

  it.each(['copilot-cli', 'codex-cli', 'scripted'])('%s: a changed session never writes the mark', async (id) => {
    const { driver } = engine(id, [[text('a'), done('s1')], [text('b'), done('s2')]])
    const { app, turn, read } = await open(driver)
    await turn('1')
    await turn('2')
    expect(agents(await read()).map((m) => m.contextLost)).toEqual([undefined, undefined])
    await app.close()
  })
})

describe('Claude refuses a gone session: one rerun without it', () => {
  it('reruns once with no session, same conversation, and marks the reply', async () => {
    const { driver, requests } = engine('claude-code', [
      [text('un'), done('s1')],
      gone('s1'),
      [text('neuf'), done('s2')],
    ])
    const { app, id, turn, read } = await open(driver)
    await turn('a')
    await turn('b')
    expect(requests.map((r) => r.sessionId)).toEqual([undefined, 's1', undefined])
    expect(requests[2]!.prompt).toBe(requests[1]!.prompt)
    const c = await read()
    expect(c.id).toBe(id)
    expect(agents(c).map((m) => [m.text, m.contextLost, m.error])).toEqual([
      ['un', undefined, undefined],
      ['neuf', true, undefined],
    ])
    expect(c.sessionId).toBe('s2')
    await app.close()
  })

  it('handles a stopped result emitted before the throw (the real SDK order)', async () => {
    let call = 0
    const requests: TurnRequest[] = []
    const driver = driverWith({
      describe: () => Promise.resolve({ id: 'claude-code', label: 'c', cliVersion: '0', capabilities: [] }),
      async *runTurn(request: TurnRequest) {
        requests.push(request)
        call += 1
        if (call === 1) { yield text('un'); yield done('s1'); return }
        if (call === 2) {
          yield { type: 'result', sessionId: 's1', stopped: true }
          throw gone('s1')
        }
        yield text('neuf')
        yield done('s2')
      },
    })
    const { app, turn, read } = await open(driver)
    await turn('a')
    await turn('b')
    expect(requests).toHaveLength(3)
    const last = agents(await read()).at(-1)!
    expect(last).toMatchObject({ text: 'neuf', contextLost: true })
    expect(last.error).toBeUndefined()
    await app.close()
  })

  it('also recovers when the refusal comes as an error event', async () => {
    const { driver, requests } = engine('claude-code', [
      [text('un'), done('s1')],
      [{ type: 'error', message: 'No conversation found with session ID: s1', fatal: true }],
      [text('neuf'), done('s2')],
    ])
    const { app, turn, read } = await open(driver)
    await turn('a')
    await turn('b')
    expect(requests).toHaveLength(3)
    expect(agents(await read()).at(-1)).toMatchObject({ text: 'neuf', contextLost: true })
    await app.close()
  })

  it('reruns only once: a second refusal is an error, no third call, no mark', async () => {
    const { driver, requests } = engine('claude-code', [
      [text('un'), done('s1')],
      gone('s1'),
      gone('s1'),
      [text('jamais'), done('s9')],
    ])
    const { app, turn, read } = await open(driver)
    await turn('a')
    await turn('b')
    expect(requests).toHaveLength(3)
    const c = await read()
    expect(JSON.stringify(c.messages)).not.toContain('contextLost')
    expect(JSON.stringify(c.messages)).not.toContain('jamais')
    await app.close()
  })

  it('does not rerun on an error that is not the gone session', async () => {
    const { driver, requests } = engine('claude-code', [
      [text('un'), done('s1')],
      new Error('rate limited'),
      [text('jamais'), done('s9')],
    ])
    const { app, turn, read } = await open(driver)
    await turn('a')
    await turn('b')
    expect(requests).toHaveLength(2)
    expect(JSON.stringify((await read()).messages)).not.toContain('contextLost')
    await app.close()
  })

  it('does not rerun on a refusal that names ANOTHER session id', async () => {
    const { driver, requests } = engine('claude-code', [[text('un'), done('s1')], gone('other'), [text('x'), done('s2')]])
    const { app, turn } = await open(driver)
    await turn('a')
    await turn('b')
    expect(requests).toHaveLength(2)
    await app.close()
  })

  it('does not rerun once the engine has spoken or worked', async () => {
    let call = 0
    const requests: TurnRequest[] = []
    const driver = driverWith({
      describe: () => Promise.resolve({ id: 'claude-code', label: 'c', cliVersion: '0', capabilities: [] }),
      async *runTurn(request: TurnRequest) {
        requests.push(request)
        call += 1
        if (call === 1) { yield text('un'); yield done('s1'); return }
        if (call === 2) { yield text('déjà dit'); throw gone('s1') }
        yield text('neuf'); yield done('s2')
      },
    })
    const { app, turn, read } = await open(driver)
    await turn('a')
    await turn('b')
    expect(requests).toHaveLength(2)
    expect(JSON.stringify((await read()).messages)).not.toContain('contextLost')
    await app.close()
  })

  it('a first turn (no session resumed) is never rerun', async () => {
    const { driver, requests } = engine('claude-code', [gone('whatever'), [text('x'), done('s1')]])
    const { app, turn, read } = await open(driver)
    await turn('a')
    expect(requests).toHaveLength(1)
    expect(JSON.stringify((await read()).messages)).not.toContain('contextLost')
    await app.close()
  })

  it('copilot and codex are never rerun on that message', async () => {
    for (const id of ['copilot-cli', 'codex-cli']) {
      const { driver, requests } = engine(id, [[text('un'), done('s1')], gone('s1'), [text('x'), done('s2')]])
      const { app, turn, read } = await open(driver)
      await turn('a')
      await turn('b')
      expect(requests).toHaveLength(2)
      expect(JSON.stringify((await read()).messages)).not.toContain('contextLost')
      await app.close()
    }
  })

  it('merged queued messages: one rerun, the mark sits on the one reply', async () => {
    let release!: () => void
    const held = new Promise<void>((r) => { release = r })
    let pulled!: () => void
    const running = new Promise<void>((r) => { pulled = r })
    let call = 0
    const requests: TurnRequest[] = []
    const driver = driverWith({
      describe: () => Promise.resolve({ id: 'claude-code', label: 'c', cliVersion: '0', capabilities: [] }),
      async *runTurn(request: TurnRequest) {
        requests.push(request)
        call += 1
        if (call === 1) { yield text('un'); yield done('s1'); return }
        if (call === 2) { pulled(); await held; yield text('deux'); yield done('s1'); return }
        if (call === 3) throw gone('s1')
        yield text('neuf'); yield done('s2')
      },
    })
    const { app, id, turn, read } = await open(driver)
    await turn('a')
    const second = turn('b')
    await running
    await app.inject({ method: 'POST', url: '/api/turn', payload: { prompt: 'c', conversationId: id } })
    await app.inject({ method: 'POST', url: '/api/turn', payload: { prompt: 'd', conversationId: id } })
    release()
    await second
    await vi.waitFor(async () => {
      expect((await read()).turn).toBeUndefined()
      expect(requests).toHaveLength(4)
    })
    const marked = agents(await read()).filter((m) => m.contextLost)
    expect(marked).toHaveLength(1)
    expect(marked[0]!.text).toBe('neuf')
    expect(requests[3]!.sessionId).toBeUndefined()
    await app.close()
  })
})

