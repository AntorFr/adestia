// @vitest-environment jsdom
/**
 * B-18 for E-9, E-11 and E-13 (AD-24): the mosaic, the instructions and the
 * delegations show their wait; the last two offer Retry where trying again can
 * help. Every response is a promise the test settles itself.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Delegations } from '../src/app/Delegations.js'
import { Instructions } from '../src/app/Instructions.js'
import { Preferences } from '../src/app/Preferences.js'

afterEach(cleanup)

type Call = { url: string; reply: (status: number, body: unknown) => void; cut: () => void }

function held() {
  const calls: Call[] = []
  const impl = vi.fn((input: unknown) =>
    new Promise<Response>((resolve, reject) => {
      calls.push({
        url: String(input),
        reply: (status, body) =>
          resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response),
        cut: () => reject(new TypeError('fetch failed')),
      })
    }),
  )
  return {
    impl: impl as unknown as typeof fetch,
    calls,
    pending: (url: string) => calls.filter((c) => c.url === url),
    async next(url: string, nth = 0) {
      await waitFor(() => expect(calls.filter((c) => c.url === url).length).toBeGreaterThan(nth))
      return calls.filter((c) => c.url === url)[nth]!
    },
  }
}

const loading = () => screen.queryByRole('status')
const retryButton = () => screen.queryByRole('button', { name: 'Retry' })

const FILES = [{ path: 'CLAUDE.md', modified: '2026-08-25T10:00:00Z', bytes: 40, managed: false, kind: 'instruction' }]
const ROWS = [{ caller: 'alfred', id: 'c1', title: 'Ranger les fiches', updatedAt: '2026-09-06T10:00:00.000Z' }]

describe('E-9 the mosaic', () => {
  const mosaic = (fetchImpl: typeof fetch) =>
    render(<Preferences page="" onPage={vi.fn()} onItem={vi.fn()} fetchImpl={fetchImpl} />)

  it('shows Loading over drawn tiles until all four reads answered, with no Retry', async () => {
    const h = held()
    mosaic(h.impl)
    expect(loading()).not.toBeNull()
    expect(screen.getByText('MCP servers')).toBeTruthy()
    expect(screen.getByText('Instructions')).toBeTruthy()
    expect(retryButton()).toBeNull()
    const urls = ['/api/mcp/status', '/api/mcp/servers', '/api/instructions', '/api/delegations']
    const calls = await Promise.all(urls.map((u) => h.next(u)))
    // Three of four answered: the wait stays.
    await act(async () => { calls.slice(0, 3).forEach((c) => c.reply(200, { servers: [], files: [], delegations: [] })) })
    expect(loading()).not.toBeNull()
    await act(async () => { calls[3]!.reply(200, { delegations: [] }) })
    await waitFor(() => expect(loading()).toBeNull())
  })

  it('ends Loading when the reads fail, leaves the tiles, shows no counts and no Retry', async () => {
    const h = held()
    mosaic(h.impl)
    const urls = ['/api/mcp/status', '/api/mcp/servers', '/api/instructions', '/api/delegations']
    const calls = await Promise.all(urls.map((u) => h.next(u)))
    await act(async () => {
      calls[0]!.reply(500, { error: 'boom' })
      calls[1]!.cut()
      calls[2]!.reply(500, { error: 'boom' })
      calls[3]!.reply(503, {})
    })
    await waitFor(() => expect(loading()).toBeNull())
    expect(screen.getByText('MCP servers')).toBeTruthy()
    expect(retryButton()).toBeNull()
    expect(screen.queryByText(/0 (files|instructions|servers|conversations)/)).toBeNull()
  })
})

describe('E-11 the instructions list', () => {
  const screenOf = (h: ReturnType<typeof held>, open?: string) =>
    render(<Instructions open={open} onOpen={vi.fn()} fetchImpl={h.impl} />)

  it('shows Loading before the list, then the list', async () => {
    const h = held()
    screenOf(h)
    expect(loading()).not.toBeNull()
    expect(screen.queryByText(/CLAUDE\.md/)).toBeNull()
    await act(async () => { (await h.next('/api/instructions')).reply(200, { files: FILES, paths: [] }) })
    await waitFor(() => expect(screen.getAllByText(/CLAUDE\.md/).length).toBeGreaterThan(0))
    expect(loading()).toBeNull()
  })

  for (const [name, settle] of [
    ['a 500', (c: Call) => c.reply(500, { error: 'boom' })],
    ['a cut network', (c: Call) => c.cut()],
  ] as const) {
    it(`${name}: message and Retry in place of the list; Retry reloads and shows the list`, async () => {
      const h = held()
      screenOf(h)
      await act(async () => { settle(await h.next('/api/instructions')) })
      await waitFor(() => expect(retryButton()).not.toBeNull())
      expect(screen.queryByText(/CLAUDE\.md/)).toBeNull()
      fireEvent.click(retryButton()!)
      await waitFor(() => expect(loading()).not.toBeNull())
      expect(retryButton()).toBeNull()
      await act(async () => { (await h.next('/api/instructions', 1)).reply(200, { files: FILES, paths: [] }) })
      await waitFor(() => expect(screen.getAllByText(/CLAUDE\.md/).length).toBeGreaterThan(0))
      expect(retryButton()).toBeNull()
    })
  }

  it('a 404 on the list is "this engine has no such folder", not a failure', async () => {
    const h = held()
    screenOf(h)
    await act(async () => { (await h.next('/api/instructions')).reply(404, {}) })
    await waitFor(() => expect(screen.getByText('This engine keeps its instructions elsewhere.')).toBeTruthy())
    expect(retryButton()).toBeNull()
    expect(loading()).toBeNull()
  })
})

describe('E-11 the open file', () => {
  const open = (h: ReturnType<typeof held>) => {
    render(<Instructions open="CLAUDE.md" onOpen={vi.fn()} fetchImpl={h.impl} />)
  }
  const settleList = async (h: ReturnType<typeof held>) => {
    await act(async () => { (await h.next('/api/instructions')).reply(200, { files: FILES, paths: [] }) })
  }

  it('shows Loading, never an empty editable box, then the text', async () => {
    const h = held()
    open(h)
    await settleList(h)
    await h.next('/api/instructions/CLAUDE.md')
    await waitFor(() => expect(loading()).not.toBeNull())
    expect(screen.queryByRole('textbox')).toBeNull()
    await act(async () => { (await h.next('/api/instructions/CLAUDE.md')).reply(200, { markdown: 'Regle un\n' }) })
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Regle un\n'))
  })

  it('a 500 gives message and Retry instead of an editor; Retry shows the text', async () => {
    const h = held()
    open(h)
    await settleList(h)
    await act(async () => { (await h.next('/api/instructions/CLAUDE.md')).reply(500, { error: 'boom' }) })
    await waitFor(() => expect(retryButton()).not.toBeNull())
    expect(screen.queryByRole('textbox')).toBeNull()
    fireEvent.click(retryButton()!)
    await act(async () => { (await h.next('/api/instructions/CLAUDE.md', 1)).reply(200, { markdown: 'Apres\n' }) })
    await waitFor(() => expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Apres\n'))
  })

  it('a cut network gives Retry too', async () => {
    const h = held()
    open(h)
    await settleList(h)
    await act(async () => { (await h.next('/api/instructions/CLAUDE.md')).cut() })
    await waitFor(() => expect(retryButton()).not.toBeNull())
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('a 404 on the file has a message and no Retry', async () => {
    const h = held()
    open(h)
    await settleList(h)
    await act(async () => { (await h.next('/api/instructions/CLAUDE.md')).reply(404, { error: 'gone' }) })
    await waitFor(() => expect(loading()).toBeNull())
    expect(retryButton()).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})

describe('E-13 delegations', () => {
  const list = (h: ReturnType<typeof held>) =>
    render(<Delegations onOpen={vi.fn()} fetchImpl={h.impl} />)

  it('shows Loading before the list, no empty state, then the rows', async () => {
    const h = held()
    list(h)
    expect(loading()).not.toBeNull()
    expect(screen.queryByText(/No delegated task yet/)).toBeNull()
    await act(async () => { (await h.next('/api/delegations')).reply(200, { delegations: ROWS }) })
    await waitFor(() => expect(screen.getByText(/Ranger les fiches/)).toBeTruthy())
    expect(loading()).toBeNull()
  })

  for (const [name, settle] of [
    ['a 500', (c: Call) => c.reply(500, { error: 'boom' })],
    ['a cut network', (c: Call) => c.cut()],
  ] as const) {
    it(`${name} on the list: Retry, not the empty state; Retry shows the rows`, async () => {
      const h = held()
      list(h)
      await act(async () => { settle(await h.next('/api/delegations')) })
      await waitFor(() => expect(retryButton()).not.toBeNull())
      expect(screen.queryByText(/No delegated task yet/)).toBeNull()
      fireEvent.click(retryButton()!)
      await waitFor(() => expect(loading()).not.toBeNull())
      await act(async () => { (await h.next('/api/delegations', 1)).reply(200, { delegations: ROWS }) })
      await waitFor(() => expect(screen.getByText(/Ranger les fiches/)).toBeTruthy())
      expect(retryButton()).toBeNull()
    })
  }

  const conversation = { caller: 'alfred', id: 'c1', title: 'Ranger les fiches', messages: [] }

  it('the open conversation loads, fails with Retry on 500, then shows on Retry', async () => {
    const h = held()
    render(<Delegations open="alfred/c1" onOpen={vi.fn()} fetchImpl={h.impl} />)
    expect(loading()).not.toBeNull()
    await act(async () => { (await h.next('/api/delegations/alfred/c1')).reply(500, { error: 'boom' }) })
    await waitFor(() => expect(retryButton()).not.toBeNull())
    fireEvent.click(retryButton()!)
    await act(async () => { (await h.next('/api/delegations/alfred/c1', 1)).reply(200, conversation) })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Ranger les fiches' })).toBeTruthy())
    expect(retryButton()).toBeNull()
  })

  it('a 404 on the conversation has a message and no Retry', async () => {
    const h = held()
    render(<Delegations open="alfred/c1" onOpen={vi.fn()} fetchImpl={h.impl} />)
    await act(async () => { (await h.next('/api/delegations/alfred/c1')).reply(404, { error: 'gone' }) })
    await waitFor(() => expect(loading()).toBeNull())
    expect(retryButton()).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Ranger les fiches' })).toBeNull()
  })
})
