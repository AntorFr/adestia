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

import { runTurn, type PendingPermission, type TurnState } from './stream.js'

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
}: {
  permission: PendingPermission
  onDecide: (id: string, allow: boolean) => void
}) {
  return (
    <div className="golem-permission" role="alertdialog" aria-label="Permission required">
      <p className="golem-permission__text">
        The agent wants to use <strong>{permission.tool}</strong>
        {permission.detail && <> — <code>{permission.detail}</code></>}
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

export function Composer({
  onSend,
  onStop,
  busy,
  blocked,
  placeholder,
}: {
  onSend: (text: string) => void
  onStop: () => void
  busy: boolean
  blocked: boolean
  placeholder?: string
}) {
  const [text, setText] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)

  const submit = useCallback(() => {
    const value = text.trim()
    if (!value || blocked) return
    onSend(value)
    setText('')
  }, [blocked, onSend, text])

  useEffect(() => {
    const element = area.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`
  }, [text])

  return (
    <form
      className="golem-composer"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <textarea
        ref={area}
        className="golem-composer__input"
        value={text}
        placeholder={placeholder ?? 'Ask the agent…'}
        rows={1}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
      />
      {/* One button, two jobs: stop while a turn runs and the field is empty,
          send otherwise. Two buttons would put "stop" next to "send" for a
          user who is trying to queue a message. */}
      {busy && text.trim() === '' ? (
        <button type="button" className="golem-composer__stop" onClick={onStop} aria-label="Stop">
          ■
        </button>
      ) : (
        <button
          type="submit"
          className="golem-composer__send"
          disabled={text.trim() === '' || blocked}
          aria-label="Send"
        >
          ↑
        </button>
      )}
    </form>
  )
}

export interface ChatProps {
  readonly contextWindow?: number
  readonly placeholder?: string
  readonly model?: string
  readonly fetchImpl?: typeof fetch
  /** Only when the shell is folded onto one screen; absent on desktop. */
  readonly onOpenCanvas?: () => void
}

export function Chat({ contextWindow, placeholder, model, fetchImpl, onOpenCanvas }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [live, setLive] = useState<TurnState | undefined>()
  const [contextTokens, setContextTokens] = useState(0)
  const sessionId = useRef<string | undefined>(undefined)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Guarded because an exception thrown in an effect tears down the whole
    // render: scrolling is a courtesy, and no environment should lose the
    // chat because it lacks one DOM convenience.
    const anchor = bottom.current
    if (typeof anchor?.scrollIntoView === 'function') anchor.scrollIntoView({ block: 'end' })
  }, [messages, live?.text])

  const send = useCallback(
    async (text: string) => {
      setMessages((current) => [
        ...current,
        { id: `u${current.length}`, role: 'user', text },
      ])

      let last: TurnState | undefined
      for await (const state of runTurn(
        {
          prompt: text,
          ...(sessionId.current ? { sessionId: sessionId.current } : {}),
          ...(model ? { model } : {}),
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
    [fetchImpl, model],
  )

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
        <span className="golem-chat__title">Chat</span>
        {onOpenCanvas && (
          <button type="button" className="golem-switch" onClick={onOpenCanvas} aria-label="Open apps">
            Apps ›
          </button>
        )}
        <ContextPill tokens={contextTokens} {...(contextWindow ? { windowSize: contextWindow } : {})} />
      </header>

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
                <span className="golem-dots" aria-label="Working" />
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

      {live?.permission && (
        <PermissionPrompt
          permission={live.permission}
          onDecide={(id, allow) => {
            void (fetchImpl ?? fetch)('/api/permission', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ id, allow }),
            })
          }}
        />
      )}

      <Composer
        onSend={(text) => void send(text)}
        onStop={stop}
        busy={live?.running ?? false}
        blocked={live?.permission !== undefined}
        {...(placeholder ? { placeholder } : {})}
      />
    </section>
  )
}
