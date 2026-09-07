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
 * Which sign-in cards a thread should raise.
 *
 * This shipped as "a tool call failed against a disconnected server" — a
 * trigger that could never fire: a disconnected `signIn` server is OMITTED
 * from the turn by design, so no tool of it exists to fail. Found in
 * production, by the agent saying "I have no such tool" while the card
 * stayed down.
 *
 * So the trigger is the STATE, scoped to where it matters: a thread the
 * person is actually talking in (the agent has answered, or is answering)
 * while a sign-in server has no key for them. That puts the card under the
 * very reply where the agent says it cannot act — as close to "at the first
 * demand" as an omitted server allows — and a dismissal keeps it from
 * nagging the threads that never talk about that world. Once connected, the
 * state clears and the card is gone everywhere for good.
 */
export function signInAsks(
  engaged: boolean,
  connections: readonly McpConnection[] | undefined,
  dismissed: ReadonlySet<string> = new Set(),
): readonly string[] {
  if (!engaged || !connections?.length) return []
  return connections
    .filter((entry) => !entry.connected && !dismissed.has(entry.name))
    .map((entry) => entry.name)
}

/** Where a dismissal lives: this browser, like the read marks and the tabs. */
const DISMISSED_KEY = 'adestia.connect.hidden'

type Store = Pick<Storage, 'getItem' | 'setItem'>

/** Same guard as the tab store's: private windows and blocked site data
    throw on ACCESS, and tests run with no `window` storage at all. */
function fallback(): Store | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export function loadDismissed(storage: Store | undefined = fallback()): ReadonlySet<string> {
  try {
    const raw = storage?.getItem(DISMISSED_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function dismissSignIn(
  name: string,
  storage: Store | undefined = fallback(),
): ReadonlySet<string> {
  const next = new Set(loadDismissed(storage))
  next.add(name)
  try {
    storage?.setItem(DISMISSED_KEY, JSON.stringify([...next]))
  } catch {
    /* remembered for this page's lifetime only */
  }
  return next
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
