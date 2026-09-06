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
 * Two identifiers, two lifetimes, on purpose:
 *
 *  - a `job_id` names ONE ask. It lives in memory, is forgotten an hour after
 *    the job settles, and dies with the process — the turn it carried died
 *    with the process too, and replaying it behind the caller's back would be
 *    worse than losing it.
 *  - a `task_id` names the CONVERSATION a job ran in. It lives on disk with
 *    the thread (see `delegations.ts`), survives restarts, and passing it
 *    back to `ask` continues the same conversation — the predecessor's
 *    resume contract (agent-gw's `task_id`), rebuilt on this product's own
 *    conversation machinery.
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
  /** The conversation this job runs in — handed back as `task_id` when done. */
  readonly taskId: string
  /** Whether to ping the caller's callback endpoint when the job settles. */
  readonly notify: boolean
  /** Where that ping goes — validated and normalized, or absent. */
  readonly callbackUrl?: string | undefined
  readonly startedAt: number
  finishedAt?: number
  result?: string
  error?: string
  /** A failed delivery, kept for the status poll: the work itself is fine. */
  notifyError?: string
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
  /**
   * What the ask tool SAYS it is for, in the caller's tool list.
   *
   * The predecessor let each body describe itself (`MCP_DESCRIPTION`) — the
   * butler's tool said filing and workbooks, the coder's said code — and that
   * sentence is how a calling model picks the right colleague. Absent, a
   * serviceable generic line stands.
   */
  readonly description?: string | undefined
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
 * Agent names double as directory names and as tool-name halves, so the same
 * grammar the config enforces on `agentName` gates what a header may claim.
 */
export const AGENT_NAME = /^[a-z][a-z0-9_-]{0,31}$/

/**
 * Who is calling, from the `x-adestia-caller` header.
 *
 * Falls back to `agent` rather than echoing what was sent: the name becomes a
 * directory under the delegation store and half of a callback verification,
 * and an unvalidated spelling would poison both.
 */
export function callerOf(header: unknown): string {
  return typeof header === 'string' && AGENT_NAME.test(header) ? header : 'agent'
}

/**
 * The caller's callback address, from `x-adestia-callback-url`.
 *
 * Parsed, never regexed, and stored in the parser's normalized form; the ping
 * is later built from this string by the HTTP client with no concatenation
 * anywhere, so there is nothing to inject. `http` and `https` only, no
 * credentials in the URL, a sane length cap. Anything else reads as "this
 * caller cannot be called back", which is an answer, not an error — a Claude
 * Code session has no door to knock on and sends no header at all.
 *
 * Deliberately NOT a token: whoever holds the ask token can already delegate
 * arbitrary work, so gating the ping's destination would guard a side door of
 * a wide-open front one. See `callback.ts` for why a forged destination buys
 * nothing anyway.
 */
export function callbackUrlOf(header: unknown): string | undefined {
  if (typeof header !== 'string' || header.length === 0 || header.length > 512) return undefined
  let url: URL
  try {
    url = new URL(header)
  } catch {
    return undefined
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  if (url.username !== '' || url.password !== '') return undefined
  return url.href
}

/**
 * The ping a settled job sends — the WHOLE ping.
 *
 * Content-free by design: no result text, no request echo, nothing a peer's
 * model will ever read raw. The receiver verifies the pair against the
 * sender's own status tool and wakes its agent with a locally templated
 * prompt, so a forged ping can at most make it poll and find nothing. This is
 * also why there is no anti-loop guard anywhere any more: the predecessor's
 * report was itself an ask and needed `notify: false` to stop two polite
 * agents ping-ponging; a ping that is not an ask cannot start a loop.
 *
 * A pure builder, so the contract is locked by a test with no network in it.
 */
export function pingBody(agentName: string, jobId: string): { from: string; job_id: string } {
  return { from: agentName, job_id: jobId }
}

/** What `create` needs to know about the ask it admits. */
export interface JobSeed {
  readonly prompt: string
  readonly from: string
  readonly taskId: string
  readonly notify: boolean
  readonly callbackUrl?: string | undefined
}

/**
 * Jobs live in memory, deliberately.
 *
 * A job only means anything while this process is alive: the turn it carried
 * died with the process, and replaying it behind the caller's back would be
 * worse than losing it. A restart drops what was in flight, and that is the
 * correct behaviour rather than a limitation. The conversation the job wrote
 * to is the part that persists — its `task_id` outlives everything here.
 */
export class JobRegistry {
  readonly #jobs = new Map<string, Job>()

  constructor(private readonly config: McpConfig) {}

  pending(): number {
    return [...this.#jobs.values()].filter((job) => job.state === 'running').length
  }

  create(seed: JobSeed): Job | { refused: string } {
    this.#collect()
    if (this.pending() >= this.config.maxPending) {
      // An immediate refusal rather than a queue: a refusal is information the
      // caller can act on, and silence behind a lock that may not release for
      // an hour is not.
      return { refused: `busy: ${this.config.maxPending} tasks already running` }
    }
    const job: Job = { id: randomUUID(), state: 'running', startedAt: Date.now(), ...seed }
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

  /** A ping that could not be delivered. The job itself is untouched. */
  noteNotifyError(id: string, error: string): void {
    const job = this.#jobs.get(id)
    if (job) job.notifyError = error
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
  const what = config.description ?? `Delegate a task to ${config.agentName}.`
  return [
    {
      name: ask,
      description:
        `${what} Returns a job id IMMEDIATELY — the work ` +
        `runs in the background and may take minutes. Collect the answer with ${ask}_status. ` +
        `To continue a previous conversation, pass back the task_id that ${ask}_status ` +
        `returned once that job was done.`,
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'What to do, in full. The agent cannot ask you.' },
          task_id: {
            type: 'string',
            description:
              'Optional: continue this earlier conversation instead of starting fresh. ' +
              `Use the task_id a finished job's ${ask}_status returned.`,
          },
          notify: {
            type: 'boolean',
            description:
              'Whether to ping your callback endpoint when the job settles (default true; ' +
              'meaningless for callers that did not declare one).',
          },
        },
        required: ['prompt'],
      },
    },
    {
      name: `${ask}_status`,
      description:
        `Collect the answer to a job started with ${ask}. When done it carries the reply ` +
        `and a task_id — pass that task_id back to ${ask} to continue the same conversation. ` +
        `Jobs are forgotten one hour after they finish.`,
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
 * whose only job is to poll for a result. What the THREAD stores is the raw
 * request — the frame is fuel for the engine, not transcript for the reader
 * (the delegations screen would otherwise open every thread on three lines of
 * liturgy).
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
