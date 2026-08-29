/**
 * The chat column.
 *
 * The parity bar, in components: user bubbles right on accent, agent bubbles
 * left on a bordered surface, a collapsible tool trace, a context pill whose
 * thresholds come from the model's real window, and a composer whose single
 * button is send or stop depending on what is happening.
 *
 * Rendering is driven entirely by `TurnState`, so the same components replay a
 * stored transcript and follow a live stream with no second code path.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import {
  archiveConversation,
  createConversation,
  listConversations,
  readConversation,
  titleFrom,
  type ConversationMeta,
  type StoredMessage,
} from './conversations.js'
import {
  INITIAL_TURN,
  attachTurn,
  startTurn,
  type PendingAsk,
  type ScreenView,
  type TurnPart,
  type TurnState,
} from './stream.js'
import {
  activateTab,
  closeTab,
  dotFor,
  isUnread,
  loadTabs,
  markRead,
  moveTab,
  openTab,
  saveTabs,
  type TabsState,
} from './tabs.js'
import { SkinSlot } from '../app/SkinSlot.js'
import type { SkinSlotRender } from '../app/skin.js'
import { useMobile } from '../app/useMobile.js'
// The drag primitive is shared with the page screen: one answer to "is this
// drag carrying files", so the two surfaces cannot disagree about it.
import { carriesFiles } from '../editor/filedrop.js'
// Markdown in a bubble is the SAME renderer a page is read through — one
// grammar, one switch, no second vocabulary and no new dependency.
import { Prose } from '../editor/Reader.js'
import { PROSE_CADENCE_MS, useCadence } from './useCadence.js'

/**
 * One model the driver offers.
 *
 * Declared here rather than imported from the driver package: the browser
 * bundle has no business depending on server code, and this is the shape of a
 * JSON payload, not of a driver.
 */
export interface ModelInfo {
  readonly id: string
  readonly label?: string
}

/** Remembered per browser, like the predecessor's. */
const MODEL_KEY = 'demeura.model'

export interface Message {
  readonly id: string
  readonly role: 'user' | 'agent'
  readonly text: string
  readonly tools?: readonly { name: string; target?: string | undefined; ok?: boolean | undefined }[]
  readonly stopped?: boolean
  readonly error?: string | undefined
}

/** Amber then red, as fractions of the window when one is known. */
const WARN_FRACTION = 0.35
const HOT_FRACTION = 0.7
/** Fallbacks when the driver cannot report a window (no contextBreakdown). */
const WARN_ABSOLUTE = 60_000
const HOT_ABSOLUTE = 120_000

export function contextLevel(tokens: number, windowSize?: number): 'calm' | 'warn' | 'hot' {
  const warn = windowSize ? windowSize * WARN_FRACTION : WARN_ABSOLUTE
  const hot = windowSize ? windowSize * HOT_FRACTION : HOT_ABSOLUTE
  if (tokens >= hot) return 'hot'
  if (tokens >= warn) return 'warn'
  return 'calm'
}

export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens)
  return `${(tokens / 1000).toFixed(tokens < 10_000 ? 1 : 0)}k`
}

export function ContextPill({
  tokens,
  windowSize,
  onClick,
}: {
  tokens: number
  windowSize?: number
  onClick?: () => void
}) {
  if (tokens <= 0) return null
  const level = contextLevel(tokens, windowSize)
  return (
    <button
      type="button"
      className={`demeura-pill demeura-pill--${level}`}
      onClick={onClick}
      title="Weight of the context your next message re-pays"
    >
      {formatTokens(tokens)}
    </button>
  )
}

/**
 * The model this instance will answer with.
 *
 * It lives in the chat's HEADER rather than in the composer, and the move is
 * the point: which engine is answering is a property of the CONVERSATION, not
 * of the message being typed. Down in the composer it competed for width with
 * the field — the one control that must never shrink — and on a phone it was
 * a truncated `claude-son…` wedged between the clip and the send button.
 * Up top it sits next to the name of the thing that is about to speak, which
 * is where every other chat surface puts it and where a reader looks for it.
 *
 * Rendered only when the driver enumerates models, so an instance whose CLI
 * has no catalogue shows no empty control. AUTO is first and is the default:
 * it sends no model at all and lets the CLI choose, which is a real answer
 * rather than a placeholder — most turns do not care, and pinning one
 * silently would override a default the operator may have set outside Demeura.
 */
export function ModelPicker({
  models,
  model,
  onModel,
  t = (key) => key,
}: {
  /** What this driver offers. Empty means it does not enumerate models. */
  models?: readonly ModelInfo[]
  /** The chosen id, or `''` for the CLI's own default. */
  model?: string
  onModel?: (model: string) => void
  t?: (key: string) => string
}) {
  if (models === undefined || models.length === 0) return null
  return (
    <select
      className="demeura-model"
      value={model ?? ''}
      onChange={(event) => onModel?.(event.target.value)}
      aria-label={t('Model')}
      title={t('Model')}
    >
      <option value="">{t('Auto')}</option>
      {models.map((entry) => (
        <option key={entry.id} value={entry.id}>
          {entry.label ?? entry.id}
        </option>
      ))}
    </select>
  )
}

