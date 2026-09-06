/**
 * Sign-in state for the MCP servers that are their own authorization server.
 *
 * The server side keeps one client registration per server and one rotating
 * refresh key per person; this module is the browser's half — who am I
 * connected to, and the window that starts a connection. Shared between the
 * chat's card and the settings tile so the two can never disagree about what
 * "connected" means.
 */

import { useEffect, useState } from 'react'

export interface McpConnection {
  readonly name: string
  readonly connected: boolean
}

/**
 * Which sign-in servers a thread is ASKING for.
 *
 * Demand-driven, as decided: the card appears when a tool call actually
 * failed against a server the current person never connected to — the need
 * and its remedy in the same place, at the same moment. A server nobody's
 * turn has touched raises no card, however disconnected it is.
 */
export function signInAsks(
  messages: readonly { tools?: readonly { name: string; ok?: boolean | undefined }[] }[],
  connections: readonly McpConnection[] | undefined,
): readonly string[] {
  if (!connections?.length) return []
  const disconnected = new Map(
    connections.filter((entry) => !entry.connected).map((entry) => [entry.name, true]),
  )
  if (disconnected.size === 0) return []

  const asked = new Set<string>()
  for (const message of messages) {
    for (const tool of message.tools ?? []) {
      if (tool.ok !== false) continue
      // Matched against the KNOWN names, never parsed out of the tool name:
      // a turn calls `mcp__<server>__<tool>`, and both halves may contain
      // underscores — only the full declared name plus its separator is
      // trustworthy as a prefix.
      for (const name of disconnected.keys()) {
        if (tool.name.startsWith(`mcp__${name}__`)) asked.add(name)
      }
    }
  }
  return [...asked]
}

/**
 * This person's connections, refreshed when the tab regains focus — which is
 * exactly what happens when the sign-in window closes behind a passkey.
 */
export function useConnections(
  fetchImpl: typeof fetch,
  enabled = true,
): readonly McpConnection[] | undefined {
  const [connections, setConnections] = useState<readonly McpConnection[] | undefined>()

  useEffect(() => {
    if (!enabled) return
    let live = true
    const load = async () => {
      try {
        const response = await fetchImpl('/api/mcp/connections')
        if (!response.ok) return
        const body = (await response.json()) as { connections?: readonly McpConnection[] }
        if (live) setConnections(body.connections ?? [])
      } catch {
        /* no state, no card — the tools still fail visibly in the trace */
      }
    }
    void load()
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => {
      live = false
      window.removeEventListener('focus', onFocus)
    }
  }, [fetchImpl, enabled])

  return connections
}

/** Opens the server's authorization flow in a window of its own. */
export function beginSignIn(name: string): void {
  window.open(
    `/api/mcp/signin/${encodeURIComponent(name)}`,
    '_blank',
    'width=520,height=720,noopener',
  )
}
