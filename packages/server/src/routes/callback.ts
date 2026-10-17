/**
 * The `/callback` route. Why it is a door of its own, and what guards it, is
 * written in `../callback.ts`; this file mounts it.
 */

import type { FastifyInstance } from 'fastify'

import { verifySettled, wakePrompt } from '../callback.js'
import type { McpServerConfig } from '../config.js'
import { AGENT_NAME } from '../mcp-in.js'

/** Job ids are UUIDs here and hex tokens elsewhere; both fit, nothing else. */
const JOB_ID = /^[A-Za-z0-9-]{8,64}$/

/** One knock per job: a peer that retries, or a prankster that replays, must
    not wake the agent twice for one settlement. */
const SEEN_TTL_MS = 60 * 60 * 1000

export interface CallbackDependencies {
  /** Every outbound server this instance may call — config, plugin and UI
      layers merged, credentials included. The verification path. */
  servers(): Promise<readonly McpServerConfig[]>
  /** The app's own unattended spawn path — the clock's, exactly. */
  runTurn(prompt: string): Promise<void>
  readonly fetchImpl?: typeof fetch
}

export function registerCallback(app: FastifyInstance, deps: CallbackDependencies): void {
  const fetchImpl = deps.fetchImpl ?? fetch
  const seen = new Map<string, number>()

  app.post<{ Body?: { from?: unknown; job_id?: unknown } }>('/callback', async (request, reply) => {
    const from = request.body?.from
    const jobId = request.body?.job_id
    if (typeof from !== 'string' || !AGENT_NAME.test(from)) {
      return reply.code(400).send({ error: 'from is required' })
    }
    if (typeof jobId !== 'string' || !JOB_ID.test(jobId)) {
      return reply.code(400).send({ error: 'job_id is required' })
    }

    const now = Date.now()
    for (const [key, at] of seen) {
      if (now - at > SEEN_TTL_MS) seen.delete(key)
    }
    const duplicate = seen.has(jobId)
    seen.set(jobId, now)

    if (!duplicate) {
      // Detached: the peer's delivery is fail-soft with a 30s budget, and
      // verification alone can spend that. What this door tells the knocker
      // is that the knock was heard — never whether it mattered, which is
      // also why a duplicate gets the same 202 as a first knock.
      void (async () => {
        const server = (await deps.servers()).find((entry) => entry.name === from)
        if (!server) return
        if (!(await verifySettled(server, from, jobId, fetchImpl))) return
        // Capacity refusals land here too, and stay silent: the poll net holds.
        await deps.runTurn(wakePrompt(from, jobId)).catch(() => undefined)
      })()
    }

    return reply.code(202).send({ received: true })
  })
}
