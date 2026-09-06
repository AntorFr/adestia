// @vitest-environment jsdom
/**
 * The delegations screen — a window on the delegation channel, never a desk.
 *
 * What matters here: the grouping mirrors the server's namespace seam, the
 * counted lede follows the settings-tile doctrine, and the open thread is
 * READ-ONLY — no composer, no input, nothing to type into.
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  Delegations,
  delegChips,
  groupByCaller,
  lastMoved,
  type DelegationRow,
} from '../src/app/Delegations.js'

const row = (overrides: Partial<DelegationRow> = {}): DelegationRow => ({
  caller: 'alfred',
  id: 'thread-1',
  title: 'Ranger les fiches',
  updatedAt: '2026-09-06T10:00:00.000Z',
  ...overrides,
})

describe('grouping', () => {
  it('bundles per caller, callers alphabetical, rows kept in given order', () => {
    const grouped = groupByCaller([
      row({ caller: 'nestor', id: 'n1' }),
      row({ id: 'a2', updatedAt: '2026-09-06T11:00:00.000Z' }),
      row({ id: 'a1' }),
    ])
    expect(grouped.map((group) => group.caller)).toEqual(['alfred', 'nestor'])
    expect(grouped[0]!.rows.map((entry) => entry.id)).toEqual(['a2', 'a1'])
  })
})

describe('the tile chips', () => {
  it('counts, and mentions running only when something runs', () => {
    // Chips like the neighbouring tiles' — "3 threads" is a fact; a chip
    // that always said "0 running" is a chip nobody reads.
    const t = (key: string) => key
    expect(delegChips([row()], t)).toEqual([{ text: '1 thread' }])
    expect(delegChips([row(), row({ id: 't2', turn: 'running' })], t)).toEqual([
      { text: '2 threads' },
      { text: '1 running' },
    ])
  })
})

describe('the timestamp', () => {
  it('gives the hour today and the date after that', () => {
    const noon = new Date('2026-09-06T12:00:00')
    expect(lastMoved('2026-09-06T09:30:00', 'fr', noon)).toMatch(/09[h:]30/)
    expect(lastMoved('2026-08-30T09:30:00', 'fr', noon)).toContain('30')
    expect(lastMoved('not a date', 'fr', noon)).toBe('')
  })
})

function apiFetch(
  rows: readonly DelegationRow[],
  thread?: { caller: string; id: string; title: string; messages: unknown[] },
): typeof fetch {
  return ((url: string) => {
    if (String(url) === '/api/delegations') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ delegations: rows }),
      } as unknown as Response)
    }
    return Promise.resolve({
      ok: thread !== undefined,
      status: thread ? 200 : 404,
      json: () => Promise.resolve(thread ?? { error: 'no such delegation' }),
    } as unknown as Response)
  }) as unknown as typeof fetch
}

describe('the list', () => {
  it('shows each caller as a shelf with its threads', async () => {
    render(
      <Delegations
        onOpen={() => {}}
        fetchImpl={apiFetch([row(), row({ caller: 'nestor', id: 'n1', title: 'La musique' })])}
      />,
    )
    await waitFor(() => expect(screen.getByText('alfred')).toBeTruthy())
    expect(screen.getByText('nestor')).toBeTruthy()
    expect(screen.getByText('Ranger les fiches')).toBeTruthy()
    expect(screen.getByText('La musique')).toBeTruthy()
  })

  it('opens a row as caller/id — the address the settings router carries', async () => {
    const onOpen = vi.fn()
    render(<Delegations onOpen={onOpen} fetchImpl={apiFetch([row()])} />)
    await waitFor(() => expect(screen.getByText('Ranger les fiches')).toBeTruthy())
    fireEvent.click(screen.getByText('Ranger les fiches'))
    expect(onOpen).toHaveBeenCalledWith('alfred/thread-1')
  })

  it('says out loud when nothing has been delegated yet', async () => {
    render(<Delegations onOpen={() => {}} fetchImpl={apiFetch([])} />)
    await waitFor(() =>
      expect(
        screen.getByText(/No delegated task yet/),
      ).toBeTruthy(),
    )
  })
})

describe('the open thread', () => {
  const THREAD = {
    caller: 'alfred',
    id: 'thread-1',
    title: 'Ranger les fiches',
    messages: [
      { id: 'm1', role: 'user', text: 'range les fiches', at: '2026-09-06T10:00:00Z' },
      { id: 'm2', role: 'agent', text: 'fait.', at: '2026-09-06T10:01:00Z' },
    ],
  }

  it('renders the transcript with the chat’s own bubbles, and says whose it is', async () => {
    render(<Delegations open="alfred/thread-1" onOpen={() => {}} fetchImpl={apiFetch([], THREAD)} />)
    await waitFor(() => expect(screen.getByText('range les fiches')).toBeTruthy())
    expect(screen.getByText('fait.')).toBeTruthy()
    expect(screen.getByText(/belongs to/)).toBeTruthy()
  })

  it('offers NOTHING to type into — the thread belongs to the calling agent', async () => {
    const { container } = render(
      <Delegations open="alfred/thread-1" onOpen={() => {}} fetchImpl={apiFetch([], THREAD)} />,
    )
    await waitFor(() => expect(screen.getByText('fait.')).toBeTruthy())
    expect(container.querySelector('textarea')).toBeNull()
    expect(container.querySelector('input')).toBeNull()
  })
})
