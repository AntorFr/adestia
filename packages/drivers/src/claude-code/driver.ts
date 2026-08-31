/**
 * The `claude-code` driver — Claude Code behind Adestia's contract.
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
  McpServer,
  McpServerHealth,
  ModelInfo,
  ShellToolsHandle,
  TurnEvent,
  TurnRequest,
  TurnUsage,
} from '../contract.js'
import { SHELL_TOOLS_SERVER_NAME, bridgeStdioConfig } from '../shell-tools-config.js'
import { AskDesk, type PendingAsk } from '../asks.js'
import { McpTokens, type RefreshStore } from '../mcp-oauth.js'
import { TOKEN_ENV_VAR, looksLikeToken } from './arming.js'
import { toolTarget } from './events.js'
import { isKnownMessage } from './sdk-types.js'
import type { McpServerConfig, QueryFn, RawMessage, SdkMessage } from './sdk-types.js'

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
   * Outbound MCP servers, from the operator's config and from active plugins.
   *
   * Handed to the SDK PROGRAMMATICALLY at the spawn site rather than written
   * to a file: the CLI's own `.mcp.json` belongs to the user and the agent,
   * and a product that rewrote it would be editing something it does not own —
   * silently, on every start. Same doctrine as instructions.
   *
   * A FUNCTION is accepted beside the list, and that is what the shell hands
   * over. A server added from the settings screen is written to a file the
   * core owns; asked for per turn, it is wired on the next message instead of
   * on the next restart — which is the difference between an "add a server"
   * button that works and one that looks broken until somebody reboots the
   * instance.
   */
  readonly mcpServers?: readonly McpServer[] | (() => readonly McpServer[])
  /**
   * Hosts the turn's shell tools INSIDE this process, when the embedding can.
   *
   * The SDK accepts a live MCP server instance among its `mcpServers`
   * (measured, spikes/shell-tools-transport): the handlers then run where the
   * conversation store lives, no socket, no token on the wire. The factory is
   * injected — like `query` — because building the instance needs the SDK,
   * and this driver deliberately never imports it. Absent, the tools ride the
   * generic bridge exactly as they do on any external-binary engine.
   */
  readonly toolsHost?: (tools: ShellToolsHandle) => unknown
  /** Injected so the token exchange can be exercised without a network. */
  readonly fetchImpl?: typeof fetch
  /** Persists a rotated MCP refresh token across restarts. */
  readonly refreshStore?: RefreshStore
  /**
   * Present in `ask` posture: where the ENGINE's own questions go.
   *
   * Absent means `open` — the instance runs with permissions bypassed and
   * nothing is ever asked. The posture is the operator's, chosen in config;
   * this driver only obeys, and declares `interactivePermissions` when a desk
   * exists so the UI never offers what this instance cannot do.
   */
  readonly asks?: AskDesk
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

/**
 * Adestia's server shape, in the SDK's.
 *
 * Two transports and one discriminator: the SDK reads `type: 'http'` for a
 * URL and treats everything else as stdio. Written explicitly rather than
 * spread, so a field the config gains does not silently reach the CLI.
 */
async function toSdkServers(
  servers: readonly McpServer[],
  tokens: McpTokens,
  callerToken?: string,
): Promise<Readonly<Record<string, McpServerConfig>>> {
  const out: Record<string, McpServerConfig> = {}
  for (const server of servers) {
    if (!server.url) {
      out[server.name] = {
        type: 'stdio',
        command: server.command ?? '',
        ...(server.args ? { args: [...server.args] } : {}),
        ...(server.env ? { env: { ...server.env } } : {}),
      }
      continue
    }

    const headers: Record<string, string> = { ...server.headers }
    if (server.identity === 'user') {
      // Somebody's own data. Without a caller there is nobody to act as, so
      // the server is absent from this turn rather than reached with the
      // instance's identity — which would be a different person's data, or a
      // flat refusal read as a broken tool.
      if (!callerToken) continue
      headers['Authorization'] = `Bearer ${callerToken}`
    } else if (server.auth) {
      const token = await tokens.for(server.auth)
      // A server whose token could not be minted is OMITTED rather than sent
      // unauthenticated: the hub would refuse every call, and the agent would
      // read a wall of 401s as "the tool is broken" instead of "I am not
      // logged in". Absent, the CLI simply has one tool fewer.
      if (!token) continue
      headers['Authorization'] = `Bearer ${token}`
    }

    out[server.name] = {
      type: 'http',
      url: server.url,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    }
  }
  return out
}

/**
 * The CLI's status words, in the contract's.
 *
 * A word this table has never met becomes `unknown` rather than `failed`: a
 * new state the CLI invents is not evidence that a server is down, and saying
 * "down" about a working server is the more expensive mistake.
 */
