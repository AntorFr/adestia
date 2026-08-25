/**
 * The page editor — the second hand that writes.
 *
 * What makes this safe to put next to an agent that edits the same files:
 *
 * - it round-trips through the SAME remark grammar as the renderer and the
 *   server, so a save cannot change what a page means;
 * - it carries the revision it opened, and the server refuses a save if the
 *   agent wrote in the meantime — no silent overwrite of either author;
 * - a page that breaks the vocabulary opens read-only with its diagnostics,
 *   because refusing loses the file and rewriting loses the content.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { parse, serialize } from '@antorfr/golem-content'

import { Attachments } from './Attachments.js'
import { carriesFiles, fileDropMessage } from './filedrop.js'
import { Reader, type BlockComponents } from './Reader.js'

export interface PageDocument {
  readonly path: string
  readonly title: string
  readonly markdown: string
  readonly revision: string
  readonly editable: boolean
  readonly diagnostics: readonly { severity: string; message: string; line?: number }[]
}

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
  const response = await fetchImpl(`/api/pages/${page.path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ markdown, revision: page.revision }),
  })

  if (response.ok) {
    const body = (await response.json()) as { revision: string; normalized: boolean }
    return { state: { kind: 'saved', normalized: body.normalized }, revision: body.revision }
  }
  if (response.status === 409) return { state: { kind: 'conflict' } }
  if (response.status === 422) {
    const body = (await response.json()) as { diagnostics: readonly { message: string }[] }
    return { state: { kind: 'rejected', diagnostics: body.diagnostics } }
  }
  const body = (await response.json().catch(() => ({}))) as { error?: string }
  return { state: { kind: 'failed', message: body.error ?? `save failed (${response.status})` } }
}

export function Diagnostics({ items }: { items: PageDocument['diagnostics'] }) {
  if (items.length === 0) return null
  return (
    <ul className="golem-diagnostics">
      {items.map((item, index) => (
        <li key={index} className={`golem-diagnostics__item golem-diagnostics__item--${item.severity}`}>
          {item.line !== undefined && <span className="golem-diagnostics__line">line {item.line}</span>}
          {item.message}
        </li>
      ))}
    </ul>
  )
}

export function SaveStatus({ state }: { state: SaveState }) {
  switch (state.kind) {
    case 'idle':
      return null
    case 'saving':
      return <span className="golem-save">Saving…</span>
    case 'saved':
      return (
        <span className="golem-save golem-save--ok">
          {/* Said out loud, because a silent reformat looks like the editor
              mangled something the user did not touch. */}
          {state.normalized ? 'Saved, tidied to house style' : 'Saved'}
        </span>
      )
    case 'conflict':
      return (
        <span className="golem-save golem-save--warn">
          The agent changed this page. Reload to see its version.
        </span>
      )
    case 'rejected':
      return (
        <span className="golem-save golem-save--error">
          Not saved: {state.diagnostics[0]?.message ?? 'the page breaks the vocabulary'}
        </span>
      )
    case 'failed':
      return <span className="golem-save golem-save--error">{state.message}</span>
  }
}

export interface EditorProps {
  readonly page: PageDocument
  readonly fetchImpl?: typeof fetch
  /** Follows a wikilink to another page. */
  readonly openPage?: (path: string) => void
  /** The shell's translator; identity in English. */
  readonly t?: (key: string) => string
  /** The reader's language, for the sizes in the attachment strip. */
  readonly locale?: string
  /**
   * Hands dropped files to the chat: uploads them to the inbox, shows them in
   * the composer's tray. Absent — no chat on this screen — disables the drop
   * entirely rather than accepting a file nothing will carry.
   */
  readonly attach?: (files: readonly File[]) => Promise<void> | void
  /** Puts the filing request in the composer, unsent. */
  readonly compose?: (text: string) => void
  /**
   * Blocks the active plugins draw. Absent means the core's vocabulary only,
   * which is also what a test that mounts an Editor alone gets.
   */
  readonly blocks?: BlockComponents
  /** Injected in tests; the real one mounts Milkdown. */
  readonly mount?: (element: HTMLElement, markdown: string, onChange: (md: string) => void) => () => void
}

