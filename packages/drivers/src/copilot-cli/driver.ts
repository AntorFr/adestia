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
  ShellToolsHandle,
  TurnEvent,
  TurnRequest,
} from '../contract.js'
import { SHELL_TOOLS_SERVER_NAME, bridgeStdioConfig } from '../shell-tools-config.js'
import { TOKEN_ENV_VAR, classifyAuthError, copilotEnv, explainAuthProblem, looksLikeToken } from './auth.js'
import { McpTokens, type RefreshStore } from '../mcp-oauth.js'
import { newTranslationState, parseLine, translate } from './events.js'
import { PLAINTEXT_CONSENT, startDeviceCodeLogin, type DeviceCodeLogin } from './login.js'

/**
 * The shell-transport CLI, embedded so it needs no build step or shipped
 * asset: the driver writes it under its own home and points the agent's
 * environment at it. It speaks the socket's newline-delimited JSON-RPC (the
 * MCP subset the shell-tools server answers), announcing the turn's token
 * with `bridge/hello` before a `tools/list` or `tools/call`. Secret-free: the
 * socket path and token arrive in this process's env.
 */
const SHELL_TOOL_CLI_SOURCE = `import { connect } from 'node:net'

const socket = process.env.ADESTIA_TOOLS_SOCKET
const token = process.env.ADESTIA_TOOLS_TOKEN
if (!socket || !token) {
  process.stderr.write('adestia-tool: ADESTIA_TOOLS_SOCKET/ADESTIA_TOOLS_TOKEN not set\\n')
  process.exit(2)
}

const [cmd, name, argsJson] = process.argv.slice(2)
let args = {}
if (argsJson) {
  try { args = JSON.parse(argsJson) } catch { process.stderr.write('adestia-tool: arguments must be a JSON object\\n'); process.exit(2) }
}
const request =
  cmd === 'list' ? { jsonrpc: '2.0', id: 1, method: 'tools/list' }
  : cmd === 'call' ? { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }
  : null
if (!request) {
  process.stderr.write("usage: adestia-tool <list|call> [name] ['<json-args>']\\n")
  process.exit(2)
}

const conn = connect(socket)
let buffer = ''
const timer = setTimeout(() => { process.stderr.write('adestia-tool: timed out\\n'); process.exit(2) }, 15000)
timer.unref?.()
conn.on('connect', () => {
  conn.write(JSON.stringify({ jsonrpc: '2.0', method: 'bridge/hello', params: { token } }) + '\\n')
  conn.write(JSON.stringify(request) + '\\n')
})
conn.on('data', (chunk) => {
  buffer += chunk.toString('utf8')
  let nl = buffer.indexOf('\\n')
  while (nl !== -1) {
    const line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1); nl = buffer.indexOf('\\n')
    if (!line.trim()) continue
    let msg; try { msg = JSON.parse(line) } catch { continue }
    if (msg.id !== 1) continue
    const result = msg.result ?? {}
    if (cmd === 'list') {
      process.stdout.write(JSON.stringify(result.tools ?? [], null, 2) + '\\n')
      conn.end(); process.exit(0)
    }
    const text = result.content && result.content[0] ? result.content[0].text : ''
    process.stdout.write((text ?? '') + '\\n')
    conn.end(); process.exit(result.isError ? 1 : 0)
  }
})
conn.on('error', (error) => { process.stderr.write('adestia-tool: ' + error.message + '\\n'); process.exit(2) })
`

export interface CopilotDriverOptions {
  /** The pinned binary. An absolute path in a container; `copilot` in dev. */
  readonly command?: string
  /** Driver-owned state: config, MCP servers, session store. */
  readonly home: string
  readonly agent?: string
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
   *   touched. Adestia does not own it, so Adestia does not rewrite it.
   * - the servers are not on argv. Inline JSON would have worked and would
   *   have put every `Authorization: Bearer …` header in `ps` output, readable
   *   by any process on the box.
   */
  readonly mcpServers?: readonly McpServer[]
  /** Injected so the token exchange can be exercised without a network. */
  readonly fetchImpl?: typeof fetch
  /** Persists a rotated MCP refresh token across restarts. */
  readonly refreshStore?: RefreshStore
  readonly spawnImpl?: typeof spawn
  /**
   * How the instance's own shell tools reach the agent.
   *
   * `mcp` (default) hands them over as a stdio MCP server — the generic path.
   * `shell` writes a tiny CLI and injects the socket path and per-turn token
   * into the agent's environment instead, so the tools ride the ordinary
   * execute tool. The escape hatch for a CLI whose MCP servers are filtered
   * against a corporate registry: only that engine needs it, and only there.
   */
  readonly shellToolsTransport?: 'mcp' | 'shell'
  /** Injection point for the device-code login flow, for tests. */
  readonly startLoginImpl?: typeof startDeviceCodeLogin
}

