import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'
import type { TurnEvent, TurnRequest } from '@antorfr/adestia-drivers'

import { BusyThreadError, DelegationChannel, titleFor } from '../src/delegations.js'
import { TurnDesk } from '../src/turns.js'

let dataDir: string

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'adestia-deleg-'))
})

const limiter = () => ({ tryAcquire: () => true, release: () => {} })

/** A driver whose turns the test scripts, one requests[] entry per call. */
function scriptedDriver(script: (request: TurnRequest, call: number) => TurnEvent[]) {
  const requests: TurnRequest[] = []
  return {
    requests,
    async *runTurn(request: TurnRequest): AsyncIterable<TurnEvent> {
      requests.push(request)
      yield* script(request, requests.length)
    },
  }
}

const answer = (text: string, sessionId = 's1'): TurnEvent[] => [
  { type: 'text-delta', text },
  { type: 'result', sessionId, stopped: false },
]

function channelWith(driver: { runTurn(request: TurnRequest): AsyncIterable<TurnEvent> }) {
  const desk = new TurnDesk(driver, limiter())
  return new DelegationChannel(desk, { dataDir, cwd: '/workspace' })
}

describe('the thread title', () => {
  it('is the request’s first words, cut on a word', () => {
    expect(titleFor('Range les fiches du mois')).toBe('Range les fiches du mois')
    const long = titleFor(
      'Range les fiches du mois de septembre dans le classeur des travaux en cours merci',
    )
    expect(long.length).toBeLessThanOrEqual(61)
    expect(long.endsWith('…')).toBe(true)
    expect(long).not.toContain('\n')
  })

  it('never yields an empty name', () => {
    expect(titleFor('  \n  ')).toBe('Delegated task')
  })
})

