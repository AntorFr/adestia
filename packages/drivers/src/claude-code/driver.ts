/**
 * The `claude-code` driver — Claude Code behind Golem's contract.
 *
 * Everything Claude-specific stops at this file's edge. Above it, the core and
 * the UI see only `TurnEvent`s and a capability list; below it, the Agent SDK's
 * forty-odd message types, its usage bookkeeping and its quirks.
 *
 * Verified against @anthropic-ai/claude-agent-sdk 0.3.237: `query()` yields
 * `SDKMessage`s, `includePartialMessages` turns on the streaming events that
 * feed the live bubble, and `SDKResultMessage` carries the usage totals.
 */

import type {
  Driver,
  DriverDescriptor,
  ModelInfo,
  TurnEvent,
  TurnRequest,
  TurnUsage,
} from '../contract.js'
import { toolTarget } from './events.js'
import { isKnownMessage } from './sdk-types.js'
import type { QueryFn, RawMessage, SdkMessage } from './sdk-types.js'

export interface ClaudeCodeOptions {
  /** Injected so tests can drive a fake SDK — see `test/claude-code.test.ts`. */
  readonly query: QueryFn
  /** Secrets the core holds; merged UNDER the turn's own env at spawn. */
  readonly credentials?: Readonly<Record<string, string>>
  readonly cliVersion?: string
  /**
   * Claude Code's own catalogue is per-account and not enumerable offline, so
   * an instance declares what it may use. Empty means the selector hides
   * rather than showing a hardcoded list that lies at the first catalog change.
   */
  readonly models?: readonly ModelInfo[]
}

export class ClaudeCodeDriver implements Driver {
  readonly #query: QueryFn
  readonly #credentials: Readonly<Record<string, string>>
  readonly #cliVersion: string
  readonly #models: readonly ModelInfo[]
  /** Live queries, so `interrupt()` can reach the right one. */
  readonly #running = new Map<string, { interrupt(): Promise<unknown> }>()

  constructor(options: ClaudeCodeOptions) {
    this.#query = options.query
    this.#credentials = options.credentials ?? {}
    this.#cliVersion = options.cliVersion ?? 'unknown'
    this.#models = options.models ?? []
  }

  describe(): Promise<DriverDescriptor> {
    return Promise.resolve({
      id: 'claude-code',
      label: 'Claude Code',
      cliVersion: this.#cliVersion,
      capabilities: [
        'usageMetrics',
        'cost',
        'liveTurnUsage',
        // Declared only when the instance actually configured a catalogue:
        // an empty selector is worse than no selector.
        ...(this.#models.length > 0 ? (['modelSelection'] as const) : []),
      ],
    })
  }

  env(): Promise<Readonly<Record<string, string>>> {
    return Promise.resolve({ ...this.#credentials })
  }

  listModels(): Promise<readonly ModelInfo[]> {
    return Promise.resolve(this.#models)
  }

  async *runTurn(request: TurnRequest): AsyncIterable<TurnEvent> {
    const query = this.#query({
      prompt: request.prompt,
      options: {
        cwd: request.cwd,
        includePartialMessages: true,
        ...(request.sessionId ? { resume: request.sessionId } : {}),
        ...(request.model ? { model: request.model } : {}),
        env: { ...this.#credentials },
      },
    })

    let sessionId = request.sessionId ?? ''
    let registered: string | undefined
    /**
     * Output tokens are reported as a running total per streamed message, but
     * a turn spans several assistant messages (one per tool step). Emitting
     * the raw number would make the counter jump backwards on every step, so
     * we carry the completed messages' total and add the current one.
     */
    let settledOutput = 0
    let currentOutput = 0

    try {
      for await (const raw of query as AsyncIterable<RawMessage>) {
        if (typeof raw.session_id === 'string') {
          sessionId = raw.session_id
          if (registered !== sessionId) {
            if (registered) this.#running.delete(registered)
            this.#running.set(sessionId, query)
            registered = sessionId
          }
        }
        if (!isKnownMessage(raw)) continue
        const message: SdkMessage = raw

        switch (message.type) {
          case 'stream_event': {
            const event = message.event
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              yield { type: 'text-delta', text: event.delta.text ?? '' }
            } else if (event.type === 'message_delta') {
              const output = event.usage?.output_tokens
              if (typeof output === 'number') {
                currentOutput = output
                yield { type: 'usage-delta', outputTokens: settledOutput + output }
              }
            } else if (event.type === 'message_stop') {
              settledOutput += currentOutput
              currentOutput = 0
            }
            break
          }

          case 'assistant': {
            for (const block of message.message?.content ?? []) {
              if (block.type === 'tool_use') {
                const target = toolTarget(block.input)
                yield {
                  type: 'tool-use',
                  name: block.name ?? 'tool',
                  ...(target === undefined ? {} : { target }),
                }
              }
            }
            break
          }

          case 'user': {
            for (const block of message.message?.content ?? []) {
              if (block.type === 'tool_result') {
                yield {
                  type: 'tool-result',
                  name: block.name ?? 'tool',
                  ok: block.is_error !== true,
                }
              }
            }
            break
          }

          case 'result': {
            yield {
              type: 'result',
              sessionId,
              // A turn the user stopped is a turn that must LOOK stopped in the
              // thread; the predecessor dropped this flag and the interruption
              // vanished from the transcript.
              stopped: message.subtype === 'error_during_execution',
              usage: usageOf(message),
            }
            break
          }

          default:
            break
        }
      }
    } finally {
      if (registered) this.#running.delete(registered)
    }
  }

  async interrupt(sessionId: string): Promise<void> {
    // Silently ignoring an unknown session would let a stuck turn look
    // interrupted while it keeps burning subscription quota.
    const query = this.#running.get(sessionId)
    if (!query) throw new Error(`No running turn for session "${sessionId}"`)
    await query.interrupt()
  }
}

function usageOf(message: Extract<SdkMessage, { type: 'result' }>): TurnUsage {
  const usage = message.usage ?? {}
  const input = usage.input_tokens ?? 0
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const cacheWrite = usage.cache_creation_input_tokens ?? 0

  const perModel: Record<string, number> = {}
  for (const [model, stats] of Object.entries(message.modelUsage ?? {})) {
    perModel[model] = (stats.inputTokens ?? 0) + (stats.outputTokens ?? 0)
  }

  return {
    inputTokens: input,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    /**
     * What the NEXT message re-pays — deliberately not the turn's sum. The
     * harness makes one API call per tool step, so summing them tells the user
     * a number that has nothing to do with what their next message costs.
     */
    contextTokens: input + cacheRead + cacheWrite,
    ...(message.duration_ms === undefined ? {} : { durationMs: message.duration_ms }),
    // Honest under a subscription: the SDK reports an estimate that means
    // nothing when the plan is flat, so it is surfaced only as `cost`.
    costUsd: typeof message.total_cost_usd === 'number' ? message.total_cost_usd : null,
    perModel,
  }
}
