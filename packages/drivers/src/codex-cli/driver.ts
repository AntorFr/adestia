/**
 * The `codex-cli` driver.
 *
 * Where the Claude driver talks to an SDK and the Copilot one scrapes JSONL,
 * this one speaks a JSON-RPC protocol: `codex app-server --stdio`. Everything
 * it assumes was established hands-on in spike 5 against binary 0.154.0 — see
 * `spikes/codex-cli/REPORT.md` — including the two facts that shape the whole
 * file:
 *
 * **One process per turn.** Codex starts its MCP servers once per THREAD, so a
 * long-lived server would carry turn 1's shell-tools token into turn 2 and
 * every tool call would come back "this turn's token is unknown or expired"
 * (measured). A fresh app-server per turn, resuming the same thread, restores
 * one token per turn, keeps the whole history, and costs about 100 ms.
 *
 * **The sandbox is the container's job, not the CLI's.** A command codex's own
 * sandbox refuses emits NO event at all — not on the exec surface, not on this
 * one, confirmed with a real model that then went on to *talk about* the
 * refusal it had just been given. On an engine where every read and edit is a
 * shell command, that would make the trace lie. So in `open` posture the
 * driver hands the CLI `danger-full-access` and lets the container be the
 * bound, exactly as DESIGN.md already says of that posture ("container and MCP
 * servers are the bounds"), and the blind spot cannot fire. In `ask` posture
 * the CLI needs a sandbox to have anything to ask about, so it gets one — and
 * the blind spot returns for denials the model did not anticipate. That is a
 * known, documented cost of that posture on this engine.
 */

import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { AskDesk, type PendingAsk } from '../asks.js'
import type {
  AuthPrompt,
  AuthStatus,
  Driver,
  DriverDescriptor,
  McpServer,
  McpServerHealth,
  ModelInfo,
  QuotaReport,
  QuotaWindow,
  ShellToolsHandle,
  TurnEvent,
  TurnRequest,
} from '../contract.js'
import { McpTokens, type RefreshStore } from '../mcp-oauth.js'
import { SHELL_TOOLS_SERVER_NAME, bridgeStdioConfig } from '../shell-tools-config.js'
import {
  CREDENTIAL_KEY,
  classifyAuthError,
  codexEnv,
  explainAuthProblem,
  materialize,
  normalizeCredential,
  readMaterialized,
} from './auth.js'
import { newTranslationState, translate, type Notification } from './events.js'
import { startDeviceAuthLogin, type DeviceAuthLogin } from './login.js'
import { AppServer, type SpawnImpl } from './protocol.js'

export interface CodexDriverOptions {
  /** The pinned binary. An absolute path in a container; `codex` in dev. */
  readonly command?: string
  /** Driver-owned state: config, credential, sessions, sqlite. */
  readonly home: string
  readonly credentials?: Readonly<Record<string, string>>
  readonly baseEnv?: Readonly<Record<string, string | undefined>>
  readonly cliVersion?: string
  /** A fallback catalogue; the engine's own list is preferred when it answers. */
  readonly models?: readonly ModelInfo[]
  readonly mcpServers?: readonly McpServer[] | (() => readonly McpServer[])
  readonly asks?: AskDesk
  readonly refreshStore?: RefreshStore
  readonly fetchImpl?: typeof fetch
  readonly spawnImpl?: SpawnImpl
  readonly startLogin?: typeof startDeviceAuthLogin
  /**
   * Told when the CLI rewrites its own credential.
   *
   * A ChatGPT login carries a refresh token and a clock, so the CLI may rotate
   * `auth.json` behind us. If it does and the core keeps the old document, the
   * next restart writes a stale credential back over a fresh one and the
   * instance silently loses its login. The driver reads the file back after
   * every turn and reports a change here.
   */
  readonly onCredentialRefreshed?: (document: string) => void
}

/** A queue that turns pushed notifications into a pullable stream. */
class EventQueue {
  readonly #items: TurnEvent[] = []
  #waiting: (() => void) | undefined
  #closed = false

  push(event: TurnEvent): void {
    this.#items.push(event)
    this.#waiting?.()
    this.#waiting = undefined
  }

  close(): void {
    this.#closed = true
    this.#waiting?.()
    this.#waiting = undefined
  }

