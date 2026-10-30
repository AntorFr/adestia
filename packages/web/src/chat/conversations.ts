/**
 * Talking to the conversation store from the browser.
 *
 * Kept apart from the components so the rules that matter — a conversation is
 * created before a turn can join it, a failed load never blanks the conversation
 * list — are testable without rendering anything.
 */

// Declared once, with the other schemas, and imported as TYPES only — the
// compiler erases the import, so the bundle still carries no server code.
import type { Conversation, ConversationMeta, StoredMessage } from '@antorfr/adestia-schemas'

import { FALLBACK_KEY, jsonInit, requestJson, requestRaw } from '../app/request.js'

export type { Conversation, ConversationMeta, StoredMessage }

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
  const result = await requestJson<T>(fetchImpl, url, init)
  return result.ok ? result.data : undefined
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
  const created = await json<ConversationMeta>(
    fetchImpl,
    '/api/conversations',
    jsonInit('POST', title ? { title } : {}),
  )
  // A body with no id is no conversation, whatever answered: an id-less meta
  // would become a tab and a list row keyed on undefined.
  return created?.id ? created : undefined
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
  const result = await requestRaw(fetchImpl, `/api/conversations/${id}`, { method: 'DELETE' })
  return result.ok && result.response.ok
}

/** A conversation's first words make a better name than "New conversation". */
export function titleFrom(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= 48 ? flat : `${flat.slice(0, 47)}…`
}

/**
 * Puts a conversation away, or brings it back.
 *
 * Reversible on purpose: the only tool for tidying up used to be a delete
 * that took every word with it.
 */
export async function archiveConversation(
  fetchImpl: typeof fetch,
  id: string,
  archived = true,
): Promise<boolean> {
  const result = await requestRaw(
    fetchImpl,
    `/api/conversations/${encodeURIComponent(id)}/archive`,
    jsonInit('POST', { archived }),
  )
  return result.ok && result.response.ok
}

/** A read that says WHY it failed, for the screens that draw a failure (AD-24). */
export type ReadOutcome<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly status: number; readonly error: string }

function said(t: (key: string) => string) {
  return (key: string) => (key === FALLBACK_KEY ? t('Request failed (%n)') : key)
}

async function outcome<T>(
  fetchImpl: typeof fetch,
  url: string,
  t: (key: string) => string,
): Promise<ReadOutcome<T>> {
  const result = await requestJson<T>(fetchImpl, url, undefined, said(t))
  if (result.ok) return { ok: true, data: result.data }
  return {
    ok: false,
    status: result.status,
    error: result.status === 0 ? t('The server is not responding') : result.error,
  }
}

export function fetchConversations(
  fetchImpl: typeof fetch = fetch,
  t: (key: string) => string = (key) => key,
): Promise<ReadOutcome<{ conversations?: ConversationMeta[] }>> {
  return outcome(fetchImpl, '/api/conversations', t)
}

export function fetchConversation(
  id: string,
  fetchImpl: typeof fetch = fetch,
  t: (key: string) => string = (key) => key,
): Promise<ReadOutcome<Conversation>> {
  return outcome(fetchImpl, `/api/conversations/${id}`, t)
}
