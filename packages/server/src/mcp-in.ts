/**
 * Inbound MCP — letting another agent delegate work to this one.
 *
 * Two agents talking is not two agents chatting: a delegated task can take
 * minutes, and an MCP call that blocks that long times out somewhere in
 * between and leaves both sides guessing. So the contract is asynchronous by
 * design — `ask` returns a job id immediately, `ask_status` collects the
 * answer — and that shape is the whole reason this module exists rather than
 * simply exposing `/api/turn`.
 *
 * The JSON-RPC subset is implemented directly rather than through the MCP SDK:
 * three methods, no transport negotiation, and a dependency fewer on a surface
 * that is exposed to other machines.
 */

import { randomUUID } from 'node:crypto'
import { timingSafeEqual } from 'node:crypto'

export type JobState = 'running' | 'done' | 'failed'

export interface Job {
  readonly id: string
  state: JobState
  readonly prompt: string
  readonly from: string
  readonly startedAt: number
  finishedAt?: number
  result?: string
  error?: string
}

export interface McpConfig {
  readonly enabled: boolean
  /** Bearer token callers must present. No token means no inbound MCP. */
  readonly token?: string | undefined
  /**
   * How this agent is named in the tool — `ask_alfred`, `ask_skippy`.
   * A generic `ask` would make two connected instances indistinguishable in
   * the calling agent's tool list.
   */
  readonly agentName: string
  /** Refuse rather than queue past this many in flight. */
  readonly maxPending: number
  /** How long a finished report stays collectable, in ms. */
  readonly ttlMs: number
}

export const DEFAULT_MCP: McpConfig = {
  enabled: false,
  agentName: 'agent',
  maxPending: 4,
  ttlMs: 60 * 60 * 1000,
}

/** Constant-time, so a token is not guessable one byte at a time. */
export function tokenMatches(given: string | undefined, expected: string | undefined): boolean {
  if (!expected || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function bearerOf(header: string | undefined): string | undefined {
  if (!header) return undefined
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match?.[1]
}

/**
 * Jobs live in memory, deliberately.
 *
 * A job only means anything while this process is alive: the turn it carried
 * died with the process, and replaying it behind the caller's back would be
 * worse than losing it. A restart drops what was in flight, and that is the
 * correct behaviour rather than a limitation.
 */
export class JobRegistry {
  readonly #jobs = new Map<string, Job>()

  constructor(private readonly config: McpConfig) {}

  pending(): number {
    return [...this.#jobs.values()].filter((job) => job.state === 'running').length
  }

  create(prompt: string, from: string): Job | { refused: string } {
    this.#collect()
    if (this.pending() >= this.config.maxPending) {
      // An immediate refusal rather than a queue: a refusal is information the
      // caller can act on, and silence behind a lock that may not release for
      // an hour is not.
      return { refused: `busy: ${this.config.maxPending} tasks already running` }
    }
    const job: Job = { id: randomUUID(), state: 'running', prompt, from, startedAt: Date.now() }
    this.#jobs.set(job.id, job)
    return job
  }

  finish(id: string, result: string): void {
    const job = this.#jobs.get(id)
    if (!job) return
    job.state = 'done'
    job.result = result
    job.finishedAt = Date.now()
  }

  fail(id: string, error: string): void {
    const job = this.#jobs.get(id)
    if (!job) return
    job.state = 'failed'
    job.error = error
    job.finishedAt = Date.now()
  }

  get(id: string): Job | undefined {
    return this.#jobs.get(id)
  }

  /** Purged on write, not on a timer: this map only grows when something asks. */
  #collect(now = Date.now()): void {
    for (const [id, job] of this.#jobs) {
      if (job.finishedAt && now - job.finishedAt > this.config.ttlMs) this.#jobs.delete(id)
    }
  }
}

export interface JsonRpcRequest {
  readonly jsonrpc?: string
  readonly id?: string | number | null
  readonly method?: string
  readonly params?: Record<string, unknown>
}

export interface McpTool {
  readonly name: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
}

export function toolsFor(config: McpConfig): readonly McpTool[] {
  const ask = `ask_${config.agentName}`
  return [
    {
      name: ask,
      description:
        `Delegate a task to ${config.agentName}. Returns a job id IMMEDIATELY — the work ` +
        `runs in the background and may take minutes. Collect the answer with ${ask}_status.`,
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'What to do, in full. The agent cannot ask you.' },
        },
        required: ['prompt'],
      },
    },
    {
      name: `${ask}_status`,
      description: `Collect the answer to a job started with ${ask}.`,
      inputSchema: {
        type: 'object',
        properties: { job_id: { type: 'string' } },
        required: ['job_id'],
      },
    },
  ]
}

/**
 * The prompt a delegated task arrives under.
 *
 * Same reasoning as a scheduled turn: without a frame the agent answers as
 * though a person were reading, and asks questions that will reach a machine
 * whose only job is to poll for a result.
 */
export function frameDelegated(prompt: string, from: string): string {
  return [
    `[Delegated task from ${from}. Another agent asked for this — nobody is reading,`,
    `and it cannot answer questions. Do the work and report what you did.`,
    `If something is genuinely impossible, say so as the answer.]`,
    '',
    prompt,
  ].join('\n')
}
