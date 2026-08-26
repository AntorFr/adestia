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

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  archiveConversation,
  createConversation,
  listConversations,
  readConversation,
  titleFrom,
  type ConversationMeta,
  type StoredMessage,
} from './conversations.js'
import { runTurn, type PendingAsk, type ScreenView, type TurnState } from './stream.js'
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
const MODEL_KEY = 'golem.model'

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
      className={`golem-pill golem-pill--${level}`}
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
 * silently would override a default the operator may have set outside Golem.
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
      className="golem-model"
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
    <div className="golem-trace">
      <button type="button" className="golem-trace__toggle" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} {tools.length} tool call{tools.length > 1 ? 's' : ''}
      </button>
      {open && (
        <ul className="golem-trace__list">
          {tools.map((tool, index) => (
            <li key={`${tool.name}-${index}`} className={`golem-trace__item golem-trace__item--${
              tool.ok === false ? 'failed' : tool.ok ? 'done' : 'running'
            }`}>
              <span className="golem-trace__glyph">◇</span>
              <span className="golem-trace__name">{tool.name}</span>
              {/* The target only. Never the full input: it routinely holds a
                  file's contents or an entire command. */}
              {tool.target && <span className="golem-trace__target">{tool.target}</span>}
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
    <article className={`golem-bubble golem-bubble--${message.role}`}>
      {message.role === 'agent' && <ToolTrace tools={message.tools} />}
      {message.text &&
        (message.role === 'agent' ? (
          <Prose markdown={message.text} {...(openPage ? { openPage } : {})} />
        ) : (
          <div className="golem-bubble__text">{message.text}</div>
        ))}
      {message.stopped && <p className="golem-bubble__note">Turn interrupted.</p>}
      {message.error && <p className="golem-bubble__error">{message.error}</p>}
    </article>
  )
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
 * memory, not Golem's: the CLI writes the rule into its own file in the
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
    <div className="golem-ask" role="alertdialog" aria-label={t('Permission required')}>
      <p className="golem-ask__text">{ask.title}</p>
      {ask.reason && <p className="golem-ask__reason">{ask.reason}</p>}
      {/* Said out loud rather than left as a missing button. The engine
          declines to propose a rule for a command its own parser cannot cut
          up — a `cd x && cat <<EOF` among them — so there is nothing durable
          to offer here, and somebody clicking through the same question for
          the tenth time deserves to know why rather than hunt for a button
          that was never there. */}
      {!ask.remembering && (
        <p className="golem-ask__reason">
          {t('No lasting rule for this one — the engine proposed none.')}
        </p>
      )}
      <div className="golem-ask__actions">
        <button type="button" onClick={() => onAnswer(ask.id, 'deny')}>
          {t('Refuse')}
        </button>
        <button type="button" onClick={() => onAnswer(ask.id, 'once')}>
          {t('Just this once')}
        </button>
        {ask.remembering && (
          <button
            type="button"
            className="golem-ask__always"
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
    <div className="golem-fold" ref={host}>
      <button
        type="button"
        className="golem-composer__attach"
        aria-label={t('More')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ＋
      </button>
      {open && (
        <div className="golem-fold__menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="golem-fold__item"
            onClick={() => {
              setOpen(false)
              onPick()
            }}
          >
            <span className="golem-fold__glyph" aria-hidden="true">
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
              className="golem-fold__item"
              onClick={() => {
                setOpen(false)
                button.onClick(button.api)
              }}
            >
              <span className="golem-fold__glyph" aria-hidden="true">
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
      className={`golem-composer${dropping ? ' golem-composer--dropping' : ''}`}
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
            className="golem-composer__attach"
            onClick={() => picker.current?.click()}
            aria-label={t('Attach files')}
          >
            📎
          </button>
          {extraButtons?.map((button) => (
            <button
              key={button.key}
              type="button"
              className="golem-composer__attach"
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
        className="golem-composer__input"
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
        <button type="button" className="golem-composer__stop" onClick={onStop} aria-label={t('Stop')}>
          ■
        </button>
      ) : (
        <button
          type="submit"
          className="golem-composer__send"
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
    <div className="golem-attachments">
      {attachments.map((attachment) => (
        <span key={attachment.id} className="golem-attachments__item">
          {attachment.name}
          <button type="button" onClick={() => onRemove(attachment.id)} aria-label={`Remove ${attachment.name}`}>
            ×
          </button>
        </span>
      ))}
      {error && <span className="golem-attachments__error">{error}</span>}
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
  const [messages, setMessages] = useState<Message[]>([])
  const [live, setLive] = useState<TurnState | undefined>()
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
  const [contextTokens, setContextTokens] = useState(0)
  const [threads, setThreads] = useState<readonly ConversationMeta[]>([])
  const [threadsOpen, setThreadsOpen] = useState(false)
  const [conversationId, setConversationId] = useState<string | undefined>()
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
  const sessionId = useRef<string | undefined>(undefined)
  /** Set by the composer once it exists, so `compose` reaches its field. */
  const composeRef = useRef<((text: string) => void) | undefined>(undefined)
  const attachRef = useRef<((files: readonly File[]) => Promise<void>) | undefined>(undefined)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void listConversations(fetchImpl).then(setThreads)
  }, [fetchImpl])

  const openThread = useCallback(
    async (id: string) => {
      const conversation = await readConversation(id, fetchImpl)
      if (!conversation) return
      setConversationId(conversation.id)
      // Replayed FAITHFULLY: tool trace, interruptions and all. The stored
      // transcript is what the UI drew, so replaying it needs no second path.
      setMessages(conversation.messages.map(toMessage))
      sessionId.current = conversation.sessionId
      setContextTokens(conversation.messages.at(-1)?.usage?.contextTokens ?? 0)
      setThreadsOpen(false)
    },
    [fetchImpl],
  )

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

  const startThread = useCallback(() => {
    setConversationId(undefined)
    setMessages([])
    setContextTokens(0)
    sessionId.current = undefined
    setThreadsOpen(false)
  }, [])

  useEffect(() => {
    // Guarded because an exception thrown in an effect tears down the whole
    // render: scrolling is a courtesy, and no environment should lose the
    // chat because it lacks one DOM convenience.
    const anchor = bottom.current
    if (typeof anchor?.scrollIntoView === 'function') anchor.scrollIntoView({ block: 'end' })
  }, [messages, live?.text])

  const send = useCallback(
    async (text: string, attachments: readonly PendingAttachment[] = []) => {
      setMessages((current) => [
        ...current,
        {
          id: `u${current.length}`,
          role: 'user',
          text: attachments.length > 0 ? `${text}\n📎 ${attachments.map((a) => a.name).join(', ')}`.trim() : text,
        },
      ])

      // A thread is created on the first message rather than on arrival: an
      // instance nobody has spoken to should not accumulate empty threads.
      let thread = conversationId
      if (!thread) {
        // Named from the first message, at creation: a title set in a second
        // call is a title lost whenever that call is.
        const title = titleFrom(text)
        const created = await createConversation(fetchImpl, title)
        if (created) {
          thread = created.id
          setConversationId(thread)
          setThreads((current) => [{ ...created, title }, ...current])
        }
      }

      let last: TurnState | undefined
      for await (const state of runTurn(
        {
          prompt: text,
          ...(sessionId.current ? { sessionId: sessionId.current } : {}),
          ...(model ? { model } : {}),
          ...(thread ? { conversationId: thread } : {}),
          ...(attachments.length > 0 ? { attachments: attachments.map((a) => a.id) } : {}),
          ...(view ? { view } : {}),
        },
        fetchImpl,
      )) {
        last = state
        setLive(state)
      }

      if (last) {
        sessionId.current = last.sessionId ?? sessionId.current
        if (last.contextTokens !== undefined) setContextTokens(last.contextTokens)
        setMessages((current) => [
          ...current,
          {
            id: `a${current.length}`,
            role: 'agent',
            text: last.text,
            tools: last.tools,
            stopped: last.stopped,
            error: last.error,
          },
        ])
      }
      setLive(undefined)
    },
    [conversationId, fetchImpl, model, view],
  )

  useEffect(() => {
    // Published once the sender exists, so a plugin loaded before the chat
    // mounted still gets a working channel rather than a silent no-op.
    onReady?.({
      ask: (prompt: string) => void send(prompt),
      compose: (text: string) => composeRef.current?.(text),
      attach: async (files: readonly File[]) => attachRef.current?.(files),
    })
  }, [onReady, send])

  const stop = useCallback(() => {
    if (!sessionId.current) return
    void (fetchImpl ?? fetch)('/api/turn/stop', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId.current }),
    })
  }, [fetchImpl])

  return (
    <section className="golem-chat">
      <header className="golem-chat__header">
        {/* The crest markup comes from the skin MODULE — code the instance
            already chose to run — never from a manifest. */}
        {crest && (
          <span className="golem-crest" aria-hidden="true" dangerouslySetInnerHTML={{ __html: crest }} />
        )}
        <span className="golem-brandname">{brand ?? 'Golem'}</span>
        {/* Next to the name of the thing about to speak: which engine answers
            belongs to the conversation, not to the message being typed. */}
        <ModelPicker models={models} model={model} onModel={chooseModel} t={t} />
        <span className="golem-chat__spacer" />
        <ContextPill tokens={contextTokens} {...(contextWindow ? { windowSize: contextWindow } : {})} />
        <button
          type="button"
          className="golem-ib"
          onClick={() => setThreadsOpen(!threadsOpen)}
          aria-label={t('Conversations')}
          aria-expanded={threadsOpen}
        >
          ▤
        </button>
        <button type="button" className="golem-ib" onClick={startThread} aria-label="New conversation">
          ＋
        </button>
        {onOpenCanvas && (
          <button type="button" className="golem-ib" onClick={onOpenCanvas} aria-label="Open apps">
            ▥
          </button>
        )}
      </header>

      {threadsOpen && (
        <ul className="golem-threads">
          {threads.length === 0 && <li className="golem-threads__empty">No conversation yet.</li>}
          {threads.map((thread) => (
            <li key={thread.id}>
              <button
                type="button"
                className={`golem-threads__item${
                  thread.id === conversationId ? ' golem-threads__item--current' : ''
                }`}
                onClick={() => void openThread(thread.id)}
              >
                {thread.title}
              </button>
              {/* Put away, not deleted: the only tool for tidying up was a
                  delete that took every word with it. */}
              <button
                type="button"
                className="golem-threads__archive"
                aria-label={`${t('Archive')} — ${thread.title}`}
                title={t('Archive')}
                onClick={() => {
                  void (async () => {
                    if (!(await archiveConversation(fetchImpl ?? fetch, thread.id))) return
                    setThreads((current) => current.filter((entry) => entry.id !== thread.id))
                    // Archiving the thread you are reading leaves you nowhere
                    // in particular; a fresh one is the honest landing.
                    if (thread.id === conversationId) startThread()
                  })()
                }}
              >
                {/* A box with a lid, not a backspace: the previous glyph read
                    as "delete", which is the one thing this does not do. */}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="4" rx="1" />
                  <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
                  <path d="M10 12h4" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="golem-chat__thread">
        {messages.map((message) => (
          <Bubble key={message.id} message={message} {...(openPage ? { openPage } : {})} />
        ))}

        {live && (
          <article className="golem-bubble golem-bubble--agent golem-bubble--live">
            <ToolTrace tools={live.tools} />
            {live.text ? (
              <LiveProse text={live.text} {...(openPage ? { openPage } : {})} />
            ) : (
              <div className="golem-bubble__working">
                {busySlot ? (
                  <SkinSlot
                    render={busySlot}
                    className="golem-busy-host"
                    context={{ ask: () => {}, compose: () => {}, focusComposer: () => {} }}
                  />
                ) : (
                  <span className="golem-dots" aria-label="Working" />
                )}
                {/* The climbing counter, when the driver can feed it. */}
                {live.outputTokens > 0 && (
                  <span className="golem-bubble__counter">{formatTokens(live.outputTokens)}</span>
                )}
              </div>
            )}
          </article>
        )}
        <div ref={bottom} />
      </div>

      {live?.ask && !answered.has(live.ask.id) && (
        <AskPrompt
          ask={live.ask}
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
        busy={live?.running ?? false}
        blocked={live?.ask !== undefined && !answered.has(live.ask.id)}
        {...(placeholder ? { placeholder } : {})}
        t={t}
      />
    </section>
  )
}