  async *drain(): AsyncGenerator<TurnEvent> {
    for (;;) {
      while (this.#items.length > 0) yield this.#items.shift() as TurnEvent
      if (this.#closed) return
      await new Promise<void>((resolve) => {
        this.#waiting = resolve
      })
    }
  }
}

export class CodexDriver implements Driver {
  readonly credentialVar = CREDENTIAL_KEY

  readonly #command: string
  readonly #home: string
  readonly #baseEnv: Readonly<Record<string, string | undefined>>
  readonly #cliVersion: string
  readonly #fallbackModels: readonly ModelInfo[]
  readonly #mcpServers: () => readonly McpServer[]
  readonly #asks: AskDesk | undefined
  readonly #tokens: McpTokens
  readonly #spawnImpl: SpawnImpl | undefined
  readonly #startLogin: typeof startDeviceAuthLogin
  readonly #onCredentialRefreshed: ((document: string) => void) | undefined

  #credentials: Record<string, string>
  #savedAt: string | undefined
  #invalidReason: string | undefined
  #models: readonly ModelInfo[] | undefined
  #quotas: QuotaReport | undefined
  #health = new Map<string, McpServerHealth>()
  #pending: { login: DeviceAuthLogin; home: string } | undefined

  constructor(options: CodexDriverOptions) {
    this.#command = options.command ?? 'codex'
    this.#home = options.home
    this.#baseEnv = options.baseEnv ?? process.env
    this.#cliVersion = options.cliVersion ?? 'unknown'
    this.#fallbackModels = options.models ?? []
    const given = options.mcpServers ?? []
    this.#mcpServers = typeof given === 'function' ? given : () => given
    this.#asks = options.asks
    this.#tokens = new McpTokens(options.fetchImpl ?? fetch, options.refreshStore)
    this.#spawnImpl = options.spawnImpl
    this.#startLogin = options.startLogin ?? startDeviceAuthLogin
    this.#onCredentialRefreshed = options.onCredentialRefreshed
    this.#credentials = { ...options.credentials }
  }

  describe(): Promise<DriverDescriptor> {
    return Promise.resolve({
      id: 'codex-cli',
      label: 'Codex CLI',
      cliVersion: this.#cliVersion,
      capabilities: [
        'authManagement',
        'usageMetrics',
        // The stream carries a cumulative token count DURING the turn
        // (`thread/tokenUsage/updated`), which is what the climbing counter
        // needs — the one thing Copilot's stream cannot do.
        'liveTurnUsage',
        // Two real windows, pushed after every turn, with a percentage and a
        // reset time. No polling, no cache to apologise for.
        'subscriptionQuotas',
        // Deliberately NOT declared: `cost`. Nothing here reports money, and
        // on a ChatGPT plan the meaningful number is a share of a window —
        // which is the capability above, not this one. `contextBreakdown`
        // likewise: no live weight of the next message was ever observed.
        ...(this.#mcpServers().length > 0 ? (['mcpStatus'] as const) : []),
        // Declared even with no configured catalogue: unlike the other two
        // engines, this one enumerates its own models, filtered by what the
        // account may actually use.
        'modelSelection',
        // Only in `ask` posture, same rule as the Claude driver: a capability
        // declared and unhonoured is the lying zero this contract exists to
        // prevent.
        ...(this.#asks ? (['interactivePermissions'] as const) : []),
      ],
    })
  }

  /**
   * What the CLI's environment gets — and what it does NOT get.
   *
   * The credential is not here. `OPENAI_API_KEY` in the environment is ignored
   * for the built-in provider (measured), so the secret is written as a file
   * under the driver-owned home at the spawn site, and what travels in the
   * environment is the home itself.
   */
  async env(): Promise<Readonly<Record<string, string>>> {
    await materialize(this.#home, this.#credentials[CREDENTIAL_KEY])
    return { CODEX_HOME: this.#home }
  }

  /** Codex reads workspace skills from here — measured against 0.154.0. */
  skillsPath(): string {
    return '.codex/skills'
  }

  /**
   * Where this CLI reads prose. `AGENTS.md` is its own dialect; the skill
   * folders hold the contracts the core delivers, whose bodies are briefs a
   * person should be able to read and correct.
   */
  instructionPaths(): readonly string[] {
    return ['AGENTS.md', '.codex/skills', '.agents/skills']
  }

  /** `sandboxPolicy.writableRoots`, per turn — finer than the contract asks. */
  acceptsRoots(): boolean {
    return true
  }

  setCredentials(credentials: Readonly<Record<string, string>>, savedAt?: string | undefined): void {
    this.#credentials = { ...credentials }
    this.#savedAt = savedAt
    this.#invalidReason = undefined
  }

  authStatus(): Promise<AuthStatus> {
    if (this.#invalidReason) {
      return Promise.resolve({
        state: 'invalid',
        source: 'managed',
        reason: this.#invalidReason,
        ...(this.#savedAt ? { savedAt: this.#savedAt } : {}),
      })
    }
    if (this.#credentials[CREDENTIAL_KEY]) {
      return Promise.resolve({
        state: 'armed',
        source: 'managed',
        ...(this.#savedAt ? { savedAt: this.#savedAt } : {}),
      })
    }
    return Promise.resolve({ state: 'absent', source: 'cli-native' })
  }

  /**
   * A relayed device flow — and, unlike Copilot's, one that needs no pty and
   * asks the user nothing beyond approving in their browser.
   *
   * The child is HELD until `completeAuth`: it is the process that polls for
   * the token, so killing it would make the user's approval land nowhere, with
   * no error on either side.
   */
  async beginAuth(): Promise<AuthPrompt> {
    this.#pending?.login.cancel()

    const home = join(this.#home, 'arming')
    await rm(home, { recursive: true, force: true })
    await mkdir(home, { recursive: true })

    const login = await this.#startLogin({
      command: this.#command,
      home,
      baseEnv: this.#baseEnv,
    })
    this.#pending = { login, home }

    return {
      sessionId: 'codex-device',
      mode: 'device-code',
      authorizeUrl: login.verificationUri,
      userCode: login.userCode,
      inputLabel: 'Approve in your browser, then finish here',
      ttl: 900,
    }
  }

  /**
   * @param input a pasted API key when there is one, ignored otherwise.
   *
   * Two ways in through one door: a device login already in progress is
   * finished, and anything else is read as a pasted credential. The pasted
   * path is shape-checked here because the CLI itself does not check at all —
   * it answers "Successfully logged in" to nonsense and only tells the truth
   * ~35 s into the first turn.
   */
  async completeAuth(_sessionId: string, input: string): Promise<{ secret: string }> {
    const pending = this.#pending
    if (pending) {
      try {
        const document = await pending.login.completed
        return { secret: document }
      } finally {
        await rm(pending.home, { recursive: true, force: true }).catch(() => undefined)
        this.#pending = undefined
      }
    }

    const document = normalizeCredential(input)
    if (!document) {
      throw new Error('that is neither an OpenAI API key nor a codex auth.json document')
    }
    return { secret: document }
  }

  async cancelAuth(_sessionId: string): Promise<void> {
    const pending = this.#pending
    if (!pending) return
    pending.login.cancel()
    await rm(pending.home, { recursive: true, force: true }).catch(() => undefined)
    this.#pending = undefined
  }

  /**
   * The engine's own catalogue, filtered by what this account may use.
   *
   * Asked once and cached: it costs a process, and it does not change between
   * two messages. A configured list is the fallback, never the override — the
   * point of asking is that a hand-maintained list goes stale.
   */
  async listModels(): Promise<readonly ModelInfo[]> {
    if (this.#models) return this.#models
    try {
      const listed = await this.#withServer(async (server) => {
        const answer = await server.request<{ data?: readonly Record<string, unknown>[] }>('model/list', {})
        return (answer.data ?? []).flatMap((entry): ModelInfo[] => {
          const id = entry['id'] ?? entry['model']
          if (typeof id !== 'string' || id === '') return []
          if (entry['hidden'] === true) return []
          const label = entry['displayName']
          return [{ id, ...(typeof label === 'string' && label !== '' ? { label } : {}) }]
        })
      })
      if (listed.length > 0) {
        this.#models = listed
        return listed
      }
    } catch {
      // Fall through: an engine that will not answer is not a reason to show
      // an empty selector when the operator configured one.
    }
    return this.#fallbackModels
  }

  /**
   * What the servers of the last turn were doing.
   *
   * Read off the turn's own notifications rather than probed, for the reason
   * the contract's `unknown` state exists: servers are started when a THREAD
   * starts, so an instance that has run no turn genuinely does not know yet.
   */
  mcpStatus(): Promise<readonly McpServerHealth[]> {
    const declared = this.#mcpServers()
    if (this.#health.size === 0) {
      return Promise.resolve(declared.map((server) => ({ name: server.name, state: 'unknown' as const })))
    }
    return Promise.resolve(
      declared.map((server) => this.#health.get(server.name) ?? { name: server.name, state: 'unknown' as const }),
    )
  }

  /**
   * The subscription's windows.
   *
   * Served from what the last turn was pushed when there is one — the engine
   * sends `account/rateLimits/updated` after every turn, unasked — and fetched
   * otherwise. `stale` says which of the two happened, because a number whose
   * age is unknown is a number nobody can act on.
   */
  async subscriptionQuotas(): Promise<QuotaReport> {
    if (this.#quotas) return this.#quotas
    const fetched = await this.#withServer((server) =>
      server.request<Record<string, unknown>>('account/rateLimits/read', {}),
    )
    const report = quotaReportOf(fetched['rateLimits'] ?? fetched, false)
    if (report) {
      this.#quotas = report
      return report
    }
    return { windows: [], stale: false, fetchedAt: new Date().toISOString() }
  }

  async *runTurn(request: TurnRequest): AsyncIterable<TurnEvent> {
    await materialize(this.#home, this.#credentials[CREDENTIAL_KEY])
    await mkdir(this.#home, { recursive: true })

    const state = newTranslationState(request.sessionId ?? '')
    const queue = new EventQueue()
    const desk = this.#asks

    const server = new AppServer({
      command: this.#command,
      cwd: request.cwd,
      env: codexEnv(this.#baseEnv, this.#home),
      ...(this.#spawnImpl ? { spawnImpl: this.#spawnImpl } : {}),
      onNotification: (message) => {
        for (const event of translate(message as Notification, state)) queue.push(event)
        if (message.method === 'account/rateLimits/updated') {
          const report = quotaReportOf(message.params?.['rateLimits'], false)
          if (report) this.#quotas = report
        }
        if (state.finished) queue.close()
      },
      onRequest: async (message) => this.#answer(message, desk, request, queue),
    })

    let threadId = request.sessionId ?? ''
    /**
     * Interrupting is a protocol call, not a signal — the turn stops where it
     * is and the thread survives, which is what "stop" means to the person who
     * pressed it.
     *
     * The engine reports the interrupted turn as one that did not complete, so
     * the marker reaches the thread on its own; `state.stopped` is set anyway,
     * because a turn WE stopped is stopped whatever status comes back.
     */
    const stop = () => {
      state.stopped = true
      if (threadId) void server.request('turn/interrupt', { threadId }).catch(() => undefined)
    }
    request.signal?.addEventListener('abort', stop, { once: true })

    try {
      await server.initialize('adestia', this.#cliVersion)

      const config = await this.#threadConfig(request)
      const started = request.sessionId
        ? await server.request<Record<string, unknown>>('thread/resume', {
            threadId: request.sessionId,
            config,
          })
        : await server.request<Record<string, unknown>>('thread/start', {
            cwd: request.cwd,
            ...this.#posture(),
            ...(request.model ? { model: request.model } : {}),
            config,
          })

      const thread = started['thread']
      const id = typeof thread === 'object' && thread !== null ? (thread as Record<string, unknown>)['id'] : undefined
      threadId = typeof id === 'string' && id !== '' ? id : threadId
      state.threadId = threadId
      // A stop pressed while the thread was still opening has nothing to name;
      // honoured here, now that there is something.
      if (request.signal?.aborted) stop()

      await server.request('turn/start', {
        threadId,
        input: [{ type: 'text', text: request.prompt }],
        ...(request.model ? { model: request.model } : {}),
        ...(request.roots && request.roots.length > 0
          ? { sandboxPolicy: { type: 'workspaceWrite', writableRoots: [request.cwd, ...request.roots] } }
          : {}),
      })

      yield* queue.drain()
    } catch (error) {
      const message = (error as Error).message
      const problem = classifyAuthError(message)
      if (problem) this.#invalidReason = explainAuthProblem(problem)
      yield { type: 'error', message, fatal: true }
      yield { type: 'result', sessionId: threadId, stopped: true }
    } finally {
      request.signal?.removeEventListener('abort', stop)
      server.close()
      this.#health = state.mcp
      await this.#noteCredentialRefresh()
    }
  }

  /**
   * The engine asks; this carries the question and brings the answer back.
   *
   * Nothing here judges. By the time this runs the engine has already decided
   * the call needs a person, and the only thing Adestia adds is the person.
   *
   * `always` returns the engine's OWN proposed rule, untouched, as an
   * execpolicy amendment: the CLI writes it into its own `.rules` file in the
   * workspace and reads it back on every later turn. So the durable allowlist
   * is the engine's, in a file somebody can open — Adestia keeps no list. And
   * the rule this engine proposes is a reusable PREFIX (`["git","pull"]`),
   * which is the granularity DESIGN.md says the other engines lack.
   */
  async #answer(
    message: { method?: string; params?: Record<string, unknown> },
    desk: AskDesk | undefined,
    request: TurnRequest,
    queue: EventQueue,
  ): Promise<unknown> {
    const method = message.method ?? ''
    const isApproval = /requestApproval$/i.test(method) || /Approval$/.test(method)
    if (!isApproval) return {}
    // Declared `interactivePermissions` or not, a question nobody can answer
    // must not hold the turn: refuse it now.
    if (!desk) return { decision: 'decline' }

    const params = message.params ?? {}
    const amendment = params['proposedExecpolicyAmendment']
    const remembering = Array.isArray(amendment) && amendment.length > 0
    const command = params['command']
    const reason = params['reason']

    const answer = await desk.ask(
      {
        tool: 'shell',
        // The engine's own words, never truncated: consent to an elided
        // command is not consent.
        title: typeof command === 'string' && command !== '' ? command : method,
        ...(typeof reason === 'string' && reason !== '' ? { reason } : {}),
        remembering,
      },
      (pending: PendingAsk) => {
        if (request.unattended) return false
        queue.push({
          type: 'permission-request',
          id: pending.id,
          tool: pending.tool,
          title: pending.title,
          ...(pending.reason ? { reason: pending.reason } : {}),
          remembering: pending.remembering,
        })
        return true
      },
    )

    if (answer === 'deny') return { decision: 'decline' }
    if (answer === 'always' && remembering) {
      return { decision: { acceptWithExecpolicyAmendment: { execpolicy_amendment: amendment } } }
    }
    return { decision: 'accept' }
  }

  /**
   * Sandbox and approvals, chosen by posture — see the note at the top of this
   * file for why `open` gets full access rather than a sandbox.
   */
  #posture(): { sandbox: string; approvalPolicy: string } {
    return this.#asks
      ? { sandbox: 'workspace-write', approvalPolicy: 'on-request' }
      : { sandbox: 'danger-full-access', approvalPolicy: 'never' }
  }

  /**
   * Everything the thread needs that is not a flag: the MCP servers, and the
   * two settings a deployment must not inherit from the machine.
   *
   * Passed at thread start rather than written into `config.toml`: the file is
   * the user's, Adestia does not own it, and a per-turn value has no business
   * outliving its turn.
   */
  async #threadConfig(request: TurnRequest): Promise<Record<string, unknown>> {
    const mcpServers = await this.#mcpConfig(request.callerToken, request.tools, request.serverTokens)
    return {
      // The startup version check is a network call a pinned deployment has no
      // use for. (The plugin-marketplace clone, measured in spike 5, has no
      // such switch — egress policy is the only lever there.)
      check_for_update_on_startup: false,
      ...(mcpServers ? { mcp_servers: mcpServers } : {}),
    }
  }

  /**
   * The outbound servers, as this engine's config names them.
   *
   * Every server is started fresh with the thread, and the thread is fresh
   * with the turn — so the per-turn token in the bridge's environment is
   * fresh by construction, which is the property the whole one-process-per-turn
   * design exists to keep.
   */
  async #mcpConfig(
    callerToken?: string,
    tools?: ShellToolsHandle,
    serverTokens?: Readonly<Record<string, string>>,
  ): Promise<Record<string, unknown> | undefined> {
    const declared = this.#mcpServers()
    if (declared.length === 0 && !tools) return undefined

    const servers: Record<string, unknown> = {}
    if (tools) {
      const bridge = bridgeStdioConfig(tools)
      servers[SHELL_TOOLS_SERVER_NAME] = {
        command: bridge.command,
        args: [...bridge.args],
        env: { ...bridge.env },
      }
    }

    for (const server of declared) {
      if (server.url) {
        const headers: Record<string, string> = { ...server.headers }
        if (server.identity === 'user') {
          // No caller, no server: a turn the clock started has nobody to act
          // as. And a `signIn` server takes only its own per-turn token —
          // never the rebound one, which would be foreign currency to it.
          const token = server.signIn ? serverTokens?.[server.name] : callerToken
          if (!token) continue
          headers['Authorization'] = `Bearer ${token}`
        } else if (server.auth) {
          const token = await this.#tokens.for(server.auth)
          // Omitted rather than sent unauthenticated: a wall of 401s reads as
          // a broken tool, an absent server reads as an absent one.
          if (!token) continue
          headers['Authorization'] = `Bearer ${token}`
        }
        servers[server.name] = {
          url: server.url,
          ...(Object.keys(headers).length > 0 ? { http_headers: headers } : {}),
        }
        continue
      }

      servers[server.name] = {
        command: server.command ?? '',
        ...(server.args ? { args: [...server.args] } : {}),
        ...(server.env ? { env: { ...server.env } } : {}),
      }
    }

    return Object.keys(servers).length > 0 ? servers : undefined
  }

  /**
   * Did the CLI rotate its own credential during that turn?
   *
   * A ChatGPT document carries a refresh token, and whoever refreshes it, the
   * core's copy has to stay the truth — otherwise the next restart writes a
   * stale credential over a fresh one and the login dies for no visible
   * reason.
   */
  async #noteCredentialRefresh(): Promise<void> {
    if (!this.#onCredentialRefreshed) return
    const current = await readMaterialized(this.#home)
    if (!current) return
    const known = this.#credentials[CREDENTIAL_KEY]
    if (known !== undefined && current.trim() === known.trim()) return
    this.#credentials = { ...this.#credentials, [CREDENTIAL_KEY]: current }
    this.#onCredentialRefreshed(current)
  }

  /** A short-lived process for one question. */
  async #withServer<T>(work: (server: AppServer) => Promise<T>): Promise<T> {
    await materialize(this.#home, this.#credentials[CREDENTIAL_KEY])
    const server = new AppServer({
      command: this.#command,
      cwd: this.#home,
      env: codexEnv(this.#baseEnv, this.#home),
      ...(this.#spawnImpl ? { spawnImpl: this.#spawnImpl } : {}),
    })
    try {
      await server.initialize('adestia', this.#cliVersion)
      return await work(server)
    } finally {
      server.close()
    }
  }
}

/** `{primary, secondary}` in minutes and percents, as the contract's windows. */
export function quotaReportOf(raw: unknown, stale: boolean): QuotaReport | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  const windows: QuotaWindow[] = []

  for (const [key, label] of [
    ['primary', 'Session'],
    ['secondary', 'Weekly'],
  ] as const) {
    const value = record[key]
    if (typeof value !== 'object' || value === null) continue
    const window = value as Record<string, unknown>
    const used = window['usedPercent']
    if (typeof used !== 'number') continue
    const minutes = window['windowDurationMins']
    const resets = window['resetsAt']
    windows.push({
      id: key,
      // Named from the window itself where it says one: "5 h" beats "Session"
      // for somebody deciding whether to wait.
      label: typeof minutes === 'number' ? describeWindow(minutes) : label,
      utilizationPct: used,
      // Unix seconds on the wire; the contract wants a date it can print.
      ...(typeof resets === 'number' ? { resetsAt: new Date(resets * 1000).toISOString() } : {}),
    })
  }

  if (windows.length === 0) return undefined
  return { windows, stale, fetchedAt: new Date().toISOString() }
}

function describeWindow(minutes: number): string {
  if (minutes % (60 * 24) === 0) {
    const days = minutes / (60 * 24)
    return days === 7 ? 'Weekly' : `${days} days`
  }
  if (minutes % 60 === 0) return `${minutes / 60} hours`
  return `${minutes} minutes`
}
