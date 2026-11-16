// @vitest-environment jsdom
/**
 * What the offline banner DECIDES, without a browser (B-19, AD-27): the screen tests of
 * `besoin-hors-ligne-*`, `ensemble-hors-ligne-browser` keep where the banner sits and how it
 * looks; whether it is lit — which answers say the server is away, what the event feed and the
 * browser's own "offline" signal change — is read here, from the reach layer and its inputs.
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { followChanges } from '../src/app/live.js'
import { useServerReach } from '../src/app/serverReach.js'

const res = (status: number) => ({ ok: status >= 200 && status < 300, status }) as unknown as Response

/** A fetch whose /api/health answer is set by the test, and which counts the probes; every other call answers `other`. */
function link(other: (url: string) => Promise<Response>) {
  const state = { healthUp: false, probes: 0 }
  const fetchImpl = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/health') {
      state.probes += 1
      return state.healthUp ? Promise.resolve(res(200)) : Promise.reject(new TypeError('Failed to fetch'))
    }
    return other(url)
  }) as unknown as typeof fetch
  return { state, fetchImpl }
}
const FAST = { probeMs: 20, probeTimeoutMs: 200 }

describe('a server that answers is not away', () => {
  it.each([401, 403, 500])('an HTTP %i on a call is the server answering: no probe, no banner', async (status) => {
    const { state, fetchImpl } = link(() => Promise.resolve(res(status)))
    const { result } = renderHook(() => useServerReach(fetchImpl, FAST))
    await act(async () => {
      await result.current.fetchImpl('/api/instructions')
    })
    await new Promise((r) => setTimeout(r, 100))
    expect(state.probes).toBe(0)
    expect(result.current.reachable).toBe(true)
  })

  it("the browser's own offline signal lights nothing while the server answers", async () => {
    const { state, fetchImpl } = link(() => Promise.resolve(res(200)))
    const { result } = renderHook(() => useServerReach(fetchImpl, FAST))
    await act(async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
      window.dispatchEvent(new Event('offline'))
      await new Promise((r) => setTimeout(r, 100))
    })
    expect(state.probes).toBe(0)
    expect(result.current.reachable).toBe(true)
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  })
})

describe('the banner is lit by a failed probe, and goes by itself', () => {
  it('the event feed dropping and the probe failing say away; the probe answering says back', async () => {
    const { state, fetchImpl } = link(() => Promise.resolve(res(200)))
    const { result } = renderHook(() => useServerReach(fetchImpl, FAST))
    const controller = new AbortController()
    const events = (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch
    const following = followChanges({
      fetchImpl: events,
      signal: controller.signal,
      retryMs: 60_000,
      onChange: () => undefined,
      onLink: (up) => result.current.report(up),
    })
    await waitFor(() => expect(result.current.reachable).toBe(false))
    state.healthUp = true
    await waitFor(() => expect(result.current.reachable).toBe(true))
    controller.abort()
    await following
  })

  it('it comes back at the next cut: not a banner for one use only', async () => {
    const { state, fetchImpl } = link(() => Promise.reject(new TypeError('Failed to fetch')))
    const { result } = renderHook(() => useServerReach(fetchImpl, FAST))
    for (let cut = 0; cut < 2; cut++) {
      state.healthUp = false
      await act(async () => {
        await result.current.fetchImpl('/api/pages').catch(() => undefined)
      })
      await waitFor(() => expect(result.current.reachable).toBe(false))
      state.healthUp = true
      await waitFor(() => expect(result.current.reachable).toBe(true))
    }
  })

  it('a 502, 503 or 504 on a call with a failing probe says away; the probe answering says back', async () => {
    for (const status of [502, 503, 504]) {
      const { state, fetchImpl } = link(() => Promise.resolve(res(status)))
      const { result, unmount } = renderHook(() => useServerReach(fetchImpl, FAST))
      await act(async () => {
        await result.current.fetchImpl('/api/instructions')
      })
      await waitFor(() => expect(result.current.reachable).toBe(false))
      state.healthUp = true
      await waitFor(() => expect(result.current.reachable).toBe(true))
      unmount()
    }
  })
})
