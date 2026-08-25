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
  AuthPrompt,
  AuthStatus,
  Driver,
  DriverDescriptor,
  ModelInfo,
  TurnEvent,
  TurnRequest,
  TurnUsage,
} from '../contract.js'
import { TOKEN_ENV_VAR, looksLikeToken } from './arming.js'
import { PermissionBroker, type PermissionRequest } from '../permissions.js'
import { proposedFileEdit, toolTarget } from './events.js'
import { isKnownMessage } from './sdk-types.js'
import type { QueryFn, RawMessage, SdkMessage } from './sdk-types.js'

export interface ClaudeCodeOptions {
  /** Injected so tests can drive a fake SDK — see `test/claude-code.test.ts`. */
  readonly query: QueryFn
  /**
   * The environment the CLI inherits. Defaults to this process's own.
   *
   * It matters that this REPLACES rather than merges: the SDK hands its `env`
   * straight to the subprocess, so passing only our credentials strips PATH
   * and the CLI cannot even launch — a failure whose message blames the binary
   * (observed 2026-08-21, smoke test).
   */
  readonly baseEnv?: Readonly<Record<string, string | undefined>>
  /** Secrets the core holds; merged UNDER the turn's own env at spawn. */
  readonly credentials?: Readonly<Record<string, string>>
  readonly cliVersion?: string
  /**
   * Claude Code's own catalogue is per-account and not enumerable offline, so
   * an instance declares what it may use. Empty means the selector hides
   * rather than showing a hardcoded list that lies at the first catalog change.
   */
  readonly models?: readonly ModelInfo[]
  /**
   * Runs the token flow (`oauth.ts`). Injected so the driver's auth path can
   * be exercised without a network, an account or a browser — a driver whose
   * auth path is untested is a driver whose auth path is tested by its first
   * user.
   */
  readonly armingFlow?: ArmingFlow
  /**
   * Gates tool use behind a human. Absent means the CLI's own permission
   * handling applies — which, with no prompt surface, denies everything it
   * would have asked about. That is the failure this exists to fix: an agent
   * that quietly cannot read a file, with nothing in the interface to say so.
   */
  readonly permissions?: PermissionBroker
}

/**
 * The terminal flow, reduced to what the contract needs: something that
 * yields an authorization URL, accepts a code, and returns a token.
 */
export interface ArmingFlow {
  start(): Promise<{ authorizeUrl: string }>
  submit(code: string): Promise<{ token: string }>
  cancel(): Promise<void>
}

export class ClaudeCodeDriver implements Driver {
  readonly #query: QueryFn
  readonly #baseEnv: Readonly<Record<string, string | undefined>>
  readonly #credentials: Readonly<Record<string, string>>
  readonly #cliVersion: string
  readonly #models: readonly ModelInfo[]
  readonly #armingFlow: ArmingFlow | undefined
  readonly #permissions: PermissionBroker | undefined
  /** Set by the core after it stores a secret, so status can report it. */
  #savedAt: string | undefined
  #invalidReason: string | undefined
  /** Live queries, so `interrupt()` can reach the right one. */
  readonly #running = new Map<string, { interrupt(): Promise<unknown> }>()

  constructor(options: ClaudeCodeOptions) {
    this.#query = options.query
    this.#baseEnv = options.baseEnv ?? process.env
    this.#credentials = options.credentials ?? {}
    this.#cliVersion = options.cliVersion ?? 'unknown'
    this.#models = options.models ?? []
    this.#armingFlow = options.armingFlow
    this.#permissions = options.permissions
  }

