/** The document baseline, revision and the 1.6 s save lifecycle. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { parse, readFrontmatter, serialize, writeFrontmatter } from '@antorfr/adestia-content'
import { jsonInit, requestJson } from '../app/request.js'
import type { PageDocument } from './Editor.js'

export type SaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved'; readonly normalized: boolean }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'rejected'; readonly diagnostics: readonly { message: string }[] }
  | { readonly kind: 'failed'; readonly message: string }

export async function savePage(
  page: PageDocument,
  markdown: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ state: SaveState; revision?: string }> {
  const qualifier = page.store ? `?store=${encodeURIComponent(page.store)}` : ''
  const response = await requestJson<{ revision: string; normalized: boolean }>(
    fetchImpl,
    `/api/pages/${page.path}${qualifier}`,
    jsonInit('PUT', { markdown, revision: page.revision }),
  )

  if (response.ok) {
    return { state: { kind: 'saved', normalized: response.data.normalized }, revision: response.data.revision }
  }
  if (response.status === 409) return { state: { kind: 'conflict' } }
  if (response.status === 422) {
    const body = response.data as { diagnostics: readonly { message: string }[] }
    return { state: { kind: 'rejected', diagnostics: body.diagnostics } }
  }
  const said = (response.data as { error?: unknown } | null | undefined)?.error
  return {
    state: {
      kind: 'failed',
      message: typeof said === 'string' && said !== '' ? said : response.status === 0 ? response.error : `save failed (${response.status})`,
    },
  }
}

/**
 * The page's own `title:`, or none.
 *
 * Through the content engine's reader rather than a regex of this file's own:
 * there was a second frontmatter writer here, and the two did not agree — the
 * regex one wrote `title: Servante: le retour` verbatim, which is not YAML
 * and which nothing in the pipeline would have reported.
 */
function titleOf(markdown: string): string {
  const value = readFrontmatter(markdown).fields['title']
  return typeof value === 'string' ? value : ''
}

/** A page as the server would store it — see `dirty`. */
function stored(markdown: string): string {
  try {
    return serialize(parse(markdown))
  } catch {
    return markdown
  }
}

export function useAutosave(
  page: PageDocument,
  fetchImpl: typeof fetch,
  titleField: boolean,
  onSaved?: (revision: string) => void,
) {
  /**
   * What the editor is shown, which is not always what is on disk.
   *
   * The page is round-tripped through the shared pipeline before the editor
   * sees it, and what comes back is also the BASELINE for `dirty`.
   *
   * This began as a bridge: Milkdown runs the parser WITHOUT its transformers,
   * so a page in the predecessor's `{% %}` spelling drew literal braces in the
   * editor and a callout everywhere else. That spelling is gone (2026-09-05)
   * and the grammar has no transformer left, so the two agree on their own
   * today. What the round trip still does is normalise: a file whose markdown
   * is merely UNUSUAL — spacing a human chose, a list marker the house style
   * does not use — would otherwise light up Save the moment it was opened,
   * inviting a rewrite nobody asked for. Reading still converts nothing on
   * disk; only an edit does.
   */
  const shown = useMemo(() => {
    try {
      return serialize(parse(page.markdown))
    } catch {
      // A page the pipeline cannot round-trip is shown exactly as written,
      // which is worse-looking and strictly safer than showing nothing.
      return page.markdown
    }
  }, [page.markdown])

  /**
   * The BODY, which is what the mounted editor owns and reports.
   *
   * Held apart from the title because there are two writers on one document
   * and they must not fight over it: Milkdown carries the frontmatter as an
   * opaque node captured when it mounted, so a title typed in the field above
   * would be overwritten by the editor's very next keystroke. The page that
   * gets saved is composed from both, every render.
   */
  const [body, setBody] = useState(shown)
  const [title, setTitle] = useState(() => titleOf(shown))
  const markdown = useMemo(
    () => (titleField ? writeFrontmatter(body, { title }) : body),
    [body, title, titleField],
  )
  /**
   * What is on the server, as far as this editor knows — and what `Done`
   * restores.
   *
   * NOT `shown`, which is the document as it was FETCHED and never moves
   * again: a plugin's embedded editor re-reads only when its path changes, so
   * after a save `page.markdown` still holds the text from before the edit.
   * Comparing against it made `Done` revert a change the server had already
   * accepted — the file was correct and the screen was not, until a reload.
   * A new journal entry is frontmatter and an empty body, so the revert looked
   * like the entry had come back blank.
   *
   * It advances on every save the server takes, which is exactly what it
   * means: the last text both hands agree on.
   */
  const [saved, setSaved] = useState(shown)
  const [revision, setRevision] = useState(page.revision)
  const [status, setStatus] = useState<SaveState>({ kind: 'idle' })
  /*
   * Changed means changed ON DISK — in the house style the server writes
   * anyway. Milkdown's serializer does not spell everything the pipeline's
   * way, so opening a page and touching nothing used to count as an edit:
   * the page saved itself a second later and said "tidied to house style".
   * The texts are compared as they would be stored, identical ones first.
   */
  const dirty = useMemo(
    () => markdown !== saved && stored(markdown) !== stored(saved),
    [markdown, saved],
  )

  useEffect(() => {
    setBody(shown)
    setTitle(titleOf(shown))
    setSaved(shown)
    setRevision(page.revision)
    setStatus({ kind: 'idle' })
  }, [shown, page.path, page.revision])

  const save = useCallback(async () => {
    setStatus({ kind: 'saving' })
    const result = await savePage({ ...page, revision }, markdown, fetchImpl)
    if (result.revision) {
      setRevision(result.revision)
      // The baseline moves with the file: what was just written is what
      // `Done` restores, and what `dirty` is measured against.
      setSaved(markdown)
    }
    setStatus(result.state)
    // Only on a save the server took: a caller reloading its list on a 409
    // would replace what the person is still holding with what beat them to
    // the file.
    if (result.revision) onSaved?.(result.revision)
    return result.state
  }, [fetchImpl, markdown, onSaved, page, revision])

  /**
   * Saving on its own, a beat after the typing stops.
   *
   * This is what makes ONE button honest. Two — `Save` beside `Done` — asked
   * the person to know which of them kept their work, and the answer used to
   * be neither obvious nor even true. With nothing left to lose by not
   * pressing anything, `Done` can simply mean "I have finished".
   *
   * It STOPS on a refusal and does not come back until the page is reopened.
   * A 409 means the agent wrote underneath; retrying every two seconds would
   * be a loop that neither hand can win, hammering the file while the message
   * telling somebody to reconcile scrolls past. The explicit Done still tries,
   * so nobody is stuck.
   */
  const held = status.kind === 'conflict' || status.kind === 'rejected'
  useEffect(() => {
    if (!dirty || !page.editable || held || status.kind === 'saving') return undefined
    const timer = setTimeout(() => void save(), 1600)
    return () => clearTimeout(timer)
  }, [dirty, held, page.editable, save, status.kind])

  return { shown, setBody, title, setTitle, markdown, saved, status, dirty, save, revision }
}
