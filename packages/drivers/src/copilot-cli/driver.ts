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

import type {
  AuthPrompt,
  AuthStatus,
  Driver,
  DriverDescriptor,
  ModelInfo,
  TurnEvent,
  TurnRequest,
} from '../contract.js'
import { TOKEN_ENV_VAR, classifyAuthError, copilotEnv, explainAuthProblem, looksLikeToken } from './auth.js'
import { newTranslationState, parseLine, translate } from './events.js'

export interface CopilotDriverOptions {
  /** The pinned binary. An absolute path in a container; `copilot` in dev. */
  readonly command?: string
  /** Driver-owned state: config, MCP servers, session store. */
  readonly home: string
  readonly credentials?: Readonly<Record<string, string>>
  readonly baseEnv?: Readonly<Record<string, string | undefined>>
  readonly cliVersion?: string
  readonly models?: readonly ModelInfo[]
  readonly spawnImpl?: typeof spawn
}

export class CopilotDriver implements Driver {
  readonly credentialVar = TOKEN_ENV_VAR

  readonly #command: string
  readonly #home: string
  readonly #baseEnv: Readonly<Record<string, string | undefined>>
  readonly #models: readonly ModelInfo[]
  readonly #cliVersion: string
  readonly #spawn: typeof spawn
  #credentials: Record<string, string>
  #savedAt: string | undefined
  #invalidReason: string | undefined
  readonly #running = new Map<string, { kill(signal?: NodeJS.Signals): boolean }>()

  constructor(options: CopilotDriverOptions) {
    this.#command = options.command ?? 'copilot'
    this.#home = options.home
    this.#baseEnv = options.baseEnv ?? process.env
    this.#models = options.models ?? []
    this.#cliVersion = options.cliVersion ?? 'unknown'
    this.#spawn = options.spawnImpl ?? spawn
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
        'mcpStatus',
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

  beginAuth(): Promise<AuthPrompt> {
    // A paste-a-token flow rather than a relayed device code: the CLI's own
    // `login --device-code` writes into ITS credential store, which is not
    // where Golem reads from, so the interface would report "absent" straight
    // after a login that visibly succeeded.
    return Promise.resolve({
      sessionId: 'copilot-token',
      mode: 'api-key',
      authorizeUrl: 'https://github.com/settings/personal-access-tokens/new',
      inputLabel: 'Paste a fine-grained token with the "Copilot Requests" permission',
      ttl: 600,
    })
  }

  completeAuth(_sessionId: string, input: string): Promise<{ secret: string }> {
    const token = input.trim()
    if (/^ghp_/.test(token)) {
      // Named precisely, because the CLI's own message for this is the one
      // thing about Copilot auth people get wrong twice.
      throw new Error(explainAuthProblem('classic-pat'))
    }
    if (!looksLikeToken(token)) {
      throw new Error('That does not look like a GitHub token (expected github_pat_, gho_ or ghu_).')
    }
    return Promise.resolve({ secret: token })
  }

  cancelAuth(): Promise<void> {
    return Promise.resolve()
  }

  mcpStatus(): Promise<readonly { name: string; ok: boolean; error?: string }[]> {
    // Reported per turn through the event stream rather than probed: the CLI
    // loads MCP servers when a session starts, and asking outside one would
    // start a session just to ask.
    return Promise.resolve([])
  }

  async *runTurn(request: TurnRequest): AsyncIterable<TurnEvent> {
    const args = [
      '--prompt',
      request.prompt,
      '--output-format',
      'json',
      '--allow-all-tools',
      '--no-auto-update',
      ...(request.sessionId ? ['--resume', request.sessionId] : []),
      ...(request.model ? ['--model', request.model] : []),
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
    }
  }

  interrupt(sessionId: string): Promise<void> {
    const child = this.#running.get(sessionId)
    if (!child) throw new Error(`No running turn for session "${sessionId}"`)
    child.kill('SIGTERM')
    return Promise.resolve()
  }
}
