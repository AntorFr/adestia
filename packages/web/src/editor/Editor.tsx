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

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Indexed } from '@antorfr/adestia-content'

import { Attachments } from './Attachments.js'
import type { PropertiesEnv } from './frontmatterview.js'
import type { FieldContributions } from './pageform.js'
import type { StoreInfo } from '../plugins/contract.js'
import type { Say } from '../plugins/words.js'
import { PluginBoundary } from '../plugins/Boundary.js'
import { Icon } from '../app/Icon.js'
import type { Incoming } from '../app/usePage.js'
import { resolveLocale, translator } from '../app/i18n.js'
import { Button } from '../app/ui/index.js'
import { Reader, type BlockComponents, type LayoutComponents, type VocabularyContext } from './Reader.js'
import { SaveStatus } from './SaveStatus.js'
import { useAutosave } from './useAutosave.js'
import { useEditorSurface } from './useEditorSurface.js'
import { usePageDrop } from './usePageDrop.js'

export { SaveStatus } from './SaveStatus.js'
export { savePage, type SaveState } from './useAutosave.js'

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

function Diagnostics({ items, t }: { items: PageDocument['diagnostics']; t: (key: string) => string }) {
  if (items.length === 0) return null
  return (
    <ul className="adestia-diagnostics">
      {items.map((item, index) => (
        <li key={index} className={`adestia-diagnostics__item adestia-diagnostics__item--${item.severity}`}>
          <Icon name={item.severity === 'error' ? 'circle-alert' : 'triangle-alert'} />
          {item.line !== undefined && (
            <span className="adestia-diagnostics__line">{t('line %n').replace('%n', String(item.line))}</span>
          )}
          {item.message}
        </li>
      ))}
    </ul>
  )
}

export interface EditorProps {
  readonly page: PageDocument
  readonly fetchImpl?: typeof fetch
  /** Follows a wikilink to another page. */
  readonly openPage?: (path: string) => void
  /** The shell's translator; absent, the page's `locale` decides the language. */
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
  /** The stores they compose, forwarded for a block that draws provenance. */
  readonly stores?: readonly StoreInfo[]
  /**
   * The frontmatter fields the active plugins declare, by page type — what
   * the properties form draws under the core's own.
   *
   * Absent means the core's fields only, which is also what a test mounting
   * an Editor alone gets, and what an instance with no plugin on sees.
   */
  readonly fieldContributions?: FieldContributions
  /**
   * A word a PLUGIN declared, in the reader's language — a block's
   * `description` in its settings panel. The shell's own `t` answers for
   * everything the core declares, so this is only ever consulted for a name
   * that came out of a manifest.
   */
  readonly say?: Say
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
   * Draw the page's `title:` as an editable line above the body.
   *
   * Off by default: the shell's own page screen names the page in the
   * breadcrumb and the document opens with its own heading, so a third copy
   * would be two too many. A plugin drawing a LIST of pages turns it on —
   * there, the title is the only thing telling one card from the next.
   *
   * It lives here rather than in the plugin for one reason, learnt the hard
   * way: the title is part of the frontmatter, the frontmatter is part of the
   * document this editor holds, and a plugin writing it from outside would be
   * a second author on an open file — a 409 on somebody's unsaved paragraph.
   */
  readonly titleField?: boolean
  /**
   * Told when this editor enters or leaves writing posture.
   *
   * For a caller that draws something ELSE about the same page — a journal
   * showing an entry's title beside the body. While the editor holds the
   * file, that caller must not write to it: two hands on one document is a
   * 409 on somebody's unsaved paragraph.
   */
  readonly onEditing?: (editing: boolean) => void
  /**
   * What the disk now holds, read aside by the shell while this editor is open
   * (AD-21). Absent — an embedded editor, no feed — means no banner. Never
   * replaces the typed text: it only raises the banner.
   */
  readonly incoming?: Incoming | undefined
  /** Puts `incoming` on screen: the agent's version, or E-8 when the page is gone. */
  readonly onReload?: () => void
  /** Called after a save the server accepted, with the revision it returned. */
  readonly onSaved?: (revision: string) => void
  /** Injected in tests; the real one mounts Milkdown. */
  readonly mount?: (
    element: HTMLElement,
    markdown: string,
    onChange: (md: string) => void,
    env?: PropertiesEnv,
  ) => () => void
}

