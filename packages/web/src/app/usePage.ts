/**
 * The page the address names, loaded — and the editor with it, on demand.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import type { PageDocument } from '../editor/Editor.js'
import { sectionRoute } from './owners.js'
import { requestJson } from './request.js'

export type EditorMount = (
  element: HTMLElement,
  markdown: string,
  onChange: (markdown: string) => void,
  // What blocks drawn in the editor need of the page — see `blockview.tsx`.
  env?: import('../editor/blockview.js').EditorEnv,
) => () => void

/** What the side read found while the editor was open (AD-21). */
export type Incoming = { readonly page: PageDocument } | { readonly gone: true }

/** The last batch of `pages-changed` — `seq` 0 until one arrives (see `useInstance`). */
export interface PageChanges {
  readonly seq: number
  readonly paths: readonly string[]
}

const NO_CHANGES: PageChanges = { seq: 0, paths: [] }

export function usePage({
  pagePath,
  pageStore,
  fetchImpl,
  pageChanges = NO_CHANGES,
  editing: editingProp,
}: {
  readonly pagePath: string | undefined
  readonly pageStore: string | undefined
  readonly fetchImpl: typeof fetch
  /** The change feed's last batch; the open page is read again when it names it. */
  readonly pageChanges?: PageChanges
  /** Whether the editor is open, when the caller keeps that itself; else `onEditing` tells. */
  readonly editing?: boolean
}) {
  /** The section being browsed, if any. Home when undefined. */
  const [page, setPage] = useState<PageDocument | undefined>()
  /** Why the last page would not load — so the shell says it instead of nothing. */
  const [problem, setProblem] = useState<{ path: string; status: number } | undefined>()
  /** Re-reads the same address: bumped by `retry`. */
  const [attempt, setAttempt] = useState(0)
  /**
   * Which request last answered. Loading is DERIVED from it — the request the
   * address asks for has not answered — so the very first render of a page
   * address is already loading, with no frame of the home in between.
   */
  const [settled, setSettled] = useState<string | undefined>()
  const key = pagePath === undefined ? undefined : `${pagePath}\n${pageStore ?? ''}\n${attempt}`
  const loading = key !== undefined && settled !== key
  const pageProblem = !loading ? problem : undefined
  const retry = useCallback(() => setAttempt((current) => current + 1), [])
  const [editingState, setEditingState] = useState(false)
  const editing = editingProp ?? editingState
  /** Announced by the editor (`Editor`'s `onEditing`). */
  const onEditing = useCallback((open: boolean) => setEditingState(open), [])
  /** The page as the disk now has it, read aside while the editor is open. */
  const [incoming, setIncoming] = useState<Incoming | undefined>()
  /** Read at answer time by the feed's reads: what is true NOW, not when they left. */
  const live = useRef({ address: '', editing: false, held: false })
  live.current = {
    address: pagePath === undefined ? '' : `${pagePath}\n${pageStore ?? ''}`,
    editing,
    held: page !== undefined,
  }
  /** Which feed read is the latest; an older answer arriving late is dropped. */
  const feedRead = useRef(0)
  /**
   * The editor is loaded on demand: ProseMirror and Milkdown weigh more than
   * the entire rest of the shell, and someone who only wants to chat should
   * not download an editor to do it. Same discipline the plugin loader
   * applies to a heavy chunk.
   */
  const [mount, setMount] = useState<EditorMount | undefined>()

  /**
   * Loads whatever page the route names.
   *
   * Driven by the URL rather than by the click, so a bookmark, a shared link
   * and the Back button all land on the same screen as the card that opened
   * it. The editor module is fetched ALONGSIDE the page: it is the heaviest
   * thing the shell can load, and most sessions never open one.
   */
  useEffect(() => {
    feedRead.current += 1
    setIncoming(undefined)
    setEditingState(false)
    if (!pagePath) {
      setPage(undefined)
      setProblem(undefined)
      setSettled(undefined)
      return undefined
    }
    let cancelled = false
    void (async () => {
      const [response, editor] = await Promise.all([
        requestJson<PageDocument>(
          fetchImpl,
          `/api/pages/${pagePath}${pageStore ? `?store=${encodeURIComponent(pageStore)}` : ''}`,
        ),
        import('../editor/milkdown.js'),
      ])
      if (cancelled) return
      /**
       * The one address this product cannot answer.
       *
       * Several shared circles carry the name and mine does not: nothing here
       * has a claim to arbitrate with, so the server refuses rather than
       * picking. The reader goes UP — a real navigation, the address bar
       * changes — to the folder, where both cards are drawn side by side and
       * can be told apart before one is opened.
       */
      if (response.status === 409) {
        const folder = pagePath.split('/').slice(0, -1).join('/')
        location.hash = folder ? sectionRoute(folder) : ''
        setSettled(key)
        return
      }
      if (!response.ok || response.data === undefined) {
        // Said, not swallowed. A 404, a 401 and a 502 used to leave the screen
        // exactly as it was — which is the home — and there was no way for a
        // reader to tell a mistyped address from an expired session.
        setPage(undefined)
        setProblem({ path: pagePath, status: response.status })
        setSettled(key)
        return
      }
      setProblem(undefined)
      // Stored via a thunk: passing a function to setState directly would
      // have React call it as an updater.
      setMount(() => editor.mountMilkdown)
      setPage(response.data)
      setSettled(key)
    })()
    return () => {
      cancelled = true
    }
    // `key` is a function of the three others and `attempt`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagePath, pageStore, fetchImpl, attempt])

  /**
   * The feed names the open page: read it again, beside the screen.
   *
   * Reading, the answer replaces `page` with no loading state; editing, it
   * waits in `incoming` — the editor's text is never replaced from here.
   * A failure other than 404 changes nothing: the next batch retries.
   */
  useEffect(() => {
    if (pageChanges.seq === 0 || !pagePath || !pageChanges.paths.includes(pagePath)) return
    if (!live.current.held) return
    const id = ++feedRead.current
    const address = live.current.address
    void (async () => {
      const response = await requestJson<PageDocument>(
        fetchImpl,
        `/api/pages/${pagePath}${pageStore ? `?store=${encodeURIComponent(pageStore)}` : ''}`,
      )
      if (id !== feedRead.current || address !== live.current.address) return
      const gone = !response.ok && response.status === 404
      const found = response.ok && response.data !== undefined ? response.data : undefined
      if (!gone && found === undefined) return
      if (live.current.editing) {
        setIncoming(found ? { page: found } : { gone: true })
      } else if (found) {
        setPage(found)
      } else {
        setPage(undefined)
        setProblem({ path: pagePath, status: 404 })
      }
    })()
    // Fires once per batch: `seq` is the signal, the rest is read from the latest render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageChanges.seq])

  /** Puts what `incoming` holds on screen: the page, or E-8 when it is gone. */
  const apply = useCallback((waiting: Incoming) => {
    setIncoming(undefined)
    if ('gone' in waiting) {
      setPage(undefined)
      setProblem((current) => ({ path: current?.path ?? pagePath ?? '', status: 404 }))
      setEditingState(false)
    } else {
      setPage(waiting.page)
    }
  }, [pagePath])
  const reload = useCallback(() => {
    if (incoming) apply(incoming)
  }, [incoming, apply])

  // The editor closing (Done) with something waiting: the page is followed again.
  useEffect(() => {
    if (!editing && incoming) apply(incoming)
  }, [editing, incoming, apply])

  return { page, pageProblem, loading, retry, mount, incoming, reload, onEditing }
}