export function Editor({
  page,
  fetchImpl = fetch,
  mount,
  openPage,
  locale = 'en',
  attach,
  compose,
  blocks,
  t = (key) => key,
}: EditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const [dropping, setDropping] = useState(false)
  // Counted rather than toggled: dragging over a child fires `dragleave` on
  // the parent, and a boolean makes the overlay flicker on every word the
  // cursor crosses.
  const depth = useRef(0)

  /**
   * What the editor is shown, which is not always what is on disk.
   *
   * A page written by the shell this store is shared with carries `{% %}`
   * blocks. The grammar knows how to READ them, but Milkdown runs the parser
   * without its transformers — so the editor alone would show literal braces
   * where every other surface shows a callout. Round-tripping through the
   * shared pipeline here is what makes the two agree.
   *
   * It is also the BASELINE for `dirty`: comparing against the file on disk
   * would light up Save on the 51 pages that carry such a block, inviting a
   * rewrite nobody asked for. Reading converts nothing; only an edit does.
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
   * Reading by default.
   *
   * Opening a page to LOOK at it used to mount ProseMirror, its toolbars and
   * its drag handles over a document nobody had asked to change — which makes
   * every reader feel like they might break something. Writing is a decision
   * now, taken by a button.
   */
  const [editing, setEditing] = useState(false)
  const [markdown, setMarkdown] = useState(shown)
  const [revision, setRevision] = useState(page.revision)
  const [status, setStatus] = useState<SaveState>({ kind: 'idle' })
  const dirty = markdown !== shown

  useEffect(() => {
    setMarkdown(shown)
    setRevision(page.revision)
    setStatus({ kind: 'idle' })
  }, [shown, page.path, page.revision])

  useEffect(() => {
    if (!editing || !mount || !host.current || !page.editable) return undefined
    return mount(host.current, shown, setMarkdown)
  }, [editing, mount, page.editable, shown, page.path])

  // Leaving a page leaves its edit mode behind: arriving somewhere new in
  // writing posture is a posture nobody chose.
  useEffect(() => {
    setEditing(false)
  }, [page.path])

  /**
   * A file let go over the page.
   *
   * Only in reading posture: while editing, the surface belongs to the editor
   * and its own drag handling, and two things claiming one drop is how a
   * paragraph ends up somewhere nobody asked for.
   */
  const takesDrop = attach !== undefined && !editing

  const onDrop = useCallback(
    (files: readonly File[]) => {
      if (files.length === 0) return
      void (async () => {
        await attach?.(files)
        compose?.(fileDropMessage(page, t))
      })()
    },
    [attach, compose, page, t],
  )

  const save = useCallback(async () => {
    setStatus({ kind: 'saving' })
    const result = await savePage({ ...page, revision }, markdown, fetchImpl)
    if (result.revision) setRevision(result.revision)
    setStatus(result.state)
  }, [fetchImpl, markdown, page, revision])

  return (
    <section
      className={`golem-editor${dropping ? ' golem-editor--dropping' : ''}`}
      {...(takesDrop
        ? {
            onDragEnter: (event: React.DragEvent) => {
              if (!carriesFiles(event.dataTransfer)) return
              depth.current += 1
              setDropping(true)
            },
            onDragOver: (event: React.DragEvent) => {
              // Without this the browser navigates to the file instead, which
              // loses the page somebody was reading.
              if (carriesFiles(event.dataTransfer)) event.preventDefault()
            },
            onDragLeave: () => {
              depth.current = Math.max(0, depth.current - 1)
              if (depth.current === 0) setDropping(false)
            },
            onDrop: (event: React.DragEvent) => {
              if (!carriesFiles(event.dataTransfer)) return
              event.preventDefault()
              depth.current = 0
              setDropping(false)
              onDrop([...event.dataTransfer.files])
            },
          }
        : {})}
    >
      {dropping && (
        <div className="golem-editor__dropzone" role="status">
          {t('Drop files to attach them to this page')}
        </div>
      )}
      {/* No title here: the breadcrumb names the page and the document's own
          heading opens it. Three of the same words is two too many. */}
      <header className="golem-editor__header">
        <div className="golem-editor__actions">
          <SaveStatus state={status} />
          {page.editable && !editing && (
            <button type="button" className="golem-ib" onClick={() => setEditing(true)} title={t('Edit')}>
              ✎
            </button>
          )}
          {page.editable && editing && (
            <>
              <button
                type="button"
                className="golem-switch"
                onClick={() => {
                  // Abandoning restores what was shown, so a half-typed
                  // sentence never survives as a "dirty" page.
                  setMarkdown(shown)
                  setEditing(false)
                }}
              >
                {t('Done')}
              </button>
              <button
                type="button"
                className="golem-editor__save"
                onClick={() => void save()}
                disabled={!dirty || status.kind === 'saving'}
              >
                {t('Save')}
              </button>
            </>
          )}
        </div>
      </header>

      {!page.editable && (
        <p className="golem-editor__readonly" role="status">
          This page uses blocks Golem does not know, so it is open read-only.
          Fixing it is a change to the code, not to the file.
        </p>
      )}

      <Diagnostics items={page.diagnostics} />

      {/* A refused page shows its RAW source, not a rendering: its vocabulary
          is broken, the diagnostics above say where, and what somebody needs
          to see is exactly what is written — not our best guess at it. */}
      {!page.editable ? (
        <pre className="golem-editor__raw">{page.markdown}</pre>
      ) : editing ? (
        <div ref={host} className="golem-editor__surface" />
      ) : (
        <Reader
          markdown={markdown}
          path={page.path}
          {...(openPage ? { openPage } : {})}
          {...(blocks ? { blocks } : {})}
        />
      )}

      {/* Not while writing: the strip is what the page CARRIES, and a list of
          documents under a live editing surface is one more thing between the
          cursor and the text. */}
      {!editing && (
        <Attachments
          path={page.path}
          markdown={markdown}
          fetchImpl={fetchImpl}
          locale={locale}
          t={t}
        />
      )}
    </section>
  )
}
