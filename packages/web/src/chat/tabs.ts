/**
 * Which conversations are open as tabs, and which ones have been read.
 *
 * The tab bar behaves like a browser's, and every rule that makes it feel
 * that way lives here rather than in the component: a new tab opens at the
 * END, closing the active tab falls to the RIGHT neighbour before the left,
 * dragging reorders by index. Kept apart from React so those rules are
 * testable without rendering anything, and shared so the tab bar and the
 * thread list cannot disagree about what a conversation's dot means.
 *
 * Per browser, like the model choice and the mosaic order: which tabs *I*
 * have open is how one person finds their screen again, not a property of
 * the workspace every reader of the instance would inherit.
 */

/** Which conversations are open as tabs, in order, and which one is active. */
export interface TabsState {
  readonly open: readonly string[]
  readonly active?: string
}

export const TABS_KEY = 'demeura.tabs'
export const READ_KEY = 'demeura.read'

/** Read marks beyond this are noise: prune so the map cannot grow forever. */
const READ_CAP = 200

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/**
 * "No active tab" is the ABSENCE of the property, not `active: undefined` —
 * `exactOptionalPropertyTypes` makes the compiler hold this module to that,
 * so every state is assembled here instead of by spreading a maybe.
 */
function state(open: readonly string[], active: string | undefined): TabsState {
  return active === undefined ? { open } : { open, active }
}

/**
 * The default store, resolved lazily and guardedly.
 *
 * Private windows and blocked site data throw on ACCESS, not on read — and
 * tests run with no `window` at all. Either way the answer is the same: no
 * store, so nothing persists and everything else still works.
 */
function fallback(): Store | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export function loadTabs(storage: Store | undefined = fallback()): TabsState {
  const empty: TabsState = { open: [] }
  if (!storage) return empty
  try {
    const raw = storage.getItem(TABS_KEY)
    if (!raw) return empty
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return empty
    const shape = parsed as { open?: unknown; active?: unknown }
    // Checked rather than trusted: this is user-writable storage, and a shape
    // the shell did not expect would otherwise throw mid-render and take the
    // whole chat with it over a convenience.
    if (!Array.isArray(shape.open)) return empty
    const open: string[] = []
    for (const entry of shape.open) {
      if (typeof entry !== 'string' || entry === '') continue
      if (open.includes(entry)) continue // a duplicate tab is two answers to one thread
      open.push(entry)
    }
    return state(
      open,
      typeof shape.active === 'string' && open.includes(shape.active) ? shape.active : undefined,
    )
  } catch {
    // Corrupt value throws on parse, refused storage throws on access. Both
    // mean the same thing here: no remembered tabs, start with none.
    return empty
  }
}

export function saveTabs(state: TabsState, storage: Store | undefined = fallback()): void {
  try {
    storage?.setItem(TABS_KEY, JSON.stringify({ open: state.open, active: state.active }))
  } catch {
    /* tabs that cannot persist still hold for this visit */
  }
}

/** A conversation joins the bar at the END, the way a browser opens tabs. */
export function openTab(tabs: TabsState, id: string, activate = true): TabsState {
  const already = tabs.open.includes(id)
  if (already && (!activate || tabs.active === id)) return tabs
  const open = already ? tabs.open : [...tabs.open, id]
  return state(open, activate ? id : tabs.active)
}

/**
 * Closing the active tab falls to the RIGHT neighbour, then the left, then
 * nothing — exactly how browsers do it, because that is the muscle memory
 * everyone using a tab bar already has.
 */
export function closeTab(tabs: TabsState, id: string): TabsState {
  const index = tabs.open.indexOf(id)
  if (index === -1) return tabs
  const open = tabs.open.filter((entry) => entry !== id)
  if (tabs.active !== id) return state(open, tabs.active)
  // After removal the right neighbour sits at the closed tab's own index.
  return state(open, open[index] ?? open[index - 1])
}

export function activateTab(tabs: TabsState, id: string): TabsState {
  // A tab that is not open cannot become active — activation is a property
  // of the bar, not a way to sneak a conversation into it.
  if (!tabs.open.includes(id) || tabs.active === id) return tabs
  return { open: tabs.open, active: id }
}

/**
 * One tab picked up and put down elsewhere. Indices are CLAMPED rather than
 * rejected: a drag that overshoots the last tab means "put it last", not
 * "do nothing" — the finger's intent is obvious even when its geometry is not.
 */
export function moveTab(tabs: TabsState, from: number, to: number): TabsState {
  const last = tabs.open.length - 1
  if (last < 0) return tabs
  const clamp = (index: number) => Math.min(Math.max(index, 0), last)
  const source = clamp(from)
  const target = clamp(to)
  if (source === target) return tabs
  const open = [...tabs.open]
  const [moved] = open.splice(source, 1)
  open.splice(target, 0, moved as string)
  return state(open, tabs.active)
}

/** The read-mark map, or nothing — same degradation as everything above. */
function readMarks(storage: Store | undefined): Record<string, string> {
  if (!storage) return {}
  try {
    const raw = storage.getItem(READ_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const marks: Record<string, string> = {}
    for (const [id, at] of Object.entries(parsed)) {
      if (typeof at === 'string') marks[id] = at
    }
    return marks
  } catch {
    return {}
  }
}

/**
 * Records that the user has SEEN this conversation as of `at`.
 *
 * Pruned to the most recent entries by timestamp: a mark only matters while
 * its thread still shows up somewhere, and a map that grows by one key per
 * conversation forever is a leak wearing a feature's clothes.
 */
export function markRead(id: string, at: string, storage: Store | undefined = fallback()): void {
  if (!storage) return
  try {
    const marks = readMarks(storage)
    marks[id] = at
    const kept = Object.entries(marks)
      .sort(([, a], [, b]) => (a > b ? -1 : a < b ? 1 : 0))
      .slice(0, READ_CAP)
    storage.setItem(READ_KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch {
    /* a mark that cannot persist costs one dot, not the chat */
  }
}

export function lastReadAt(id: string, storage: Store | undefined = fallback()): string | undefined {
  return readMarks(storage)[id]
}

/**
 * Finished since the user last looked?
 *
 * Plain string comparison: both sides are ISO timestamps, which order
 * lexically. An empty `updatedAt` (a thread that never got a turn) is never
 * unread — there is nothing in it to have missed.
 */
export function isUnread(
  meta: { id: string; updatedAt: string },
  storage: Store | undefined = fallback(),
): boolean {
  if (!meta.updatedAt) return false
  const seen = lastReadAt(meta.id, storage)
  return seen === undefined || meta.updatedAt > seen
}

export type TabDot = 'waiting' | 'working' | 'unread' | 'idle'

/**
 * The one place that decides what a conversation's dot shows, shared by the
 * tab bar and the thread list so they cannot drift apart.
 *
 * Waiting outranks everything: the engine is blocked on a person, and a
 * waiting turn IS also a running one — showing "working" would tell the user
 * to keep waiting when the engine is waiting for THEM.
 */
export function dotFor(state: { waiting?: boolean; working?: boolean; unread?: boolean }): TabDot {
  if (state.waiting) return 'waiting'
  if (state.working) return 'working'
  if (state.unread) return 'unread'
  return 'idle'
}
