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

import { type ScreenView } from './stream.js'
import { SkinSlot } from '../app/SkinSlot.js'
import {
  beginSignIn,
  dismissSignIn,
  loadDismissed,
  signInAsks,
  useConnections,
} from '../app/signin.js'
import type { SkinSlotRender } from '../app/skin.js'
import { useMobile } from '../app/useMobile.js'
// Markdown in a bubble is the SAME renderer a page is read through — one
// grammar, one switch, no second vocabulary and no new dependency.
import { Prose } from '../editor/Reader.js'
import { AskPrompt } from './AskPrompt.js'
import { Bubble, LiveProse, ToolTrace, livePartsOf } from './Bubble.js'
import { Composer, type ComposerButton, type PendingAttachment } from './Composer.js'
import { ContextPill, formatTokens } from './ContextPill.js'
import { DRAFT, useSessions } from './useSessions.js'
import { ModelPicker, type ModelInfo } from './ModelPicker.js'

/** Remembered per browser, like the predecessor's. */
const MODEL_KEY = 'adestia.model'

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
  const {
    tabs,
    threads,
    threadsOpen,
    setThreadsOpen,
    activeId,
    active,
    answered,
    setAnswered,
    session,
    refreshThreads,
    openThread,
    activate,
    shut,
    archiveThread,
    dotOf,
    newDraft,
    send,
    stop,
    moveTab,
  } = useSessions({ fetchImpl, narrow, model, view })
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

  // The sign-in card's three halves: what this person is connected to,
  // whether THIS thread is actually a conversation (the agent answered, or
  // is answering — a disconnected server is omitted from the turn, so an
  // agent reply is the closest observable to "the demand arose here"), and
  // what they already waved away.
  const connections = useConnections(fetchImpl ?? fetch)
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => loadDismissed())
  const engaged =
    active.live !== undefined || active.messages.some((message) => message.role === 'agent')
  const asks = signInAsks(engaged, connections, dismissed)

  useEffect(() => {
    // Guarded because an exception thrown in an effect tears down the whole
    // render: scrolling is a courtesy, and no environment should lose the
    // chat because it lacks one DOM convenience.
    const anchor = bottom.current
    if (typeof anchor?.scrollIntoView === 'function') anchor.scrollIntoView({ block: 'end' })
  }, [active.messages, active.live?.parts, active.held])

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

  return (
    <section className="adestia-chat">
      <header className="adestia-chat__header">
        {/* The crest markup comes from the skin MODULE — code the instance
            already chose to run — never from a manifest. */}
        {crest && (
          <span className="adestia-crest" aria-hidden="true" dangerouslySetInnerHTML={{ __html: crest }} />
        )}
        <span className="adestia-brandname">{brand ?? 'Adestia'}</span>
        {/* Next to the name of the thing about to speak: which engine answers
            belongs to the conversation, not to the message being typed. */}
        <ModelPicker models={models} model={model} onModel={chooseModel} t={t} />
        <span className="adestia-chat__spacer" />
        <ContextPill
          tokens={active.live?.contextTokens ?? active.contextTokens}
          {...(contextWindow ? { windowSize: contextWindow } : {})}
        />
        <button
          type="button"
          className="adestia-ib"
          onClick={() => {
            const opening = !threadsOpen
            setThreadsOpen(opening)
            // Reopened = refreshed: the dots read the desk's live state and
            // the updatedAt the unread marks compare against.
            if (opening) void refreshThreads()
          }}
          aria-label={t('Conversations')}
          aria-expanded={threadsOpen}
        >
          ▤
        </button>
        <button type="button" className="adestia-ib" onClick={newDraft} aria-label="New conversation">
          ＋
        </button>
        {onOpenCanvas && (
          <button type="button" className="adestia-ib" onClick={onOpenCanvas} aria-label="Open apps">
            ▥
          </button>
        )}
      </header>

      {/* The tab strip — a desktop surface. On a phone the thread list, with
          the same dots, is the whole navigation. */}
      {!narrow && tabs.open.length > 0 && (
        <div className="adestia-tabs" role="tablist">
          {tabs.open.map((id, index) => {
            const title =
              id === DRAFT
                ? t('New conversation')
                : session(id).title ?? threads.find((thread) => thread.id === id)?.title ?? '…'
            return (
              <div
                key={id}
                className={`adestia-tab${id === activeId ? ' adestia-tab--active' : ''}`}
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
                  if (from !== undefined) moveTab(from, index)
                }}
              >
                <button
                  type="button"
                  className="adestia-tab__pick"
                  onClick={() => activate(id)}
                  title={title}
                >
                  <span className={`adestia-dot adestia-dot--${dotOf(id)}`} aria-hidden="true" />
                  <span className="adestia-tab__title">{title}</span>
                </button>
                {/* Two exits, two meanings: the box puts the CONVERSATION
                    away, the cross only closes the TAB — the thread stays in
                    the list, dot and all. */}
                {id !== DRAFT && (
                  <button
                    type="button"
                    className="adestia-tab__tool"
                    aria-label={`${t('Archive')} — ${title}`}
                    title={t('Archive')}
                    onClick={() => void archiveThread(id)}
                  >
                    <ArchiveGlyph />
                  </button>
                )}
                <button
                  type="button"
                  className="adestia-tab__tool"
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
        <ul className="adestia-threads">
          {threads.length === 0 && <li className="adestia-threads__empty">No conversation yet.</li>}
          {threads.map((thread) => (
            <li key={thread.id}>
              <button
                type="button"
                className={`adestia-threads__item${
                  thread.id === activeId ? ' adestia-threads__item--current' : ''
                }`}
                onClick={() => openThread(thread.id)}
              >
                {/* The same dot vocabulary as the tab strip: on a phone this
                    list IS the tab strip. */}
                <span className={`adestia-dot adestia-dot--${dotOf(thread.id, thread)}`} aria-hidden="true" />
                {thread.title}
              </button>
              {/* Put away, not deleted: the only tool for tidying up was a
                  delete that took every word with it. */}
              <button
                type="button"
                className="adestia-threads__archive"
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

      <div className="adestia-chat__thread">
        {active.messages.map((message) => (
          <Bubble key={message.id} message={message} t={t} {...(openPage ? { openPage } : {})} />
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
                className={`adestia-bubble adestia-bubble--agent${last ? ' adestia-bubble--live' : ''}`}
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
                  <div className="adestia-bubble__working">
                    {busySlot ? (
                      <SkinSlot
                        render={busySlot}
                        className="adestia-busy-host"
                        context={{ ask: () => {}, compose: () => {}, focusComposer: () => {} }}
                      />
                    ) : (
                      <span className="adestia-dots" aria-label="Working" />
                    )}
                    {/* The climbing counter, when the driver can feed it. */}
                    {active.live!.outputTokens > 0 && (
                      <span className="adestia-bubble__counter">
                        {formatTokens(active.live!.outputTokens)}
                      </span>
                    )}
                  </div>
                )}
                {/* A fragment that stands — the stream ended and the thread
                    could not be read back — says the end it saw, the way a
                    filed message would. */}
                {last && !active.live!.running && active.live!.stopped && (
                  <p className="adestia-bubble__note">{t('Turn interrupted.')}</p>
                )}
                {last && !active.live!.running && active.live!.error && (
                  <p className="adestia-bubble__error">{active.live!.error}</p>
                )}
              </article>
            )
          })}

        {/* What was said while the agent was busy, visibly waiting its turn.
            The server holds the real queue; these leave as ONE merged turn
            when the running one settles. */}
        {active.held.map((message, index) => (
          <article key={`h${index}`} className="adestia-bubble adestia-bubble--user adestia-bubble--held">
            <div className="adestia-bubble__text">
              {message.text || `📎 ${message.attachments.map((a) => a.name).join(', ')}`}
            </div>
          </article>
        ))}
        <div ref={bottom} />
      </div>

      {/* A server this person never connected to, raised where they are
          actually talking to the agent — right under the reply where it says
          it cannot act. The window closes itself after the passkey, and
          regaining focus refreshes the state that hides this card; the cross
          hides it for this browser without connecting, because a thread
          about something else entirely owes nobody a nag. */}
      {asks.map((name) => (
        <div className="adestia-connect" key={name} role="status">
          <span className="adestia-connect__text">
            <strong>{name}</strong> {t('asks you to connect before it can act for you.')}
          </span>
          <button type="button" className="adestia-connect__go" onClick={() => beginSignIn(name)}>
            {t('Connect')}
          </button>
          <button
            type="button"
            className="adestia-connect__hide"
            aria-label={`${t('Not now')} — ${name}`}
            title={t('Not now')}
            onClick={() => setDismissed(dismissSignIn(name))}
          >
            ✕
          </button>
        </div>
      ))}

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
        stopping={active.stopping}
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
