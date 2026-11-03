// @vitest-environment jsdom
/**
 * AD-21: `useInstance` publishes the last `pages-changed` batch as
 * `pageChanges` from the stream it already holds — and opens no second one.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useInstance } from '../src/app/useInstance.js'

const INSTANCE = {
  driver: { label: 'T', cliVersion: '1', capabilities: [] },
  auth: { mode: 'none' },
  user: { userId: 'local', displayName: 'Local' },
  skin: 'default',
  plugins: [],
  pluginProblems: [],
  turns: { max: 3, running: 0 },
}
const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: () => Promise.resolve(body) }) as unknown as Response

const options = (fetchImpl: typeof fetch) =>
  ({
    fetchImpl,
    openPage: () => undefined,
    askRef: { current: undefined },
    composeRef: { current: undefined },
    blocksRef: { current: {} },
    onTrail: () => undefined,
  }) as unknown as Parameters<typeof useInstance>[0]

function feed(events: 'stream' | 'off') {
  const urls: string[] = []
  let push!: (paths: string[]) => void
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      push = (paths) => c.enqueue(enc.encode(`event: pages-changed\ndata: ${JSON.stringify({ type: 'pages-changed', paths })}\n\n`))
    },
  })
  const fetchImpl = ((url: string) => {
    urls.push(String(url))
    if (String(url).startsWith('/api/instance')) return Promise.resolve(json(INSTANCE))
    if (String(url).startsWith('/api/pages/index')) return Promise.resolve(json({ entries: [], stores: [] }))
    if (String(url).startsWith('/api/events')) {
      if (events === 'off') return Promise.resolve(json({}, 404))
      return Promise.resolve({ ok: true, status: 200, body } as unknown as Response)
    }
    return Promise.resolve(json({}))
  }) as unknown as typeof fetch
  return { fetchImpl, urls, push: (p: string[]) => push(p) }
}

describe('useInstance.pageChanges', () => {
  it('is seq 0 until a batch arrives, then carries each batch with a growing seq', async () => {
    const f = feed('stream')
    const opts = options(f.fetchImpl)
    const { result } = renderHook(() => useInstance(opts))
    await waitFor(() => expect(f.urls.some((u) => u.startsWith('/api/events'))).toBe(true))
    expect(result.current.pageChanges).toEqual({ seq: 0, paths: [] })
    await act(async () => f.push(['a.md']))
    await waitFor(() => expect(result.current.pageChanges).toEqual({ seq: 1, paths: ['a.md'] }))
    await act(async () => f.push(['a.md']))
    await waitFor(() => expect(result.current.pageChanges).toEqual({ seq: 2, paths: ['a.md'] }))
    expect(f.urls.filter((u) => u.startsWith('/api/events'))).toHaveLength(1)
  })

  it('stays at seq 0 when the feed is off (404)', async () => {
    const f = feed('off')
    const opts = options(f.fetchImpl)
    const { result } = renderHook(() => useInstance(opts))
    await waitFor(() => expect(f.urls.some((u) => u.startsWith('/api/events'))).toBe(true))
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.pageChanges).toEqual({ seq: 0, paths: [] })
  })
})
