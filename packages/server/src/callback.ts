/**
 * The `/callback` endpoint — where a peer's settled delegation knocks.
 *
 * The OTHER door, deliberately not the MCP one. When this instance delegates
 * work (its agent calls a peer's `ask_*`), the peer pings back here once the
 * job settles. Routing that ping through `ask_*` — the predecessor's design —
 * meant every callback demanded the caller's own ask token: agent A calling
 * agent B had to hand B the key to A's front door, and any asymmetry of
 * trust between them died on the first ask. A callback is not an ask, so it
 * gets a door that grants nothing.
 *
 * What guards this door is not a bearer but the shape of what may pass:
 *
 *  - the ping is CONTENT-FREE — `{from, job_id}`, both validated against
 *    closed grammars. No text a model will ever read arrives here.
 *  - `from` must name one of THIS instance's own outbound MCP servers: the
 *    only peers whose settled work means anything are the ones this instance
 *    can ask. An unknown name is dropped without an answer worth timing.
 *  - the pair is then VERIFIED: this instance calls the named peer's own
 *    status tool — through its own configured credentials, rights it holds by
 *    definition since it delegated in the first place — and only a job the
 *    peer confirms settled wakes the agent. A forged ping buys one
 *    authenticated poll that finds nothing.
 *  - the wake prompt is a LOCAL TEMPLATE whose only variable is the validated
 *    id. The result itself travels on the pull path the agent then takes.
 *
 * And because a callback is not an ask, the predecessor's anti-loop guard
 * (`notify: false` on the report) has nothing left to guard: a ping cannot
 * generate a counter-report, so two polite agents can no longer ping-pong an
 * account dry by design rather than by flag.
 */

import type { FastifyInstance } from 'fastify'

import type { McpServerConfig } from './config.js'
import { AGENT_NAME } from './mcp-in.js'

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

const VERIFY_TIMEOUT_MS = 30_000

/**
 * What the agent is woken with. A template, not a relay: nothing the ping
 * carried appears here beyond the two validated identifiers.
 */
export function wakePrompt(from: string, jobId: string): string {
  return [
    `[Callback: the delegation you handed to "${from}" (job "${jobId}") has settled.`,
    `Collect the outcome with ask_${from}_status (job_id "${jobId}") and carry on with`,
    `whatever that work was for. Nobody is at a screen.]`,
  ].join('\n')
}

/**
 * Asks the peer itself whether this job settled.
 *
 * `undefined` means "do not wake": the peer is unknown, unreachable, minting
 * credentials this path does not speak (an `auth` block), still running the
 * job, or has never heard of it. All one answer, because all warrant the same
 * silence — a door like this one explains itself to nobody.
 */
export async function verifySettled(
  server: McpServerConfig,
  from: string,
  jobId: string,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  // Static wiring only. A peer declared with an OAuth mint would need the
  // refresh dance this path deliberately does not carry — the fleet's
  // agent-to-agent doors are bearer-gated, and a peer that is not stays
  // poll-only.
  if (!server.url || server.auth) return false
  let body: unknown
  try {
    const response = await fetchImpl(server.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Streamable HTTP demands BOTH types in Accept even for a JSON
        // answer; without text/event-stream some servers refuse with 406.
        accept: 'application/json, text/event-stream',
        ...(server.headers ?? {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: `ask_${from}_status`, arguments: { job_id: jobId } },
      }),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    })
    if (!response.ok) return false
    body = await response.json()
  } catch {
    return false
  }

  const result = (body as { result?: { content?: { text?: unknown }[] } })?.result
  const text = result?.content?.[0]?.text
  if (typeof text !== 'string') return false
  // "Settled" is everything but the two states that say otherwise. A failed
  // job wakes the agent too: "your delegation broke" is exactly as actionable
  // as "your delegation finished".
  return !text.includes('still running') && !text.includes('no such job')
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
