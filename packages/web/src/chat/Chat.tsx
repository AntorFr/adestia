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
  createConversation,
  listConversations,
  readConversation,
  titleFrom,
  type ConversationMeta,
  type StoredMessage,
} from './conversations.js'
import { runTurn, type PendingPermission, type TurnState } from './stream.js'
import { SkinSlot } from '../app/SkinSlot.js'
import type { SkinSlotRender } from '../app/skin.js'
// The drag primitive is shared with the page screen: one answer to "is this
// drag carrying files", so the two surfaces cannot disagree about it.
import { carriesFiles } from '../editor/filedrop.js'

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

export function Bubble({ message }: { message: Message }) {
  return (
    <article className={`golem-bubble golem-bubble--${message.role}`}>
      {message.role === 'agent' && <ToolTrace tools={message.tools} />}
      {message.text && <div className="golem-bubble__text">{message.text}</div>}
      {message.stopped && <p className="golem-bubble__note">Turn interrupted.</p>}
      {message.error && <p className="golem-bubble__error">{message.error}</p>}
    </article>
  )
}

export function PermissionPrompt({
  permission,
  onDecide,
  recovered = false,
}: {
  permission: PendingPermission
  onDecide: (id: string, allow: boolean) => void
  /** Found waiting after a reload, rather than raised by the turn on screen. */
  recovered?: boolean
}) {
  return (
    <div className="golem-permission" role="alertdialog" aria-label="Permission required">
      <p className="golem-permission__text">
        The agent wants to use <strong>{permission.tool}</strong>
        {permission.detail && <> — <code>{permission.detail}</code></>}
        {/* Only on a RECOVERED prompt. Live, the thread around it already
            says which conversation asked, and repeating it would be noise
            on the one surface that must stay readable in a hurry. */}
        {recovered && permission.context && (
          <span className="golem-permission__where"> — {permission.context}</span>
        )}
      </p>
      <div className="golem-permission__actions">
        <button type="button" onClick={() => onDecide(permission.id, false)}>
          Refuse
        </button>
        <button
          type="button"
          className="golem-permission__allow"
          onClick={() => onDecide(permission.id, true)}
        >
          Allow
        </button>
      </div>
    </div>
  )
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
  models,
  model,
  onModel,
  t = (key) => key,
}: {
  onSend: (text: string, attachments: readonly PendingAttachment[]) => void
  onStop: () => void
  busy: boolean
  blocked: boolean
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
  /** What this driver offers. Empty means it does not enumerate models. */
  models?: readonly ModelInfo[]
  /** The chosen id, or `''` for the CLI's own default. */
  model?: string
  onModel?: (model: string) => void
  t?: (key: string) => string
}) {
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
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`
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
      <button
        type="button"
        className="golem-composer__attach"
        onClick={() => picker.current?.click()}
        aria-label={t('Attach files')}
      >
        📎
      </button>
      {/*
        Rendered only when the driver enumerates models, so an instance whose
        CLI has no catalogue shows no empty control. AUTO is first and is the
        default: it sends no model at all and lets the CLI choose, which is a
        real answer rather than a placeholder — most turns do not care, and
        pinning one silently would override a default the operator may have
        set outside Golem.
      */}
      {models !== undefined && models.length > 0 && (
        <select
          className="golem-composer__model"
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
      )}
      {/* Rendered BY THE SHELL from declarative data, never as markup a plugin
          supplied: a button is a glyph and a title, and injected HTML here
          would be injected into the one surface every user touches. */}
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
}: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [live, setLive] = useState<TurnState | undefined>()
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

  /**
   * A permission the browser forgot.
   *
   * The prompt only ever existed inside a live turn's event stream, so a
   * reload — or a phone locking, or a tab crashing — left the agent waiting
   * on an answer nobody could give any more. The turn kept its slot until it
   * timed out minutes later, and a second one wedged the whole instance:
   * "too many turns running", with nothing on screen to explain it.
   *
   * The server was built for this and says so at `GET /api/permission` — it
   * keeps what is still waiting precisely so a reconnecting UI can re-ask.
   * Only this half was missing.
   */
  const [orphan, setOrphan] = useState<PendingPermission | undefined>()

  useEffect(() => {
    void (async () => {
      try {
        const response = await (fetchImpl ?? fetch)('/api/permission')
        if (!response.ok) return
        const body = (await response.json()) as { pending?: readonly PendingPermission[] }
        // The oldest first: it is the one holding a slot the longest.
        setOrphan(body.pending?.[0])
      } catch {
        /* nothing waiting, or nothing reachable */
      }
    })()
  }, [fetchImpl])

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
    [conversationId, fetchImpl, model],
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
        <span className="golem-chat__spacer" />
        <ContextPill tokens={contextTokens} {...(contextWindow ? { windowSize: contextWindow } : {})} />
        <button
          type="button"
          className="golem-ib"
          onClick={() => setThreadsOpen(!threadsOpen)}
          aria-label="Conversations"
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
            </li>
          ))}
        </ul>
      )}

      <div className="golem-chat__thread">
        {messages.map((message) => (
          <Bubble key={message.id} message={message} />
        ))}

        {live && (
          <article className="golem-bubble golem-bubble--agent golem-bubble--live">
            <ToolTrace tools={live.tools} />
            {live.text ? (
              <div className="golem-bubble__text">{live.text}</div>
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

      {(live?.permission ?? orphan) && (
        <PermissionPrompt
          permission={(live?.permission ?? orphan)!}
          recovered={!live?.permission}
          onDecide={(id, allow) => {
            setOrphan(undefined)
            void (async () => {
              await (fetchImpl ?? fetch)('/api/permission', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id, allow }),
              })
              // A recovered request belongs to a turn whose stream is gone:
              // answering lets it finish server-side, and its reply lands in
              // the thread rather than on a screen nobody is watching.
              if (!live?.permission && conversationId) {
                setThreads(await listConversations(fetchImpl ?? fetch))
              }
            })()
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
        blocked={live?.permission !== undefined}
        {...(placeholder ? { placeholder } : {})}
        models={models}
        model={model}
        onModel={chooseModel}
        t={t}
      />
    </section>
  )
}
