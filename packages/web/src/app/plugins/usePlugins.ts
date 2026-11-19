/** The plugins payload, and the one write this page makes: a plugin on or off in the file. */

import { useCallback, useEffect, useState } from 'react'

import type { PluginsPayload } from '@antorfr/adestia-schemas'

import { jsonInit, requestJson } from '../request.js'

export type PluginsFailure =
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'not-exposed' }

interface Written {
  readonly wanted?: boolean
  readonly revision?: string
}

/**
 * The switch shows what the FILE wants; the group shows what the instance
 * LOADED. Both come from one read, so a flip only has to move `wanted`.
 */
export function usePlugins(fetchImpl: typeof fetch, t: (key: string) => string) {
  const [payload, setPayload] = useState<PluginsPayload | undefined>()
  const [failure, setFailure] = useState<PluginsFailure | undefined>()
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  /** A refused write: the server's reason, said under the heading. */
  const [refused, setRefused] = useState<string | undefined>()
  /** The file changed since this page read it: only a reload helps. */
  const [stale, setStale] = useState(false)

  const load = useCallback(async () => {
    const result = await requestJson<PluginsPayload>(fetchImpl, '/api/plugins', undefined, t)
    if (!result.ok) {
      setFailure({ kind: result.status === 404 ? 'not-exposed' : 'unreachable' })
      return
    }
    setPayload(result.data)
    setFailure(undefined)
    setRefused(undefined)
    setStale(false)
  }, [fetchImpl, t])

  useEffect(() => {
    void load()
  }, [load])

  const retry = useCallback(() => {
    setFailure(undefined)
    void load()
  }, [load])

  const flip = useCallback(
    async (id: string, active: boolean) => {
      if (!payload) return
      setRefused(undefined)
      setBusy((current) => new Set(current).add(id))
      const result = await requestJson<Written>(
        fetchImpl,
        `/api/plugins/${encodeURIComponent(id)}`,
        jsonInit('PUT', { active, revision: payload.revision }),
        t,
      )
      setBusy((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
      if (!result.ok) {
        const kind = (result.data as { kind?: unknown } | null | undefined)?.kind
        if (result.status === 409 && kind === 'stale') setStale(true)
        else setRefused(result.error)
        return
      }
      const revision = result.data?.revision
      setPayload((current) =>
        current === undefined
          ? current
          : {
              ...current,
              revision: revision ?? current.revision,
              plugins: current.plugins.map((row) => (row.id === id ? { ...row, wanted: active } : row)),
            },
      )
    },
    [fetchImpl, payload, t],
  )

  const pending = payload?.plugins.some((row) => row.wanted !== row.loaded) ?? false

  return { payload, failure, busy, refused, stale, pending, load, retry, flip, quiet: () => setRefused(undefined) }
}
