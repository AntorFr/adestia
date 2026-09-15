/**
 * The page the address names, loaded — and the editor with it, on demand.
 */

import { useEffect, useState } from 'react'

import type { PageDocument } from '../editor/Editor.js'
import { sectionRoute } from './owners.js'

export type EditorMount = (
  element: HTMLElement,
  markdown: string,
  onChange: (markdown: string) => void,
) => () => void

export function usePage({
  pagePath,
  pageStore,
  fetchImpl,
}: {
  readonly pagePath: string | undefined
  readonly pageStore: string | undefined
  readonly fetchImpl: typeof fetch
}) {
  /** The section being browsed, if any. Home when undefined. */
  const [page, setPage] = useState<PageDocument | undefined>()
  /** Why the last page would not load — so the shell says it instead of nothing. */
  const [pageProblem, setPageProblem] = useState<{ path: string; status: number } | undefined>()
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
    if (!pagePath) {
      setPage(undefined)
      setPageProblem(undefined)
      return undefined
    }
    let cancelled = false
    void (async () => {
      const [response, editor] = await Promise.all([
        fetchImpl(`/api/pages/${pagePath}${pageStore ? `?store=${encodeURIComponent(pageStore)}` : ''}`),
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
        return
      }
      if (!response.ok) {
        // Said, not swallowed. A 404, a 401 and a 502 used to leave the screen
        // exactly as it was — which is the home — and there was no way for a
        // reader to tell a mistyped address from an expired session.
        setPage(undefined)
        setPageProblem({ path: pagePath, status: response.status })
        return
      }
      setPageProblem(undefined)
      // Stored via a thunk: passing a function to setState directly would
      // have React call it as an updater.
      setMount(() => editor.mountMilkdown)
      setPage((await response.json()) as PageDocument)
    })()
    return () => {
      cancelled = true
    }
  }, [pagePath, pageStore, fetchImpl])

  return { page, pageProblem, mount }
}
