// @vitest-environment jsdom
/**
 * `ready` (AD-13 b): false until the plugins are loaded AND the first index
 * request has answered — true after an answer, and true after a failure too.
 */
import { renderHook, waitFor } from '@testing-library/react'
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

function options(fetchImpl: typeof fetch) {
  return {
    fetchImpl,
    openPage: () => undefined,
    askRef: { current: undefined },
    composeRef: { current: undefined },
    blocksRef: { current: {} },
    onTrail: () => undefined,
  } as unknown as Parameters<typeof useInstance>[0]
}

function gated(indexReply: () => Promise<Response>) {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let asked!: () => void
  const indexAsked = new Promise<void>((resolve) => {
    asked = resolve
  })
  const fetchImpl = ((url: string) => {
    if (String(url).startsWith('/api/instance')) return Promise.resolve(json(INSTANCE))
    if (String(url).startsWith('/api/pages/index')) {
      asked()
      return held.then(indexReply)
    }
    return Promise.resolve(json({}))
  }) as unknown as typeof fetch
  return { fetchImpl, release, indexAsked }
}

describe('useInstance.ready', () => {
  it('is false until the index answers, then true', async () => {
    const { fetchImpl, release, indexAsked } = gated(async () => json({ entries: [], stores: [] }))
    const { result } = renderHook(() => useInstance(options(fetchImpl)))
    expect(result.current.ready).toBe(false)
    await indexAsked
    expect(result.current.ready).toBe(false)
    release()
    await waitFor(() => expect(result.current.ready).toBe(true))
  })

  it('is true when the index fails (refusal)', async () => {
    const { fetchImpl, release } = gated(async () => json({ error: 'x' }, 500))
    const { result } = renderHook(() => useInstance(options(fetchImpl)))
    release()
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.pages).toEqual([])
  })

  it('is true when the index request itself throws', async () => {
    const { fetchImpl, release } = gated(async () => {
      throw new TypeError('offline')
    })
    const { result } = renderHook(() => useInstance(options(fetchImpl)))
    release()
    await waitFor(() => expect(result.current.ready).toBe(true))
  })

  it('stays false when the instance itself cannot be reached', async () => {
    const fetchImpl = (() => Promise.resolve(json({}, 500))) as unknown as typeof fetch
    const { result } = renderHook(() => useInstance(options(fetchImpl)))
    await waitFor(() => expect(result.current.fatal).toBeDefined())
    expect(result.current.ready).toBe(false)
  })
})