const HEALTH_STATES = new Set(['connected', 'failed', 'needs-auth', 'pending', 'disabled'])

function readHealth(
  reported: readonly { name: string; status?: string; error?: string }[],
): readonly McpServerHealth[] {
  return reported.map((server) => ({
    name: server.name,
    state: (HEALTH_STATES.has(server.status ?? '')
      ? server.status
      : 'unknown') as McpServerHealth['state'],
    ...(server.error ? { error: server.error } : {}),
  }))
}

export class ClaudeCodeDriver implements Driver {
  readonly #query: QueryFn
  readonly #baseEnv: Readonly<Record<string, string | undefined>>
  readonly #credentials: Readonly<Record<string, string>>
  #cliVersion: string
  readonly #models: readonly ModelInfo[]
  readonly #armingFlow: ArmingFlow | undefined
  readonly #asks: AskDesk | undefined
  readonly #mcpServers: () => readonly McpServer[]
  readonly #toolsHost: ((tools: ShellToolsHandle) => unknown) | undefined
  readonly #tokens: McpTokens
  /** What the last session said about them. Empty until a turn has run. */
  #mcpHealth: readonly McpServerHealth[] = []
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
    this.#asks = options.asks
    // Kept as a question rather than an answer: a fixed list is wrapped, and
    // a caller that has a live one is asked afresh every time it matters.
    const given = options.mcpServers ?? []
    this.#mcpServers = typeof given === 'function' ? given : () => given
    this.#toolsHost = options.toolsHost
    this.#tokens = new McpTokens(options.fetchImpl ?? fetch, options.refreshStore)
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
    // someone set up outside Adestia, and forcing an arming flow to start a
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
        // Declared only when this instance actually wired servers: a panel
        // offering to report the health of nothing is a panel that looks
        // broken. The CLI's own `.mcp.json` servers are the user's, and Adestia
        // does not claim to report on what it did not wire.
        ...(this.#mcpServers().length > 0 ? (['mcpStatus'] as const) : []),
        // Declared only when the instance actually configured a catalogue:
        // an empty selector is worse than no selector.
        ...(this.#models.length > 0 ? (['modelSelection'] as const) : []),
        // Only in `ask` posture. In `open` the instance genuinely cannot ask,
        // and a capability declared and unhonoured is the lying zero this
        // contract exists to prevent.
        ...(this.#asks ? (['interactivePermissions'] as const) : []),
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

  /**
   * Where this CLI reads prose: the project brief, skills, and subagents.
   *
   * The agent folder is in BOTH lists, and that pairing is the whole posture:
   * a subagent's markdown body is a brief somebody wrote and should be able
   * to correct here, while its frontmatter is authority. Guarding the write
   * without showing the file would leave a person told "no" about a file
   * they cannot read.
   */
  instructionPaths(): readonly string[] {
    return ['CLAUDE.md', '.claude/agents', '.claude/skills']
  }

  listModels(): Promise<readonly ModelInfo[]> {
    return Promise.resolve(this.#models)
  }

  /**
   * What the servers are doing, as of the last turn.
   *
   * Read off the session's init message rather than probed, because probing
   * would mean opening a session to ask. Before any turn has run, every
   * declared server is reported as `unknown` — which is true, and which the
   * panel can say. An empty list would read as "you have no servers" to
   * somebody who just configured three.
   */
  mcpStatus(): Promise<readonly McpServerHealth[]> {
    if (this.#mcpHealth.length > 0) return Promise.resolve(this.#mcpHealth)
    return Promise.resolve(
      this.#mcpServers().map((server) => ({ name: server.name, state: 'unknown' as const })),
    )
  }

  async *runTurn(request: TurnRequest): AsyncIterable<TurnEvent> {
    // Resolved per turn, not per process: a hub's token lives about an hour,
    // and a map built at construction would be stale by the second morning.
    const mcpServers: Record<string, unknown> = {
      ...(await toSdkServers(this.#mcpServers(), this.#tokens, request.callerToken)),
    }
    if (request.tools) {
      // The instance's own tools. In-process when the embedding provided a
      // host; over the generic bridge otherwise — same registry either way,
      // and the model sees the same server name.
      mcpServers[SHELL_TOOLS_SERVER_NAME] = this.#toolsHost
        ? this.#toolsHost(request.tools)
        : { type: 'stdio', ...bridgeStdioConfig(request.tools) }
    }

    const desk = this.#asks
    /**
     * Questions raised inside the SDK's callback, drained by the loop below.
     *
     * `canUseTool` runs off the event stream, so it cannot yield an event
     * itself — it can only leave one where the loop will find it.
     */
    const raised: PendingAsk[] = []

    /**
     * The engine asks; this carries the question and brings the answer back.
     *
     * Note what is NOT here: any judgement of our own. By the time this runs,
     * the CLI's own first line has already let the harmless through — a
     * `Read`, an `echo` never reach it (measured). What arrives is its
     * residue, and the only thing Adestia adds is a person.
     *
     * `always` returns the engine's OWN suggestions, untouched, as
     * `updatedPermissions`. The CLI then writes the rule into its own file in
     * the workspace and reads it back on every later turn — so the durable
     * allowlist is the engine's, in a file a person can open and edit, and
     * Adestia keeps no list of its own.
     *
     * ⚠️ Untouched is deliberate, and was learned the hard way. An earlier
     * version pinned these to `destination: 'session'` so a button reading
     * "for this conversation" would not lie — but a session's rules die with
     * the turn's process, so the promise became "for this turn" and the
     * answer had to be given again at the next message. The honest fix was
     * the LABEL, not the scope.
     */
    const canUseTool = desk
      ? async (
          toolName: string,
          input: Record<string, unknown>,
          options: {
            suggestions?: unknown[]
            title?: string
            decisionReason?: string
          },
        ) => {
          const suggestions = options.suggestions ?? []
          const answer = await desk.ask(
            {
              tool: toolName,
              // The engine's own sentence when it wrote one; the tool and its
              // target otherwise. Never truncated — this is the thing being
              // consented to, and consent to an elided command is not consent.
              title: options.title ?? [toolName, toolTarget(input)].filter(Boolean).join(' — '),
              ...(options.decisionReason ? { reason: options.decisionReason } : {}),
              remembering: suggestions.length > 0,
            },
            (pending) => {
              // Nobody to ask: refuse now rather than block the turn for five
              // minutes on a question no screen will ever show.
              if (request.unattended) return false
              raised.push(pending)
              return true
            },
          )

          if (answer === 'deny') {
            return { behavior: 'deny' as const, message: 'refused by the user' }
          }
          return {
            behavior: 'allow' as const,
            updatedInput: input,
            ...(answer === 'always' && suggestions.length > 0
              ? { updatedPermissions: suggestions }
              : {}),
          }
        }
      : undefined

    const query = this.#query({
      prompt: request.prompt,
      options: {
        cwd: request.cwd,
        includePartialMessages: true,
        // The two postures, and the whole of the difference between them.
        //
        // `open` (no desk): permissions bypassed, explicitly — removing the
        // prompt surface WITHOUT this makes the SDK deny what it meant to ask
        // (measured), which is silent failure rather than freedom.
        //
        // `ask` (a desk): `default`, so the CLI applies its own first line and
        // routes what is left to `canUseTool`. Deliberately NOT `'auto'`: its
        // classifier approved a `rm -rf` without ever calling back (measured
        // 2026-08-26), so it is a bypass wearing a gate's name.
        ...(canUseTool
          ? { permissionMode: 'default' as const, canUseTool }
          : {
              permissionMode: 'bypassPermissions' as const,
              allowDangerouslySkipPermissions: true,
            }),
        ...(request.sessionId ? { resume: request.sessionId } : {}),
        ...(request.model ? { model: request.model } : {}),
        // Only what this instance declared. The CLI's own MCP config still
        // applies on top — it is the user's, and Adestia does not touch it.
        ...(Object.keys(mcpServers).length > 0 ? { mcpServers } : {}),
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

    try {
      for await (const raw of query as AsyncIterable<RawMessage>) {
        // Drained before each message, so a question reaches the screen as
        // soon as the SDK raises it rather than after the next piece of
        // output — the turn is BLOCKED on it, so late is the same as lost.
        while (raised.length > 0) {
          const ask = raised.shift()!
          yield {
            type: 'permission-request',
            id: ask.id,
            tool: ask.tool,
            title: ask.title,
            ...(ask.reason === undefined ? {} : { reason: ask.reason }),
            remembering: ask.remembering,
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

          case 'system': {
            // Two fields consumed from session metadata, both recorded rather
            // than yielded: they are not events of the conversation, they are
            // the state of the plumbing, and the interface asks for them.
            if (message.mcpServers) this.#mcpHealth = readHealth(message.mcpServers)
            // Where the version comes from. There is no probe to run: the SDK
            // owns the binary, and the session announces what it is. Which
            // means it is genuinely unknown until a first turn has run —
            // honest, and better than never knowing.
            if (message.claude_code_version) this.#cliVersion = message.claude_code_version
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
      // A question whose turn is over can never be answered usefully, and
      // leaving it pending strands the composer behind a prompt nothing will
      // resolve.
      desk?.releaseAll()
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
