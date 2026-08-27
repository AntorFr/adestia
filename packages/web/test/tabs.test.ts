/**
 * The conversation tabs behave like a browser's.
 *
 * What these tests guard is the muscle memory: a new tab opens at the END,
 * closing the active one falls RIGHT then left then nowhere, a drag that
 * overshoots clamps instead of dying. Plus the two disciplines the module
 * owes the rest of the shell — user-writable storage is checked rather than
 * trusted, and a storage that throws on access costs its feature and
 * nothing else.
 */

import { describe, expect, it } from 'vitest'

import {
  activateTab,
  closeTab,
  dotFor,
  isUnread,
  lastReadAt,
  loadTabs,
  markRead,
  moveTab,
  openTab,
  saveTabs,
  READ_KEY,
  TABS_KEY,
  type TabsState,
} from '../src/chat/tabs.js'

const store = () => {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  }
}

const refusing = {
  getItem: (): string | null => {
    throw new Error('blocked')
  },
  setItem: (): void => {
    throw new Error('blocked')
  },
  removeItem: (): void => {
    throw new Error('blocked')
  },
}

describe('loading remembered tabs', () => {
  it('round-trips through save', () => {
    const storage = store()
    saveTabs({ open: ['a', 'b'], active: 'b' }, storage)
    expect(loadTabs(storage)).toEqual({ open: ['a', 'b'], active: 'b' })
  })

  it('reads nothing as no tabs', () => {
    expect(loadTabs(store())).toEqual({ open: [] })
    expect(loadTabs(undefined)).toEqual({ open: [] })
  })

  it('survives a value somebody else wrote', () => {
    // User-writable storage: any of these would otherwise throw mid-render
    // and blank the chat over a convenience.
    const storage = store()
    storage.map.set(TABS_KEY, 'not json at all')
    expect(loadTabs(storage)).toEqual({ open: [] })
    storage.map.set(TABS_KEY, '["an", "array", "not", "an", "object"]')
    expect(loadTabs(storage)).toEqual({ open: [] })
    storage.map.set(TABS_KEY, '{"open": "not an array"}')
    expect(loadTabs(storage)).toEqual({ open: [] })
    storage.map.set(TABS_KEY, 'null')
    expect(loadTabs(storage)).toEqual({ open: [] })
  })

  it('keeps only unique non-empty string ids', () => {
    const storage = store()
    storage.map.set(TABS_KEY, JSON.stringify({ open: ['a', '', 7, null, 'b', 'a'] }))
    expect(loadTabs(storage).open).toEqual(['a', 'b'])
  })

  it('drops an active id that is not among the open tabs', () => {
    // An active tab that is not in the bar is a pointer into nothing; the
    // sanitizer must not let the component discover that at render time.
    const storage = store()
    storage.map.set(TABS_KEY, JSON.stringify({ open: ['a', 'b'], active: 'gone' }))
    expect(loadTabs(storage)).toEqual({ open: ['a', 'b'] })
    storage.map.set(TABS_KEY, JSON.stringify({ open: ['a'], active: 42 }))
    expect(loadTabs(storage)).toEqual({ open: ['a'] })
  })
})

describe('opening a tab', () => {
  it('appends at the end, like a browser', () => {
    expect(openTab({ open: ['a'], active: 'a' }, 'b')).toEqual({ open: ['a', 'b'], active: 'b' })
  })

  it('can open in the background', () => {
    expect(openTab({ open: ['a'], active: 'a' }, 'b', false)).toEqual({
      open: ['a', 'b'],
      active: 'a',
    })
  })

  it('does not duplicate an already-open id, but still switches to it', () => {
    const state: TabsState = { open: ['a', 'b'], active: 'a' }
    expect(openTab(state, 'b')).toEqual({ open: ['a', 'b'], active: 'b' })
    // Fully idempotent when there is nothing to change.
    expect(openTab(state, 'b', false)).toBe(state)
    expect(openTab(state, 'a')).toBe(state)
  })
})

describe('closing a tab', () => {
  const state: TabsState = { open: ['a', 'b', 'c'], active: 'b' }

  it('falls to the RIGHT neighbour when the active tab closes', () => {
    expect(closeTab(state, 'b')).toEqual({ open: ['a', 'c'], active: 'c' })
  })

  it('falls LEFT when there is nothing to the right', () => {
    expect(closeTab({ open: ['a', 'b'], active: 'b' }, 'b')).toEqual({ open: ['a'], active: 'a' })
  })

  it('leaves nothing active when the last tab closes', () => {
    expect(closeTab({ open: ['a'], active: 'a' }, 'a')).toEqual({ open: [] })
  })

  it('keeps the active tab when some other tab closes', () => {
    expect(closeTab(state, 'c')).toEqual({ open: ['a', 'b'], active: 'b' })
  })

  it('ignores an id that is not open', () => {
    expect(closeTab(state, 'nope')).toBe(state)
  })
})

describe('activating a tab', () => {
  it('switches to an open tab', () => {
    expect(activateTab({ open: ['a', 'b'], active: 'a' }, 'b')).toEqual({
      open: ['a', 'b'],
      active: 'b',
    })
  })

  it('is a no-op on an id that is not open, and on the already-active one', () => {
    const state: TabsState = { open: ['a'], active: 'a' }
    expect(activateTab(state, 'ghost')).toBe(state)
    expect(activateTab(state, 'a')).toBe(state)
  })
})

