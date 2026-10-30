// @vitest-environment jsdom
/**
 * B-18 for E-16 (`adestia-ajouts-chat-chargements`): the conversation list and
 * the thread of a tab being adopted show their loading, and a failed read
 * offers Retry. Every response is a promise the test settles itself.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import { translator } from '../src/app/i18n.js'
import { Chat } from '../src/chat/Chat.js'

interface Call {
  readonly url: string
  readonly answer: (status: number, body?: unknown) => void
  readonly cut: () => void
}

/** Routes `/api/conversations[/id]` to held calls; the rest answers quietly. */
function bench(tabs?: { open: string[]; active: string }) {
  const store = new Map<string, string>()
  if (tabs) store.set('adestia.tabs', JSON.stringify(tabs))
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
  onTestFinished(() => { vi.unstubAllGlobals() })
  const list: Call[] = []
  const thread: Call[] = []
  const impl = vi.fn((input: unknown) => {
    const url = String(input)
    const held = (into: Call[]) =>
      new Promise<Response>((resolve, reject) => {
        into.push({
          url,
          answer: (status, body) =>
            resolve({
              ok: status >= 200 && status < 300,
              status,
              json: async () => body ?? {},
            } as unknown as Response),
          cut: () => reject(new TypeError('fetch failed')),
        })
      })
    if (url === '/api/conversations') return held(list)
    if (/^\/api\/conversations\/[^/]+$/.test(url)) return held(thread)
    if (url === '/api/turn') {
      const frame = `data: ${JSON.stringify({ type: 'result', sessionId: 's1', stopped: false })}\n\n`
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
        json: () => Promise.resolve({}),
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(frame))
            controller.close()
          },
        }),
      } as unknown as Response)
    }
    if (url.startsWith('/api/turn/attach')) {
      return Promise.resolve({ ok: true, status: 204, body: null } as unknown as Response)
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as unknown as Response)
  })
  return { fetchImpl: impl as unknown as typeof fetch, list, thread }
}

const record = (id: string) => ({
  id,
  title: `Fil ${id}`,
  updatedAt: '',
  messages: [
    { id: 'm1', role: 'user', text: `question ${id}`, at: '' },
    { id: 'm2', role: 'agent', text: `réponse ${id}`, at: '' },
  ],
})

const settle = (fn: () => void) => act(async () => { fn() })
/** Answers every list read still pending: opening the list re-reads it, and only the newest speaks. */
const answerList = (list: Call[], from: number, status: number, body?: unknown) =>
  act(async () => { for (const c of list.slice(from)) c.answer(status, body) })
const openList = () => fireEvent.click(screen.getByRole('button', { name: 'Conversations' }))

beforeEach(() => {
  try { localStorage.clear() } catch { /* no storage */ }
})
afterEach(cleanup)

