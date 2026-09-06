/**
 * The delegation channel — inbound MCP work as a channel of its own.
 *
 * A delegated task and a chat message run through the SAME machinery — the
 * turn desk for chaining and capacity, the conversation store for the thread,
 * the session line for resume — but they are not the same kind of thing, and
 * this module is where the differences live rather than as conditionals
 * scattered around a shared path:
 *
 *  - the channel's threads belong to CALLERS (agent names), not to users, and
 *    sit in their own store under `dataDir/delegations` — a task_id resolves
 *    only inside its channel, so an agent can never resume a person's chat
 *    thread and a person's client can never open a delegation by id through
 *    the chat routes. The separation is the authorization boundary, not a
 *    display preference.
 *  - a delegated turn is unattended and framed (`frameDelegated`); a chat
 *    turn is neither.
 *  - two asks on one thread do not merge the way queued chat messages do:
 *    each ask is one job owing one answer, so a thread that is still working
 *    refuses the second ask instead of blending both into a single turn.
 *
 * Threads are stored raw: the request as the caller wrote it, the answer as
 * the agent wrote it. The frame is applied at the driver boundary only — it
 * is fuel, not transcript (see `frameDelegated`).
 */

import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import { ConversationStore, type Conversation, type ConversationMeta } from './conversations.js'
import { frameDelegated } from './mcp-in.js'
import { TurnDesk, type TurnOutcome, type TurnSpec } from './turns.js'

/** What one settled delegated turn hands back to the job that asked for it. */
export interface DelegatedResult {
  readonly text: string
  readonly failure?: string | undefined
}

/** A thread row for the delegations screen: whose it is, and whether it runs. */
export interface DelegationRow extends ConversationMeta {
  readonly caller: string
  readonly turn?: 'running' | 'waiting'
}

export interface DelegationChannelOptions {
  readonly dataDir: string
  readonly cwd: string
  readonly roots?: readonly string[] | undefined
}

/** How a thread is named in the list: the request's first words, not a serial
    number. Cut on a word so the tile never ends mid-syllable. */
export function titleFor(request: string): string {
  const line = request.trim().split('\n', 1)[0] ?? ''
  if (line.length <= 60) return line || 'Delegated task'
  const cut = line.slice(0, 60)
  const space = cut.lastIndexOf(' ')
  return `${cut.slice(0, space > 30 ? space : 60)}…`
}

export class DelegationChannel {
  readonly #store: ConversationStore
  readonly #desk: TurnDesk
  readonly #cwd: string
  readonly #roots: readonly string[] | undefined

  constructor(desk: TurnDesk, options: DelegationChannelOptions) {
    // Plain naming, so `owners()` can enumerate callers for the screen; the
    // caller name is validated upstream (`callerOf`) and re-checked by the
    // store — an unsafe name must never become a directory.
    this.#store = new ConversationStore(join(options.dataDir, 'delegations'), 'plain')
    this.#desk = desk
    this.#cwd = options.cwd
    this.#roots = options.roots
  }