describe('moving a tab', () => {
  const state: TabsState = { open: ['a', 'b', 'c'], active: 'a' }

  it('reorders by index', () => {
    expect(moveTab(state, 0, 2).open).toEqual(['b', 'c', 'a'])
    expect(moveTab(state, 2, 0).open).toEqual(['c', 'a', 'b'])
  })

  it('clamps an overshooting drag instead of dropping it', () => {
    // A drag past the last tab means "put it last", not "do nothing".
    expect(moveTab(state, 0, 99).open).toEqual(['b', 'c', 'a'])
    expect(moveTab(state, 99, 0).open).toEqual(['c', 'a', 'b'])
    expect(moveTab(state, -5, 1).open).toEqual(['b', 'a', 'c'])
  })

  it('returns the same state when the move collapses to nothing', () => {
    expect(moveTab(state, 1, 1)).toBe(state)
    // Both out of range on the same side clamp to the same index.
    expect(moveTab(state, 99, 50)).toBe(state)
    const empty: TabsState = { open: [] }
    expect(moveTab(empty, 0, 1)).toBe(empty)
  })

  it('keeps the active id — activation follows the tab, not its slot', () => {
    expect(moveTab(state, 0, 2).active).toBe('a')
  })
})

describe('read marks', () => {
  it('round-trips through markRead', () => {
    const storage = store()
    markRead('a', '2026-08-27T10:00:00Z', storage)
    expect(lastReadAt('a', storage)).toBe('2026-08-27T10:00:00Z')
    expect(lastReadAt('never-seen', storage)).toBeUndefined()
  })

  it('flags a thread that finished after the user last looked', () => {
    const storage = store()
    markRead('a', '2026-08-27T10:00:00Z', storage)
    expect(isUnread({ id: 'a', updatedAt: '2026-08-27T11:00:00Z' }, storage)).toBe(true)
    expect(isUnread({ id: 'a', updatedAt: '2026-08-27T09:00:00Z' }, storage)).toBe(false)
    expect(isUnread({ id: 'a', updatedAt: '2026-08-27T10:00:00Z' }, storage)).toBe(false)
  })

  it('treats never-read as unread, and an empty updatedAt as read', () => {
    const storage = store()
    expect(isUnread({ id: 'fresh', updatedAt: '2026-08-27T10:00:00Z' }, storage)).toBe(true)
    // A thread that never got a turn has nothing in it to have missed.
    expect(isUnread({ id: 'fresh', updatedAt: '' }, storage)).toBe(false)
  })

  it('prunes to the 200 most recent marks by timestamp', () => {
    const storage = store()
    // 210 marks with strictly increasing timestamps: the ten OLDEST must go.
    for (let i = 0; i < 210; i++) {
      markRead(`id-${i}`, `2026-01-01T00:00:${String(i).padStart(2, '0')}.${String(i).padStart(3, '0')}Z`, storage)
    }
    const kept = JSON.parse(storage.map.get(READ_KEY) ?? '{}') as Record<string, string>
    expect(Object.keys(kept)).toHaveLength(200)
    expect(kept['id-9']).toBeUndefined()
    expect(kept['id-10']).toBeDefined()
    expect(kept['id-209']).toBeDefined()
  })

  it('survives a marks value somebody else wrote', () => {
    const storage = store()
    storage.map.set(READ_KEY, '["not", "a", "map"]')
    expect(lastReadAt('a', storage)).toBeUndefined()
    storage.map.set(READ_KEY, '{"a": 42, "b": "2026-01-01T00:00:00Z"}')
    expect(lastReadAt('a', storage)).toBeUndefined()
    expect(lastReadAt('b', storage)).toBe('2026-01-01T00:00:00Z')
  })
})

describe('a storage that throws', () => {
  // Private windows and blocked site data throw on ACCESS. Every entry
  // point must swallow that, because it can happen mid-render.
  it('never propagates', () => {
    expect(loadTabs(refusing)).toEqual({ open: [] })
    expect(() => saveTabs({ open: ['a'], active: 'a' }, refusing)).not.toThrow()
    expect(() => markRead('a', '2026-01-01T00:00:00Z', refusing)).not.toThrow()
    expect(lastReadAt('a', refusing)).toBeUndefined()
    expect(isUnread({ id: 'a', updatedAt: '2026-01-01T00:00:00Z' }, refusing)).toBe(true)
  })

  it('degrades the same with no storage at all', () => {
    // Node has no window: the default-storage path must resolve to nothing
    // rather than throwing, which is exactly what this environment checks.
    expect(loadTabs()).toEqual({ open: [] })
    expect(() => saveTabs({ open: [] })).not.toThrow()
    expect(() => markRead('a', '2026-01-01T00:00:00Z')).not.toThrow()
    expect(lastReadAt('a')).toBeUndefined()
  })
})

describe('the status dot', () => {
  it('ranks waiting over working over unread over idle', () => {
    // A waiting turn IS also a running one; showing "working" would tell the
    // user to keep waiting when the engine is waiting for THEM.
    expect(dotFor({ waiting: true, working: true, unread: true })).toBe('waiting')
    expect(dotFor({ working: true, unread: true })).toBe('working')
    expect(dotFor({ unread: true })).toBe('unread')
    expect(dotFor({})).toBe('idle')
    expect(dotFor({ waiting: false, working: false, unread: false })).toBe('idle')
  })
})
