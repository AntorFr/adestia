import { useCallback, useEffect, useRef, useState } from 'react'

import { FALLBACK_KEY, requestJson } from './request.js'

export interface RequestState<T> {
  readonly status: 'loading' | 'ready' | 'failed'
  readonly data: T | undefined
  readonly error: string | undefined
  readonly httpStatus: number | undefined
}

const identity = (key: string) => key

/** A read with a local loading/failure state; screens keep the meaning of each HTTP status. */
export function useRequest<T = unknown>(
  fetchImpl: typeof fetch,
  url: string,
  { enabled = true, t = identity }: { readonly enabled?: boolean; readonly t?: (key: string) => string } = {},
) {
  // Callers may pass an inline translator. Its identity must not trigger another read.
  const say = useRef(t)
  say.current = t
  const generation = useRef(0)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<RequestState<T>>({
    status: enabled ? 'loading' : 'ready', data: undefined, error: undefined, httpStatus: undefined,
  })

  const retry = useCallback(() => {
    if (!enabled) return
    // Invalidate the old response immediately, before the next effect gets its turn.
    generation.current += 1
    setState({ status: 'loading', data: undefined, error: undefined, httpStatus: undefined })
    setAttempt((current) => current + 1)
  }, [enabled])

  useEffect(() => {
    const current = ++generation.current
    setState({ status: enabled ? 'loading' : 'ready', data: undefined, error: undefined, httpStatus: undefined })
    if (!enabled) return undefined

    void requestJson<T>(fetchImpl, url, undefined, (key) =>
      say.current(key === FALLBACK_KEY ? 'Request failed (%n)' : key),
    ).then((result) => {
      if (generation.current !== current) return
      if (result.ok) {
        setState({ status: 'ready', data: result.data, error: undefined, httpStatus: result.status })
      } else {
        setState({
          status: 'failed', data: undefined, httpStatus: result.status,
          error: result.status === 0 ? say.current('The server is not responding') : result.error,
        })
      }
    })

    return () => { generation.current += 1 }
  }, [fetchImpl, url, enabled, attempt])

  return { ...state, retry }
}