  /** Called by the core when it loads or stores this driver's credentials. */
  setCredentials(
    credentials: Readonly<Record<string, string>>,
    savedAt?: string | undefined,
  ): void {
    Object.assign(this.#credentials as Record<string, string>, credentials)
    this.#savedAt = savedAt
    this.#invalidReason = undefined
  }

  authStatus(): Promise<AuthStatus> {
    const managed = this.#credentials[TOKEN_ENV_VAR]
    if (this.#invalidReason) {
      return Promise.resolve({
        state: 'invalid',
        source: 'managed',
        reason: this.#invalidReason,
        ...(this.#savedAt ? { savedAt: this.#savedAt } : {}),
      })
    }
    if (managed) {
      return Promise.resolve({
        state: 'armed',
        source: 'managed',
        ...(this.#savedAt ? { savedAt: this.#savedAt } : {}),
      })
    }
    // NOT an error: the CLI may perfectly well be living on credentials
    // someone set up outside Golem, and forcing an arming flow to start a
    // session would make the product harder to use than the terminal.
    return Promise.resolve({ state: 'absent', source: 'cli-native' })
  }

  async beginAuth(): Promise<AuthPrompt> {
    if (!this.#armingFlow) throw new Error('this instance cannot arm a token from the interface')
    const { authorizeUrl } = await this.#armingFlow.start()
    return {
      sessionId: 'claude-oauth',
      mode: 'url+code',
      authorizeUrl,
      inputLabel: 'Paste the code shown after authorising',
      ttl: 600,
    }
  }

  async completeAuth(_sessionId: string, input: string): Promise<{ secret: string }> {
    if (!this.#armingFlow) throw new Error('this instance cannot arm a token from the interface')
    const { token } = await this.#armingFlow.submit(input)
    if (!looksLikeToken(token)) {
      // Refused here rather than stored: a malformed token fails at the first
      // turn with an error about the CLI, which sends its owner to debug the
      // wrong thing entirely.
      throw new Error('the flow returned something that is not a subscription token')
    }
    return { secret: token }
  }

  async cancelAuth(_sessionId: string): Promise<void> {
    await this.#armingFlow?.cancel()
  }

  /**
   * Where the CLI reads its credential. Declared rather than hardcoded in the
   * core, so a third-party driver can be armed too — the core validates it,
   * refusing anything that would turn a token into code execution.
   */
  readonly credentialVar = TOKEN_ENV_VAR

  describe(): Promise<DriverDescriptor> {
    return Promise.resolve({
      id: 'claude-code',
      label: 'Claude Code',
      cliVersion: this.#cliVersion,
      capabilities: [
        // Declared only when a flow exists: an interface offering to arm a
        // token it cannot arm is worse than one that does not offer.
        ...(this.#armingFlow ? (['authManagement'] as const) : []),
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

  /** Claude Code reads skills from `.claude/skills/<name>/SKILL.md`. */
  skillsPath(): string {
    return '.claude/skills'
  }

  listModels(): Promise<readonly ModelInfo[]> {
    return Promise.resolve(this.#models)
  }

  async *runTurn(request: TurnRequest): AsyncIterable<TurnEvent> {
    // Requests raised inside the SDK's callback, drained by the loop below:
    // `canUseTool` runs off the event stream, so it cannot yield an event
    // itself — it can only leave one where the loop will find it.
    const asks: PermissionRequest[] = []
    let wakeLoop: (() => void) | undefined
    const broker = this.#permissions

    const canUseTool = broker
      ? async (toolName: string, input: Record<string, unknown>) => {
          const decision = await broker.ask(
            toolName,
            toolTarget(input),
            (ask) => {
              asks.push(ask)
              wakeLoop?.()
              return true
            },
            proposedFileEdit(toolName, input),
          )
          return decision === 'allow'
            ? ({ behavior: 'allow' as const, updatedInput: input })
            : ({ behavior: 'deny' as const, message: 'refused by the user' })
        }
      : undefined

    const query = this.#query({
      prompt: request.prompt,
      options: {
        cwd: request.cwd,
        includePartialMessages: true,
        ...(canUseTool ? { canUseTool } : {}),
        ...(request.sessionId ? { resume: request.sessionId } : {}),
        ...(request.model ? { model: request.model } : {}),
        // Credentials go ON TOP of the inherited environment, so a token
        // managed here wins over stale credentials in a shared home without
        // stripping everything the CLI needs to run.
        env: { ...this.#baseEnv, ...this.#credentials },
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
    void wakeLoop

    try {
      for await (const raw of query as AsyncIterable<RawMessage>) {
        // Drained before each message, so a prompt reaches the UI as soon as
        // the SDK raises it rather than after the next piece of output.
        while (asks.length > 0) {
          const ask = asks.shift()!
          yield {
            type: 'permission-request',
            id: ask.id,
            tool: ask.tool,
            ...(ask.detail === undefined ? {} : { detail: ask.detail }),
          }
        }

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
      // A request whose turn is over can never be answered usefully, and
      // leaving it pending strands the composer behind a prompt nothing will
      // resolve.
      broker?.releaseAll()
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
