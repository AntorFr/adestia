/**
 * The state behind the MCP screen: the wired servers, the declaration being
 * typed, and the three things done with it (add, save, remove).
 */

import { useCallback, useEffect, useState } from 'react'

import type { McpServerView } from '@antorfr/adestia-schemas'

import { jsonInit, requestJson } from '../request.js'
import { useRequest } from '../useRequest.js'
import { TEMPLATE } from './health.js'

export type Save =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved' }
  | { readonly kind: 'failed'; readonly message: string }

export function useDeclaration(
  open: string | undefined,
  onOpen: (name: string | undefined) => void,
  fetchImpl: typeof fetch,
  t: (key: string) => string,
) {
  // The first read carries the loading and failure states (AD-24). Later reads
  // (after Save or Remove) land in `fresh` and never bring the loading back.
  const first = useRequest<{ servers?: readonly McpServerView[] }>(fetchImpl, '/api/mcp/servers', { t })
  const [fresh, setFresh] = useState<readonly McpServerView[] | undefined>()
  const views = fresh ?? (first.status === 'ready' ? (first.data?.servers ?? []) : undefined)
  const status = fresh !== undefined ? 'ready' : first.status
  /**
   * The new-server form, which is deliberately NOT in the address.
   *
   * Every other state of this product is: the URL is the navigation, all of
   * it. A blank form is not a place — nothing links to it, a reload of it
   * would restore an empty box under a name that means nothing — and giving
   * it a segment would also mean reserving a name a real server could take.
   */
  const [adding, setAdding] = useState(false)
  const [draft, setDraftText] = useState('')
  const [onServer, setOnServer] = useState('')
  const [save, setSave] = useState<Save>({ kind: 'idle' })

  const refresh = useCallback(async () => {
    const result = await requestJson<{ servers?: readonly McpServerView[] }>(
      fetchImpl,
      '/api/mcp/servers',
      undefined,
      t,
    )
    if (result.ok) setFresh(result.data?.servers ?? [])
  }, [fetchImpl, t])

  // A new transport starts over: the first read runs again and the held list goes.
  useEffect(() => { setFresh(undefined) }, [fetchImpl])

  const shown = views?.find((view) => view.name === open)

  // Re-seeded whenever the opened server changes, never on every render: the
  // textarea is what somebody is typing into, and rebuilding it from the
  // fetched declaration would erase their edit at the next poll.
  useEffect(() => {
    if (adding) return
    const text = shown ? `${JSON.stringify(shown.config, null, 2)}\n` : ''
    setDraftText(text)
    setOnServer(text)
    setSave({ kind: 'idle' })
  }, [shown, adding])

  const setDraft = useCallback((text: string) => {
    setDraftText(text)
    setSave((now) => (now.kind === 'idle' ? now : { kind: 'idle' }))
  }, [])

  const beginAdding = useCallback(() => {
    onOpen(undefined)
    setAdding(true)
    setDraftText(`${TEMPLATE}\n`)
    setOnServer('')
    setSave({ kind: 'idle' })
  }, [onOpen])

  const commit = useCallback(async () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(draft)
    } catch {
      // Caught here rather than posted: a JSON error is about what is on this
      // screen, and a round trip would answer it with a 400 that says less.
      setSave({ kind: 'failed', message: t('The declaration is not valid JSON.') })
      return
    }
    setSave({ kind: 'saving' })
    const result = await requestJson<{ server?: { name?: string } }>(
      fetchImpl,
      adding ? '/api/mcp/servers' : `/api/mcp/servers/${encodeURIComponent(open ?? '')}`,
      jsonInit(adding ? 'POST' : 'PUT', parsed),
      t,
    )
    if (!result.ok) {
      setSave({ kind: 'failed', message: result.error })
      return
    }
    setOnServer(draft)
    setSave({ kind: 'saved' })
    setAdding(false)
    await refresh()
    // The name may have changed under us — a rename is a legitimate edit —
    // so the address follows what came back rather than what was typed.
    if (result.data?.server?.name) onOpen(result.data.server.name)
  }, [adding, draft, fetchImpl, onOpen, open, refresh, t])

  const remove = useCallback(async () => {
    if (!open) return
    const result = await requestJson(
      fetchImpl,
      `/api/mcp/servers/${encodeURIComponent(open)}`,
      jsonInit('DELETE'),
      t,
    )
    if (!result.ok) {
      setSave({ kind: 'failed', message: result.error })
      return
    }
    onOpen(undefined)
    await refresh()
  }, [fetchImpl, onOpen, open, refresh, t])

  return {
    views, status, error: first.error, httpStatus: first.httpStatus, retry: first.retry, shown, adding, draft, setDraft, dirty: draft !== onServer, save, beginAdding, commit, remove }
}
