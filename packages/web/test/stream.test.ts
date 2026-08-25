import { describe, expect, it } from 'vitest'

import type { TurnEvent } from '../src/chat/events.js'
import { INITIAL_TURN, SseParser, applyEvent, runTurn, type TurnState } from '../src/chat/stream.js'

const frame = (event: TurnEvent) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`

describe('SseParser', () => {
  it('reads a complete frame', () => {
    const parser = new SseParser()
    expect(parser.push(frame({ type: 'text-delta', text: 'salut' }))).toEqual([
      { type: 'text-delta', text: 'salut' },
    ])
  })

  it('holds a half-arrived frame until it completes', () => {
    // A network chunk has no relationship to a frame boundary. Code that
    // assumes otherwise works locally and corrupts long answers in production.
    const parser = new SseParser()
    const whole = frame({ type: 'text-delta', text: 'bonjour' })
    const cut = Math.floor(whole.length / 2)

    expect(parser.push(whole.slice(0, cut))).toEqual([])
    expect(parser.pending.length).toBeGreaterThan(0)
    expect(parser.push(whole.slice(cut))).toEqual([{ type: 'text-delta', text: 'bonjour' }])
    expect(parser.pending).toBe('')
  })

  it('reads several frames arriving in one chunk', () => {
    const parser = new SseParser()
    const events = parser.push(
      frame({ type: 'text-delta', text: 'a' }) +
        frame({ type: 'text-delta', text: 'b' }) +
        frame({ type: 'usage-delta', outputTokens: 12 }),
    )
    expect(events).toHaveLength(3)
  })

  it('survives a byte-by-byte stream', () => {
    const parser = new SseParser()
    const source = frame({ type: 'text-delta', text: 'très fin' })
    const events = [...source].flatMap((char) => parser.push(char))
    expect(events).toEqual([{ type: 'text-delta', text: 'très fin' }])
  })

  it('drops a malformed frame rather than killing the stream', () => {
    // Losing one event beats losing the rest of the answer.
    const parser = new SseParser()
    const events = parser.push(
      'event: text-delta\ndata: {broken\n\n' + frame({ type: 'text-delta', text: 'ok' }),
    )
    expect(events).toEqual([{ type: 'text-delta', text: 'ok' }])
  })

  it('ignores comment and retry lines a proxy may inject', () => {
    const parser = new SseParser()
    expect(parser.push(': keep-alive\n\n')).toEqual([])
  })
})

describe('applyEvent', () => {
  const reduce = (events: readonly TurnEvent[]): TurnState =>
    events.reduce(applyEvent, INITIAL_TURN)

  it('grows the bubble delta by delta', () => {
    const state = reduce([
      { type: 'text-delta', text: 'Bon' },
      { type: 'text-delta', text: 'jour ' },
      { type: 'text-delta', text: 'singe' },
    ])
    expect(state.text).toBe('Bonjour singe')
    expect(state.running).toBe(true)
  })

  it('tracks tool calls and their outcomes', () => {
    const state = reduce([
      { type: 'tool-use', name: 'Read', target: '/a.md' },
      { type: 'tool-result', name: 'Read', ok: true },
    ])
    expect(state.tools).toEqual([{ name: 'Read', target: '/a.md', ok: true }])
  })

  it('resolves parallel calls of the same tool in order', () => {
    // Two Reads in flight: marking "the last one" would label the wrong call.
    const state = reduce([
      { type: 'tool-use', name: 'Read', target: '/a.md' },
      { type: 'tool-use', name: 'Read', target: '/b.md' },
      { type: 'tool-result', name: 'Read', ok: false },
    ])
    expect(state.tools.map((t) => t.ok)).toEqual([undefined, false])
  })

  it('ignores a result for a tool that was never announced', () => {
    expect(reduce([{ type: 'tool-result', name: 'Ghost', ok: true }]).tools).toEqual([])
  })

  it('carries the climbing token counter', () => {
    const state = reduce([
      { type: 'usage-delta', outputTokens: 10 },
      { type: 'usage-delta', outputTokens: 42 },
    ])
    expect(state.outputTokens).toBe(42)
  })

  it('holds a permission request so the composer cannot ignore it', () => {
    const state = reduce([
      { type: 'permission-request', id: 'p1', tool: 'Bash', detail: 'rm -rf build' },
    ])
    expect(state.permission).toEqual({ id: 'p1', tool: 'Bash', detail: 'rm -rf build' })
  })

  it('clears a permission the turn ended without answering', () => {
    // Leaving it would strand the composer behind a prompt nothing resolves.
    const state = reduce([
      { type: 'permission-request', id: 'p1', tool: 'Bash' },
      { type: 'result', sessionId: 's1', stopped: false },
    ])
    expect(state.permission).toBeUndefined()
  })

  it('ends the turn on a result and keeps the session id', () => {
    const state = reduce([
      { type: 'text-delta', text: 'done' },
      { type: 'result', sessionId: 's7', stopped: false, usage: { outputTokens: 99 } },
    ])
    expect(state).toMatchObject({ running: false, sessionId: 's7', outputTokens: 99 })
  })

  it('materializes an interruption', () => {
    // The predecessor computed this flag and the front end dropped it, so
    // interruptions vanished from the thread.
    const state = reduce([{ type: 'result', sessionId: 's1', stopped: true }])
    expect(state.stopped).toBe(true)
  })

  it('keeps streaming after a non-fatal error', () => {
    const state = reduce([
      { type: 'error', message: 'a tool failed', fatal: false },
      { type: 'text-delta', text: 'carrying on' },
    ])
    expect(state).toMatchObject({ error: 'a tool failed', running: true, text: 'carrying on' })
  })

  it('ends the turn on a fatal error', () => {
    expect(reduce([{ type: 'error', message: 'CLI died', fatal: true }]).running).toBe(false)
  })
})

/** A fetch that replays a scripted SSE body in arbitrary chunks. */
function fakeFetch(
  chunks: readonly string[],
  init: { ok?: boolean; status?: number } = {},
): typeof fetch {
  const impl = () =>
    Promise.resolve({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      text: () => Promise.resolve(chunks.join('')),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder()
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
          controller.close()
        },
      }),
    } as unknown as Response)
  return impl as unknown as typeof fetch
}

describe('runTurn', () => {
  it('yields a growing state as the stream arrives', async () => {
    const states: TurnState[] = []
    for await (const state of runTurn(
      { prompt: 'hi' },
      fakeFetch([
        frame({ type: 'text-delta', text: 'Bon' }),
        frame({ type: 'text-delta', text: 'jour' }),
        frame({ type: 'result', sessionId: 's1', stopped: false }),
      ]),
    )) {
      states.push(state)
    }
    expect(states.map((s) => s.text)).toEqual(['Bon', 'Bonjour', 'Bonjour'])
    expect(states.at(-1)).toMatchObject({ running: false, sessionId: 's1' })
  })

  it('reassembles frames split across network chunks', async () => {
    const whole = frame({ type: 'text-delta', text: 'coupé en deux' })
    const states: TurnState[] = []
    for await (const state of runTurn(
      { prompt: 'hi' },
      fakeFetch([whole.slice(0, 12), whole.slice(12), frame({ type: 'result', sessionId: 's', stopped: false })]),
    )) {
      states.push(state)
    }
    expect(states[0]?.text).toBe('coupé en deux')
  })

  it('carries the screen being watched, and nothing when there is none', async () => {
    const sent: unknown[] = []
    const capture = (chunks: readonly string[]): typeof fetch => {
      const inner = fakeFetch(chunks)
      return ((url: string, init: RequestInit) => {
        sent.push(JSON.parse(String(init.body)))
        return (inner as unknown as (u: string, i: RequestInit) => Promise<Response>)(url, init)
      }) as unknown as typeof fetch
    }
    const done = [frame({ type: 'result', sessionId: 's', stopped: false })]

    for await (const _ of runTurn(
      { prompt: 'hi', view: { route: '/parcours', title: 'Parcours' } },
      capture(done),
    )) {
      /* drained */
    }
    for await (const _ of runTurn({ prompt: 'hi' }, capture(done))) {
      /* drained */
    }

    expect(sent[0]).toMatchObject({ view: { route: '/parcours', title: 'Parcours' } })
    expect(sent[1]).not.toHaveProperty('view')
  })

  it('surfaces the server refusal message on a 429', async () => {
    // The concurrency cap answers with a reason; showing "429" instead would
    // waste the one useful thing the server said.
    const states: TurnState[] = []
    for await (const state of runTurn(
      { prompt: 'hi' },
      fakeFetch(['{"error":"too many turns running","max":1}'], { ok: false, status: 429 }),
    )) {
      states.push(state)
    }
    expect(states.at(-1)).toMatchObject({ running: false, error: 'too many turns running' })
  })

  it('reports a stream that ends without a result', async () => {
    // A crashed server or a proxy timeout. Saying so beats a bubble that
    // spins forever.
    const states: TurnState[] = []
    for await (const state of runTurn(
      { prompt: 'hi' },
      fakeFetch([frame({ type: 'text-delta', text: 'half an ans' })]),
    )) {
      states.push(state)
    }
    expect(states.at(-1)).toMatchObject({
      running: false,
      error: 'the turn ended unexpectedly',
      text: 'half an ans',
    })
  })
})
