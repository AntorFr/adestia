import { describe, expect, it, vi } from 'vitest'
import type { TurnEvent, TurnRequest } from '@antorfr/golem-drivers'

import { TurnCapacityError, TurnDesk, TurnJob, type TurnOutcome } from '../src/turns.js'

/** A gate the test opens when it decides the driver may go on. */
function gate() {
  let open!: () => void
  const passed = new Promise<void>((resolve) => {
    open = resolve
  })
  return { open, passed }
}

/** A limiter that counts, so slot discipline is observable. */
function meter(max = Number.POSITIVE_INFINITY) {
  let running = 0
  const state = { peak: 0, releases: 0 }
  return {
    state,
    tryAcquire: () => {
      if (running >= max) return false
      running += 1
      state.peak = Math.max(state.peak, running)
      return true
    },
    release: () => {
      running -= 1
      state.releases += 1
    },
  }
}

const RESULT: TurnEvent = { type: 'result', sessionId: 's1', stopped: false }

describe('the turn desk', () => {
  it('runs a turn with nobody watching and still hands finish the outcome', async () => {
    // The whole point of the desk: the turn is not the HTTP request's. No
    // subscriber ever attaches here, and the transcript closure still runs.
    const driver = {
      async *runTurn(_request: TurnRequest): AsyncIterable<TurnEvent> {
        yield { type: 'text-delta', text: 'Bonjour ' }
        yield { type: 'text-delta', text: 'singe' }
        yield { type: 'tool-use', name: 'Read', target: '/a.md' }
        yield { type: 'tool-result', name: 'Read', ok: true }
        yield RESULT
      },
    }
    const limiter = meter()
    const desk = new TurnDesk(driver, limiter)
    const finished: TurnOutcome[] = []

    const admission = desk.admit('u/c:1')
    if (admission.mode !== 'run') throw new Error('expected a run')
    const job = admission.start({
      request: { prompt: 'salut', cwd: '.' },
      finish: async (outcome) => void finished.push(outcome),
    })
    await job.done

    expect(finished[0]).toMatchObject({ sessionId: 's1', stopped: false })
    // Cut where the reader sees the cut: the agent spoke, then went back to
    // work, so the tool call belongs to a SECOND part and not above the first
    // answer. The shell's reducer applies the same rule to the same stream.
    expect(finished[0]?.parts).toEqual([
      { tools: [], text: 'Bonjour singe' },
      { tools: [{ name: 'Read', target: '/a.md', ok: true }], text: '' },
    ])
    expect(limiter.state.releases).toBe(1)
  })

  it('queues behind the key, then dispatches ONE merged turn under the same slot', async () => {
    const first = gate()
    const requests: TurnRequest[] = []
    const driver = {
      async *runTurn(request: TurnRequest): AsyncIterable<TurnEvent> {
        requests.push(request)
        if (requests.length === 1) await first.passed
        yield RESULT
      },
    }
    const limiter = meter()
    const desk = new TurnDesk(driver, limiter)
    const finishes: string[] = []
    const spec = (label: string, prompt: string) => ({
      request: { prompt, cwd: '.' },
      finish: async () => void finishes.push(label),
    })

    const admission = desk.admit('u/c:1')
    if (admission.mode !== 'run') throw new Error('expected a run')
    const job = admission.start(spec('a', 'a'))

    // Posted while the first runs: both queue, neither needs a slot.
    const second = desk.admit('u/c:1')
    const third = desk.admit('u/c:1')
    expect(second.mode).toBe('queued')
    expect(third.mode).toBe('queued')
    if (second.mode === 'queued') second.enqueue(spec('b', 'b'))
    if (third.mode === 'queued') third.enqueue(spec('c', 'c'))

    // The adoption guarantee: when the first announces its end, the merged
    // follow-up is ALREADY the active job for the key.
    let activeAtEnd: TurnJob | undefined
    job.subscribe({
      event: () => {},
      end: () => {
        activeAtEnd = desk.activeFor('u/c:1')
      },
    })

    first.open()
    await job.done
    expect(activeAtEnd).toBeDefined()
    expect(activeAtEnd).not.toBe(job)

    await activeAtEnd!.done
    // ONE merged turn: paragraphs joined, session chained from the result
    // the queued messages predate, one slot held across the whole chain.
    expect(requests).toHaveLength(2)
    expect(requests[1]).toMatchObject({ prompt: 'b\n\nc', sessionId: 's1' })
    // The merged turn settles through the LAST spec's closure — same
    // conversation, one transcript write.
    expect(finishes).toEqual(['a', 'c'])
    expect(limiter.state.peak).toBe(1)
    expect(limiter.state.releases).toBe(1)
    expect(desk.activeFor('u/c:1')).toBeUndefined()
  })

  it('replays a coalesced log to a late subscriber', async () => {
    const midway = gate()
    const rest = gate()
    const driver = {
      async *runTurn(_request: TurnRequest): AsyncIterable<TurnEvent> {
        yield { type: 'text-delta', text: 'moitié ' }
        yield { type: 'text-delta', text: 'une' }
        midway.open()
        await rest.passed
        yield { type: 'text-delta', text: ' — moitié deux' }
        yield RESULT
      },
    }
    const desk = new TurnDesk(driver, meter())
    const admission = desk.admit('u/c:1')
    if (admission.mode !== 'run') throw new Error('expected a run')
    const job = admission.start({ request: { prompt: 'x', cwd: '.' }, finish: async () => {} })

    await midway.passed
    // Two deltas were emitted; the log holds ONE — a long answer replays as
    // a handful of frames, and the reducer rebuilds the same state.
    expect(job.log).toEqual([{ type: 'text-delta', text: 'moitié une' }])

    const late: TurnEvent[] = [...job.log]
    job.subscribe({ event: (event) => void late.push(event), end: () => {} })
    rest.open()
    await job.done

    const text = late
      .filter((event): event is TurnEvent & { type: 'text-delta' } => event.type === 'text-delta')
      .map((event) => event.text)
      .join('')
    expect(text).toBe('moitié une — moitié deux')
  })

  it('scrubs an answered question from the replay', async () => {
    const asked = gate()
    const rest = gate()
    const driver = {
      async *runTurn(_request: TurnRequest): AsyncIterable<TurnEvent> {
        yield {
          type: 'permission-request',
          id: 'q1',
          tool: 'Bash',
          title: 'Bash — rm -rf build',
          remembering: true,
        }
        asked.open()
        await rest.passed
        yield RESULT
      },
    }
    const desk = new TurnDesk(driver, meter())
    const admission = desk.admit('u/c:1')
    if (admission.mode !== 'run') throw new Error('expected a run')
    const job = admission.start({ request: { prompt: 'x', cwd: '.' }, finish: async () => {} })

    await asked.passed
    expect(job.log.some((event) => event.type === 'permission-request')).toBe(true)
    desk.scrubAsk('q1')
    // A re-attach must not resurrect a question nothing can resolve.
    expect(job.log.some((event) => event.type === 'permission-request')).toBe(false)
    rest.open()
    await job.done
  })

  it('refuses a fresh turn when the cap is full, but never the backlog of a running one', async () => {
    const hold = gate()
    const driver = {
      async *runTurn(_request: TurnRequest): AsyncIterable<TurnEvent> {
        await hold.passed
        yield RESULT
      },
    }
    const desk = new TurnDesk(driver, meter(1))

    const admission = desk.admit('u/c:1')
    if (admission.mode !== 'run') throw new Error('expected a run')
    const job = admission.start({ request: { prompt: 'a', cwd: '.' }, finish: async () => {} })

    // A different conversation is refused — information, not a silent wait.
    expect(() => desk.admit('u/c:2')).toThrow(TurnCapacityError)
    // The running conversation's own backlog queues without a slot.
    expect(desk.admit('u/c:1').mode).toBe('queued')

    hold.open()
    await job.done
  })

  it('gives the slot back when the caller aborts before starting', () => {
    const desk = new TurnDesk(
      { runTurn: async function* (): AsyncIterable<TurnEvent> {} },
      meter(1),
    )
    const admission = desk.admit()
    if (admission.mode !== 'run') throw new Error('expected a run')
    admission.abort()
    // The slot is free again: the next admission succeeds.
    expect(desk.admit().mode).toBe('run')
  })

  it('turns a driver crash into a fatal error event and a finish that says so', async () => {
    const driver = {
      async *runTurn(_request: TurnRequest): AsyncIterable<TurnEvent> {
        yield { type: 'text-delta', text: 'partiel' }
        throw new Error('CLI died')
      },
    }
    const desk = new TurnDesk(driver, meter())
    const finished: TurnOutcome[] = []
    const seen: TurnEvent[] = []

    const admission = desk.admit()
    if (admission.mode !== 'run') throw new Error('expected a run')
    const job = admission.start({
      request: { prompt: 'x', cwd: '.' },
      finish: async (outcome) => void finished.push(outcome),
    })
    job.subscribe({ event: (event) => void seen.push(event), end: () => {} })
    await job.done

    expect(seen.at(-1)).toEqual({ type: 'error', message: 'CLI died', fatal: true })
    expect(finished[0]).toMatchObject({ failure: 'CLI died' })
    expect(finished[0]?.parts).toEqual([{ tools: [], text: 'partiel' }])
  })

  it('survives a finish that throws, and still runs the backlog', async () => {
    const first = gate()
    const prompts: string[] = []
    const driver = {
      async *runTurn(request: TurnRequest): AsyncIterable<TurnEvent> {
        prompts.push(request.prompt)
        if (prompts.length === 1) await first.passed
        yield RESULT
      },
    }
    const desk = new TurnDesk(driver, meter())
    const finish = vi.fn().mockRejectedValue(new Error('disk full'))

    const admission = desk.admit('u/c:1')
    if (admission.mode !== 'run') throw new Error('expected a run')
    const job = admission.start({ request: { prompt: 'a', cwd: '.' }, finish })
    const queued = desk.admit('u/c:1')
    if (queued.mode === 'queued') queued.enqueue({ request: { prompt: 'b', cwd: '.' }, finish })

    first.open()
    await job.done
    await vi.waitFor(() => expect(prompts).toEqual(['a', 'b']))
    await vi.waitFor(() => expect(desk.activeFor('u/c:1')).toBeUndefined())
  })

  it('reports waiting while a question is pending, and not once it is answered', async () => {
    const asked = gate()
    const rest = gate()
    const driver = {
      async *runTurn(_request: TurnRequest): AsyncIterable<TurnEvent> {
        yield {
          type: 'permission-request',
          id: 'q1',
          tool: 'Bash',
          title: 'Bash — rm -rf build',
          remembering: true,
        }
        asked.open()
        await rest.passed
        yield RESULT
      },
    }
    const desk = new TurnDesk(driver, meter())
    const admission = desk.admit('u/c:1')
    if (admission.mode !== 'run') throw new Error('expected a run')
    const job = admission.start({ request: { prompt: 'x', cwd: '.' }, finish: async () => {} })

    expect(job.waiting).toBe(false)
    await asked.passed
    expect(job.waiting).toBe(true)
    // The answer travels through the ask desk, so the scrub is the only
    // signal the desk gets that a person resolved the question.
    desk.scrubAsk('q1')
    expect(job.waiting).toBe(false)
    rest.open()
    await job.done
    expect(job.waiting).toBe(false)
  })

  it('drops waiting when the turn moves on without a scrub — the timeout path', async () => {
    // An ask that times out auto-denies inside the engine: no answer route is
    // hit, no scrub happens, the driver simply resumes. The next event is the
    // only proof the person is no longer being waited on.
    const asked = gate()
    const resumed = gate()
    const rest = gate()
    const driver = {
      async *runTurn(_request: TurnRequest): AsyncIterable<TurnEvent> {
        yield {
          type: 'permission-request',
          id: 'q1',
          tool: 'Bash',
          title: 'Bash — rm -rf build',
          remembering: true,
        }
        asked.open()
        await rest.passed
        yield { type: 'text-delta', text: 'refusé, je continue' }
        resumed.open()
        yield RESULT
      },
    }
    const desk = new TurnDesk(driver, meter())
    const admission = desk.admit('u/c:1')
    if (admission.mode !== 'run') throw new Error('expected a run')
    const job = admission.start({ request: { prompt: 'x', cwd: '.' }, finish: async () => {} })

    await asked.passed
    expect(job.waiting).toBe(true)
    rest.open()
    await resumed.passed
    expect(job.waiting).toBe(false)
    await job.done
  })

  it('lists active chains with their state, and never a keyless job', async () => {
    const keyedAsked = gate()
    const keyedRest = gate()
    const looseHold = gate()
    const driver = {
      async *runTurn(request: TurnRequest): AsyncIterable<TurnEvent> {
        if (request.prompt === 'ask') {
          yield {
            type: 'permission-request',
            id: 'q1',
            tool: 'Bash',
            title: 'Bash — rm -rf build',
            remembering: true,
          }
          keyedAsked.open()
          await keyedRest.passed
        } else {
          await looseHold.passed
        }
        yield RESULT
      },
    }
    const desk = new TurnDesk(driver, meter())
    expect(desk.active()).toEqual([])

    const keyed = desk.admit('u/c:1')
    if (keyed.mode !== 'run') throw new Error('expected a run')
    const keyedJob = keyed.start({ request: { prompt: 'ask', cwd: '.' }, finish: async () => {} })
    // A loose job holds a slot but has no address — no status dot to feed.
    const loose = desk.admit()
    if (loose.mode !== 'run') throw new Error('expected a run')
    const looseJob = loose.start({ request: { prompt: 'free', cwd: '.' }, finish: async () => {} })

    expect(desk.active()).toEqual([{ key: 'u/c:1', state: 'running' }])
    await keyedAsked.passed
    expect(desk.active()).toEqual([{ key: 'u/c:1', state: 'waiting' }])
    desk.scrubAsk('q1')
    expect(desk.active()).toEqual([{ key: 'u/c:1', state: 'running' }])

    keyedRest.open()
    looseHold.open()
    await keyedJob.done
    await looseJob.done
    expect(desk.active()).toEqual([])
  })
})
