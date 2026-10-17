/** The restart: ask, then wait for the instance to answer again. */

import { useCallback, useState } from 'react'

import { requestJson } from '../request.js'
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
      // Not `requestJson`: a refusal here carries DATA — how many turns run —
      // and the helper keeps only a refusal's message.
      try {
        const response = await fetchImpl('/api/restart', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(force ? { force: true } : {}),
        })
        if (response.status === 409) {
          const body = (await response.json().catch(() => ({}))) as { running?: number }
          setRestart({ kind: 'blocked', running: body.running ?? 1 })
          return
        }
        if (!response.ok) {
          setRestart({ kind: 'failed', message: t('The instance could not be restarted.') })
          return
        }
      } catch {
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