  #key(caller: string, threadId: string): string {
    // The channel's own key family. Prefixed like the chat's `user/c:id` keys
    // but never colliding with them: a user id may be anything, but the desk
    // only ever sees `mcp:` from here.
    return `mcp:${caller}/c:${threadId}`
  }

  /** Whether this thread is mid-turn — asked at the door, so a second ask on
      a working thread is refused before a job is even minted. */
  busy(caller: string, threadId: string): boolean {
    return this.#desk.activeFor(this.#key(caller, threadId)) !== undefined
  }

  /**
   * The thread this ask will run in.
   *
   * No task_id: a fresh thread, titled after the request. A task_id that
   * names nothing (expired store, other caller's thread, typo) is refused as
   * one thing — from the caller's side those are all "there is no such
   * conversation to continue".
   */
  async open(
    caller: string,
    request: string,
    taskId: string | undefined,
  ): Promise<{ threadId: string } | { unknown: true }> {
    if (taskId === undefined) {
      const meta = await this.#store.create(caller, titleFor(request))
      return { threadId: meta.id }
    }
    const existing = await this.#store.read(caller, taskId)
    if (!existing) return { unknown: true }
    return { threadId: taskId }
  }

  /**
   * One delegated turn, through the same desk as everything else.
   *
   * The desk gives this channel what the predecessor's global lock gave it —
   * no two turns of one conversation at once — but per thread instead of per
   * body. What it deliberately does NOT reuse is the chat's queueing: a
   * second ask while the thread runs is refused (`busy`), because two jobs
   * merged into one turn would owe two answers and hold one.
   *
   * Resume is best-effort the way the design settled it: when a stored
   * session has expired under the thread, the turn is retried ONCE with no
   * session — but only if the failed attempt produced nothing at all. A turn
   * that half-ran and died may have had side effects, and silently running it
   * again is the one thing worse than failing.
   */
  async run(caller: string, threadId: string, request: string): Promise<DelegatedResult> {
    const key = this.#key(caller, threadId)
    if (this.#desk.activeFor(key)) {
      throw new BusyThreadError(threadId)
    }

    const thread = await this.#store.read(caller, threadId)
    const sessionId = thread?.sessionId

    await this.#store.append(caller, threadId, {
      id: randomUUID(),
      role: 'user',
      text: request,
      at: new Date().toISOString(),
    })

    const first = await this.#turn(caller, threadId, key, request, sessionId)
    // No parts AT ALL — not merely no text: a turn that called tools without
    // speaking has side effects too, and must not run twice.
    const retriable =
      first.failure !== undefined && first.outcome.parts.length === 0 && sessionId !== undefined
    if (!retriable) {
      await this.#persist(caller, threadId, first.outcome)
      return { text: first.text, ...(first.failure ? { failure: first.failure } : {}) }
    }

    // The stored session is the prime suspect (expired, pruned, another
    // machine): nothing ran, so a fresh start repeats nothing.
    const second = await this.#turn(caller, threadId, key, request, undefined)
    await this.#persist(caller, threadId, second.outcome)
    return { text: second.text, ...(second.failure ? { failure: second.failure } : {}) }
  }

  async #turn(
    caller: string,
    threadId: string,
    key: string,
    request: string,
    sessionId: string | undefined,
  ): Promise<{ outcome: TurnOutcome; text: string; failure?: string | undefined }> {
    let outcome: TurnOutcome = { parts: [], stopped: false }
    let settle: () => void = () => {}
    const settled = new Promise<void>((resolve) => {
      settle = resolve
    })

    const spec: TurnSpec = {
      request: {
        prompt: frameDelegated(request, caller),
        cwd: this.#cwd,
        ...(this.#roots && this.#roots.length > 0 ? { roots: this.#roots } : {}),
        ...(sessionId ? { sessionId } : {}),
        // A delegating agent is not a person at a screen.
        unattended: true,
      },
      finish: async (result) => {
        outcome = result
        settle()
      },
    }

    const admission = this.#desk.admit(key)
    if (admission.mode === 'queued') {
      // `activeFor` said idle just above; a chain appearing in between means
      // another ask raced this one. Same answer as finding it running.
      throw new BusyThreadError(threadId)
    }
    const job = admission.start(spec)
    await settled
    // And the job's END, not just its outcome: the desk unregisters the chain
    // between the two, and a retry that re-admits on `settled` alone finds its
    // own dying chain still at the counter and reads it as "busy".
    await job.done

    const text = outcome.parts
      .map((part) => part.text)
      .filter((part) => part !== '')
      .join('\n\n')
    return { outcome, text, ...(outcome.failure ? { failure: outcome.failure } : {}) }
  }

  /** The thread gets what the chat's finish gives its own: one message per
      part, the failure on the last word, the session line for the next ask. */
  async #persist(caller: string, threadId: string, outcome: TurnOutcome): Promise<void> {
    const parts = outcome.parts.filter((part) => part.text !== '' || part.tools.length > 0)
    const written = parts.length > 0 ? parts : [{ tools: [], text: '' }]
    for (const [index, part] of written.entries()) {
      const last = index === written.length - 1
      await this.#store
        .append(caller, threadId, {
          id: randomUUID(),
          role: 'agent',
          text: part.text,
          at: new Date().toISOString(),
          ...(part.tools.length > 0 ? { tools: [...part.tools] } : {}),
          ...(last && outcome.stopped ? { stopped: outcome.stopped } : {}),
          ...(last && outcome.failure ? { error: outcome.failure } : {}),
          ...(last && outcome.usage ? { usage: outcome.usage } : {}),
        })
        .catch(() => undefined)
    }
    if (outcome.sessionId) {
      await this.#store.setSession(caller, threadId, outcome.sessionId).catch(() => undefined)
    }
  }

  /** Every caller's threads, flat, for the screen — which groups them itself.
      The status dot is computed against the desk per request, never stored. */
  async list(): Promise<readonly DelegationRow[]> {
    const rows: DelegationRow[] = []
    for (const caller of await this.#store.owners()) {
      for (const meta of await this.#store.list(caller, true)) {
        const job = this.#desk.activeFor(this.#key(caller, meta.id))
        rows.push({
          ...meta,
          caller,
          ...(job ? { turn: job.waiting ? ('waiting' as const) : ('running' as const) } : {}),
        })
      }
    }
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async read(caller: string, threadId: string): Promise<Conversation | undefined> {
    return this.#store.read(caller, threadId)
  }
}

/** Thrown when an ask lands on a thread already working its previous one. */
export class BusyThreadError extends Error {
  constructor(readonly threadId: string) {
    super(`conversation ${threadId} is still working on its previous request`)
  }
}