export function ToolTrace({ tools }: { tools: Message['tools'] }) {
  const [open, setOpen] = useState(false)
  if (!tools || tools.length === 0) return null

  return (
    <div className="demeura-trace">
      <button type="button" className="demeura-trace__toggle" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} {tools.length} tool call{tools.length > 1 ? 's' : ''}
      </button>
      {open && (
        <ul className="demeura-trace__list">
          {tools.map((tool, index) => (
            <li key={`${tool.name}-${index}`} className={`demeura-trace__item demeura-trace__item--${
              tool.ok === false ? 'failed' : tool.ok ? 'done' : 'running'
            }`}>
              <span className="demeura-trace__glyph">◇</span>
              <span className="demeura-trace__name">{tool.name}</span>
              {/* The target only. Never the full input: it routinely holds a
                  file's contents or an entire command. */}
              {tool.target && <span className="demeura-trace__target">{tool.target}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * One message in the thread.
 *
 * The agent's half is rendered as MARKDOWN, because markdown is what it
 * writes: an answer that says `**important**` and `[la fiche](voyages/x.md)`
 * was showing its asterisks and its brackets, which is the transcript of a
 * formatting intention rather than the formatting itself.
 *
 * The user's half deliberately is not. What somebody typed is what they meant
 * — a message about `**` must be able to contain `**`, and a person typing
 * into a text field has no way to escape a grammar nobody told them applied.
 * The predecessor drew the same line, and it is the right one.
 */
export function Bubble({
  message,
  openPage,
}: {
  message: Message
  /** Lets a workspace path the agent named open the page. Absent, it is text. */
  openPage?: (path: string) => void
}) {
  return (
    <article className={`demeura-bubble demeura-bubble--${message.role}`}>
      {message.role === 'agent' && <ToolTrace tools={message.tools} />}
      {message.text &&
        (message.role === 'agent' ? (
          <Prose markdown={message.text} {...(openPage ? { openPage } : {})} />
        ) : (
          <div className="demeura-bubble__text">{message.text}</div>
        ))}
      {message.stopped && <p className="demeura-bubble__note">Turn interrupted.</p>}
      {message.error && <p className="demeura-bubble__error">{message.error}</p>}
    </article>
  )
}

/**
 * The parts to DRAW for a live turn.
 *
 * A turn that has not produced anything yet has no parts at all, and the
 * indicator has to hang somewhere: one empty part is that somewhere. It keeps
 * "nothing has happened yet" and "the agent is between two answers" as the
 * same shape, so the bubble is written once.
 */
export function livePartsOf(state: TurnState): readonly TurnPart[] {
  return state.parts.length > 0 ? state.parts : [{ tools: [], text: '' }]
}

/**
 * The answer while it is still arriving.
 *
 * Its own component for one reason: the cadence is a hook, and the live bubble
 * exists only some of the time. See useCadence.ts for why a growing answer is
 * not re-parsed on every delta.
 */
export function LiveProse({
  text,
  openPage,
}: {
  text: string
  openPage?: (path: string) => void
}) {
  const shown = useCadence(text, PROSE_CADENCE_MS)
  return <Prose markdown={shown} {...(openPage ? { openPage } : {})} />
}

/**
 * The question the engine raised, and the three ways to answer it.
 *
 * The sentence is the ENGINE's own (`title`), shown whole. A predecessor
 * rendered a target truncated to 78 characters — a string built for a trace
 * line, reused for consent — so a long command was approved unseen. Consent to
 * an elided command is not consent.
 *
 * "Always" is the answer that makes asking bearable, and it is the ENGINE's
 * memory, not Demeura's: the CLI writes the rule into its own file in the
 * workspace and reads it back on every later turn. So the durable allowlist
 * is a file a person can open, read and edit — which is also the honest
 * answer to "what is my agent allowed to do".
 *
 * It is HIDDEN, not disabled, when the engine offered no rule to remember: a
 * button that promises silence and does not deliver it is worse than one more
 * question.
 */
export function AskPrompt({
  ask,
  onAnswer,
  t = (key) => key,
}: {
  ask: PendingAsk
  onAnswer: (id: string, answer: 'once' | 'always' | 'deny') => void
  t?: (key: string) => string
}) {
  return (
    <div className="demeura-ask" role="alertdialog" aria-label={t('Permission required')}>
      <p className="demeura-ask__text">{ask.title}</p>
      {ask.reason && <p className="demeura-ask__reason">{ask.reason}</p>}
      {/* Said out loud rather than left as a missing button. The engine
          declines to propose a rule for a command its own parser cannot cut
          up — a `cd x && cat <<EOF` among them — so there is nothing durable
          to offer here, and somebody clicking through the same question for
          the tenth time deserves to know why rather than hunt for a button
          that was never there. */}
      {!ask.remembering && (
        <p className="demeura-ask__reason">
          {t('No lasting rule for this one — the engine proposed none.')}
        </p>
      )}
      <div className="demeura-ask__actions">
        <button type="button" onClick={() => onAnswer(ask.id, 'deny')}>
          {t('Refuse')}
        </button>
        <button type="button" onClick={() => onAnswer(ask.id, 'once')}>
          {t('Just this once')}
        </button>
        {ask.remembering && (
          <button
            type="button"
            className="demeura-ask__always"
            onClick={() => onAnswer(ask.id, 'always')}
          >
            {t('Always')}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * The composer's secondary controls, folded under one button.
 *
 * On a phone the composer had grown a row of peers — clip, model, one glyph
 * per plugin, send — and the field they surround is the only one of them
 * anybody came to use. Every extra button takes its width from the text.
 *
 * So they fold: one `+` opens them as a menu, which is the gesture every
 * messaging app on the device already taught. Nothing is removed and nothing
 * is hidden behind a guess — the menu names each action in words rather than
 * asking the reader to decode a glyph, which the inline row never did either.
 * Wide enough to lay them out, the row comes back; this is a fold, not a
 * second navigation.
 */
export function ComposerFold({
  onPick,
  buttons,
  t = (key) => key,
}: {
  onPick: () => void
  buttons: readonly ComposerButton[]
  t?: (key: string) => string
}) {
  const [open, setOpen] = useState(false)
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return undefined
    // Escape and a click outside, because a menu that only closes by
    // reopening it is a menu that covers the field it belongs to.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onDown = (event: MouseEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return (
    <div className="demeura-fold" ref={host}>
      <button
        type="button"
        className="demeura-composer__attach"
        aria-label={t('More')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ＋
      </button>
      {open && (
        <div className="demeura-fold__menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="demeura-fold__item"
            onClick={() => {
              setOpen(false)
              onPick()
            }}
          >
            <span className="demeura-fold__glyph" aria-hidden="true">
              📎
            </span>
            {t('Attach files')}
          </button>
          {/* Same declarative data the inline row draws — a glyph and a
              title, never markup a plugin supplied. */}
          {buttons.map((button) => (
            <button
              key={button.key}
              type="button"
              role="menuitem"
              className="demeura-fold__item"
              onClick={() => {
                setOpen(false)
                button.onClick(button.api)
              }}
            >
              <span className="demeura-fold__glyph" aria-hidden="true">
                {button.glyph}
              </span>
              {button.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * How tall the field stands, in pixels.
 *
 * A floor as well as a ceiling, and the floor is the fix: `rows={1}` left a
 * 34px slot that read as a search box on a surface whose whole purpose is
 * writing to somebody. Two lines' worth at rest says "type here, at length".
 * The ceiling stops a pasted essay from eating the transcript — past it the
 * field scrolls, which is why it is a max and not a cap on what you may say.
 */
export const COMPOSER_MIN_HEIGHT = 48
export const COMPOSER_MAX_HEIGHT = 200

export function composerHeight(scrollHeight: number): number {
  return Math.min(Math.max(scrollHeight, COMPOSER_MIN_HEIGHT), COMPOSER_MAX_HEIGHT)
}

export interface PendingAttachment {
  readonly id: string
  readonly name: string
}

export function Composer({
  onSend,
  onStop,
  busy,
  blocked,
  placeholder,
  fetchImpl = fetch,
  extraButtons,
  onFill,
  onAttach,
  folded,
  t = (key) => key,
}: {
  onSend: (text: string, attachments: readonly PendingAttachment[]) => void
  onStop: () => void
  busy: boolean
  /** A question is on screen: the turn is waiting on it, not on more text. */
  blocked?: boolean
  placeholder?: string
  fetchImpl?: typeof fetch
  extraButtons?: readonly ComposerButton[]
  onFill?: (fill: (text: string) => void) => void
  /**
   * Publishes the composer's uploader, so a screen elsewhere can hand it
   * files. The chat is where an attachment belongs — the tray, the refusals
   * and the send are already here — and a second uploader would be a second
   * place for a file to get lost.
   */
  onAttach?: (attach: (files: readonly File[]) => Promise<void>) => void
  /**
   * Fold the secondary controls under one button.
   *
   * Defaults to whatever the viewport says, and is a prop so a test — or a
   * skin that folds early — can state it outright rather than driving a
   * media query to get there.
   */
  folded?: boolean
  t?: (key: string) => string
}) {
  const narrow = useMobile()
  // The prop wins when given: a caller who states it means it, and the hook
  // still runs so the answer stays live when nobody does.
  const fold = folded ?? narrow
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<readonly PendingAttachment[]>([])
  const [uploadError, setUploadError] = useState<string | undefined>()
  const [dropping, setDropping] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)

  const upload = useCallback(
    async (files: readonly File[]) => {
      if (files.length === 0) return
      setUploadError(undefined)
      const form = new FormData()
      for (const file of files) form.append('file', file)

      try {
        const response = await fetchImpl('/api/upload', { method: 'POST', body: form })
        const body = (await response.json()) as {
          attachments?: PendingAttachment[]
          refused?: string[]
          error?: string
        }
        if (!response.ok) {
          setUploadError(body.error ?? `upload failed (${response.status})`)
          return
        }
        setAttachments((current) => [...current, ...(body.attachments ?? [])])
        // Refusals are shown next to what worked: a file silently dropped is a
        // file the user believes the agent has.
        if (body.refused?.length) setUploadError(body.refused.join('; '))
      } catch (error) {
        setUploadError((error as Error).message)
      }
    },
    [fetchImpl],
  )

  const submit = useCallback(() => {
    const value = text.trim()
    // A message may be files only: dropping a photo and saying nothing is a
    // complete request.
    if ((!value && attachments.length === 0) || blocked) return
    onSend(value, attachments)
    setText('')
    setAttachments([])
  }, [attachments, blocked, onSend, text])

  useEffect(() => {
    // Appends rather than replaces: whatever the user already typed IS the
    // instruction, and a plugin dropping text must not erase it.
    onFill?.((text: string) => {
      // Composing nothing is a no-op, not a stray space: a plugin whose
      // scanner found no code should leave the field exactly as it was.
      if (text.trim() === '') return
      setText((current) => (current.trim() === '' ? text : `${current.trimEnd()} ${text}`))
      area.current?.focus()
    })
  }, [onFill])

  useEffect(() => {
    onAttach?.(upload)
  }, [onAttach, upload])

  useEffect(() => {
    const element = area.current
    if (!element) return
    // Measured from scratch each time: `scrollHeight` on an element that
    // still carries its previous height reports that height, so a field that
    // grew would never shrink back when the text was deleted.
    element.style.height = 'auto'
    const height = composerHeight(element.scrollHeight)
    element.style.height = `${height}px`
    // Only once it has stopped growing, or the scrollbar flickers in and out
    // on every keystroke of an ordinary two-line message.
    element.style.overflowY = element.scrollHeight > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden'
  }, [text])

  return (
    <form
      className={`demeura-composer${dropping ? ' demeura-composer--dropping' : ''}`}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      // Dropping a file on the chat is the same gesture as picking one or
      // pasting one, and without these handlers the browser does the worst
      // possible thing with it: it leaves the conversation to display the file.
      onDragOver={(event) => {
        if (!carriesFiles(event.dataTransfer)) return
        event.preventDefault()
        setDropping(true)
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(event) => {
        if (!carriesFiles(event.dataTransfer)) return
        event.preventDefault()
        setDropping(false)
        void upload([...event.dataTransfer.files])
      }}
    >
      <AttachmentTray
        attachments={attachments}
        {...(uploadError ? { error: uploadError } : {})}
        onRemove={(id) => setAttachments((current) => current.filter((a) => a.id !== id))}
      />
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          void upload([...(event.target.files ?? [])])
          event.target.value = ''
        }}
      />
      {/* Rendered BY THE SHELL from declarative data, never as markup a plugin
          supplied: a button is a glyph and a title, and injected HTML here
          would be injected into the one surface every user touches. Folded or
          in a row, the data is the same and only the layout differs. */}
      {fold ? (
        <ComposerFold
          onPick={() => picker.current?.click()}
          buttons={extraButtons ?? []}
          t={t}
        />
      ) : (
        <>
          <button
            type="button"
            className="demeura-composer__attach"
            onClick={() => picker.current?.click()}
            aria-label={t('Attach files')}
          >
            📎
          </button>
          {extraButtons?.map((button) => (
            <button
              key={button.key}
              type="button"
              className="demeura-composer__attach"
              onClick={() => button.onClick(button.api)}
              aria-label={button.title}
              title={button.title}
            >
              {button.glyph}
            </button>
          ))}
        </>
      )}
      <textarea
        ref={area}
        className="demeura-composer__input"
        value={text}
        placeholder={placeholder ?? t('Ask the agent…')}
        rows={1}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
        onPaste={(event) => {
          // Pasting an image is the same gesture as attaching one; gating it
          // behind the button would make a natural action fail silently.
          const files = [...event.clipboardData.files]
          if (files.length > 0) {
            event.preventDefault()
            void upload(files)
          }
        }}
      />
      {/* One button, two jobs: stop while a turn runs and the field is empty,
          send otherwise. Two buttons would put "stop" next to "send" for a
          user who is trying to queue a message. */}
      {busy && text.trim() === '' ? (
        <button type="button" className="demeura-composer__stop" onClick={onStop} aria-label={t('Stop')}>
          ■
        </button>
      ) : (
        <button
          type="submit"
          className="demeura-composer__send"
          disabled={(text.trim() === '' && attachments.length === 0) || blocked}
          aria-label={t('Send')}
        >
          ↑
        </button>
      )}
    </form>
  )
}

export function AttachmentTray({
  attachments,
  error,
  onRemove,
}: {
  attachments: readonly PendingAttachment[]
  error?: string | undefined
  onRemove: (id: string) => void
}) {
  if (attachments.length === 0 && !error) return null
  return (
    <div className="demeura-attachments">
      {attachments.map((attachment) => (
        <span key={attachment.id} className="demeura-attachments__item">
          {attachment.name}
          <button type="button" onClick={() => onRemove(attachment.id)} aria-label={`Remove ${attachment.name}`}>
            ×
          </button>
        </span>
      ))}
      {error && <span className="demeura-attachments__error">{error}</span>}
    </div>
  )
}

export interface ChatProps {
  readonly contextWindow?: number
  readonly placeholder?: string
  /** The body's name, worn on the rail. */
  readonly brand?: string
  /** SVG markup for the crest plate, from the skin module (see skin.ts). */
  readonly crest?: string
  /** The livery's working indicator, replacing the three dots. */
  readonly busySlot?: SkinSlotRender
  readonly fetchImpl?: typeof fetch
  /** The shell's translator. Absent leaves every label in English. */
  readonly t?: (key: string) => string
  /** Only when the shell is folded onto one screen; absent on desktop. */
  readonly onOpenCanvas?: () => void
  /**
   * Opens a page of the workspace, for a path the agent named in its answer.
   *
   * The chat does not own routing and must not learn it — it hands the path
   * back and the shell decides where that lands. Absent, such a path renders
   * as the text it is rather than as a link that goes nowhere.
   */
  readonly openPage?: (path: string) => void
  /**
   * Hands the shell a way to send a message, so a plugin's button can ask the
   * agent something. The chat owns this channel; nobody else may fabricate a
   * turn behind its back and leave the thread out of step with the session.
   */
  readonly onReady?: (channel: {
    ask: (prompt: string) => void
    compose: (text: string) => void
    /** Uploads files to the inbox and shows them in the composer's tray. */
    attach: (files: readonly File[]) => Promise<void>
  }) => void
  /** Composer buttons contributed by plugins. */
  readonly extraButtons?: readonly ComposerButton[]
  /**
   * The screen open next to the chat, when one is being watched.
   *
   * Read at send time rather than remembered: what is on screen when the
   * message leaves is the only moment that means anything, and nothing about
   * it sticks to the next turn.
   */
  readonly view?: ScreenView
}

/** A composer button a plugin added. */
export interface ComposerButton {
  readonly key: string
  readonly glyph: string
  readonly title: string
  readonly api: unknown
  onClick(api: unknown): void
}

/**
 * A message sent while a turn was still running.
 *
 * The SERVER holds the real queue — each of these was POSTed at once, written
 * into the thread on acceptance, and will leave as one merged turn when the
 * running one settles. What lives here is only the display: the bubbles shown
 * waiting, promoted to ordinary messages when their turn begins. A reload
 * loses this list and nothing else — the thread already has the texts.
 */
interface HeldMessage {
  readonly text: string
  readonly attachments: readonly PendingAttachment[]
}

/** A stored message, as the thread renders it. */
function toMessage(stored: StoredMessage): Message {
  return {
    id: stored.id,
    role: stored.role,
    text: stored.text,
    ...(stored.tools ? { tools: stored.tools } : {}),
    ...(stored.stopped ? { stopped: stored.stopped } : {}),
    ...(stored.error ? { error: stored.error } : {}),
  }
}

/**
 * The tab that is not a conversation yet.
 *
 * A fresh tab has nothing to address until its first message creates the
 * thread; this sentinel is its name until then. It never reaches the server —
 * the moment a conversation exists the tab is renamed to its real id, in
 * place, so the tab keeps its position and its history of being "the one I
 * just opened".
 */
const DRAFT = 'draft'

/**
 * Everything ONE open conversation carries while its tab lives.
 *
 * The chat used to hold exactly one of these, spread over half a dozen
 * useStates; tabs make it a value, keyed by conversation id. Sessions live in
 * a REF with an explicit redraw, because the pump loops that write them
 * outlive any render's closure — the same reason the old code kept `turning`
 * and `held` in refs.
 */
interface TabSession {
  readonly messages: readonly Message[]
  readonly live?: TurnState | undefined
  readonly held: readonly HeldMessage[]
  readonly sessionId?: string | undefined
  readonly contextTokens: number
  /** An answer landed while the reader was elsewhere. */
  readonly unread: boolean
  /** The stored transcript has been read into `messages`. */
  readonly loaded: boolean
  /** A pump is consuming this conversation's turn right now. */
  readonly turning: boolean
  readonly title?: string | undefined
}

const EMPTY_SESSION: TabSession = {
  messages: [],
  held: [],
  contextTokens: 0,
  unread: false,
  loaded: false,
  turning: false,
}

export function Chat({
  contextWindow,
  placeholder,
  brand,
  crest,
  busySlot,
  fetchImpl,
  t = (key) => key,
  onOpenCanvas,
  onReady,
  extraButtons,
  openPage,
  view,
}: ChatProps) {
  const narrow = useMobile()
  /**
   * Which conversations are open as tabs, their order, and the active one —
   * persisted like a browser's tab strip, so a refresh reopens what was open.
   */
  const [tabs, setTabs] = useState<TabsState>(() => loadTabs())
  /**
   * Per-conversation sessions (see TabSession). A ref plus an explicit redraw
   * rather than a state map: the pump loops writing these outlive any
   * render's closure, and a stale map snapshot would drop their updates.
   */
  const sessionsRef = useRef(new Map<string, TabSession>())
  const [, redraw] = useReducer((count: number) => count + 1, 0)
  /**
   * Questions already answered, by id.
   *
   * Kept HERE rather than cleared out of the turn state, and that is the whole
   * fix: the stream's generator carries its own accumulated state, so clearing
   * `live.ask` in the component lasted exactly until the next event re-yielded
   * it — the prompt vanished on click and came straight back, over and over,
   * until the turn ended (reported from the real interface, 2026-08-26).
   *
   * The answer is a fact the INTERFACE owns: the server was told, and no
   * event will ever say so. So the interface remembers it.
   */
  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => new Set())
  const [threads, setThreads] = useState<readonly ConversationMeta[]>([])
  const [threadsOpen, setThreadsOpen] = useState(false)
  const [models, setModels] = useState<readonly ModelInfo[]>([])
  /**
   * The chosen model, `''` meaning the CLI's own default.
   *
   * Read from storage before the catalogue arrives, and NOT validated against
   * it: a driver that briefly fails to enumerate must not silently reset a
   * choice somebody made. An id the catalogue no longer holds simply stops
   * being selectable, and the select falls back to showing Auto.
   */
  const [model, setModel] = useState<string>(() => {
    try {
      return window.localStorage.getItem(MODEL_KEY) ?? ''
    } catch {
      // Private windows and blocked site data throw on ACCESS, not on read.
      return ''
    }
  })
  /** The tab everything composes into; DRAFT when none is open yet. */
  const activeId = tabs.active ?? DRAFT
  /** Mirror for the pump loops, which outlive any render's `tabs` closure. */
  const activeRef = useRef(activeId)
  /** In-flight thread creation, so two rapid sends share ONE conversation. */
  const threadCreation = useRef<Promise<string | undefined> | undefined>(undefined)
  /** Drag origin while a tab is being reordered. */
  const dragFrom = useRef<number | undefined>(undefined)
  /** Latest `send`, for the channel published to plugins (see the effect). */
  const sendRef = useRef<(text: string, attachments?: readonly PendingAttachment[]) => Promise<void>>(
    async () => {},
  )
  /** Set by the composer once it exists, so `compose` reaches its field. */
  const composeRef = useRef<((text: string) => void) | undefined>(undefined)
  const attachRef = useRef<((files: readonly File[]) => Promise<void>) | undefined>(undefined)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void listConversations(fetchImpl).then(setThreads)
  }, [fetchImpl])

  useEffect(() => {
    // Persisted like a browser's tab strip — order, membership, activation —
    // so a refresh reopens what was open. The ref keeps the pump loops honest
    // about which tab the reader is looking at.
    activeRef.current = tabs.active ?? DRAFT
    saveTabs(tabs)
  }, [tabs])

  // Declared as FUNCTIONS, not useCallback: the session machinery below is a
  // web of mutual calls (adoption is recursive by nature — a turn's end looks
  // for the next), and hoisting lets the cycle be written in reading order.

  function session(id: string): TabSession {
    return sessionsRef.current.get(id) ?? EMPTY_SESSION
  }

  function patchSession(
    id: string,
    patch: Partial<TabSession> | ((current: TabSession) => Partial<TabSession>),
  ): void {
    const previous = session(id)
    const delta = typeof patch === 'function' ? patch(previous) : patch
    sessionsRef.current.set(id, { ...previous, ...delta })
    redraw()
  }

  /** The draft tab becomes the conversation's tab — a rename, not a swap. */
  function renameSession(from: string, to: string): void {
    const moving = sessionsRef.current.get(from)
    if (!moving) return
    sessionsRef.current.delete(from)
    sessionsRef.current.set(to, moving)
    redraw()
  }

  /** Records that the reader has SEEN this thread, for the unread dots. */
  function read(id: string): void {
    if (id === DRAFT) return
    markRead(id, new Date().toISOString())
    if (session(id).unread) patchSession(id, { unread: false })
  }

  /**
   * Loads a conversation into its session if needed, then re-attaches to its
   * running turn if the desk has one — a reload, a phone that slept, a tab
   * restored at mount. A tab pointing at a conversation that no longer
   * answers closes itself rather than sitting there blank.
   */
  async function adopt(id: string): Promise<void> {
    const current = session(id)
    // A pump already consumes this conversation: attaching a second stream
    // would apply every event twice.
    if (current.turning) return
    if (!current.loaded) {
      const conversation = await readConversation(id, fetchImpl)
      if (!conversation) {
        setTabs((state) => closeTab(state, id))
        return
      }
      // Replayed FAITHFULLY: tool trace, interruptions and all. The stored
      // transcript is what the UI drew, so replaying it needs no second path.
      patchSession(id, {
        messages: conversation.messages.map(toMessage),
        sessionId: conversation.sessionId,
        contextTokens: conversation.messages.at(-1)?.usage?.contextTokens ?? 0,
        loaded: true,
        title: conversation.title,
      })
    }
    const running = await attachTurn(id, fetchImpl ?? fetch)
    if (running) {
      patchSession(id, { live: INITIAL_TURN })
      void pump(id, running)
    }
  }

  /** From the list: opening a thread opens it AS a tab, active. */
  function openThread(id: string): void {
    setTabs((state) => openTab(state, id))
    setThreadsOpen(false)
    read(id)
    void adopt(id)
  }

  function activate(id: string): void {
    setTabs((state) => activateTab(state, id))
    read(id)
    if (!session(id).loaded && id !== DRAFT) void adopt(id)
  }

  /**
   * Closes the TAB — never the conversation. The thread stays in the list,
   * the session stays warm (a running pump keeps feeding it, and its dot
   * keeps meaning something if the tab is reopened).
   */
  function shut(id: string): void {
    setTabs((state) => closeTab(state, id))
  }

  /** Put away, not deleted — and its tab goes with it. */
  async function archiveThread(id: string): Promise<void> {
    if (!(await archiveConversation(fetchImpl ?? fetch, id))) return
    setThreads((current) => current.filter((entry) => entry.id !== id))
    shut(id)
  }

  /**
   * One dot vocabulary for the tab strip and the thread list. The session is
   * the authority when this browser is watching the conversation; the list's
   * server-computed `turn` field answers for everything else, and the stored
   * read-marks answer "seen?" for threads with no session at all.
   */
  function dotOf(id: string, meta?: ConversationMeta) {
    const s = sessionsRef.current.get(id)
    return dotFor({
      waiting:
        (s?.live?.ask !== undefined && !answered.has(s.live.ask.id)) || meta?.turn === 'waiting',
      working: (s?.live?.running ?? false) || meta?.turn === 'running',
      unread: s?.unread || (meta ? isUnread(meta) : false),
    })
  }

  useEffect(() => {
    // Restore what the last visit left open: every tab on a desktop, only
    // the last active one on a phone — the tab strip is a desktop surface,
    // and a phone reopening everything would pay N fetches for one screen.
    const restore = (narrow ? [tabs.active] : tabs.open).filter(
      (id): id is string => typeof id === 'string' && id !== DRAFT,
    )
    for (const id of restore) void adopt(id)
    // Run once, with the state the page loaded with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // A 404 is the honest answer for a driver that cannot enumerate models,
    // and it lands here as an empty list — which draws no control at all.
    // Anything else (a network blip, a driver error) leaves it empty too: a
    // missing selector beats a selector that lists nothing.
    void (async () => {
      try {
        const response = await (fetchImpl ?? fetch)('/api/models')
        if (!response.ok) return
        const body = (await response.json()) as { models?: readonly ModelInfo[] }
        setModels(body.models ?? [])
      } catch {
        /* no catalogue, no control */
      }
    })()
  }, [fetchImpl])

  const chooseModel = useCallback((chosen: string) => {
    setModel(chosen)
    try {
      // Auto is the absence of a choice, so it CLEARS the key rather than
      // storing an empty string — a stored '' and no key mean the same thing,
      // and only one of them survives a change of default.
      if (chosen === '') window.localStorage.removeItem(MODEL_KEY)
      else window.localStorage.setItem(MODEL_KEY, chosen)
    } catch {
      // Storage refused: the choice still holds for this session, which is
      // the part the user is actually looking at.
    }
  }, [])

  /** The ＋ of the strip and the header: a fresh tab, conversation-less
      until its first message names one. Only ever one draft — reopening it
      just activates it. */
  function newDraft(): void {
    setTabs((state) => openTab(state, DRAFT))
    setThreadsOpen(false)
  }

  /** What the visible thread renders — everything below reads through this. */
  const active = session(activeId)

  useEffect(() => {
    // Guarded because an exception thrown in an effect tears down the whole
    // render: scrolling is a courtesy, and no environment should lose the
    // chat because it lacks one DOM convenience.
    const anchor = bottom.current
    if (typeof anchor?.scrollIntoView === 'function') anchor.scrollIntoView({ block: 'end' })
  }, [active.messages, active.live?.parts, active.held])

  /** The user's half, as the thread shows it — attachments named after it. */
  function stamped(text: string, attachments: readonly PendingAttachment[]): string {
    return attachments.length > 0
      ? `${text}\n📎 ${attachments.map((a) => a.name).join(', ')}`.trim()
      : text
  }

  function turnOptions(
    sid: string | undefined,
    text: string,
    attachments: readonly PendingAttachment[],
    thread?: string,
  ) {
    return {
      prompt: text,
      ...(sid ? { sessionId: sid } : {}),
      ...(model ? { model } : {}),
      ...(thread ? { conversationId: thread } : {}),
      ...(attachments.length > 0 ? { attachments: attachments.map((a) => a.id) } : {}),
      ...(view ? { view } : {}),
    }
  }

  /**
   * A thread is created on the first message rather than on arrival: an
   * instance nobody has spoken to should not accumulate empty threads. The
   * creation is SHARED — a second send arriving before the first answer must
   * join the same conversation, not open its own. The draft tab is renamed
   * to the new id IN PLACE: same position, same activation, its session —
   * user bubble included — moving with it.
   */
  async function ensureThread(tabId: string, title: string): Promise<string | undefined> {
    if (tabId !== DRAFT) return tabId
    threadCreation.current ??= createConversation(fetchImpl, title)
      .then((created) => {
        if (!created) return undefined
        setThreads((current) => [{ ...created, title }, ...current])
        renameSession(DRAFT, created.id)
        patchSession(created.id, { title, loaded: true })
        setTabs((state) =>
          state.open.includes(DRAFT)
            ? {
                open: state.open.map((id) => (id === DRAFT ? created.id : id)),
                ...(state.active !== undefined
                  ? { active: state.active === DRAFT ? created.id : state.active }
                  : {}),
              }
            : openTab(state, created.id),
        )
        return created.id
      })
      .finally(() => {
        threadCreation.current = undefined
      })
    return threadCreation.current
  }

  /** What was held becomes ordinary user messages: their turn has begun, and
      this is the shape the store recorded them in — one each, never merged. */
  function promoteHeld(tabId: string): void {
    patchSession(tabId, (current) => ({
      held: [],
      messages:
        current.held.length === 0
          ? current.messages
          : [
              ...current.messages,
              ...current.held.map((message, index) => ({
                id: `u${current.messages.length + index}`,
                role: 'user' as const,
                text: stamped(message.text, message.attachments),
              })),
            ],
    }))
  }

  /**
   * Follows one turn to its end, then looks for the next.
   *
   * The follow-up attach is the other half of the server's queue: when the
   * desk dispatches what was held as a merged turn, it is installed BEFORE
   * the old stream announces its end, so this attach finds it. A turn that
   * settles with nothing behind it answers 204 and the loop rests.
   */
  async function consume(tabId: string, states: AsyncGenerator<TurnState>): Promise<void> {
    let last: TurnState | undefined
    try {
      for await (const state of states) {
        last = state
        patchSession(tabId, { live: state })
      }
    } catch (error) {
      // A fetch that REJECTS — network down, server gone — must land as the
      // error it is, not leave the dots pulsing forever.
      last = { ...(last ?? INITIAL_TURN), running: false, error: (error as Error).message }
    }

    if (last) {
      const settled = last
      // What was drawn as several bubbles is FILED as several messages. The
      // alternative — one record holding the whole turn — would have made a
      // reload merge back what the live view had just separated, and the
      // thread on disk is the version that outlives the tab.
      const settledParts = settled.parts.filter(
        (part) => part.text !== '' || part.tools.length > 0,
      )
      patchSession(tabId, (current) => ({
        live: undefined,
        sessionId: settled.sessionId ?? current.sessionId,
        ...(settled.contextTokens !== undefined ? { contextTokens: settled.contextTokens } : {}),
        messages: [
          ...current.messages,
          // A turn that produced nothing still leaves a message: it is what
          // carries the interruption marker and the error.
          ...(settledParts.length > 0 ? settledParts : [{ tools: [], text: '' }]).map(
            (part, index, parts) => ({
              id: `a${current.messages.length + index}`,
              role: 'agent' as const,
              text: part.text,
              tools: part.tools,
              // How the TURN ended belongs to its last word, not to each of
              // them: an interruption marker under every part would read as
              // three interruptions.
              ...(index === parts.length - 1
                ? { stopped: settled.stopped, error: settled.error }
                : {}),
            }),
          ),
        ],
        // The dot that says "finished, and you have not seen it": only when
        // the answer landed in a tab the reader was not looking at.
        unread: tabId !== activeRef.current,
      }))
      if (tabId === activeRef.current) read(tabId)
    } else {
      patchSession(tabId, { live: undefined })
    }

    if (tabId === DRAFT) return
    const follow = await attachTurn(tabId, fetchImpl ?? fetch)
    if (follow) {
      promoteHeld(tabId)
      patchSession(tabId, { live: INITIAL_TURN })
      return consume(tabId, follow)
    }

    if (session(tabId).held.length > 0) {
      // Held, and nothing to attach to: the merged turn ran to completion
      // faster than this re-attach. The store has the whole exchange — read
      // it back rather than guess at it.
      patchSession(tabId, { held: [], loaded: false })
      await adopt(tabId)
    }
  }

  /** One consumer per tab — its `turning` is what `send` reads to hold back. */
  async function pump(tabId: string, states: AsyncGenerator<TurnState>): Promise<void> {
    patchSession(tabId, { turning: true })
    try {
      await consume(tabId, states)
    } finally {
      patchSession(tabId, { turning: false })
    }
  }

  async function send(text: string, attachments: readonly PendingAttachment[] = []): Promise<void> {
    // Into the tab the reader is looking at, read at send time: tabs can
    // switch while a reply is being typed, and the words go where the eyes
    // were.
    const tabId = activeRef.current
    const current = session(tabId)

    // Sent DURING that tab's turn: the SERVER holds it — POSTed at once,
    // persisted on acceptance, dispatched as one merged turn when the
    // running one settles. What is kept here is only the waiting bubble.
    if (current.turning) {
      patchSession(tabId, { held: [...current.held, { text, attachments }] })
      const controller = new AbortController()
      const start = await startTurn(
        {
          ...turnOptions(
            current.sessionId,
            text,
            attachments,
            tabId !== DRAFT ? tabId : undefined,
          ),
          signal: controller.signal,
        },
        fetchImpl,
      )
      if (start.kind === 'stream') {
        // The running turn settled in the instant this left, so the desk
        // answered with a fresh stream instead of holding. Drop this
        // duplicate subscription: the consumer's follow-up attach adopts the
        // same job, replay included.
        controller.abort()
        void start.states.return?.(undefined)
      }
      return
    }

    patchSession(tabId, (previous) => ({
      messages: [
        ...previous.messages,
        { id: `u${previous.messages.length}`, role: 'user' as const, text: stamped(text, attachments) },
      ],
      // The dots go up BEFORE the server is asked anything: between here and
      // the driver's first event stand a conversation write, the POST and a
      // CLI spawn — seconds, sometimes, during which a silent screen reads
      // as a swallowed message. The stream's first state replaces this one.
      live: INITIAL_TURN,
    }))

    // Named from the first message, at creation: a title set in a second
    // call is a title lost whenever that call is.
    const thread = await ensureThread(tabId, titleFrom(text))
    const runId = thread ?? tabId
    const start = await startTurn(
      turnOptions(session(runId).sessionId, text, attachments, thread),
      fetchImpl,
    )

    if (start.kind === 'held') {
      // Another browser tab is running this conversation's turn: adopt it,
      // and this message rides the follow-up like any held one.
      if (thread && !session(runId).turning) {
        const running = await attachTurn(thread, fetchImpl ?? fetch)
        if (running) {
          void pump(runId, running)
          return
        }
      }
      patchSession(runId, { live: undefined })
      return
    }

    void pump(runId, start.states)
  }
  sendRef.current = send

  useEffect(() => {
    // Published once the sender exists, so a plugin loaded before the chat
    // mounted still gets a working channel rather than a silent no-op.
    // Through the ref, because `send` is a plain function remade each render:
    // the channel is published once and always reaches the latest one.
    onReady?.({
      ask: (prompt: string) => void sendRef.current(prompt),
      compose: (text: string) => composeRef.current?.(text),
      attach: async (files: readonly File[]) => attachRef.current?.(files),
    })
  }, [onReady])

  /** Stops the ACTIVE tab's turn — the one whose ■ the user can see. */
  function stop(): void {
    const sid = session(activeRef.current).sessionId
    if (!sid) return
    void (fetchImpl ?? fetch)('/api/turn/stop', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: sid }),
    })
  }

  return (
    <section className="demeura-chat">
      <header className="demeura-chat__header">
        {/* The crest markup comes from the skin MODULE — code the instance
            already chose to run — never from a manifest. */}
        {crest && (
          <span className="demeura-crest" aria-hidden="true" dangerouslySetInnerHTML={{ __html: crest }} />
        )}
        <span className="demeura-brandname">{brand ?? 'Demeura'}</span>
        {/* Next to the name of the thing about to speak: which engine answers
            belongs to the conversation, not to the message being typed. */}
        <ModelPicker models={models} model={model} onModel={chooseModel} t={t} />
        <span className="demeura-chat__spacer" />
        <ContextPill tokens={active.contextTokens} {...(contextWindow ? { windowSize: contextWindow } : {})} />
        <button
          type="button"
          className="demeura-ib"
          onClick={() => {
            const opening = !threadsOpen
            setThreadsOpen(opening)
            // Reopened = refreshed: the dots read the desk's live state and
            // the updatedAt the unread marks compare against.
            if (opening) void listConversations(fetchImpl).then(setThreads)
          }}
          aria-label={t('Conversations')}
          aria-expanded={threadsOpen}
        >
          ▤
        </button>
        <button type="button" className="demeura-ib" onClick={newDraft} aria-label="New conversation">
          ＋
        </button>
        {onOpenCanvas && (
          <button type="button" className="demeura-ib" onClick={onOpenCanvas} aria-label="Open apps">
            ▥
          </button>
        )}
      </header>

      {/* The tab strip — a desktop surface. On a phone the thread list, with
          the same dots, is the whole navigation. */}
      {!narrow && tabs.open.length > 0 && (
        <div className="demeura-tabs" role="tablist">
          {tabs.open.map((id, index) => {
            const title =
              id === DRAFT
                ? t('New conversation')
                : session(id).title ?? threads.find((thread) => thread.id === id)?.title ?? '…'
            return (
              <div
                key={id}
                className={`demeura-tab${id === activeId ? ' demeura-tab--active' : ''}`}
                role="tab"
                aria-selected={id === activeId}
                draggable
                onDragStart={() => {
                  dragFrom.current = index
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  const from = dragFrom.current
                  dragFrom.current = undefined
                  if (from !== undefined) setTabs((state) => moveTab(state, from, index))
                }}
              >
                <button
                  type="button"
                  className="demeura-tab__pick"
                  onClick={() => activate(id)}
                  title={title}
                >
                  <span className={`demeura-dot demeura-dot--${dotOf(id)}`} aria-hidden="true" />
                  <span className="demeura-tab__title">{title}</span>
                </button>
                {/* Two exits, two meanings: the box puts the CONVERSATION
                    away, the cross only closes the TAB — the thread stays in
                    the list, dot and all. */}
                {id !== DRAFT && (
                  <button
                    type="button"
                    className="demeura-tab__tool"
                    aria-label={`${t('Archive')} — ${title}`}
                    title={t('Archive')}
                    onClick={() => void archiveThread(id)}
                  >
                    <ArchiveGlyph />
                  </button>
                )}
                <button
                  type="button"
                  className="demeura-tab__tool"
                  aria-label={`${t('Close tab')} — ${title}`}
                  title={t('Close tab')}
                  onClick={() => shut(id)}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}

      {threadsOpen && (
        <ul className="demeura-threads">
          {threads.length === 0 && <li className="demeura-threads__empty">No conversation yet.</li>}
          {threads.map((thread) => (
            <li key={thread.id}>
              <button
                type="button"
                className={`demeura-threads__item${
                  thread.id === activeId ? ' demeura-threads__item--current' : ''
                }`}
                onClick={() => openThread(thread.id)}
              >
                {/* The same dot vocabulary as the tab strip: on a phone this
                    list IS the tab strip. */}
                <span className={`demeura-dot demeura-dot--${dotOf(thread.id, thread)}`} aria-hidden="true" />
                {thread.title}
              </button>
              {/* Put away, not deleted: the only tool for tidying up was a
                  delete that took every word with it. */}
              <button
                type="button"
                className="demeura-threads__archive"
                aria-label={`${t('Archive')} — ${thread.title}`}
                title={t('Archive')}
                onClick={() => void archiveThread(thread.id)}
              >
                <ArchiveGlyph />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="demeura-chat__thread">
        {active.messages.map((message) => (
          <Bubble key={message.id} message={message} {...(openPage ? { openPage } : {})} />
        ))}

        {/* A turn draws one bubble PER PART: the agent that answers, works
            again and answers again said two things. Only the last is live —
            the ones behind it are finished, and re-parsing them on every
            delta would re-render the whole turn for each keystroke of it. */}
        {active.live &&
          livePartsOf(active.live).map((part, index, parts) => {
            const last = index === parts.length - 1
            return (
              <article
                key={`l${index}`}
                className={`demeura-bubble demeura-bubble--agent${last ? ' demeura-bubble--live' : ''}`}
              >
                <ToolTrace tools={part.tools} />
                {part.text &&
                  (last ? (
                    <LiveProse text={part.text} {...(openPage ? { openPage } : {})} />
                  ) : (
                    <Prose markdown={part.text} {...(openPage ? { openPage } : {})} />
                  ))}
                {/* The indicator stays UP for as long as the turn runs, under
                    whatever has been said so far. It used to be the ALTERNATIVE
                    to the text, so the first sentence killed it: the agent then
                    worked for minutes behind a bubble that looked finished. */}
                {last && active.live!.running && (
                  <div className="demeura-bubble__working">
                    {busySlot ? (
                      <SkinSlot
                        render={busySlot}
                        className="demeura-busy-host"
                        context={{ ask: () => {}, compose: () => {}, focusComposer: () => {} }}
                      />
                    ) : (
                      <span className="demeura-dots" aria-label="Working" />
                    )}
                    {/* The climbing counter, when the driver can feed it. */}
                    {active.live!.outputTokens > 0 && (
                      <span className="demeura-bubble__counter">
                        {formatTokens(active.live!.outputTokens)}
                      </span>
                    )}
                  </div>
                )}
              </article>
            )
          })}

        {/* What was said while the agent was busy, visibly waiting its turn.
            The server holds the real queue; these leave as ONE merged turn
            when the running one settles. */}
        {active.held.map((message, index) => (
          <article key={`h${index}`} className="demeura-bubble demeura-bubble--user demeura-bubble--held">
            <div className="demeura-bubble__text">
              {message.text || `📎 ${message.attachments.map((a) => a.name).join(', ')}`}
            </div>
          </article>
        ))}
        <div ref={bottom} />
      </div>

      {active.live?.ask && !answered.has(active.live.ask.id) && (
        <AskPrompt
          ask={active.live.ask}
          t={t}
          onAnswer={(id, answer) => {
            // Recorded BEFORE the request goes out. The turn is blocked on
            // this answer, so no event will arrive to clear it — and any
            // event that does arrive still carries the question.
            setAnswered((current) => new Set(current).add(id))
            void (fetchImpl ?? fetch)('/api/permission', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ id, answer }),
            }).catch(() => {
              // The turn will time out on its own and refuse; saying so twice
              // would put an error over a question that is already gone.
            })
          }}
        />
      )}

      <Composer
        onFill={(fill) => {
          composeRef.current = fill
        }}
        onAttach={(attach) => {
          attachRef.current = attach
        }}
        fetchImpl={fetchImpl ?? fetch}
        {...(extraButtons ? { extraButtons } : {})}
        onSend={(text, attachments) => void send(text, attachments)}
        onStop={stop}
        busy={active.live?.running ?? false}
        blocked={active.live?.ask !== undefined && !answered.has(active.live.ask.id)}
        {...(placeholder ? { placeholder } : {})}
        t={t}
      />
    </section>
  )
}

/** A box with a lid, not a backspace: "put away", the one thing this does. */
function ArchiveGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </svg>
  )
}