export function Editor(props: EditorProps) {
  const {
    page,
    fetchImpl = fetch,
    openPage,
    locale = 'en',
    blocks,
    vocabulary,
    layouts,
    pages,
    stores,
    attachments = true,
    startEditing = false,
    titleField = false,
    onEditing,
    onSaved,
    incoming,
    onReload,
    t = translator(resolveLocale(locale)),
  } = props
  const { shown, setBody, title, setTitle, markdown, saved, status, dirty, save, revision } =
    useAutosave(page, fetchImpl, titleField, onSaved)
  /**
   * Reading by default.
   *
   * Opening a page to LOOK at it used to mount ProseMirror, its toolbars and
   * its drag handles over a document nobody had asked to change — which makes
   * every reader feel like they might break something. Writing is a decision
   * now, taken by a button.
   */
  const [editing, setEditing] = useState(startEditing)
  const host = useEditorSurface(
    { ...props, fetchImpl, locale, t },
    editing, shown, saved, setBody,
  )
  const { dropping, events } = usePageDrop({ ...props, t }, editing)

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

  /*
   * Compared by REVISION, against the one this editor holds (opening, or the
   * last save): `page.revision` stays put after a save, and the text is
   * reformatted by the editor, so neither can say whether the agent wrote.
   */
  const changed = incoming !== undefined && ('gone' in incoming || incoming.page.revision !== revision)

  /**
   * Leaving writing posture — which SAVES.
   *
   * It used to abandon, and it was called `Done`. Reported from use within an
   * hour of shipping: "Terminé ne sauve pas, si tu cliques dessus tu perds tes
   * modifs". Exactly so, and the label was the whole defect — a control that
   * throws work away must not wear the name of the one that keeps it, and
   * next to a `Save` that greys out when there is nothing to save, `Done`
   * reads as "I have finished", never as "discard".
   *
   * The page stays open when the server refuses. A conflict or a rejected
   * vocabulary is precisely the moment somebody needs their text still on
   * screen — closing on a 409 would throw away the paragraph the message is
   * telling them to reconcile.
   *
   * There is no discard button now, and that is deliberate rather than
   * overlooked: undo is in the editor, and a page nobody meant to change is a
   * page whose `Save` was never enabled anyway.
   */
  const done = useCallback(async () => {
    if (!dirty) {
      setEditing(false)
      return
    }
    if ((await save()).kind === 'saved') setEditing(false)
  }, [dirty, save])

  return (
    <section
      className={`adestia-editor${dropping ? ' adestia-editor--dropping' : ''}`}
      {...events}
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
          <SaveStatus state={status} t={t} />
          {page.editable && !editing && (
            <Button
              variant="ghost"
              icon="pencil"
              aria-label={t('Edit')}
              title={t('Edit')}
              onClick={() => setEditing(true)}
            />
          )}
          {page.editable && editing && (
            <Button
              variant="accent"
              className="adestia-editor__save"
              onClick={() => void done()}
              disabled={status.kind === 'saving'}
            >
              {t('Done')}
            </Button>
          )}
        </div>
      </header>

      {/* The title, when the caller draws a list of pages and needs one.
          A heading while reading, a field while writing — reading posture
          reads, here as everywhere else. What it is NOT any more is a control
          that vanishes the moment the editor opens, which was exactly when
          somebody wanted to name what they were writing. */}
      {titleField &&
        (editing && page.editable ? (
          <input
            className="adestia-editor__title"
            value={title}
            placeholder={t('Untitled')}
            aria-label={t('Title')}
            onChange={(event) => setTitle(event.target.value)}
          />
        ) : (
          title !== '' && <h2 className="adestia-editor__title">{title}</h2>
        ))}

      {!page.editable && (
        <p className="adestia-editor__readonly" role="status">
          <Icon name="lock" />
          {t('This page uses blocks Adestia does not know, so it is open read-only. Fixing it is a change to the code, not to the file.')}
        </p>
      )}

      {changed && (
        <div className="adestia-save adestia-save--warn adestia-editor__changed" role="status">
          <span className="adestia-editor__changed-text">
            <Icon name="triangle-alert" />
            {t('The page changed.')}
          </span>
          <button type="button" className="adestia-btn" onClick={() => onReload?.()}>
            {t('Reload')}
          </button>
        </div>
      )}

      <Diagnostics items={page.diagnostics} t={t} />

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
              {...(pages ? { pages } : {})}
          {...(stores ? { stores } : {})}
              fetchImpl={fetchImpl}
              locale={locale}
              t={t}
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
          {...(vocabulary ? { vocabulary } : {})}
          {...(pages ? { pages } : {})}
          {...(stores ? { stores } : {})}
          fetchImpl={fetchImpl}
          locale={locale}
          t={t}
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
