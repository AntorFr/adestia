// @vitest-environment jsdom
/**
 * A message sent while the FIRST one of a new conversation is still leaving.
 *
 * Stop reads live.running (up from the keystroke); the hold rule used to read
 * turning (up after the POST). A second message in that gap left as a fresh
 * turn and was never drawn held. It must wait for the first to have gone, ride
 * the conversation the first made, and be drawn held.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Chat } from '../src/chat/Chat.js'

beforeEach(() => {
  try {
    localStorage.clear()
  } catch {
    /* no storage, nothing to leak */
  }
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function setup(createOk: boolean) {
  const turns: { prompt: string; conversationId?: string }[] = []
  let creates = 0
  let finishCreate!: () => void
  const created = new Promise<void>((resolve) => {
    finishCreate = resolve
  })
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url)
    if (path === '/api/turn') {
      turns.push(JSON.parse(String(init?.body)))
      if (turns.length === 1) {
        return { ok: true, status: 200, body: new ReadableStream<Uint8Array>({ start() {} }) } as unknown as Response
      }
      return { ok: true, status: 202, body: null } as unknown as Response
    }
    if (path.startsWith('/api/turn/attach')) return { ok: true, status: 204, body: null } as unknown as Response
    if (init?.method === 'POST' && path === '/api/conversations') {
      creates += 1
      await created
      return createOk ? json({ id: 'c1', title: 'premier', updatedAt: '' }) : json({ error: 'no' }, 500)
    }
    if (path === '/api/conversations/c1') {
      return json({ id: 'c1', title: 'premier', updatedAt: '', turn: 'running', messages: [] })
    }
    return json({ conversations: [] })
  }) as unknown as typeof fetch
  return { turns, creates: () => creates, finishCreate, fetchImpl }
}

async function send(text: string) {
  const input = screen.getByRole('textbox')
  fireEvent.change(input, { target: { value: text } })
  await act(async () => {
    fireEvent.keyDown(input, { key: 'Enter' })
  })
}

describe('a second message sent before the first has left', () => {
  it('is drawn held, creates no second conversation, and leaves with the first one’s id', async () => {
    const s = setup(true)
    const { container } = render(<Chat fetchImpl={s.fetchImpl} />)
    await send('premier')
    await waitFor(() => expect(s.creates()).toBe(1))
    await send('deuxième') // the first is still waiting on its conversation
    expect(s.turns).toHaveLength(0) // neither left yet
    expect(container.querySelectorAll('.adestia-bubble--held')).toHaveLength(1)

    await act(async () => s.finishCreate())
    await waitFor(() => expect(s.turns).toHaveLength(2))
    expect(s.creates()).toBe(1)
    expect(s.turns.map((t) => t.prompt)).toEqual(['premier', 'deuxième'])
    expect(s.turns.map((t) => t.conversationId)).toEqual(['c1', 'c1'])
    expect(container.querySelectorAll('.adestia-bubble--held')).toHaveLength(1)
  })

  it('draws no held bubble and sends nothing when the conversation could not be made', async () => {
    const s = setup(false)
    const { container } = render(<Chat fetchImpl={s.fetchImpl} />)
    await send('premier')
    await waitFor(() => expect(s.creates()).toBe(1))
    await send('deuxième')
    await act(async () => s.finishCreate())
    await waitFor(() => expect(container.querySelectorAll('.adestia-bubble--held')).toHaveLength(0))
    expect(s.turns).toHaveLength(0)
  })
})
