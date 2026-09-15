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
  type Conversation,
  type ConversationMeta,
  type StoredMessage,
} from './conversations.js'
import {
  INITIAL_TURN,
  attachTurn,
  startTurn,
  type ScreenView,
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
import { Bubble, LiveProse, ToolTrace, livePartsOf, type Message } from './Bubble.js'
import { Composer, type ComposerButton, type PendingAttachment } from './Composer.js'
import { ContextPill, formatTokens } from './ContextPill.js'
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
 * A tab's session as the store has it — everything the thread REMEMBERS.
 *
 * Held bubbles go: the server writes a held message into the thread the moment
 * it accepts it, so the stored transcript already carries them as the
 * ordinary messages they became.
 */
function fromStore(conversation: Conversation): Partial<TabSession> {
  return {
    messages: conversation.messages.map(toMessage),
    held: [],
    sessionId: conversation.sessionId,
    contextTokens: conversation.messages.at(-1)?.usage?.contextTokens ?? 0,
    loaded: true,
    title: conversation.title,
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
  /**
   * Stop was pressed on the turn running now, and the engine has not landed
   * yet. Drawn as a spent button: a press that leaves no trace is a press the
   * user repeats, and this one takes a moment to bite.
   */
  readonly stopping: boolean
  readonly title?: string | undefined
}

const EMPTY_SESSION: TabSession = {
  messages: [],
  held: [],
  contextTokens: 0,
  unread: false,
  loaded: false,
  turning: false,
  stopping: false,
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
    void refreshThreads()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- plain function, stable per fetchImpl
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

  /**
   * Refetches the thread list AND pushes fresh titles into the open tabs.
   *
   * The second half is the point: a tab renders `session(id).title` first,
   * a copy taken at adoption — so a title the AGENT changed mid-turn (its
   * `rename_conversation` tool) would stay masked by the stale copy for as
   * long as the tab lives. The list is the server's truth; the copies follow.
   */
  function refreshThreads(): Promise<void> {
    return listConversations(fetchImpl).then((fresh) => {
      setThreads(fresh)
      for (const meta of fresh) {
        const open = sessionsRef.current.get(meta.id)
        if (open && open.title !== meta.title) patchSession(meta.id, { title: meta.title })
      }
    })
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
      // "No longer answers" includes answering with something that is not a
      // conversation — an error body has no transcript to replay.
      if (!conversation || !Array.isArray(conversation.messages)) {
        setTabs((state) => closeTab(state, id))
        return
      }
      // Replayed FAITHFULLY: tool trace, interruptions and all. The stored
      // transcript is what the UI drew, so replaying it needs no second path.
      patchSession(id, fromStore(conversation))
    }
    const running = await attachTurn(id, fetchImpl ?? fetch)
    if (running) {
      patchSession(id, { live: INITIAL_TURN })
      void pump(id, running)
    }
  }

  /**
   * Puts what the store holds in place of what a tab drew, for a tab whose
   * live view lost track of its turn.
   *
   * Not `adopt`, for two reasons. It is called from inside the pump, where
   * `adopt` declines because a pump is turning. And a store that does not
   * answer changes NOTHING here — false, and the tab keeps what it drew —
   * where `adopt` closes the tab: a phone waking from sleep may reach the
   * server a moment after it needs to, and that is no reason to lose the tab.
   */
  async function reread(id: string): Promise<boolean> {
    const conversation = await readConversation(id, fetchImpl)
    if (!conversation || !Array.isArray(conversation.messages)) return false
    patchSession(id, fromStore(conversation))
    return true
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
      // A thread's engine session is the server's to read from the thread,
      // and it ignores one named here; only a turn with no thread names its
      // own.
      ...(sid && !thread ? { sessionId: sid } : {}),
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
    let lost = false
    try {
      for await (const state of states) {
        last = state
        patchSession(tabId, { live: state })
      }
      lost = last?.lost === true
    } catch (error) {
      // A fetch that REJECTS — network down, server gone — must land as the
      // error it is, not leave the dots pulsing forever.
      last = { ...(last ?? INITIAL_TURN), running: false, error: (error as Error).message }
      lost = true
    }

    // The stream died before the turn did. Seen on a real instance: a phone
    // slept through a thread's first turn, woke to "Load failed" under a lone
    // tool call, and the answer — finished at the desk in the meantime — was
    // nowhere on screen. The store holds everything that finished, so it is
    // read back instead of filing the fragment; the fragment stands, error and
    // all, only when the store cannot be reached either.
    const recovered = lost && tabId !== DRAFT && (await reread(tabId))

    if (recovered) {
      patchSession(tabId, {
        live: undefined,
        stopping: false,
        unread: tabId !== activeRef.current,
      })
      if (tabId === activeRef.current) read(tabId)
    } else if (last) {
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
        stopping: false,
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
      patchSession(tabId, { live: undefined, stopping: false })
    }

    if (tabId === DRAFT) return
    const follow = await attachTurn(tabId, fetchImpl ?? fetch)
    if (follow) {
      promoteHeld(tabId)
      // A stop applies to the turn it was pressed on. The message waiting
      // behind it is the next instruction, and stopping THAT one is another
      // press — so the button comes back.
      patchSession(tabId, { live: INITIAL_TURN, stopping: false })
      return consume(tabId, follow)
    }

    if (session(tabId).held.length > 0) {
      // Held, and nothing to attach to: the merged turn ran to completion
      // faster than this re-attach. The store has the whole exchange — read
      // it back rather than guess at it. This used to go through `adopt`,
      // which declines while a pump is turning — and this IS the pump, so the
      // read never happened and the merged answer stayed off screen until a
      // reload. Unreadable, the tab is left for the next adoption to fill.
      if (!(await reread(tabId))) patchSession(tabId, { held: [], loaded: false })
    }
  }

  /** One consumer per tab — its `turning` is what `send` reads to hold back. */
  async function pump(tabId: string, states: AsyncGenerator<TurnState>): Promise<void> {
    patchSession(tabId, { turning: true })
    try {
      await consume(tabId, states)
    } finally {
      patchSession(tabId, { turning: false })
      // The turn may have changed what the LIST says — the agent renames its
      // own conversation now — and nothing else redraws it mid-session.
      void refreshThreads()
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

  /**
   * Stops the ACTIVE tab's turn — the one whose ■ the user can see.
   *
   * Named by the CONVERSATION, the same address the re-attach uses. The
   * engine's session id, which this used to send, only comes back when the
   * turn is OVER: on a thread's first turn the browser had none, the function
   * returned here, and the button posted nothing at all.
   *
   * A tab with no thread yet has nothing running either — the thread is
   * created before the turn is posted — so there is nothing to stop.
   */
  function stop(): void {
    const tabId = activeRef.current
    if (tabId === DRAFT) return
    patchSession(tabId, { stopping: true })
    void (fetchImpl ?? fetch)('/api/turn/stop', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversation: tabId }),
    })
      .then((response) => response.ok)
      .catch(() => false)
      .then((taken) => {
        // Refused or never sent: give the button back. A turn that settled
        // first clears this on its own, one line below in `consume`.
        if (!taken) patchSession(tabId, { stopping: false })
      })
  }

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
        <ContextPill tokens={active.contextTokens} {...(contextWindow ? { windowSize: contextWindow } : {})} />
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
                  if (from !== undefined) setTabs((state) => moveTab(state, from, index))
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
