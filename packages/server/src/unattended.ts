/**
 * The loose unattended spawn path — the clock's and the callback wake's.
 *
 * Same limiter as everything else: a person typing must not find the
 * instance busy with work nobody asked for right now, so a full house
 * refuses rather than queues. Unattended, because nobody is at a screen: a
 * question raised in such a turn is refused at once rather than holding a
 * slot for five minutes waiting on a person who was never there.
 */

import type { BackgroundReach } from './background.js'
import type { McpServerConfig } from './config.js'
import type { TurnDesk, TurnOutcome } from './turns.js'

interface UnattendedDependencies {
  readonly desk: TurnDesk
  readonly backgroundReach: BackgroundReach
  readonly outboundServers: () => Promise<readonly McpServerConfig[]>
  readonly cwd: string
  readonly agentRoots: readonly string[]
}

export function makeRunUnattended(deps: UnattendedDependencies): (prompt: string) => Promise<void> {
  const { desk, backgroundReach, outboundServers, cwd, agentRoots } = deps
  return async (prompt) => {
    // Through the desk, like every other turn: same cap, same preamble, same
    // event log. A LOOSE job — no key — because nothing will ever attach to
    // it or queue behind it; a full house refuses (`TurnCapacityError`)
    // rather than queues, which is the refusal the callers already log.
    const admission = desk.admit()
    if (admission.mode !== 'run') throw new Error('a loose turn is never queued')
    // The `background` servers' tokens — this spawn path and no other: the
    // delegation channel deliberately never mints, so an agent that
    // may delegate work here still cannot read anybody's mail by ricochet.
    // Minted after admission: a full house should refuse before the identity
    // provider is asked for anything. Minting never throws by design; the
    // reads around it can, and a slot reserved by `admit` must go back.
    let serverTokens: Readonly<Record<string, string>>
    try {
      serverTokens = await backgroundReach.tokensFor(await outboundServers())
    } catch (error) {
      admission.abort()
      throw error
    }
    let outcome: TurnOutcome | undefined
    const job = admission.start({
      request: {
        prompt,
        cwd,
        ...(agentRoots.length > 0 ? { roots: agentRoots } : {}),
        ...(Object.keys(serverTokens).length > 0 ? { serverTokens } : {}),
        unattended: true,
      },
      finish: async (done) => {
        outcome = done
      },
    })
    await job.done
    if (outcome?.failure) throw new Error(outcome.failure)
  }
}
