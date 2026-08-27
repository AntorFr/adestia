/**
 * Talking to the conversation store from the browser.
 *
 * Kept apart from the components so the rules that matter — a thread is
 * created before a turn can join it, a failed load never blanks the thread
 * list — are testable without rendering anything.
 */

export interface ConversationMeta {
  readonly id: string
  readonly title: string
  readonly updatedAt: string
  readonly sessionId?: string
  /**
   * What the desk is doing for this thread right now, when anything.
   *
   * Computed by the server per request, never stored: 'running' feeds the
   * working dot, 'waiting' the one that says the engine is blocked on a
   * person. Absent means at rest — the honest default for a listing that
   * mostly shows finished conversations.
   */
  readonly turn?: 'running' | 'waiting'
}

export interface StoredMessage {
  readonly id: string
  readonly role: 'user' | 'agent'
  readonly text: string
  readonly at: string
  readonly tools?: readonly { name: string; target?: string; ok?: boolean }[]
  readonly stopped?: boolean
  readonly error?: string
  readonly usage?: { contextTokens?: number; outputTokens?: number }
}

export interface Conversation extends ConversationMeta {
  readonly messages: readonly StoredMessage[]
}

/**
 * Every call here degrades instead of throwing.
 *
 * History is a convenience: the chat works without it. A rejected promise on
 * the shell's boot path, on the other hand, takes the whole interface with it
 * — so a store that is down, slow or answering nonsense costs its feature and
 * nothing else.
 */
async function json<T>(
  fetchImpl: typeof fetch,
  url: string,
  init?: RequestInit,
): Promise<T | undefined> {
  try {
    const response = await fetchImpl(url, init)
    if (!response.ok) return undefined
    return (await response.json()) as T
  } catch {
    return undefined
  }
}

export async function listConversations(
  fetchImpl: typeof fetch = fetch,
): Promise<readonly ConversationMeta[]> {
  const body = await json<{ conversations: ConversationMeta[] }>(fetchImpl, '/api/conversations')
  return body?.conversations ?? []
}

export async function createConversation(
  fetchImpl: typeof fetch = fetch,
  title?: string,
): Promise<ConversationMeta | undefined> {
  const created = await json<ConversationMeta>(fetchImpl, '/api/conversations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(title ? { title } : {}),
  })
  // A body with no id is no conversation, whatever answered: an id-less meta
  // would become a tab and a list row keyed on undefined.
  return created?.id ? created : undefined
}

export async function renameConversation(
  id: string,
  title: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    return response.ok
  } catch {
    return false
  }
}

export async function readConversation(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Conversation | undefined> {
  return json<Conversation>(fetchImpl, `/api/conversations/${id}`)
}

export async function deleteConversation(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    return (await fetchImpl(`/api/conversations/${id}`, { method: 'DELETE' })).ok
  } catch {
    return false
  }
}

/** A thread's first words make a better name than "New conversation". */
export function titleFrom(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= 48 ? flat : `${flat.slice(0, 47)}…`
}

/**
 * Puts a thread away, or brings it back.
 *
 * Reversible on purpose: the only tool for tidying up used to be a delete
 * that took every word with it.
 */
export async function archiveConversation(
  fetchImpl: typeof fetch,
  id: string,
  archived = true,
): Promise<boolean> {
  try {
    const response = await fetchImpl(`/api/conversations/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ archived }),
    })
    return response.ok
  } catch {
    return false
  }
}
