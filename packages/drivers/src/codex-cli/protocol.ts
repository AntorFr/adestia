/**
 * The `codex app-server` JSON-RPC client.
 *
 * Where the Copilot driver scrapes JSONL off a one-shot process, this one
 * speaks a protocol: newline-delimited JSON-RPC 2.0 over the child's stdio,
 * with a schema the CLI generates itself (`codex app-server
 * generate-json-schema`). That is what buys the two things `codex exec` cannot
 * give — a return channel for the engine's own questions, and typed errors
 * instead of English sentences.
 *
 * ## One process per turn, and why
 *
 * Adestia mints a shell-tools token per turn and revokes it when the turn
 * settles, relying on the engine respawning the MCP bridge each time. Measured
 * in spike 5: codex starts its MCP servers once per THREAD, so a long-lived
 * server would carry turn 1's token into turn 2 and every tool call would come
 * back "this turn's token is unknown or expired". A fresh process per turn
 * restores the property (three turns, three bridge processes) and costs about
 * 100 ms — the same shape the Copilot driver already has.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

export interface JsonRpcMessage {
  readonly jsonrpc?: string
  readonly id?: number | string
  readonly method?: string
  readonly params?: Record<string, unknown>
  readonly result?: unknown
  readonly error?: { readonly code?: number; readonly message?: string }
}

export interface SpawnedProcess {
  readonly stdin: NodeJS.WritableStream
  readonly stdout: NodeJS.ReadableStream
  readonly stderr: NodeJS.ReadableStream
  kill(signal?: NodeJS.Signals): void
  on(event: 'exit', listener: (code: number | null) => void): unknown
}

export type SpawnImpl = (
  command: string,
  args: readonly string[],
  options: { cwd: string; env: Record<string, string | undefined> },
) => SpawnedProcess

export const defaultSpawn: SpawnImpl = (command, args, options) =>
  spawn(command, [...args], {
    cwd: options.cwd,
    env: options.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as unknown as ChildProcessWithoutNullStreams as unknown as SpawnedProcess

export interface AppServerOptions {
  readonly command: string
  readonly args?: readonly string[]
  readonly cwd: string
  readonly env: Record<string, string | undefined>
  readonly spawnImpl?: SpawnImpl
  /** Every notification the server pushes. */
  readonly onNotification?: (message: JsonRpcMessage) => void
  /**
   * A server->client REQUEST. Whatever this resolves to is sent back as the
   * result, and the turn is blocked until it does — which is the whole point:
   * an approval request is a question a person answers.
   */
  readonly onRequest?: (message: JsonRpcMessage) => Promise<unknown>
  readonly onStderr?: (line: string) => void
}

/** A JSON-RPC error the server answered with, kept typed rather than flattened. */
export class AppServerError extends Error {
  readonly code: number | undefined

  constructor(message: string, code?: number) {
    super(message)
    this.name = 'AppServerError'
    this.code = code
  }
}

export class AppServer {
  readonly #child: SpawnedProcess
  readonly #pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  #nextId = 1
  #buffer = ''
  #exited = false
  #stderr: string[] = []

  constructor(options: AppServerOptions) {
    const spawnImpl = options.spawnImpl ?? defaultSpawn
    this.#child = spawnImpl(options.command, options.args ?? ['app-server', '--stdio'], {
      cwd: options.cwd,
      env: options.env,
    })

    this.#child.stdout.setEncoding?.('utf8')
    this.#child.stdout.on('data', (chunk: string | Buffer) => {
      this.#buffer += chunk.toString()
      let index = this.#buffer.indexOf('\n')
      while (index !== -1) {
        const line = this.#buffer.slice(0, index)
        this.#buffer = this.#buffer.slice(index + 1)
        index = this.#buffer.indexOf('\n')
        this.#handle(line, options)
      }
    })

    this.#child.stderr.setEncoding?.('utf8')
    this.#child.stderr.on('data', (chunk: string | Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        const trimmed = line.trimEnd()
        if (trimmed === '') continue
        // Kept, capped: the CLI's tracing is where a config refusal or a
        // sandbox rejection says why, and it is the only place some of them
        // are said at all.
        this.#stderr.push(trimmed)
        if (this.#stderr.length > 200) this.#stderr.shift()
        options.onStderr?.(trimmed)
      }
    })

    this.#child.on('exit', () => {
      this.#exited = true
      const reason = new Error(
        this.#stderr.length > 0
          ? `the codex app-server exited: ${this.#stderr.slice(-3).join(' / ')}`
          : 'the codex app-server exited',
      )
      for (const [, waiting] of this.#pending) waiting.reject(reason)
      this.#pending.clear()
    })
  }

  get stderr(): readonly string[] {
    return this.#stderr
  }

  #handle(line: string, options: AppServerOptions): void {
    const trimmed = line.trim()
    if (trimmed === '') return
    let message: JsonRpcMessage
    try {
      message = JSON.parse(trimmed) as JsonRpcMessage
    } catch {
      // Tolerant on purpose: one unreadable line must not end a turn.
      return
    }

    // A server->client request: it has BOTH an id and a method.
    if (message.id !== undefined && message.method !== undefined) {
      const answer = options.onRequest?.(message) ?? Promise.resolve({})
      void answer
        .then((result) => this.#send({ jsonrpc: '2.0', id: message.id, result }))
        .catch((error: Error) =>
          this.#send({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: error.message } }),
        )
      return
    }

    if (message.id !== undefined) {
      const waiting = this.#pending.get(Number(message.id))
      if (!waiting) return
      this.#pending.delete(Number(message.id))
      if (message.error) waiting.reject(new AppServerError(message.error.message ?? 'app-server error', message.error.code))
      else waiting.resolve(message.result)
      return
    }

    if (message.method !== undefined) options.onNotification?.(message)
  }

  #send(payload: Record<string, unknown>): void {
    if (this.#exited) return
    this.#child.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (this.#exited) return Promise.reject(new Error('the codex app-server is not running'))
    const id = this.#nextId++
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      this.#send({ jsonrpc: '2.0', id, method, params })
    })
  }

  notify(method: string, params: Record<string, unknown> = {}): void {
    this.#send({ jsonrpc: '2.0', method, params })
  }

  /**
   * The handshake. `initialize` then the `initialized` notification, in that
   * order — the server answers requests before it, but a client that skips the
   * notification is one the server is entitled to treat as still starting.
   */
  async initialize(clientName: string, version: string): Promise<Record<string, unknown>> {
    const result = await this.request<Record<string, unknown>>('initialize', {
      clientInfo: { name: clientName, title: 'Adestia', version },
    })
    this.notify('initialized', {})
    return result
  }

  close(): void {
    if (this.#exited) return
    // SIGTERM, never SIGKILL: the npm entry point is a node loader that
    // forwards TERM/INT/HUP to the rust binary and cannot forward a KILL —
    // killing the loader orphans the engine (observed in spike 5).
    this.#child.kill('SIGTERM')
  }
}
