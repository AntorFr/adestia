/** The restart: ask, then wait for the instance to answer again. */

import { useCallback, useState } from 'react'

import { jsonInit, requestJson } from '../request.js'
import type { RestartState } from './model.js'

/**
 * Nothing exits: the server closes its instance and starts a new one in the
 * same process, so the wait is short — but it is a real gap, and a fetch
 * that lands inside it fails. Hence the poll, and hence plain retries: a
 * failure here is EXPECTED for a moment, and only becomes news once it lasts.
 */
export function useRestart(
  fetchImpl: typeof fetch,
  t: (key: string) => string,
  onBack: () => Promise<void>,
  onAsk: () => void,
) {
  const [restart, setRestart] = useState<RestartState>({ kind: 'none' })

  const reboot = useCallback(
    async (force: boolean) => {
      onAsk()
      setRestart({ kind: 'asking' })
      const result = await requestJson<unknown>(
        fetchImpl,
        '/api/restart',
        jsonInit('POST', force ? { force: true } : {}),
        t,
      )
      if (!result.ok && result.status === 409) {
        // A refusal here carries DATA — how many turns run.
        const body = result.data as { running?: number } | null | undefined
        setRestart({ kind: 'blocked', running: body?.running ?? 1 })
        return
      }
      if (!result.ok) {
        setRestart({ kind: 'failed', message: t('The instance could not be restarted.') })
        return
      }

      setRestart({ kind: 'waiting' })
      // Roughly fifteen seconds, which is far beyond the measured cycle and
      // still short enough that a genuinely dead instance is reported rather
      // than spun on forever.
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250))
        if ((await requestJson(fetchImpl, '/api/health')).ok) {
          setRestart({ kind: 'none' })
          await onBack()
          return
        }
      }
      setRestart({
        kind: 'failed',
        message: t('The instance did not come back. Check the logs where it runs.'),
      })
    },
    [fetchImpl, onAsk, onBack, t],
  )

  return { restart, reboot }
}
