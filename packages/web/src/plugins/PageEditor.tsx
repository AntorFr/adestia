/**
 * The shell's page editor, wrapped for a plugin to mount inside its own screen.
 *
 * This exists so that a plugin whose screen is made of pages — a journal, a
 * logbook, anything that shows several documents at once — does not have to
 * invent an editor. It gets the shell's: the same closed vocabulary, the same
 * revision handling against an agent that writes without warning, the same
 * refusal to save a page that breaks the grammar.
 *
 * Two things it adds to `Editor`, and both are about being EMBEDDED:
 *
 * - it fetches the page itself, because a plugin holding a list has paths, not
 *   documents, and making every plugin write the same fetch-and-narrow is how
 *   two of them end up disagreeing about what a 404 means;
 * - it loads Milkdown on demand, exactly as the page screen does. A journal
 *   with thirty entries imports the module once — the module system dedupes —
 *   and a reader who never clicks ✎ still pays for it, which is the same deal
 *   the shell already takes on `#/page/…` and not a new one.
 */

import { useEffect, useState, type ComponentType } from 'react'

import { Editor, type PageDocument } from '../editor/Editor.js'
import type { BlockComponents } from '../editor/Reader.js'

import type { PageEditorProps } from './contract.js'

type EditorMount = (
  element: HTMLElement,
  markdown: string,
  onChange: (markdown: string) => void,
) => () => void

/** What the shell knows and a plugin does not have to be told. */
export interface PageEditorHost {
  readonly locale: string
  readonly t: (key: string) => string
  readonly fetchImpl?: typeof fetch
  /** Follows a wikilink out of an embedded page. */
  readonly openPage?: (path: string) => void
  /**
   * The blocks the active plugins draw, READ when an entry renders.
   *
   * A function rather than a value because of when this is built: the editor
   * is handed to the loader before a single plugin has loaded, so a snapshot
   * taken here would always be empty. An embedded page carrying `{% %}` would
   * then show literal braces where the shell's own page screen shows the
   * block — the same page, two answers, depending on which screen opened it.
   */
  readonly blocks?: () => BlockComponents
  /** Injected in tests; the real one imports Milkdown. */
  readonly loadMount?: () => Promise<EditorMount>
}

export function makePageEditor(host: PageEditorHost): ComponentType<PageEditorProps> {
  const fetchImpl = host.fetchImpl ?? fetch
  const loadMount =
    host.loadMount ??
    (async () => (await import('../editor/milkdown.js')).mountMilkdown as EditorMount)

  return function PluginPageEditor({ path, attachments = false, onSaved }: PageEditorProps) {
    const [page, setPage] = useState<PageDocument | undefined>()
    const [mount, setMount] = useState<EditorMount | undefined>()
    const [error, setError] = useState<string | undefined>()

    useEffect(() => {
      let cancelled = false
      setPage(undefined)
      setError(undefined)
      void (async () => {
        try {
          // Settled rather than awaited together: an editor module that fails
          // to load costs writing, not reading, and a page nobody can read
          // because ProseMirror 404'd is the worse of the two failures.
          const response = await fetchImpl(`/api/pages/${path}`)
          if (!response.ok) throw new Error(`that page answered ${response.status}`)
          const document = (await response.json()) as PageDocument
          if (cancelled) return
          setPage(document)
          const mounter = await loadMount().catch(() => undefined)
          if (!cancelled && mounter) setMount(() => mounter)
        } catch (cause) {
          if (!cancelled) setError((cause as Error).message)
        }
      })()
      return () => {
        cancelled = true
      }
    }, [path])

    if (error) {
      return (
        <p className="demeura-embed__problem" role="status">
          {error}
        </p>
      )
    }
    if (!page) return <p className="demeura-embed__loading">{host.t('Loading…')}</p>

    return (
      <Editor
        page={page}
        fetchImpl={fetchImpl}
        locale={host.locale}
        t={host.t}
        attachments={attachments}
        {...(host.blocks ? { blocks: host.blocks() } : {})}
        {...(onSaved ? { onSaved: () => onSaved() } : {})}
        {...(host.openPage ? { openPage: host.openPage } : {})}
        {...(mount ? { mount } : {})}
      />
    )
  }
}
