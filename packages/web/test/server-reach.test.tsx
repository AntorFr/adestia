// @vitest-environment jsdom
/**
 * The server-reach layer (AD-22): which calls are watched, what counts as
 * "down", and when `reachable` flips. Fake timers, promises settled by the test.
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { followChanges } from '../src/app/live.js'
import { observeFetch, useServerReach } from '../src/app/serverReach.js'

const res = (status: number) => ({ ok: status >= 200 && status < 300, status }) as unknown as Response

describe('observeFetch', () => {
  it.each([502, 503, 504])('reports HTTP %i as down', async (status) => {
    const report = vi.fn()
    const f = observeFetch((() => Promise.resolve(res(status))) as typeof fetch, report)
    expect((await f('/api/pages')).status).toBe(status)
    expect(report.mock.calls).toEqual([[false]])
  })

  it.each([200, 401, 404, 500])('reports HTTP %i as answering', async (status) => {
    const report = vi.fn()
    const f = observeFetch((() => Promise.resolve(res(status))) as typeof fetch, report)
    await f('/api/pages')
    expect(report.mock.calls).toEqual([[true]])
  })

  it('reports a throw as down and rethrows the very same error', async () => {
    const report = vi.fn()
    const boom = new TypeError('Failed to fetch')
    const f = observeFetch((() => Promise.reject(boom)) as typeof fetch, report)
    await expect(f('/api/pages')).rejects.toBe(boom)
    expect(report.mock.calls).toEqual([[false]])
  })

  it('says nothing of an AbortError, and rethrows it', async () => {
    const report = vi.fn()
    const abort = new DOMException('aborted', 'AbortError')
    const f = observeFetch((() => Promise.reject(abort)) as typeof fetch, report)
    await expect(f('/api/pages')).rejects.toBe(abort)
    expect(report).not.toHaveBeenCalled()
  })

  it('does not watch /api/health, nor non-/api/ paths, nor other origins', async () => {
    const report = vi.fn()
    const f = observeFetch((() => Promise.reject(new TypeError('x'))) as typeof fetch, report)
    for (const url of ['/api/health', '/assets/a.js', '/apix', 'https://elsewhere.example/api/pages']) {
      await expect(f(url)).rejects.toBeInstanceOf(TypeError)
    }
    expect(report).not.toHaveBeenCalled()
  })

  it('forwards input and init untouched', async () => {
    const inner = vi.fn(() => Promise.resolve(res(200)))
    const init = { method: 'POST' }
    await observeFetch(inner as unknown as typeof fetch, () => undefined)('/api/x', init)
    expect(inner).toHaveBeenCalledWith('/api/x', init)
  })
})

describe('useServerReach', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  /** A fetch whose /api/health answers are settled by the test. */
  function rig() {
    const probes: { resolve: (r: Response) => void; reject: (e: unknown) => void; signal?: AbortSignal | null }[] = []
    const base = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/health') {
        return new Promise<Response>((resolve, reject) => {
          probes.push({ resolve, reject, signal: init?.signal })
          init?.signal?.addEventListener('abort', () => reject(new DOMException('a', 'AbortError')))
        })
      }
      return Promise.resolve(res(200))
    }) as unknown as typeof fetch
    return { base, probes }
  }
  const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })

  it('a down signal followed by an answering probe never makes reachable false', async () => {
    const { base, probes } = rig()
    const seen: boolean[] = []
    const { result } = renderHook(() => {
      const r = useServerReach(base)
      seen.push(r.reachable)
      return r
    })
    act(() => result.current.report(false))
    expect(probes).toHaveLength(1)
    await act(async () => probes[0]!.resolve(res(200)))
    await flush()
    expect(seen).not.toContain(false)
    expect(result.current.reachable).toBe(true)
    // and the loop is over
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
    expect(probes).toHaveLength(1)
  })

  it('a failed probe says away; the next one after probeMs brings it back', async () => {
    const { base, probes } = rig()
    const { result } = renderHook(() => useServerReach(base, { probeMs: 3000, probeTimeoutMs: 5000 }))
    act(() => result.current.report(false))
    await act(async () => probes[0]!.reject(new TypeError('down')))
    await flush()
    expect(result.current.reachable).toBe(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(2999) })
    expect(probes).toHaveLength(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(probes).toHaveLength(2)
    await act(async () => probes[1]!.resolve(res(200)))
    await flush()
    expect(result.current.reachable).toBe(true)
  })

  it('a probe that never answers fails after probeTimeoutMs', async () => {
    const { base, probes } = rig()
    const { result } = renderHook(() => useServerReach(base, { probeMs: 3000, probeTimeoutMs: 5000 }))
    act(() => result.current.report(false))
    await act(async () => { await vi.advanceTimersByTimeAsync(4999) })
    expect(result.current.reachable).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(probes[0]!.signal?.aborted).toBe(true)
    expect(result.current.reachable).toBe(false)
  })

  it('a non-ok health answer is a failed probe', async () => {
    const { base, probes } = rig()
    const { result } = renderHook(() => useServerReach(base))
    act(() => result.current.report(false))
    await act(async () => probes[0]!.resolve(res(503)))
    await flush()
    expect(result.current.reachable).toBe(false)
  })

  it('a real call that answers while away brings reachable back and ends the probing', async () => {
    const { base, probes } = rig()
    const { result } = renderHook(() => useServerReach(base, { probeMs: 3000 }))
    act(() => result.current.report(false))
    await act(async () => probes[0]!.reject(new TypeError('down')))
    await flush()
    expect(result.current.reachable).toBe(false)
    await act(async () => { await result.current.fetchImpl('/api/pages') })
    expect(result.current.reachable).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
    expect(probes).toHaveLength(1)
  })

  it('an answering call during an in-flight probe retires it: a late failure stays silent', async () => {
    const { base, probes } = rig()
    const { result } = renderHook(() => useServerReach(base))
    act(() => result.current.report(false))
    act(() => result.current.report(true))
    await act(async () => probes[0]!.reject(new TypeError('late')))
    await flush()
    expect(result.current.reachable).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
    expect(probes).toHaveLength(1)
  })

  it('further down signals while probing do not stack probes', async () => {
    const { base, probes } = rig()
    const { result } = renderHook(() => useServerReach(base))
    act(() => { result.current.report(false); result.current.report(false) })
    expect(probes).toHaveLength(1)
    await act(async () => probes[0]!.reject(new TypeError('down')))
    await flush()
    act(() => result.current.report(false))
    expect(probes).toHaveLength(1)
  })

  it('the observed fetch from the hook triggers the probe on a throw; health is never observed', async () => {
    const { base, probes } = rig()
    const failing = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input) === '/api/health' ? (base as typeof fetch)(input, init) : Promise.reject(new TypeError('x')),
    ) as unknown as typeof fetch
    const { result } = renderHook(() => useServerReach(failing))
    await act(async () => { await result.current.fetchImpl('/api/pages').catch(() => undefined) })
    expect(probes).toHaveLength(1)
    await act(async () => probes[0]!.reject(new TypeError('down')))
    await flush()
    expect(result.current.reachable).toBe(false)
  })

  it('unmounting stops the probing', async () => {
    const { base, probes } = rig()
    const { result, unmount } = renderHook(() => useServerReach(base))
    act(() => result.current.report(false))
    await act(async () => probes[0]!.reject(new TypeError('down')))
    await flush()
    unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
    expect(probes).toHaveLength(1)
  })
})