export class CopilotDriver implements Driver {
  readonly credentialVar = TOKEN_ENV_VAR

  readonly #command: string
  readonly #home: string
  readonly #baseEnv: Readonly<Record<string, string | undefined>>
  readonly #models: readonly ModelInfo[]
  readonly #agent: string | undefined
  readonly #cliVersion: string
  readonly #spawn: typeof spawn
  readonly #startLogin: typeof startDeviceCodeLogin
  readonly #mcpServers: readonly McpServer[]
  readonly #shellToolsTransport: 'mcp' | 'shell'
  readonly #tokens: McpTokens
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
    this.#agent = options.agent
    this.#cliVersion = options.cliVersion ?? 'unknown'
    this.#spawn = options.spawnImpl ?? spawn
    this.#startLogin = options.startLoginImpl ?? startDeviceCodeLogin
    this.#mcpServers = options.mcpServers ?? []
    this.#shellToolsTransport = options.shellToolsTransport ?? 'mcp'
    this.#tokens = new McpTokens(options.fetchImpl ?? fetch, options.refreshStore)
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
        // servers are the user's, and Adestia does not claim to report on what
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
   * Where this CLI reads prose — `copilot init` writes the second one, and
   * `.github/agents/*.agent.md` holds the custom agents `--agent` selects.
   *
   * The agent folder is BOTH prose and authority, and appears in both lists
   * for that reason: its markdown body is a brief somebody writes and should
   * be able to correct here, while its frontmatter grants tools and wires MCP
   * servers. Reading it is a person's business; rewriting it is a decision.
   */
  instructionPaths(): readonly string[] {
    return ['AGENTS.md', '.github/copilot-instructions.md', '.github/agents', '.github/skills']
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
    // where Adestia reads from — but the CLI stores a `gho_` token, in plaintext,
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
   * The session-scoped MCP config, rewritten before every turn.
   *
   * Written once was wrong the moment a server could carry an OAuth token: a
   * hub's token lives about an hour, so a file produced at the first turn
   * authenticates nothing by the second morning. The CLI reads this file per
   * invocation, so rewriting it per turn is exactly as cheap as it looks.
   *
   * Undefined when this instance declares no servers — no file, no flag, and
   * the CLI keeps the behaviour it had before any of this existed. A failure
   * to write is swallowed on purpose: a turn that cannot reach one MCP server
   * is worth far more than a turn that refuses to start.
   */
  async #mcpConfig(callerToken?: string, tools?: ShellToolsHandle): Promise<string | undefined> {
    // Under the shell transport the instance's tools ride the execute tool,
    // not an MCP server — so they never enter this file.
    const bridgeTools = this.#shellToolsTransport === 'mcp' ? tools : undefined
    if (this.#mcpServers.length === 0 && !bridgeTools) return undefined

    const mcpServers: Record<string, unknown> = {}
    if (bridgeTools) {
      // The instance's own tools, over the generic bridge: for this driver it
      // is one more stdio server, and the per-turn token is fresh by
      // construction — this binary is spawned per turn, config and all.
      mcpServers[SHELL_TOOLS_SERVER_NAME] = {
        type: 'local',
        ...bridgeStdioConfig(bridgeTools),
        tools: ['*'],
      }
    }
    for (const server of this.#mcpServers) {
      if (server.url) {
        const headers: Record<string, string> = { ...server.headers }
        if (server.identity === 'user') {
          // See the other driver: no caller, no server. A turn the clock
          // started has nobody to act as.
          if (!callerToken) continue
          headers['Authorization'] = `Bearer ${callerToken}`
        } else if (server.auth) {
          const token = await this.#tokens.for(server.auth)
          // Omitted rather than sent unauthenticated — same rule as the other
          // driver: a wall of 401s reads as a broken tool, an absent one reads
          // as an absent one.
          if (!token) continue
          headers['Authorization'] = `Bearer ${token}`
        }
        mcpServers[server.name] = {
          type: 'http',
          url: server.url,
          ...(Object.keys(headers).length > 0 ? { headers } : {}),
          // Required: an entry without it exposes no tools at all.
          tools: ['*'],
        }
        continue
      }

      mcpServers[server.name] = {
        // The CLI's own word for stdio, captured from what `copilot mcp add`
        // actually writes — not guessed from the flag's vocabulary, which
        // calls the same thing "stdio".
        type: 'local',
        command: server.command ?? '',
        ...(server.args ? { args: server.args } : {}),
        ...(server.env ? { env: server.env } : {}),
        tools: ['*'],
      }
    }

    // Every server dropped for want of a token: no file rather than an empty
    // one, so the flag disappears too.
    if (Object.keys(mcpServers).length === 0) return undefined

    const path = join(this.#home, 'adestia-mcp.json')
    try {
      await mkdir(this.#home, { recursive: true })
      // 0600: this file holds whatever tokens the servers need.
      await writeFile(path, JSON.stringify({ mcpServers }, null, 2), { mode: 0o600 })
      return path
    } catch {
      return undefined
    }
  }

  /**
   * Writes the shell-transport CLI and returns the env that arms it. The
   * socket path and per-turn token travel in the child's environment, which
   * the agent's execute tool inherits; nothing lands on argv or in a registry.
   */
  async #writeShellToolCli(tools: ShellToolsHandle): Promise<Record<string, string>> {
    const bin = join(this.#home, 'adestia-tool.mjs')
    try {
      await mkdir(this.#home, { recursive: true })
      await writeFile(bin, SHELL_TOOL_CLI_SOURCE)
    } catch {
      // A missing CLI degrades to a tool the agent simply cannot call — the
      // same shape of failure as a filtered MCP server, and never fatal.
    }
    return {
      ADESTIA_TOOLS_SOCKET: tools.socketPath,
      ADESTIA_TOOLS_TOKEN: tools.token,
      ADESTIA_TOOL_BIN: bin,
    }
  }

  async *runTurn(request: TurnRequest): AsyncIterable<TurnEvent> {
    // Guarded rather than always awaited: an instance with no MCP servers must
    // reach `spawn` in the same tick it did before this existed. The await is
    // real work only when there is a file to write, and deferring the spawn by
    // a microtask for everyone else is a behaviour change nobody asked for.
    const mcpRelevantTools = this.#shellToolsTransport === 'mcp' ? request.tools : undefined
    const mcpConfig =
      this.#mcpServers.length === 0 && !mcpRelevantTools
        ? undefined
        : await this.#mcpConfig(request.callerToken, request.tools)
    // Shell transport: the CLI is written and the socket/token armed in the
    // child's env, so the instance tools ride the execute tool instead of MCP.
    const shellToolsEnv =
      this.#shellToolsTransport === 'shell' && request.tools
        ? await this.#writeShellToolCli(request.tools)
        : undefined
    const args = [
      '--prompt',
      request.prompt,
      '--output-format',
      'json',
      '--allow-all-tools',
      '--no-auto-update',
      ...(request.sessionId ? ['--resume', request.sessionId] : []),
      ...(request.model ? ['--model', request.model] : []),
      ...(this.#agent ? ['--agent', this.#agent] : []),
      // `@file` rather than inline JSON: the servers' tokens stay out of argv.
      ...(mcpConfig ? ['--additional-mcp-config', `@${mcpConfig}`] : []),
    ]

    const child = this.#spawn(this.#command, args, {
      cwd: request.cwd,
      env: copilotEnv({ ...this.#baseEnv, ...this.#credentials, ...shellToolsEnv }, this.#home) as NodeJS.ProcessEnv,
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
