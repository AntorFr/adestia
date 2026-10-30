/**
 * Does the server answer? (AD-22)
 *
 * The shell learns it from what it already does: every `/api/` call it makes
 * is watched, and the event feed reports its own link. A call that fails is
 * only a hint — one blip must not flash a banner — so a hint starts a probe of
 * `GET /api/health`, and only a failed probe says the server is away.
 * `navigator.onLine` is not used: with a VPN down the browser is "online".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/** Called with the outcome of an observed call: `true` = the server answered. */
export type ReachReport = (answered: boolean) => void

const HEALTH = '/api/health'

function pathOf(input: Parameters<typeof fetch>[0]): string | undefined {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  try {
    // A relative path is resolved against a base only to be parsed; same-origin only.
    const base = typeof location === 'undefined' ? 'http://localhost' : location.href
    const url = new URL(raw, base)
    if (typeof location !== 'undefined' && url.origin !== location.origin) return undefined
    return url.pathname
  } catch {
    return undefined
  }
}

function isObserved(input: Parameters<typeof fetch>[0]): boolean {
  const path = pathOf(input)
  return path !== undefined && path.startsWith('/api/') && path !== HEALTH
}

/**
 * A `fetch` that forwards every call unchanged and reports its outcome for
 * `/api/` calls (except `/api/health`). Down = a throw that is not an abort,
 * or a 502/503/504; any other answer means the server is there. The failure
 * itself is rethrown as it came.
 */
export function observeFetch(fetchImpl: typeof fetch, report: ReachReport): typeof fetch {
  return async (input, init) => {
    if (!isObserved(input)) return fetchImpl(input, init)
    let response: Response
    try {
      response = await fetchImpl(input, init)
    } catch (error) {
      // A deliberate abort (navigation, a stopped turn) says nothing of the server.
      // Name only: a DOMException is not always an Error instance (jsdom).
      if ((error as { name?: unknown } | null)?.name !== 'AbortError') report(false)
      throw error
    }
    report(!(response.status === 502 || response.status === 503 || response.status === 504))
    return response
  }
}

export interface ReachOptions {
  /** Delay between probes while the server is thought away. */
  readonly probeMs?: number
  /** A probe that has not answered by then has failed. */
  readonly probeTimeoutMs?: number
}

export function useServerReach(
  fetchImpl: typeof fetch,
  { probeMs = 3000, probeTimeoutMs = 5000 }: ReachOptions = {},
): { fetchImpl: typeof fetch; reachable: boolean; report: ReachReport } {
  const [reachable, setReachable] = useState(true)
  /** Identifies the running probe loop; 0 = none. Bumping it retires a loop. */
  const loop = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const abort = useRef<AbortController | undefined>(undefined)
  const raw = useRef(fetchImpl)
  raw.current = fetchImpl

  const stop = useCallback(() => {
    loop.current = 0
    clearTimeout(timer.current)
    timer.current = undefined
    abort.current?.abort()
    abort.current = undefined
  }, [])

  const probe = useCallback(
    (id: number) => {
      const controller = new AbortController()
      abort.current = controller
      const limit = setTimeout(() => controller.abort(), probeTimeoutMs)
      void (async () => {
        let ok = false
        try {
          ok = (await raw.current(HEALTH, { signal: controller.signal })).ok
        } catch {
          ok = false
        }
        clearTimeout(limit)
        if (loop.current !== id) return
        abort.current = undefined
        if (ok) {
          stop()
          setReachable(true)
          return
        }
        setReachable(false)
        timer.current = setTimeout(() => {
          if (loop.current === id) probe(id)
        }, probeMs)
      })()
    },
    [probeMs, probeTimeoutMs, stop],
  )

  const nextId = useRef(0)
  const report = useCallback<ReachReport>(
    (answered) => {
      if (answered) {
        stop()
        setReachable(true)
        return
      }
      // A probe is already out, or waiting its turn: it will say.
      if (loop.current !== 0) return
      nextId.current += 1
      loop.current = nextId.current
      probe(loop.current)
    },
    [probe, stop],
  )

  useEffect(() => stop, [stop])

  const observed = useMemo(() => observeFetch(fetchImpl, report), [fetchImpl, report])
  return { fetchImpl: observed, reachable, report }
}
