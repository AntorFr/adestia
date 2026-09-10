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

import { parse, serialize, type Indexed } from '@antorfr/adestia-content'

import { Attachments } from './Attachments.js'
import { carriesFiles, fileDropMessage } from './filedrop.js'
import { PluginBoundary } from '../plugins/Boundary.js'
import { Reader, type BlockComponents, type LayoutComponents, type VocabularyContext } from './Reader.js'

export interface PageDocument {
  readonly path: string
  /**
   * Which store this copy came from — present only on an instance composing
   * more than one, and carried back on save.
   *
   * Without it, saving a card opened from a shared circle would land in the
   * default store: the server sends an existing page back to its own store,
   * but two circles can carry the SAME name, and then it is the one the bare
   * address resolves to that gets written. The reader would see their
   * correction on a card they were not editing, and the card they were
   * editing unchanged.
   */
  readonly store?: string
  readonly title: string
  readonly markdown: string
  /**
   * The page's frontmatter, as the server parsed it. Absent on a shell talking
   * to an older server, and on the fixtures of tests that predate it — which
   * is why every read of it tolerates nothing being there.
   */
  readonly fields?: Readonly<Record<string, unknown>>
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
  const qualifier = page.store ? `?store=${encodeURIComponent(page.store)}` : ''
  const response = await fetchImpl(`/api/pages/${page.path}${qualifier}`, {
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
    <ul className="adestia-diagnostics">
      {items.map((item, index) => (
        <li key={index} className={`adestia-diagnostics__item adestia-diagnostics__item--${item.severity}`}>
          {item.line !== undefined && <span className="adestia-diagnostics__line">line {item.line}</span>}
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
      return <span className="adestia-save">Saving…</span>
    case 'saved':
      return (
        <span className="adestia-save adestia-save--ok">
          {/* Said out loud, because a silent reformat looks like the editor
              mangled something the user did not touch. */}
          {state.normalized ? 'Saved, tidied to house style' : 'Saved'}
        </span>
      )
    case 'conflict':
      return (
        <span className="adestia-save adestia-save--warn">
          The agent changed this page. Reload to see its version.
        </span>
      )
    case 'rejected':
      return (
        <span className="adestia-save adestia-save--error">
          Not saved: {state.diagnostics[0]?.message ?? 'the page breaks the vocabulary'}
        </span>
      )
    case 'failed':
      return <span className="adestia-save adestia-save--error">{state.message}</span>
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
  /** Who owns this page's domain, and the features on — `from=` resolution. */
  readonly vocabulary?: VocabularyContext
  /**
   * Whole-page layouts the active plugins draw, keyed by frontmatter `type`.
   *
   * Reading posture only: a page whose type is claimed is DRAWN by its plugin
   * and still EDITED by the shell. That split is what keeps a document from
   * being stranded behind a screen — the ✎ opens the same markdown surface as
   * anywhere else, so a wrong date in a period's frontmatter is corrected on
   * the page itself rather than by hunting for the file.
   */
  readonly layouts?: LayoutComponents
  /** The instance's pages, forwarded so a `[[type#id]]` link finds its page. */
  readonly pages?: readonly Indexed[]
  /**
   * Draw the attachment strip under the page. On for the shell's own page
   * screen, where a page is the whole subject; a plugin embedding this inside
   * a list of items turns it off, because a strip of documents under every
   * item is furniture — and a request per item.
   */
  readonly attachments?: boolean
  /**
   * Open in WRITING posture rather than reading.
   *
   * For the one case reading-by-default gets wrong: a page that was just
   * created because somebody asked for it. Landing on an empty document with
   * a ✎ to press is asking twice for the same decision — they already pressed
   * `+`. Everywhere else the default stands, and it is the reason a reader
   * never feels they might break something.
   */
  readonly startEditing?: boolean
  /**
   * Told when this editor enters or leaves writing posture.
   *
   * For a caller that draws something ELSE about the same page — a journal
   * showing an entry's title beside the body. While the editor holds the
   * file, that caller must not write to it: two hands on one document is a
   * 409 on somebody's unsaved paragraph.
   */
  readonly onEditing?: (editing: boolean) => void
  /** Called after a save the server accepted, with the revision it returned. */
  readonly onSaved?: (revision: string) => void
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
  vocabulary,
  layouts,
  pages,
  attachments = true,
  startEditing = false,
  onEditing,
  onSaved,
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
   * Reading by default.
   *
   * Opening a page to LOOK at it used to mount ProseMirror, its toolbars and
   * its drag handles over a document nobody had asked to change — which makes
   * every reader feel like they might break something. Writing is a decision
   * now, taken by a button.
   */
  const [editing, setEditing] = useState(startEditing)
  const [markdown, setMarkdown] = useState(shown)
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
  const dirty = markdown !== saved

  useEffect(() => {
    setMarkdown(shown)
    setSaved(shown)
    setRevision(page.revision)
    setStatus({ kind: 'idle' })
  }, [shown, page.path, page.revision])

  useEffect(() => {
    if (!editing || !mount || !host.current || !page.editable) return undefined
    return mount(host.current, shown, setMarkdown)
  }, [editing, mount, page.editable, shown, page.path])

  /*
   * Announced on CHANGE, not on every render: the callback is written inline
   * by its caller, so a plain dependency on it would fire this on each pass
   * and put the caller in a loop of its own making.
   */
  const announced = useRef<boolean | undefined>(undefined)
  useEffect(() => {
    if (announced.current === editing) return
    announced.current = editing
    onEditing?.(editing)
  }, [editing, onEditing])

  // Leaving a page leaves its edit mode behind: arriving somewhere new in
  // writing posture is a posture nobody chose — unless the caller says this
  // page is one somebody just asked to write.
  useEffect(() => {
    setEditing(startEditing)
  }, [page.path, startEditing])

  /**
   * The layout this page's own `type` asks for, if a plugin draws it.
   *
   * A type nobody claims — or whose plugin is switched off — falls through to
   * the ordinary reader, which is the screen the page had before any of this.
   * Never a guess and never an error: a layout is an offer, and a page must
   * stay readable when nobody takes it up.
   */
  const type = page.fields?.['type']
  const Layout = typeof type === 'string' ? layouts?.[type] : undefined

  /**
   * A file let go over the page.
   *
   * Only in reading posture: while editing, the surface belongs to the editor
   * and its own drag handling, and two things claiming one drop is how a
   * paragraph ends up somewhere nobody asked for.
   *
   * And only where `attach` was handed over. The shell's own page screen
   * passes it; an editor EMBEDDED by a plugin currently does not, so a task
   * or a journal entry takes no drop while the same document does on
   * `#/page/…` — see `plugins/PageEditor.tsx`.
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
    if (result.revision) {
      setRevision(result.revision)
      // The baseline moves with the file: what was just written is what
      // `Done` must restore, and what `dirty` must be measured against.
      setSaved(markdown)
    }
    setStatus(result.state)
    // Only on a save the server took: a caller reloading its list on a 409
    // would replace what the person is still holding with what beat them to
    // the file.
    if (result.revision) onSaved?.(result.revision)
  }, [fetchImpl, markdown, onSaved, page, revision])

  return (
    <section
      className={`adestia-editor${dropping ? ' adestia-editor--dropping' : ''}`}
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
        <div className="adestia-editor__dropzone" role="status">
          {t('Drop files to attach them to this page')}
        </div>
      )}
      {/* No title here: the breadcrumb names the page and the document's own
          heading opens it. Three of the same words is two too many. */}
      <header className="adestia-editor__header">
        <div className="adestia-editor__actions">
          <SaveStatus state={status} />
          {page.editable && !editing && (
            <button type="button" className="adestia-ib" onClick={() => setEditing(true)} title={t('Edit')}>
              ✎
            </button>
          )}
          {page.editable && editing && (
            <>
              <button
                type="button"
                className="adestia-switch"
                onClick={() => {
                  // Abandoning restores the last text the server took — so a
                  // half-typed sentence never survives, and a SAVED one is
                  // never thrown away with it.
                  setMarkdown(saved)
                  setEditing(false)
                }}
              >
                {t('Done')}
              </button>
              <button
                type="button"
                className="adestia-editor__save"
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
        <p className="adestia-editor__readonly" role="status">
          This page uses blocks Adestia does not know, so it is open read-only.
          Fixing it is a change to the code, not to the file.
        </p>
      )}

      <Diagnostics items={page.diagnostics} />

      {/* A refused page shows its RAW source, not a rendering: its vocabulary
          is broken, the diagnostics above say where, and what somebody needs
          to see is exactly what is written — not our best guess at it. */}
      {!page.editable ? (
        <pre className="adestia-editor__raw">{page.markdown}</pre>
      ) : editing ? (
        <div ref={host} className="adestia-editor__surface" />
      ) : Layout ? (
        /* A page whose type a plugin claims is DRAWN by that plugin. Only the
           reading posture: the ✎ above still opens the markdown, which is what
           keeps the document reachable and the frontmatter correctable. */
        <PluginBoundary id={String(type)} what="layout">
          <Layout
            path={page.path}
            {...(page.store ? { store: page.store } : {})}
            fields={page.fields ?? {}}
            title={page.title}
            markdown={markdown}
            revision={page.revision}
            {...(openPage ? { openPage } : {})}
          >
            {/* The page's own body, for the layout to place. Rendered here so
                a plugin never has to know how this instance draws markdown. */}
            <Reader
              markdown={markdown}
              path={page.path}
              {...(page.store ? { store: page.store } : {})}
              {...(page.fields ? { fields: page.fields } : {})}
              {...(openPage ? { openPage } : {})}
              {...(blocks ? { blocks } : {})}
          {...(vocabulary ? { vocabulary } : {})}
              {...(vocabulary ? { vocabulary } : {})}
              {...(pages ? { pages } : {})}
            />
          </Layout>
        </PluginBoundary>
      ) : (
        <Reader
          markdown={markdown}
          path={page.path}
          {...(page.store ? { store: page.store } : {})}
          {...(page.fields ? { fields: page.fields } : {})}
          {...(openPage ? { openPage } : {})}
          {...(blocks ? { blocks } : {})}
          {...(pages ? { pages } : {})}
        />
      )}

      {/* Not while writing: the strip is what the page CARRIES, and a list of
          documents under a live editing surface is one more thing between the
          cursor and the text. */}
      {!editing && attachments && (
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
