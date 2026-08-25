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
  /**
   * Which conversation this was raised in.
   *
   * An identifier, for ROUTING — not a label to show. A recovered request
   * has to reappear in the thread it belongs to, and with more than one turn
   * allowed at once there is nothing in "Edit todo/rails.md" that says which.
   * Rendering it in the wrong thread is worse than not rendering it: it asks
   * somebody to approve a change to a conversation they are not having.
   *
   * Attached by the product, never by the driver: a driver knows a session
   * id, and conversations are the shell's notion.
   */
  conversationId?: string
}

/**
 * A file change a tool is about to make, normalized out of the engine's own
 * tool vocabulary by its driver. Only shapes a rule can reason about are
 * represented: anything else (a shell command, a notebook cell) never becomes
 * one, and falls through to the name-based policy.
 */
export type ProposedFileEdit =
  | { readonly kind: 'write'; readonly path: string; readonly content: string }
  | {
      readonly kind: 'edit'
      readonly path: string
      readonly oldText: string
      readonly newText: string
      /** Replace every occurrence, not just the first. */
      readonly all: boolean
    }

/**
 * What a content rule says about a proposed edit:
 * - `'allow'` — this exact change is fine without asking anyone;
 * - `'ask'` — this file is sensitive: a human must approve, even when the
 *   tool's NAME is auto-allowed (unattended, that resolves to the unattended
 *   policy — deny by default);
 * - `undefined` — not this rule's file; the name-based policy decides.
 */
export type EditRuling = 'allow' | 'ask' | undefined

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
  /**
   * Content-aware rule, consulted between `autoDeny` and `autoAllow` when the
   * driver could normalize the tool call into a file edit. The ordering is the
   * contract: an operator's explicit deny still wins over any rule, and a
   * rule's `'ask'` pierces a blanket `autoAllow` — that is what lets a zone
   * stay guarded on an instance that otherwise trusts its file tools.
   */
  readonly decideEdit?: (edit: ProposedFileEdit) => EditRuling | Promise<EditRuling>
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
   * @param edit the call normalized as a file change, when the driver could —
   *   what the `decideEdit` rule reasons about. Absent for anything that is
   *   not a plain file edit, which then follows the name-based policy alone.
   */
  async ask(
    tool: string,
    detail: string | undefined,
    emit: (request: PermissionRequest) => boolean,
    edit?: ProposedFileEdit,
  ): Promise<PermissionDecision> {
    // The operator's explicit deny is absolute — no rule re-opens it.
    if (this.#policy.autoDeny?.includes(tool)) return 'deny'

    const ruling = edit ? await this.#policy.decideEdit?.(edit) : undefined
    if (ruling === 'allow') return 'allow'

    // `'ask'` skips this line on purpose: a guarded file must reach a human
    // even when the tool's name is blanket-allowed.
    if (ruling !== 'ask' && this.#policy.autoAllow?.includes(tool)) return 'allow'

    const request: PermissionRequest = { id: randomUUID(), tool, detail, askedAt: Date.now() }
    const unattended = this.#policy.whenUnattended ?? 'deny'

    if (!emit(request)) return unattended

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
  /**
   * Records which conversation a waiting request belongs to.
   *
   * Separate from `ask` because the two are known in different places: the
   * driver raises the request, the shell knows the conversation. A request
   * already answered or timed out is silently ignored — there is nothing
   * left to route.
   */
  attach(id: string, conversationId: string): void {
    const pending = this.#pending.get(id)
    if (pending && conversationId) pending.request.conversationId = conversationId
  }

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
