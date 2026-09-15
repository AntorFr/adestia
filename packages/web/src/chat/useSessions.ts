/**
 * The chat's sessions: which conversations are open as tabs, what each
 * remembers, and the pump that follows a turn to its end.
 *
 * Everything here used to sit inside the Chat component, above its markup.
 * It is one web of mutual calls — adoption is recursive by nature, a turn's
 * end looks for the next — written as plain functions in reading order, and
 * that is kept: the hook returns fresh functions on every render, exactly as
 * the component declared them, so nothing about closure lifetimes changed.
 */

import { useEffect, useReducer, useRef, useState } from 'react'

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
import type { Message } from './Bubble.js'
import type { PendingAttachment } from './Composer.js'
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
export const DRAFT = 'draft'

/**
 * Everything ONE open conversation carries while its tab lives.
 *
 * The chat used to hold exactly one of these, spread over half a dozen
 * useStates; tabs make it a value, keyed by conversation id. Sessions live in
 * a REF with an explicit redraw, because the pump loops that write them
 * outlive any render's closure — the same reason the old code kept `turning`
 * and `held` in refs.
 */
export interface TabSession {
  readonly messages: readonly Message[]
  readonly live?: TurnState | undefined
  readonly held: readonly HeldMessage[]
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

export interface SessionsOptions {
  readonly fetchImpl?: typeof fetch | undefined
  /** The shell's translator, for the one sentence this hook says itself. */
  readonly t: (key: string) => string
  /** A phone: the tab strip is a desktop surface, and a restore reopens one tab. */
  readonly narrow: boolean
  /** The chosen model, `''` for the CLI's own default. */
  readonly model: string
  /** The screen open beside the chat, when one is being watched. */
  readonly view?: ScreenView | undefined
}

export function useSessions({ fetchImpl, narrow, model, view, t }: SessionsOptions) {
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
  /** The tab everything composes into; DRAFT when none is open yet. */
  const activeId = tabs.active ?? DRAFT
  /** Mirror for the pump loops, which outlive any render's `tabs` closure. */
  const activeRef = useRef(activeId)
  /** In-flight thread creation, so two rapid sends share ONE conversation. */
  const threadCreation = useRef<Promise<string | undefined> | undefined>(undefined)

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

  /** The ＋ of the strip and the header: a fresh tab, conversation-less
      until its first message names one. Only ever one draft — reopening it
      just activates it. */
  function newDraft(): void {
    setTabs((state) => openTab(state, DRAFT))
    setThreadsOpen(false)
  }

  /** What the visible thread renders — everything below reads through this. */
  const active = session(activeId)

  /** The user's half, as the thread shows it — attachments named after it. */
  function stamped(text: string, attachments: readonly PendingAttachment[]): string {
    return attachments.length > 0
      ? `${text}\n📎 ${attachments.map((a) => a.name).join(', ')}`.trim()
      : text
  }

  function turnOptions(text: string, attachments: readonly PendingAttachment[], thread: string) {
    return {
      prompt: text,
      ...(model ? { model } : {}),
      conversationId: thread,
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

  /**
   * Follows one turn to its end, reads the thread back, then looks for the
   * next.
   *
   * The store is the truth about how a turn ended: the desk writes the
   * outcome BEFORE it announces the end, whoever was watching. So whether the
   * stream closed on its result or died under a sleeping phone, the same
   * thing happens next — the thread is read back and what was drawn live is
   * replaced by what was filed. This used to refile the live parts as
   * messages itself, a second copy of the server's own rule that drifted
   * from it; only when the store cannot be reached does the fragment stand,
   * still, with the end it saw drawn on it, until the next read.
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
      last = { ...(last ?? INITIAL_TURN), running: false, lost: true, error: (error as Error).message }
    }

    const filed = tabId !== DRAFT && (await reread(tabId))
    patchSession(tabId, {
      live: filed || !last ? undefined : { ...last, running: false },
      stopping: false,
      // The dot that says "finished, and you have not seen it": only when
      // the answer landed in a tab the reader was not looking at.
      unread: tabId !== activeRef.current,
    })
    if (tabId === activeRef.current) read(tabId)

    if (tabId === DRAFT) return
    const follow = await attachTurn(tabId, fetchImpl ?? fetch)
    if (follow) {
      // A stop applies to the turn it was pressed on. The message waiting
      // behind it is the next instruction, and stopping THAT one is another
      // press — so the button comes back.
      patchSession(tabId, { live: INITIAL_TURN, stopping: false })
      return consume(tabId, follow)
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
      // A turning tab has a thread: a draft never turns, its thread is made
      // before its first turn leaves.
      const start = await startTurn(
        { ...turnOptions(text, attachments, tabId), signal: controller.signal },
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
    if (!thread) {
      // No thread, no turn. The message stays drawn with the refusal under
      // it, and the next send tries the creation again. It used to leave
      // anyway — keyed by nothing, carrying the browser's own idea of the
      // engine session — as a turn nothing could read back, adopt or stop.
      patchSession(tabId, {
        live: { ...INITIAL_TURN, running: false, error: t('The conversation could not be created.') },
      })
      return
    }
    const start = await startTurn(turnOptions(text, attachments, thread), fetchImpl)

    if (start.kind === 'held') {
      // Another browser tab is running this conversation's turn: adopt it,
      // and this message rides the follow-up like any held one.
      if (!session(thread).turning) {
        const running = await attachTurn(thread, fetchImpl ?? fetch)
        if (running) {
          void pump(thread, running)
          return
        }
      }
      patchSession(thread, { live: undefined })
      return
    }

    void pump(thread, start.states)
  }
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

  return {
    tabs,
    setTabs,
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
    moveTab: (from: number, to: number) => setTabs((state) => moveTab(state, from, to)),
  }
}
