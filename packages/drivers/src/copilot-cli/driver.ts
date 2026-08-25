/**
 * The `copilot-cli` driver.
 *
 * Where the Claude driver talks to an SDK, this one runs a binary and reads
 * its JSONL. Everything it knows was established hands-on in spike 3 against
 * version 1.0.80: the flags, the event schema, the three authentication
 * errors, and the fact that fatal failures never appear in the JSON stream at
 * all — they are prose on stderr with an empty stdout.
 *
 * The version is pinned by the operator, not by this file, and the parser is
 * tolerant, because the schema is undocumented and moves.
 */

import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type {
  AuthPrompt,
  AuthStatus,
  Driver,
  DriverDescriptor,
  McpServer,
  McpServerHealth,
  ModelInfo,
  TurnEvent,
  TurnRequest,
} from '../contract.js'
import { TOKEN_ENV_VAR, classifyAuthError, copilotEnv, explainAuthProblem, looksLikeToken } from './auth.js'
import { newTranslationState, parseLine, translate } from './events.js'
import { PLAINTEXT_CONSENT, startDeviceCodeLogin, type DeviceCodeLogin } from './login.js'

export interface CopilotDriverOptions {
  /** The pinned binary. An absolute path in a container; `copilot` in dev. */
  readonly command?: string
  /** Driver-owned state: config, MCP servers, session store. */
  readonly home: string
  readonly credentials?: Readonly<Record<string, string>>
  readonly baseEnv?: Readonly<Record<string, string | undefined>>
  readonly cliVersion?: string
  readonly models?: readonly ModelInfo[]
  /**
   * Outbound MCP servers, from the operator's config and from active plugins.
   *
   * Materialized as a SIDE file under the driver-owned home and handed over
   * with `--additional-mcp-config`, which augments the user's own config for
   * one session. Two things that buys, both deliberate:
   *
   * - `mcp-config.json` — the user's, written by `copilot mcp add` — is never
   *   touched. Golem does not own it, so Golem does not rewrite it.
   * - the servers are not on argv. Inline JSON would have worked and would
   *   have put every `Authorization: Bearer …` header in `ps` output, readable
   *   by any process on the box.
   */
  readonly mcpServers?: readonly McpServer[]
  readonly spawnImpl?: typeof spawn
  /** Injection point for the device-code login flow, for tests. */
  readonly startLoginImpl?: typeof startDeviceCodeLogin
}

export class CopilotDriver implements Driver {
  readonly credentialVar = TOKEN_ENV_VAR

  readonly #command: string
  readonly #home: string
  readonly #baseEnv: Readonly<Record<string, string | undefined>>
  readonly #models: readonly ModelInfo[]
  readonly #cliVersion: string
  readonly #spawn: typeof spawn
  readonly #startLogin: typeof startDeviceCodeLogin
  readonly #mcpServers: readonly McpServer[]
  /** Written once, then reused: the set is fixed for the process's life. */
  #mcpConfigPath: Promise<string | undefined> | undefined
  /** What the last session said about them. Empty until a turn has run. */
  #mcpHealth: readonly McpServerHealth[] = []
  #credentials: Record<string, string>
  #savedAt: string | undefined
  #invalidReason: string | undefined
  #pending: { login: DeviceCodeLogin; home: string } | undefined
  readonly #running = new Map<string, { kill(signal?: NodeJS.Signals): boolean }>()

  constructor(options: CopilotDriverOptions) {
    this.#command = options.command ?? 'copilot'
    this.#home = options.home
    this.#baseEnv = options.baseEnv ?? process.env
    this.#models = options.models ?? []
    this.#cliVersion = options.cliVersion ?? 'unknown'
    this.#spawn = options.spawnImpl ?? spawn
    this.#startLogin = options.startLoginImpl ?? startDeviceCodeLogin
    this.#mcpServers = options.mcpServers ?? []
    this.#credentials = { ...options.credentials }
  }

