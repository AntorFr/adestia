/**
 * The credential the core arms, as every driver keeps it.
 *
 * Three engines, one story: the interface captures a secret, the CORE stores
 * it and hands it back, and the driver only has to remember what it was
 * given, when, and whether the engine has since refused it. That story was
 * written three times, once per driver, and the copies had already started
 * to differ — one merged a new secret into the old set where the others
 * replaced it, so clearing the token cleared nothing there.
 *
 * The driver still owns the variable name and the moment it declares the
 * secret invalid; this only keeps the three facts together and answers the
 * one question the interface asks about them.
 */

import type { AuthStatus } from './contract.js'

export class ManagedCredential {
  #values: Readonly<Record<string, string>>
  #savedAt: string | undefined
  #invalidReason: string | undefined

  /**
   * @param key the environment variable the engine reads the secret from
   * @param initial what the core loaded before the driver was built
   */
  constructor(
    readonly key: string,
    initial: Readonly<Record<string, string>> = {},
  ) {
    this.#values = { ...initial }
  }

  /**
   * Replaces — never merges — what is held, and forgets any refusal.
   *
   * Replacing is what makes an empty set mean "cleared": the core sends `{}`
   * when the person removes the token, and a merge would keep the old secret
   * armed until the next restart.
   */
  set(values: Readonly<Record<string, string>>, savedAt?: string | undefined): void {
    this.#values = { ...values }
    this.#savedAt = savedAt
    this.#invalidReason = undefined
  }

  /** The engine refused the secret; status says so until a new one is set. */
  invalidate(reason: string): void {
    this.#invalidReason = reason
  }

  /**
   * The engine rotated the secret itself — a refresh token did its job.
   *
   * The record keeps its date and its standing: nobody armed anything, the
   * same credential simply has a newer body, and the core is told so it can
   * store that body before the next restart writes the stale one back.
   */
  refresh(secret: string): void {
    this.#values = { ...this.#values, [this.key]: secret }
  }

  /** Everything held, for the spawn's environment. */
  values(): Readonly<Record<string, string>> {
    return { ...this.#values }
  }

  /** The managed secret itself, when one is held. */
  secret(): string | undefined {
    return this.#values[this.key]
  }

  /**
   * NOT an error when nothing is held: the CLI may perfectly well be living
   * on credentials someone set up outside Adestia, and forcing an arming flow
   * to start a session would make the product harder to use than the terminal.
   */
  status(): AuthStatus {
    const savedAt = this.#savedAt ? { savedAt: this.#savedAt } : {}
    if (this.#invalidReason) {
      return { state: 'invalid', source: 'managed', reason: this.#invalidReason, ...savedAt }
    }
    if (this.secret()) return { state: 'armed', source: 'managed', ...savedAt }
    return { state: 'absent', source: 'cli-native' }
  }
}
