/**
 * Interactive permissions — the gate between an agent and a destructive act.
 *
 * A v1 requirement, and one that has to work the same whichever engine is
 * running, so the mechanics live here rather than in a driver: a pending
 * decision, a way to answer it, and a policy for what happens when nobody
 * does.
 *
 * The default is DENY on timeout. An agent left waiting forever holds a turn
 * and a subscription slot; an agent that proceeds because nobody answered is
 * an agent that did something nobody approved. Only one of those is
 * recoverable.
 */

import { randomUUID } from 'node:crypto'

export type PermissionDecision = 'allow' | 'deny'

export interface PermissionRequest {
  readonly id: string
  readonly tool: string
  /** A short, telling summary — never the full input. */
  readonly detail: string | undefined
  readonly askedAt: number
}

export interface PermissionPolicy {
  /** Tools that never ask. Matched exactly, never by prefix. */
  readonly autoAllow?: readonly string[]
  /** Tools that always refuse, without asking anyone. */
  readonly autoDeny?: readonly string[]
  /** How long a request waits for an answer, in ms. */
  readonly timeoutMs?: number
  /**
   * What to do when nobody answers in time, or when there is no interface
   * listening at all — a scheduled turn, an MCP delegation.
   */
  readonly whenUnattended?: PermissionDecision
}

export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

interface Pending {
  readonly request: PermissionRequest
  readonly resolve: (decision: PermissionDecision) => void
  readonly timer: ReturnType<typeof setTimeout>
}

/**
 * Holds the requests waiting on a human.
 *
 * Shared by the core and whichever driver is running: the UI answers by id,
 * and neither side needs to know which engine asked.
 */
export class PermissionBroker {
  readonly #pending = new Map<string, Pending>()
  readonly #policy: PermissionPolicy

  constructor(policy: PermissionPolicy = {}) {
    this.#policy = policy
  }

  /** Decided without asking, or undefined when a human must be asked. */
  preDecide(tool: string): PermissionDecision | undefined {
    // Exact matches only. A prefix rule that allows "Read" would also allow a
    // tool called "ReadSecrets" that arrives in a future CLI version.
    if (this.#policy.autoDeny?.includes(tool)) return 'deny'
    if (this.#policy.autoAllow?.includes(tool)) return 'allow'
    return undefined
  }

  /**
   * @param emit publishes the request to whoever is watching the turn.
   *   When it returns false there is no interface listening, and the
   *   unattended policy decides immediately rather than waiting five minutes
   *   for a person who was never there.
   */
  ask(
    tool: string,
    detail: string | undefined,
    emit: (request: PermissionRequest) => boolean,
  ): Promise<PermissionDecision> {
    const immediate = this.preDecide(tool)
    if (immediate) return Promise.resolve(immediate)

    const request: PermissionRequest = { id: randomUUID(), tool, detail, askedAt: Date.now() }
    const unattended = this.#policy.whenUnattended ?? 'deny'

    if (!emit(request)) return Promise.resolve(unattended)

    return new Promise<PermissionDecision>((resolve) => {
      const timer = setTimeout(() => {
        this.#pending.delete(request.id)
        resolve(unattended)
      }, this.#policy.timeoutMs ?? DEFAULT_TIMEOUT_MS)
      // Node keeps the process alive for a pending timer; a five-minute one
      // would hold a shutdown open for no reason.
      timer.unref?.()
      this.#pending.set(request.id, { request, resolve, timer })
    })
  }

  /** @returns false when the id is unknown — expired, or already answered. */
  answer(id: string, decision: PermissionDecision): boolean {
    const pending = this.#pending.get(id)
    if (!pending) return false
    clearTimeout(pending.timer)
    this.#pending.delete(id)
    pending.resolve(decision)
    return true
  }

  /** Everything still waiting, so a reconnecting UI can re-ask. */
  outstanding(): readonly PermissionRequest[] {
    return [...this.#pending.values()].map((pending) => pending.request)
  }

  /**
   * Resolves everything with the unattended policy. Called when a turn ends:
   * a request whose turn is over can never be answered usefully, and leaving
   * it pending strands the composer behind a prompt nothing will resolve.
   */
  releaseAll(): void {
    const unattended = this.#policy.whenUnattended ?? 'deny'
    for (const pending of [...this.#pending.values()]) {
      clearTimeout(pending.timer)
      pending.resolve(unattended)
    }
    this.#pending.clear()
  }
}