  describe(): Promise<DriverDescriptor> {
    return Promise.resolve({
      id: 'copilot-cli',
      label: 'GitHub Copilot CLI',
      cliVersion: this.#cliVersion,
      capabilities: [
        'authManagement',
        'usageMetrics',
        // Only when this instance actually wired servers: a panel offering to
        // report the health of nothing looks broken. The CLI's own config
        // servers are the user's, and Golem does not claim to report on what
        // it did not wire.
        ...(this.#mcpServers.length > 0 ? (['mcpStatus'] as const) : []),
        ...(this.#models.length > 0 ? (['modelSelection'] as const) : []),
        // Deliberately NOT declared: `liveTurnUsage` (the stream carries no
        // running token count), `cost` (billing is AI credits, aggregated
        // daily by an API, never per turn) and `subscriptionQuotas` (same).
        // Declaring them would put numbers in the UI that mean nothing.
      ],
    })
  }

  env(): Promise<Readonly<Record<string, string>>> {
    return Promise.resolve({ ...this.#credentials })
  }

  listModels(): Promise<readonly ModelInfo[]> {
    return Promise.resolve(this.#models)
  }

  /**
   * Copilot loads skills from `.github/skills/<name>/SKILL.md` alongside its
   * instruction files. Delivering them as files rather than as prompt text is
   * what keeps a contract identical across engines: same markdown, different
   * folder.
   */
  skillsPath(): string {
    return '.github/skills'
  }

  /**
   * What decides this CLI's authority, inside the workspace.
   *
   * Read off spike 3's captures rather than recalled: repo-level `settings.json`
   * carries hooks and the `sandbox` key — a workspace file that can switch a
   * protection off — `.github/hooks/*.json` is the hook schema itself, and
   * `.mcp.json` / `.github/mcp.json` are the workspace MCP wiring.
   *
   * Both roots are listed because this CLI reads instructions and skills from
   * `.github/`, `.agents/` AND `.claude/`: the two drivers' zones overlap
   * without being identical, which is the whole reason this is declared rather
   * than assumed.
   */
  authorityPaths(): readonly string[] {
    return [
      '.github/settings.json',
      '.github/hooks',
      '.github/mcp.json',
      '.mcp.json',
      '.agents/hooks',
    ]
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
    if (this.#credentials[TOKEN_ENV_VAR]) {
      return Promise.resolve({
        state: 'armed',
        source: 'managed',
        ...(this.#savedAt ? { savedAt: this.#savedAt } : {}),
      })
    }
    return Promise.resolve({ state: 'absent', source: 'cli-native' })
  }

  async beginAuth(): Promise<AuthPrompt> {
    // A relayed device code, not a paste-a-token page. The objection to this
    // was that `login --device-code` writes into the CLI's own store, not
    // where Golem reads from — but the CLI stores a `gho_` token, in plaintext,
    // under the COPILOT_HOME this driver owns, and that token works as
    // COPILOT_GITHUB_TOKEN. So completeAuth harvests it into the one managed
    // secret, and a login that visibly succeeds is one the interface reports
    // as armed.
    this.#pending?.login.cancel()

    const home = join(this.#home, 'arming')
    await rm(home, { recursive: true, force: true })
    await mkdir(home, { recursive: true })

    const login = await this.#startLogin({
      command: this.#command,
      home,
      baseEnv: this.#baseEnv,
      spawnImpl: this.#spawn,
    })
    this.#pending = { login, home }

    return {
      sessionId: 'copilot-device',
      mode: 'device-code',
      authorizeUrl: login.verificationUri,
      userCode: login.userCode,
      inputLabel: 'Approve in your browser, then finish here',
      consent: PLAINTEXT_CONSENT,
      ttl: 900,
    }
  }

  async completeAuth(_sessionId: string, _input: string): Promise<{ secret: string }> {
    // No pasted input: a device code is approved in a browser, with nothing to
    // copy back. The server requires a non-empty field, which the interface
    // fills with a sentinel; it is deliberately ignored here.
    const pending = this.#pending
    if (!pending) throw new Error('no device-code login is in progress; start again')
    try {
      // Finishing IS the consent. On a keychain-less machine the CLI blocks on
      // "may I write this token in plaintext?", and until now nobody answered:
      // the flow stalled until the device code expired, with no hint why. The
      // answer is the user's to give — the panel will not enable this step
      // until they have accepted the statement above — so it is released here,
      // and nowhere else.
      pending.login.consentToPlaintextStorage()
      const token = await pending.login.completed
      if (!looksLikeToken(token)) {
        throw new Error('the login stored a credential Copilot will not accept')
      }
      return { secret: token }
    } finally {
      await rm(pending.home, { recursive: true, force: true }).catch(() => undefined)
      this.#pending = undefined
    }
  }

  async cancelAuth(_sessionId: string): Promise<void> {
    const pending = this.#pending
    if (!pending) return
    pending.login.cancel()
    await rm(pending.home, { recursive: true, force: true }).catch(() => undefined)
    this.#pending = undefined
  }

  /**
   * What the servers are doing, as of the last turn.
   *
   * Read off the session's own events rather than probed: the CLI loads MCP
   * servers when a session starts, and asking outside one would mean starting
   * a session just to ask. Before any turn has run, every declared server is
   * reported as `unknown` — which is true, where an empty list would read as
   * "you have no servers" to somebody who just configured three.
   *
   * This returned `[]` unconditionally until now, while the capability was
   * declared: a method that answers "nothing" is worse than one that is
   * absent, because the panel believes it.
   */
  mcpStatus(): Promise<readonly McpServerHealth[]> {
    if (this.#mcpHealth.length > 0) return Promise.resolve(this.#mcpHealth)
    return Promise.resolve(this.#mcpServers.map((server) => ({ name: server.name, state: 'unknown' as const })))
  }

  /**
   * The session-scoped MCP config, written once.
   *
   * Undefined when this instance declares no servers — no file, no flag, and
   * the CLI keeps exactly the behaviour it had before this existed. A failure
   * to write is swallowed on purpose: a turn that cannot reach one MCP server
   * is worth far more than a turn that refuses to start.
   */
  #mcpConfig(): Promise<string | undefined> {
    this.#mcpConfigPath ??= (async () => {
      if (this.#mcpServers.length === 0) return undefined
      const mcpServers: Record<string, unknown> = {}
      for (const server of this.#mcpServers) {
        mcpServers[server.name] = server.url
          ? {
              type: 'http',
              url: server.url,
              ...(server.headers ? { headers: server.headers } : {}),
              tools: ['*'],
            }
          : {
              // The CLI's own word for stdio, captured from what `copilot mcp
              // add` actually writes — not guessed from the flag's vocabulary,
              // which calls the same thing "stdio".
              type: 'local',
              command: server.command ?? '',
              ...(server.args ? { args: server.args } : {}),
              ...(server.env ? { env: server.env } : {}),
              // Required: an entry without it exposes no tools at all.
              tools: ['*'],
            }
      }
      const path = join(this.#home, 'golem-mcp.json')
      try {
        await mkdir(this.#home, { recursive: true })
        // 0600: this file holds whatever tokens the servers need.
        await writeFile(path, JSON.stringify({ mcpServers }, null, 2), { mode: 0o600 })
        return path
      } catch {
        return undefined
      }
    })()
    return this.#mcpConfigPath
  }

  async *runTurn(request: TurnRequest): AsyncIterable<TurnEvent> {
    // Guarded rather than always awaited: an instance with no MCP servers must
    // reach `spawn` in the same tick it did before this existed. The await is
    // real work only when there is a file to write, and deferring the spawn by
    // a microtask for everyone else is a behaviour change nobody asked for.
    const mcpConfig = this.#mcpServers.length === 0 ? undefined : await this.#mcpConfig()
    const args = [
      '--prompt',
      request.prompt,
      '--output-format',
      'json',
      '--allow-all-tools',
      '--no-auto-update',
      ...(request.sessionId ? ['--resume', request.sessionId] : []),
      ...(request.model ? ['--model', request.model] : []),
      // `@file` rather than inline JSON: the servers' tokens stay out of argv.
      ...(mcpConfig ? ['--additional-mcp-config', `@${mcpConfig}`] : []),
    ]

    const child = this.#spawn(this.#command, args, {
      cwd: request.cwd,
      env: copilotEnv({ ...this.#baseEnv, ...this.#credentials }, this.#home) as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const state = newTranslationState(request.sessionId ?? '')
    const queue: TurnEvent[] = []
    let stdoutBuffer = ''
    let stderr = ''
    let finished = false
    let notify: (() => void) | undefined

    const wake = () => {
      notify?.()
      notify = undefined
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf8')
      let newline = stdoutBuffer.indexOf('\n')
      while (newline !== -1) {
        const line = stdoutBuffer.slice(0, newline)
        stdoutBuffer = stdoutBuffer.slice(newline + 1)
        const event = parseLine(line)
        if (event) queue.push(...translate(event, state))
        newline = stdoutBuffer.indexOf('\n')
      }
      wake()
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    child.on('error', (error) => {
      queue.push({ type: 'error', message: error.message, fatal: true })
      finished = true
      wake()
    })

    child.on('close', (code) => {
      // Fatal failures never reach the JSON stream: they are prose on stderr
      // with an empty stdout. A driver reading only JSONL reports nothing at
      // all for the single most common failure — a missing credential.
      const problem = classifyAuthError(stderr)
      if (problem) {
        this.#invalidReason = explainAuthProblem(problem)
        queue.push({ type: 'error', message: this.#invalidReason, fatal: true })
      } else if (code !== 0 && !queue.some((event) => event.type === 'result')) {
        queue.push({
          type: 'error',
          message: stderr.trim() || `the CLI exited with code ${String(code)}`,
          fatal: true,
        })
      }
      finished = true
      wake()
    })

    if (state.sessionId) this.#running.set(state.sessionId, child)

    try {
      for (;;) {
        while (queue.length > 0) {
          const event = queue.shift()!
          if (event.type === 'result' && event.sessionId) {
            this.#running.delete(state.sessionId)
            this.#running.set(event.sessionId, child)
          }
          yield event
        }
        if (finished) break
        await new Promise<void>((resolve) => {
          notify = resolve
        })
      }
    } finally {
      this.#running.delete(state.sessionId)
      child.kill('SIGTERM')
      // Kept from the session that just ended, INCLUDING when the turn was
      // interrupted: a server that failed to start is exactly what somebody
      // wants to see after a turn went wrong.
      if (state.mcp.size > 0) this.#mcpHealth = [...state.mcp.values()]
    }
  }

  interrupt(sessionId: string): Promise<void> {
    const child = this.#running.get(sessionId)
    if (!child) throw new Error(`No running turn for session "${sessionId}"`)
    child.kill('SIGTERM')
    return Promise.resolve()
  }
}
