// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useConversations } from '../src/chat/useConversations.js'

const encoder = new TextEncoder()
const frame = (event: unknown) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** An SSE response the test feeds and closes by hand. */
function openStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
  })
  return {
    response: new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    push: (event: unknown) => controller.enqueue(frame(event)),
    close: () => controller.close(),
  }
}

describe('a message sent in the instant the running turn settles', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('does not leave its waiting bubble without anyone following the fresh stream', async () => {
    const first = openStream()
    const second = openStream()
    let secondPost!: (response: Response) => void
    const secondAnswer = new Promise<Response>((resolve) => {
      secondPost = resolve
    })
    let posts = 0
    let consumerDone!: () => void
    const consumerFinished = new Promise<void>((resolve) => {
      consumerDone = resolve
    })

    const fetchImpl = (async (url: string, init?: RequestInit) => {
      const path = String(url)
      if (path === '/api/turn') {
        posts += 1
        return posts === 1 ? first.response : secondAnswer
      }
      if (path.startsWith('/api/turn/attach')) {
        // The first turn's consumer asks for a follow-up: nothing is running.
        consumerDone()
        return new Response(null, { status: 204 })
      }
      if (init?.method === 'POST' && path === '/api/conversations') {
        return json({ id: 'c1', title: 't', updatedAt: '' })
      }
      if (path === '/api/conversations/c1') {
        return json({ id: 'c1', title: 't', updatedAt: '', messages: [] })
      }
      return json({ conversations: [] })
    }) as unknown as typeof fetch

    const { result } = renderHook(() =>
      useConversations({ fetchImpl, t: (key) => key, narrow: false, model: '' }),
    )

    await act(async () => {
      void result.current.send('un')
    })
    await waitFor(() => expect(result.current.conversation('c1').turning).toBe(true))

    // Sent during the turn: held, its POST left and waits for the desk.
    await act(async () => {
      void result.current.send('deux')
    })
    await waitFor(() => expect(posts).toBe(2))
    expect(result.current.conversation('c1').held).toHaveLength(1)

    // The turn settles and its consumer finishes (attach 204) BEFORE the POST answers.
    await act(async () => {
      first.push({ type: 'result', stopped: false })
      first.close()
      await consumerFinished
    })
    await waitFor(() => expect(result.current.conversation('c1').turning).toBe(false))

    // The desk, having settled, answers the held message with a fresh stream.
    await act(async () => {
      secondPost(second.response)
    })

    // Someone must follow it: the bubble is gone and the stream is pumped.
    await waitFor(() => expect(result.current.conversation('c1').held).toHaveLength(0))
    expect(result.current.conversation('c1').turning).toBe(true)

    await act(async () => {
      second.push({ type: 'result', stopped: false })
      second.close()
    })
    await waitFor(() => expect(result.current.conversation('c1').turning).toBe(false))
  })
})
