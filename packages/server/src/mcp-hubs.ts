/**
 * A HUB: one origin that carries several MCP servers, enumerated at boot.
 *
 * Declaring a dozen addons by hand is a maintenance trap, not a safety
 * measure: the day the hub gains one, every instance that wants it needs a
 * config edit nobody will remember to make. So an operator declares the HUB —
 * its URL and the identity to present — and the addons come from the hub
 * itself.
 *
 * That still respects "declared beats guessed". What is declared moves up a
 * level: you state which hub you trust and that you want what it carries. What
 * it carries is the hub's business, and the instance says out loud at boot
 * which servers it mounted, so the answer is visible rather than implied.
 *
 * ENUMERATED ONCE, at startup. Not per turn: an agent's toolset changing
 * mid-conversation is a conversation whose earlier answers no longer make
 * sense, and a hub that gained an addon is a restart away either way.
 *
 * The shape is a convention, not a standard — MCP has no notion of a hub. An
 * origin qualifies if `GET /` answers `{"addons": {"<name>": {"state": "..."}}}`
 * and serves each addon at `/<name>/`.
 */

import type { McpServer, McpTokens } from '@antorfr/golem-drivers'

import type { McpHubConfig } from './config.js'
import type { DiscoveryProblem } from './extensions.js'

/** States worth mounting. Anything else is a server that would only fail. */
const USABLE = new Set(['ok', 'degraded'])

interface HubIndex {
  readonly addons?: Readonly<Record<string, { readonly state?: string; readonly detail?: string }>>
}

/**
 * Asks one hub what it carries.
 *
 * Queried WITH the identity rather than through an unauthenticated probe: it
 * proves at boot that the credentials work, in one loud line, instead of
 * letting the first tool call discover it inside a conversation.
 */
export async function discoverHub(
  hub: McpHubConfig,
  tokens: McpTokens,
  fetchImpl: typeof fetch = fetch,
): Promise<{ servers: readonly McpServer[]; problems: readonly DiscoveryProblem[] }> {
  const problems: DiscoveryProblem[] = []
  const fail = (reason: string) => ({
    servers: [] as readonly McpServer[],
    problems: [{ id: `mcp:${hub.name}`, severity: 'degraded' as const, reason }],
  })

  const token = await tokens.for(hub.auth)
  if (!token) return fail(`could not obtain a token from ${hub.auth.tokenUrl} — no addon is wired`)

  const base = hub.url.replace(/\/+$/, '')
  let index: HubIndex
  try {
    const response = await fetchImpl(`${base}/`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return fail(`answered ${response.status} when asked what it carries`)
    index = (await response.json()) as HubIndex
  } catch (error) {
    return fail(`could not be reached: ${(error as Error).message}`)
  }

  const addons = index.addons
  if (!addons || typeof addons !== 'object') {
    return fail('did not answer with an addon list — is this a hub?')
  }

  const servers: McpServer[] = []
  for (const [addon, entry] of Object.entries(addons).sort(([a], [b]) => a.localeCompare(b))) {
    if (hub.exclude?.includes(addon)) continue
    const state = entry?.state ?? 'unknown'
    if (!USABLE.has(state)) {
      // Named rather than skipped in silence: an addon the hub reports as
      // broken is exactly what somebody wants to know before wondering why a
      // tool is missing.
      problems.push({
        id: `mcp:${hub.name}`,
        severity: 'degraded',
        reason: `addon "${addon}" is ${state} on the hub — not wired`,
      })
      continue
    }
    servers.push({
      // Prefixed, because two hubs may both carry a `maps`, and because the
      // name becomes the prefix of every tool the agent sees.
      name: `${hub.name}-${addon}`,
      // The trailing slash is not cosmetic: without it these endpoints answer
      // 307 to the slashed form — a redirect that can also downgrade the
      // scheme, which is a bad thing to hand a bearer token to.
      url: `${base}/${addon}/`,
      auth: hub.auth,
    })
  }

  return { servers, problems }
}

/** Every hub this instance declares, expanded into servers. */
export async function discoverHubs(
  hubs: readonly McpHubConfig[],
  tokens: McpTokens,
  fetchImpl: typeof fetch = fetch,
): Promise<{ servers: readonly McpServer[]; problems: readonly DiscoveryProblem[] }> {
  const servers: McpServer[] = []
  const problems: DiscoveryProblem[] = []
  for (const hub of hubs) {
    const found = await discoverHub(hub, tokens, fetchImpl)
    servers.push(...found.servers)
    problems.push(...found.problems)
  }
  return { servers, problems }
}