describe('E-16 list', () => {
  it('shows Loading, never the empty state, while the list has not answered', async () => {
    const { fetchImpl, list } = bench()
    render(<Chat fetchImpl={fetchImpl} />)
    openList()
    expect(screen.getByRole('status').textContent).toBe('Loading…')
    expect(screen.queryByText('No conversation yet.')).toBeNull()
    await answerList(list, 0, 200, { conversations: [] })
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText('No conversation yet.')).toBeTruthy()
  })

  it('shows the rows once the list answered, with no Loading and no empty state', async () => {
    const { fetchImpl, list } = bench()
    render(<Chat fetchImpl={fetchImpl} />)
    openList()
    await answerList(list, 0, 200, { conversations: [{ id: 'c1', title: 'Premier fil', updatedAt: '' }] })
    expect(screen.getByText('Premier fil')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByText('No conversation yet.')).toBeNull()
  })

  it('on a 500 shows the server sentence and Retry, which asks the list again and shows Loading, then the rows', async () => {
    const { fetchImpl, list } = bench()
    render(<Chat fetchImpl={fetchImpl} />)
    openList()
    await answerList(list, 0, 500, { error: 'le magasin est cassé' })
    expect(screen.getByText('le magasin est cassé')).toBeTruthy()
    expect(screen.queryByText('No conversation yet.')).toBeNull()
    const before = list.length
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(list.length).toBe(before + 1)
    // Pending Retry: Loading in place of the Failure.
    expect(screen.getByRole('status').textContent).toBe('Loading…')
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.queryByText('le magasin est cassé')).toBeNull()
    await answerList(list, before, 200, { conversations: [{ id: 'c9', title: 'Revenu', updatedAt: '' }] })
    expect(screen.getByText('Revenu')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('on a cut shows the not-responding sentence, and a second failed Retry brings the Failure back with no old rows', async () => {
    const { fetchImpl, list } = bench()
    render(<Chat fetchImpl={fetchImpl} />)
    openList()
    await act(async () => { for (const c of list) c.cut() })
    expect(screen.getByText('The server is not responding')).toBeTruthy()
    const before = list.length
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await answerList(list, before, 503, {})
    expect(screen.getByText('Request failed (503)')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('says Chargement… and Réessayer in French', async () => {
    const { fetchImpl, list } = bench()
    render(<Chat fetchImpl={fetchImpl} t={translator('fr')} />)
    fireEvent.click(screen.getByRole('button', { name: 'Conversations' }))
    expect(screen.getByRole('status').textContent).toBe('Chargement…')
    await answerList(list, 0, 503, {})
    expect(screen.getByText('La requête a échoué (503)')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy()
  })

  it.each([401, 403])('on a %i draws neither Failure nor Retry nor the empty state', async (status) => {
    const { fetchImpl, list } = bench()
    render(<Chat fetchImpl={fetchImpl} />)
    openList()
    await answerList(list, 0, status, { error: 'nope' })
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.queryByText('nope')).toBeNull()
    expect(screen.queryByText('No conversation yet.')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('E-16 thread', () => {
  it('shows Loading, not the welcome, while an open tab is being adopted; the composer is blocked', async () => {
    const { fetchImpl, thread } = bench({ open: ['c1'], active: 'c1' })
    render(<Chat fetchImpl={fetchImpl} />)
    expect(screen.getByRole('status').textContent).toBe('Loading…')
    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'trop tôt' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(fetchImpl).not.toHaveBeenCalledWith('/api/turn', expect.anything())
    await settle(() => thread[0]!.answer(200, record('c1')))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText('réponse c1')).toBeTruthy()
  })

  it.each([
    ['500', (c: Call) => c.answer(500, { error: 'disque plein' }), 'disque plein'],
    ['cut', (c: Call) => c.cut(), 'The server is not responding'],
  ])('a %s read shows Failure; Retry reads again, shows Loading, then the thread', async (_name, fail, message) => {
    const { fetchImpl, thread } = bench({ open: ['c1'], active: 'c1' })
    render(<Chat fetchImpl={fetchImpl} />)
    await settle(() => fail(thread[0]!))
    expect(screen.getByText(message)).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
    // The composer stays disabled: a message now would land on an unseen thread.
    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'perdu' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(fetchImpl).not.toHaveBeenCalledWith('/api/turn', expect.anything())

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(thread.length).toBe(2)
    expect(screen.getByRole('status').textContent).toBe('Loading…')
    expect(screen.queryByText(message)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    await settle(() => thread[1]!.answer(200, record('c1')))
    expect(screen.getByText('réponse c1')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('a Retry that fails again brings the Failure back', async () => {
    const { fetchImpl, thread } = bench({ open: ['c1'], active: 'c1' })
    render(<Chat fetchImpl={fetchImpl} />)
    await settle(() => thread[0]!.answer(500, { error: 'premier' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await settle(() => thread[1]!.answer(502, {}))
    expect(screen.getByText('Request failed (502)')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })

  it('says Réessayer in French on a failed thread', async () => {
    const { fetchImpl, thread } = bench({ open: ['c1'], active: 'c1' })
    render(<Chat fetchImpl={fetchImpl} t={translator('fr')} />)
    expect(screen.getByRole('status').textContent).toBe('Chargement…')
    await settle(() => thread[0]!.answer(500, {}))
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy()
  })

  it.each([401, 403])('a %i read gives the chat no Failure and no Retry', async (status) => {
    const { fetchImpl, thread } = bench({ open: ['c1'], active: 'c1' })
    render(<Chat fetchImpl={fetchImpl} />)
    await settle(() => thread[0]!.answer(status, { error: 'refusé' }))
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.queryByText('refusé')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('a 404 closes the tab, as before: no Failure, no Retry', async () => {
    const { fetchImpl, thread } = bench({ open: ['c1'], active: 'c1' })
    render(<Chat fetchImpl={fetchImpl} />)
    await settle(() => thread[0]!.answer(404, { error: 'gone' }))
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.queryByText('gone')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(JSON.parse(localStorage.getItem('adestia.tabs') ?? '{}').open ?? []).not.toContain('c1')
  })

  it('a Retry answered 404 closes the tab too', async () => {
    const { fetchImpl, thread } = bench({ open: ['c1'], active: 'c1' })
    render(<Chat fetchImpl={fetchImpl} />)
    await settle(() => thread[0]!.answer(500, {}))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await settle(() => thread[1]!.answer(404, {}))
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(JSON.parse(localStorage.getItem('adestia.tabs') ?? '{}').open ?? []).not.toContain('c1')
  })

  it.each([500, 0])('a reread after a turn that fails (%i) draws no Failure, no Loading and keeps the thread', async (status) => {
    const { fetchImpl, thread } = bench({ open: ['c1'], active: 'c1' })
    render(<Chat fetchImpl={fetchImpl} />)
    await settle(() => thread[0]!.answer(200, record('c1')))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'encore' } })
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }) })
    // The stream's end rereads the conversation: that is the second thread read.
    await vi.waitFor(() => expect(thread.length).toBe(2))
    await settle(() => (status === 0 ? thread[1]!.cut() : thread[1]!.answer(status, { error: 'boum' })))
    expect(screen.queryByText('boum')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText('réponse c1')).toBeTruthy()
    expect(screen.getByText('encore')).toBeTruthy()
  })

  it('a new draft has no Loading and an enabled composer', () => {
    const { fetchImpl } = bench()
    render(<Chat fetchImpl={fetchImpl} />)
    expect(screen.queryByRole('status')).toBeNull()
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(false)
  })
})
