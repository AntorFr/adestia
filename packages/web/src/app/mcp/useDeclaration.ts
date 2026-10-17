/**
 * The state behind the MCP screen: the wired servers, the declaration being
 * typed, and the three things done with it (add, save, remove).
 */

import { useCallback, useEffect, useState } from 'react'

import type { McpServerView } from '@antorfr/adestia-schemas'

import { jsonInit, requestJson } from '../request.js'
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
  const [views, setViews] = useState<readonly McpServerView[] | undefined>()
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
    if (result.ok) setViews(result.data?.servers ?? [])
  }, [fetchImpl, t])

  useEffect(() => {
    void refresh()
    // `t` is a new function on every render of a caller that inlines it;
    // refreshing on each would poll. The list is fetched when the transport changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchImpl])

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

  return { views, shown, adding, draft, setDraft, dirty: draft !== onServer, save, beginAdding, commit, remove }
}