describe('the delegation channel', () => {
  it('stores the raw request and the answer — the frame is fuel, not transcript', async () => {
    const driver = scriptedDriver(() => answer('fait.'))
    const channel = channelWith(driver)

    const opened = await channel.open('alfred', 'range les fiches', undefined)
    if ('unknown' in opened) throw new Error('expected a thread')
    const result = await channel.run('alfred', opened.threadId, 'range les fiches')

    expect(result.text).toBe('fait.')
    // The engine saw the frame…
    expect(driver.requests[0]!.prompt).toContain('Delegated task from alfred')
    expect(driver.requests[0]!.unattended).toBe(true)
    // …the thread did not.
    const thread = await channel.read('alfred', opened.threadId)
    expect(thread!.messages.map((message) => message.text)).toEqual(['range les fiches', 'fait.'])
    expect(thread!.messages[0]!.role).toBe('user')
    expect(thread!.title).toBe('range les fiches')
  })

  it('resumes the stored session on the next ask of the same thread', async () => {
    const driver = scriptedDriver((_request, call) => answer(`réponse ${call}`, `session-${call}`))
    const channel = channelWith(driver)

    const opened = await channel.open('alfred', 'step one', undefined)
    if ('unknown' in opened) throw new Error('expected a thread')
    await channel.run('alfred', opened.threadId, 'step one')

    const reopened = await channel.open('alfred', 'step two', opened.threadId)
    if ('unknown' in reopened) throw new Error('expected the same thread')
    expect(reopened.threadId).toBe(opened.threadId)
    await channel.run('alfred', opened.threadId, 'step two')

    // The second turn carried the first turn's session: that IS the resume
    // contract task_id promises.
    expect(driver.requests[1]!.sessionId).toBe('session-1')
    const thread = await channel.read('alfred', opened.threadId)
    expect(thread!.messages).toHaveLength(4)
  })

  it('says unknown for a task_id of another caller — the namespace IS the boundary', async () => {
    const driver = scriptedDriver(() => answer('ok'))
    const channel = channelWith(driver)
    const opened = await channel.open('alfred', 'secret des fiches', undefined)
    if ('unknown' in opened) throw new Error('expected a thread')

    expect(await channel.open('nestor', 'continue', opened.threadId)).toEqual({ unknown: true })
  })

  it('retries once WITHOUT the session when a resumed turn died producing nothing', async () => {
    // The stored session is the prime suspect (expired, pruned). Nothing ran,
    // so a fresh start repeats nothing.
    const driver = scriptedDriver((request, call) => {
      if (call === 1) return answer('premier', 'stale-session')
      if (request.sessionId === 'stale-session') {
        return [{ type: 'error', fatal: true, message: 'no such session' } as TurnEvent]
      }
      return answer('reparti de zéro', 'fresh')
    })
    const channel = channelWith(driver)

    const opened = await channel.open('alfred', 'un', undefined)
    if ('unknown' in opened) throw new Error('expected a thread')
    await channel.run('alfred', opened.threadId, 'un')

    const result = await channel.run('alfred', opened.threadId, 'deux')
    expect(result.text).toBe('reparti de zéro')
    expect(result.failure).toBeUndefined()
    expect(driver.requests).toHaveLength(3)
    expect(driver.requests[2]!.sessionId).toBeUndefined()
  })

  it('does NOT retry a turn that half-ran: it may have had side effects', async () => {
    const driver = scriptedDriver((_request, call) => {
      if (call === 1) return answer('premier', 'stale')
      return [
        { type: 'text-delta', text: 'je commence…' },
        { type: 'error', fatal: true, message: 'died mid-flight' } as TurnEvent,
      ]
    })
    const channel = channelWith(driver)

    const opened = await channel.open('alfred', 'un', undefined)
    if ('unknown' in opened) throw new Error('expected a thread')
    await channel.run('alfred', opened.threadId, 'un')

    const result = await channel.run('alfred', opened.threadId, 'deux')
    expect(result.failure).toContain('died mid-flight')
    expect(driver.requests).toHaveLength(2)
  })

  it('refuses a second run while the thread works — no merged asks', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    // The run persists the request to disk before it reaches the desk, so the
    // thread is not busy the instant `run` is called. Waited for by asking the
    // DRIVER when it was pulled, rather than by spinning a fixed number of
    // event-loop turns: the desk registers the chain before it pulls the
    // driver, so this signal cannot arrive too early — and it cannot arrive
    // too late either, which a counted wait can and did, once, on CI.
    let pulled!: () => void
    const running = new Promise<void>((resolve) => {
      pulled = resolve
    })
    const driver = {
      async *runTurn(): AsyncIterable<TurnEvent> {
        pulled()
        await held
        yield* answer('enfin')
      },
    }
    const channel = channelWith(driver)

    const opened = await channel.open('alfred', 'lent', undefined)
    if ('unknown' in opened) throw new Error('expected a thread')
    const first = channel.run('alfred', opened.threadId, 'lent')
    await running

    expect(channel.busy('alfred', opened.threadId)).toBe(true)
    await expect(channel.run('alfred', opened.threadId, 'pressé')).rejects.toThrow(BusyThreadError)

    release()
    await first
    expect(channel.busy('alfred', opened.threadId)).toBe(false)
  })

  it('lists every caller’s threads for the screen, newest first, dot included', async () => {
    const driver = scriptedDriver(() => answer('ok'))
    const channel = channelWith(driver)

    const one = await channel.open('alfred', 'les fiches', undefined)
    if ('unknown' in one) throw new Error('expected a thread')
    await channel.run('alfred', one.threadId, 'les fiches')
    const two = await channel.open('nestor', 'la musique', undefined)
    if ('unknown' in two) throw new Error('expected a thread')
    await channel.run('nestor', two.threadId, 'la musique')

    const rows = await channel.list()
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.caller).sort()).toEqual(['alfred', 'nestor'])
    expect(rows[0]!.turn).toBeUndefined()
    expect(rows[0]!.title).toBeTruthy()
  })

  it('keeps the failure in the thread, on the last word', async () => {
    const driver = scriptedDriver(() => [
      { type: 'text-delta', text: 'à moitié' },
      { type: 'error', fatal: true, message: 'boom' } as TurnEvent,
    ])
    const channel = channelWith(driver)
    const opened = await channel.open('alfred', 'risqué', undefined)
    if ('unknown' in opened) throw new Error('expected a thread')

    const result = await channel.run('alfred', opened.threadId, 'risqué')
    expect(result.failure).toContain('boom')
    const thread = await channel.read('alfred', opened.threadId)
    const last = thread!.messages.at(-1)!
    expect(last.role).toBe('agent')
    expect(last.error).toContain('boom')
  })
})
