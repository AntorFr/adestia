/**
 * The turn stream — SSE parsing and the live bubble's state.
 *
 * This is deficit #1 of the parity bar closed: the predecessor posted whole
 * assistant blocks, so on a long answer the user watched a typing indicator
 * and nothing else. Here, text arrives as deltas and the bubble grows.
 *
 * Parsing is separated from fetching on purpose — an SSE parser that can only
 * be exercised through a live server is an SSE parser nobody tests.
 */

import type { TurnEvent } from './events.js'

/**
 * Incremental SSE parser.
 *
 * A network chunk has no relationship to a frame boundary: one read may carry
 * half an event, or three and a half. Anything that assumes otherwise works
 * perfectly against a local server and corrupts long answers in production.
 */
export class SseParser {
  #buffer = ''

  push(chunk: string): readonly TurnEvent[] {
    this.#buffer += chunk
    const events: TurnEvent[] = []

    let boundary = this.#buffer.indexOf('\n\n')
    while (boundary !== -1) {
      const frame = this.#buffer.slice(0, boundary)
      this.#buffer = this.#buffer.slice(boundary + 2)
      const event = parseFrame(frame)
      if (event) events.push(event)
      boundary = this.#buffer.indexOf('\n\n')
    }
    return events
  }

  /** What is still held back waiting for its frame to complete. */
  get pending(): string {
    return this.#buffer
  }
}

function parseFrame(frame: string): TurnEvent | undefined {
  const data = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')

  if (data.length === 0) return undefined
  try {
    return JSON.parse(data) as TurnEvent
  } catch {
    // A malformed frame is dropped rather than killing the stream: losing one
    // event beats losing the rest of the answer.
    return undefined
  }
}

/** A tool call waiting on the user. The turn is blocked until it is answered. */
export interface PendingPermission {
  readonly id: string
  readonly tool: string
  readonly detail?: string | undefined
}

export interface ToolCall {
  readonly name: string
  readonly target?: string | undefined
  readonly ok?: boolean | undefined
}

/** Everything the chat needs to render one turn while it happens. */
export interface TurnState {
  readonly text: string
  readonly tools: readonly ToolCall[]
  readonly outputTokens: number
  /**
   * Weight of the context the NEXT message re-pays, known only once the turn
   * reports its result. Distinct from `outputTokens`, which is this turn's
   * production — conflating them is the error the driver contract calls out.
   */
  readonly contextTokens?: number | undefined
  readonly running: boolean
  readonly stopped: boolean
  /**
   * Interactive permissions are a v1 requirement, so an unhandled request must
   * be impossible to ignore: it lives in the turn state, and the composer
   * cannot proceed while it is set.
   */
  readonly permission?: PendingPermission | undefined
  readonly sessionId?: string | undefined
  readonly error?: string | undefined
}

export const INITIAL_TURN: TurnState = {
  text: '',
  tools: [],
  outputTokens: 0,
  running: true,
  stopped: false,
}

export function applyEvent(state: TurnState, event: TurnEvent): TurnState {
  switch (event.type) {
    case 'text-delta':
      return { ...state, text: state.text + event.text }

    case 'tool-use':
      return { ...state, tools: [...state.tools, { name: event.name, target: event.target }] }

    case 'tool-result': {
      // Mark the most recent unresolved call of that name: tool calls can
      // overlap, and blindly marking the last one mislabels a parallel pair.
      const index = findLastIndex(
        state.tools,
        (tool) => tool.name === event.name && tool.ok === undefined,
      )
      if (index === -1) return state
      const tools = [...state.tools]
      tools[index] = { ...tools[index]!, ok: event.ok }
      return { ...state, tools }
    }

    case 'permission-request':
      return {
        ...state,
        permission: { id: event.id, tool: event.tool, detail: event.detail },
      }

    case 'usage-delta':
      // The driver guarantees this only grows; the UI never has to reconcile a
      // counter that jumped backwards mid-turn.
      return { ...state, outputTokens: event.outputTokens }

    case 'result':
      return {
        ...state,
        running: false,
        stopped: event.stopped,
        sessionId: event.sessionId,
        // A request the turn ended without answering is stale; leaving it
        // would strand the composer behind a prompt nothing will resolve.
        permission: undefined,
        ...(event.usage?.outputTokens !== undefined
          ? { outputTokens: event.usage.outputTokens }
          : {}),
        ...(event.usage?.contextTokens !== undefined
          ? { contextTokens: event.usage.contextTokens }
          : {}),
      }

    case 'error':
      // A fatal error ends the turn; a non-fatal one is shown while the stream
      // keeps going, because the answer so far is still worth having.
      return { ...state, error: event.message, running: !event.fatal }
  }
}

function findLastIndex<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index]!)) return index
  }
  return -1
}

export interface StreamOptions {
  readonly prompt: string
  readonly sessionId?: string
  readonly model?: string
  readonly signal?: AbortSignal
}

/**
 * Drives one turn against the server, yielding the state after each event.
 * `fetchImpl` is injectable for the same reason the loader's environment is:
 * a stream client only testable against a running server is untested.
 */
export async function* runTurn(
  options: StreamOptions,
  fetchImpl: typeof fetch = fetch,
): AsyncGenerator<TurnState> {
  const response = await fetchImpl('/api/turn', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt: options.prompt,
      ...(options.sessionId ? { sessionId: options.sessionId } : {}),
      ...(options.model ? { model: options.model } : {}),
    }),
    ...(options.signal ? { signal: options.signal } : {}),
  })

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '')
    let message = `turn refused (${response.status})`
    try {
      const parsed = JSON.parse(detail) as { error?: string }
      if (parsed.error) message = parsed.error
    } catch {
      /* keep the status-based message */
    }
    yield { ...INITIAL_TURN, running: false, error: message }
    return
  }

  const parser = new SseParser()
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let state = INITIAL_TURN

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      for (const event of parser.push(value)) {
        state = applyEvent(state, event)
        yield state
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (state.running) {
    // The connection ended without a result event — a crashed server, a proxy
    // timeout. Saying so beats a bubble that spins forever.
    yield { ...state, running: false, error: state.error ?? 'the turn ended unexpectedly' }
  }
}
