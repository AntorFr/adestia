/**
 * The questions a turn is waiting on.
 *
 * What this is NOT, because a predecessor was: a permission policy. There are
 * no allow lists here, no deny lists, no content rules, no unattended policy.
 * Demeura judges nothing — the ENGINE decides a call needs a person, and this
 * holds that question until somebody answers it. Demeura is the surface, never
 * the wall (DESIGN.md, decision log 2026-08-26).
 *
 * Three answers, and the last one is why this is bearable: `once` for this
 * call, `always` to stop being asked at all, and `deny`.
 *
 * `always` is remembered by the ENGINE, in the engine's own rule file inside
 * the workspace — not by Demeura. That is the whole point: the durable
 * allowlist is a file a person can open, read and edit, maintained by the CLI
 * that enforces it. Demeura keeps no list, and never did after 2026-08-26.
 */

import { randomUUID } from 'node:crypto'

export type AskAnswer = 'once' | 'always' | 'deny'

export interface PendingAsk {
  readonly id: string
  readonly tool: string
  /** The engine's own sentence. */
  readonly title: string
  readonly reason?: string
  /** Whether `always` is answerable — the engine offered a rule to remember. */
  readonly remembering: boolean
}

/**
 * How long a question waits before it answers itself with a refusal.
 *
 * A turn holds one of the instance's slots while it waits, so "forever" would
 * let a closed tab wedge the instance. Five minutes is long enough to walk
 * back to a screen; a refusal is recoverable — asking again costs a sentence.
 */
export const ASK_TIMEOUT_MS = 5 * 60 * 1000

interface Waiting {
  readonly ask: PendingAsk
  readonly settle: (answer: AskAnswer) => void
  readonly timer: ReturnType<typeof setTimeout>
}

export class AskDesk {
  readonly #waiting = new Map<string, Waiting>()
  readonly #timeoutMs: number

  constructor(timeoutMs: number = ASK_TIMEOUT_MS) {
    this.#timeoutMs = timeoutMs
  }

  /**
   * @param publish hands the question to whoever is watching the turn.
   *   Returning false means nobody is — a scheduled turn, a delegation — and
   *   the question is refused at once rather than holding a slot for five
   *   minutes waiting on a person who was never there.
   */
  ask(
    ask: Omit<PendingAsk, 'id'>,
    publish: (pending: PendingAsk) => boolean,
  ): Promise<AskAnswer> {
    const pending: PendingAsk = { id: randomUUID(), ...ask }
    if (!publish(pending)) return Promise.resolve('deny')

    return new Promise<AskAnswer>((resolve) => {
      const timer = setTimeout(() => {
        this.#waiting.delete(pending.id)
        resolve('deny')
      }, this.#timeoutMs)
      // Node keeps the process alive for a pending timer; a five-minute one
      // would hold a shutdown open for nothing.
      timer.unref?.()
      this.#waiting.set(pending.id, { ask: pending, settle: resolve, timer })
    })
  }

  /**
   * What is still waiting.
   *
   * The turn is blocked on each of these, so "what is this instance stuck on"
   * is a real question with a real answer — worth being able to ask from the
   * outside rather than inferring from a spinner.
   */
  outstanding(): readonly PendingAsk[] {
    return [...this.#waiting.values()].map((waiting) => waiting.ask)
  }

  /** @returns false when the id is unknown — already answered, or timed out. */
  answer(id: string, answer: AskAnswer): boolean {
    const waiting = this.#waiting.get(id)
    if (!waiting) return false
    clearTimeout(waiting.timer)
    this.#waiting.delete(id)
    waiting.settle(answer)
    return true
  }

  /**
   * Refuses everything still waiting. Called when a turn ends: a question
   * whose turn is over can never be answered usefully, and leaving it pending
   * strands the composer behind a prompt nothing will resolve.
   */
  releaseAll(): void {
    for (const waiting of [...this.#waiting.values()]) {
      clearTimeout(waiting.timer)
      waiting.settle('deny')
    }
    this.#waiting.clear()
  }
}