describe('followChanges onLink', () => {
  function sse(hang: boolean): Response {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(': connected\n\n'))
        if (!hang) c.close()
      },
    })
    return { ok: true, status: 200, body } as unknown as Response
  }

  it('false on a refused connection, true on the reconnection', async () => {
    const controller = new AbortController()
    const links: boolean[] = []
    let calls = 0
    const fetchImpl = (() => {
      calls += 1
      return calls === 1 ? Promise.reject(new TypeError('down')) : Promise.resolve(sse(true))
    }) as unknown as typeof fetch
    const done = followChanges({
      fetchImpl,
      signal: controller.signal,
      retryMs: 1,
      onChange: () => undefined,
      onLink: (up) => {
        links.push(up)
        if (up) controller.abort()
      },
    })
    await done
    expect(links).toEqual([false, true])
  })

  it('false when the stream ends on its own, true when it reconnects', async () => {
    const controller = new AbortController()
    const links: boolean[] = []
    let calls = 0
    const fetchImpl = (() => {
      calls += 1
      return Promise.resolve(sse(calls > 1))
    }) as unknown as typeof fetch
    await followChanges({
      fetchImpl,
      signal: controller.signal,
      retryMs: 1,
      onChange: () => undefined,
      onLink: (up) => {
        links.push(up)
        if (links.length === 3) controller.abort()
      },
    })
    expect(links).toEqual([true, false, true])
  })

  it('says nothing on the 404, nor when the shell itself cuts the feed', async () => {
    const links: boolean[] = []
    await followChanges({
      fetchImpl: (() => Promise.resolve({ ok: false, status: 404 } as unknown as Response)) as unknown as typeof fetch,
      signal: new AbortController().signal,
      retryMs: 1,
      onChange: () => undefined,
      onLink: (up) => links.push(up),
    })
    expect(links).toEqual([])

    const controller = new AbortController()
    const cut: boolean[] = []
    const following = followChanges({
      fetchImpl: ((_i: unknown, init?: RequestInit) => {
        init?.signal?.addEventListener('abort', () => undefined)
        return Promise.resolve(sse(true))
      }) as unknown as typeof fetch,
      signal: controller.signal,
      retryMs: 1,
      onChange: () => undefined,
      onLink: (up) => {
        cut.push(up)
        controller.abort()
      },
    })
    await following
    expect(cut).toEqual([true])
  })

})
