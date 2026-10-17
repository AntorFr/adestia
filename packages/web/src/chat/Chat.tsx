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
import {
  beginSignIn,
  dismissSignIn,
  loadDismissed,
  signInAsks,
  useConnections,
} from '../app/signin.js'
import type { SkinSlotRender } from '../app/skin.js'
import { useMobile } from '../app/useMobile.js'
import { AskPrompt } from './AskPrompt.js'
import { type Signature, type SigningOptions } from './Signatures.js'
import { Composer, type ComposerButton, type PendingAttachment } from './Composer.js'
import { jsonInit, requestJson } from '../app/request.js'
import { useConversations } from './useConversations.js'
import type { ModelInfo } from './ModelPicker.js'
import { ChatHeader } from './ChatHeader.js'
import { ConversationList } from './ConversationList.js'
import { TabStrip } from './TabStrip.js'
import { Thread } from './Thread.js'

/** Remembered per browser, like the predecessor's. */
const MODEL_KEY = 'adestia.model'

export interface ChatProps {
  readonly contextWindow?: number
  readonly placeholder?: string
  /** The body's name, worn on the rail. */
  readonly brand?: string
  /** SVG markup for the crest plate, from the skin module (see skin.ts). */
  readonly crest?: string
  /** SVG markup for the send glyph, from the skin module (see skin.ts). */
  readonly sendIcon?: string
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
   * turn behind its back and leave the screen out of step with the conversation.
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
  /**
   * Signatures asked for at the hub's façade: drawn as cards, and opened in
   * a sheet when `embed`. Absent when the instance names no façade.
   */
  readonly signatures?: { readonly embed: boolean }
}

/**
 * The model catalogue and the choice, remembered per browser. Lives outside
 * the conversations: it follows the person, and a send merely reads it.
 */
function useModelChoice(fetchImpl: typeof fetch | undefined) {
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

  useEffect(() => {
    // A 404 is the honest answer for a driver that cannot enumerate models,
    // and it lands here as an empty list — which draws no control at all.
    // Anything else (a network blip, a driver error) leaves it empty too: a
    // missing selector beats a selector that lists nothing.
    void (async () => {
      const result = await requestJson<{ models?: readonly ModelInfo[] }>(fetchImpl ?? fetch, '/api/models')
      // No catalogue, no control.
      if (result.ok) setModels(result.data?.models ?? [])
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
      // Storage refused: the choice still holds for this conversation, which is
      // the part the user is actually looking at.
    }
  }, [])

  return { models, model, chooseModel }
}

export function Chat({
  contextWindow,
  placeholder,
  brand,
  crest,
  sendIcon,
  busySlot,
  fetchImpl,
  t = (key) => key,
  onOpenCanvas,
  onReady,
  extraButtons,
  openPage,
  view,
  signatures,
}: ChatProps) {
  const narrow = useMobile()
  const { models, model, chooseModel } = useModelChoice(fetchImpl)
  const {
    tabs,
    conversations,
    listOpen,
    setListOpen,
    activeId,
    active,
    answered,
    setAnswered,
    conversation,
    refreshConversations,
    openConversation,
    activate,
    shut,
    archive,
    dotOf,
    newDraft,
    send,
    stop,
    moveTab,
  } = useConversations({ fetchImpl, narrow, model, view, t })
  /** Latest `send`, for the channel published to plugins (see the effect). */
  const sendRef = useRef<(text: string, attachments?: readonly PendingAttachment[]) => Promise<void>>(
    async () => {},
  )
  /** Set by the composer once it exists, so `compose` reaches its field. */
  const composeRef = useRef<((text: string) => void) | undefined>(undefined)
  const attachRef = useRef<((files: readonly File[]) => Promise<void>) | undefined>(undefined)
  const bottom = useRef<HTMLDivElement>(null)

  // The sign-in card's three halves: what this person is connected to,
  // whether THIS conversation is actually a dialogue (the agent answered, or
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

  /**
   * What a signature given here sets off.
   *
   * An immediate consent held a call the agent must make AGAIN — its turn is
   * over, and nothing tells it the person signed — so the chat says it, as the
   * person would have had to. It rides the ordinary send, queued behind a
   * running turn like anything typed. A grant is asked ahead of time and
   * nothing waits on it: signing it is the whole gesture.
   */
  const onSigned = useCallback(
    (signature: Signature) => {
      if (signature.kind !== 'consent') return
      void sendRef.current(
        `${t('Signed — resume the held call with')} {"_consent": "${signature.id}"}`,
      )
    },
    [t],
  )
  const signing: SigningOptions | undefined = signatures
    ? { embed: signatures.embed, onSigned }
    : undefined

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
      <ChatHeader
        {...(brand !== undefined ? { brand } : {})}
        {...(crest !== undefined ? { crest } : {})}
        models={models}
        model={model}
        onModel={chooseModel}
        tokens={active.live?.contextTokens ?? active.contextTokens}
        {...(contextWindow ? { contextWindow } : {})}
        listOpen={listOpen}
        setListOpen={setListOpen}
        refreshConversations={refreshConversations}
        newDraft={newDraft}
        {...(onOpenCanvas ? { onOpenCanvas } : {})}
        t={t}
      />

      {/* The tab strip — a desktop surface. On a phone the conversation list, with
          the same dots, is the whole navigation. */}
      {!narrow && tabs.open.length > 0 && (
        <TabStrip
          tabs={tabs}
          activeId={activeId}
          conversations={conversations}
          conversation={conversation}
          dotOf={dotOf}
          activate={activate}
          archive={archive}
          shut={shut}
          moveTab={moveTab}
          t={t}
        />
      )}

      {listOpen && (
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          dotOf={dotOf}
          openConversation={openConversation}
          archive={archive}
          t={t}
        />
      )}

      <Thread
        active={active}
        t={t}
        {...(openPage ? { openPage } : {})}
        signing={signing}
        {...(busySlot ? { busySlot } : {})}
        bottom={bottom}
      />


      {/* A server this person never connected to, raised where they are
          actually talking to the agent — right under the reply where it says
          it cannot act. The window closes itself after the passkey, and
          regaining focus refreshes the state that hides this card; the cross
          hides it for this browser without connecting, because a conversation
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
            // A failure is not reported: the turn will time out on its own and
            // refuse; saying so twice would put an error over a question that
            // is already gone.
            void requestJson(fetchImpl ?? fetch, '/api/permission', jsonInit('POST', { id, answer }))
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
        {...(sendIcon ? { sendIcon } : {})}
        t={t}
      />
    </section>
  )
}
