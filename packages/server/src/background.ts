/**
 * The background reach — which user-scoped servers a turn with NO caller may
 * see, and as whom.
 *
 * A server marked `background: true` in the config is opened to the clock's
 * turns and to callback wakes, acting as the ONE person whose rebound key the
 * instance holds. Deliberately NOT to inbound delegations: honouring the flag
 * there would hand this person's mail to every agent allowed to delegate work
 * here — if a third agent must ever read it, that is a grant the hub's façade
 * signs, not a flag the runtime widens. The delegation channel therefore
 * never touches this module, and that absence is the boundary.
 *
 * WHOSE token: "the one entry of the rebound store, a loud refusal for two".
 * Never a subject written into the config — the store is keyed by the IdP's
 * opaque `sub`, which an IdP storage reset can silently reassign, and a
 * config naming one would then lie without a sound.
 *
 * FAILURE IS SAID, NEVER SILENT. The old behaviour — a background turn just
 * does not see the server — was the guardrail; now that it is a granted
 * reach, losing it (grant purged, provider unreachable, nobody or two people
 * in the store) must surface: every failing mint logs, and the latest
 * trouble is held here for `/api/instance` to show the shell. A background
 * that quietly stops reading the mail is indistinguishable from one that
 * never ran.
 */

import type { McpServerConfig } from './config.js'

/** What the rebound store answers the background minter. */
export interface ReboundKeys {
  subjects(): Promise<readonly string[]>
  accessToken(subject: string): Promise<string | undefined>
}

export interface BackgroundTrouble {
  /**
   * `no-rebound` — servers are flagged but this instance keeps no user keys
   * (proxy auth, or no rebound audience): a config that promises what the
   * deployment cannot mint.
   * `nobody-connected` — the store is empty: nobody signed in since the
   * rebound was turned on.
   * `several-people` — two or more keys: the minter refuses to choose whose
   * data the background reads.
   * `mint-failed` — one key, no token: the grant was purged (signed out past
   * the provider's refresh lifetime, or revoked) or the provider is down.
   */
  readonly code: 'no-rebound' | 'nobody-connected' | 'several-people' | 'mint-failed'
  /** When this trouble was FIRST seen, epoch ms — held across repeats. */
  readonly since: number
  /** The background servers that stayed out of reach. */
  readonly servers: readonly string[]
}

export class BackgroundReach {
  readonly #keys: ReboundKeys | undefined
  readonly #log: (message: string) => void
  #trouble: BackgroundTrouble | undefined

  constructor(keys: ReboundKeys | undefined, log: (message: string) => void = () => {}) {
    this.#keys = keys
    this.#log = log
  }

  /** The standing trouble, for the instance payload. Absent means healthy. */
  trouble(): BackgroundTrouble | undefined {
    return this.#trouble
  }

  /**
   * The per-server tokens a caller-less turn carries — empty when nothing is
   * flagged, and empty WITH a said reason when minting failed. The turn runs
   * either way: a scheduled note that never reads mail may still water every
   * other plant it was written for.
   */
  async tokensFor(
    servers: readonly McpServerConfig[],
  ): Promise<Readonly<Record<string, string>>> {
    const flagged = servers.filter((server) => server.background).map((server) => server.name)
    if (flagged.length === 0) {
      // Nothing granted, nothing to be in trouble about — a flag removed
      // from the config must also take its banner down.
      this.#trouble = undefined
      return {}
    }

    if (!this.#keys) return this.#refuse('no-rebound', flagged)

    const subjects = await this.#keys.subjects()
    if (subjects.length === 0) return this.#refuse('nobody-connected', flagged)
    if (subjects.length > 1) return this.#refuse('several-people', flagged)

    const token = await this.#keys.accessToken(subjects[0]!)
    if (!token) return this.#refuse('mint-failed', flagged)

    this.#trouble = undefined
    return Object.fromEntries(flagged.map((name) => [name, token]))
  }

  #refuse(
    code: BackgroundTrouble['code'],
    servers: readonly string[],
  ): Readonly<Record<string, string>> {
    // `since` survives repeats of the SAME trouble: the banner should say how
    // long the mail has gone unread, not when the clock last ticked.
    const since = this.#trouble?.code === code ? this.#trouble.since : Date.now()
    this.#trouble = { code, since, servers }
    // Logged at every failing turn, not once: each entry is a turn that ran
    // without its reach, and the journal should count them all.
    this.#log(`background reach refused (${code}): ${servers.join(', ')} stayed out of this turn`)
    return {}
  }
}
