/** The settings payload, what the operator touched in it, and the write that sends only that. */

import { useCallback, useEffect, useMemo, useState } from 'react'

import type { SettingView, SettingsPayload } from '@antorfr/adestia-schemas'

import { jsonInit, requestJson } from '../request.js'
import { keyOf, type SaveState, type Value } from './model.js'

interface Written {
  readonly revision?: string
  readonly values?: readonly SettingView[]
}

export function useSettings(fetchImpl: typeof fetch, t: (key: string) => string) {
  const [payload, setPayload] = useState<SettingsPayload | undefined>()
  const [failed, setFailed] = useState<string | undefined>()
  /** Only what the operator touched, so an untouched key is never rewritten. */
  const [edits, setEdits] = useState<Record<string, Value>>({})
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })
  /**
   * Whether a value that only takes effect on a restart has been WRITTEN.
   *
   * Not "whether such a setting exists" — that is always true and would leave
   * the button standing there forever, which is how a button stops being read.
   * It appears because something is now pending, and goes when it is not.
   */
  const [pending, setPending] = useState(false)

  const load = useCallback(async () => {
    const result = await requestJson<SettingsPayload>(fetchImpl, '/api/settings', undefined, t)
    if (!result.ok) {
      // 404 is the shape the other capability-gated routes use: this
      // instance does not offer the screen, which is a fact to state rather
      // than an error to retry.
      setFailed(
        result.status === 404
          ? t('This instance does not expose its configuration.')
          : t('The settings could not be read.'),
      )
      return
    }
    setPayload(result.data)
    setEdits({})
    setFailed(undefined)
  }, [fetchImpl, t])

  useEffect(() => {
    void load()
  }, [load])

  const stored = useMemo(() => {
    const map = new Map<string, SettingView>()
    for (const view of payload?.values ?? []) map.set(keyOf(view.path), view)
    return map
  }, [payload])

  const dirty = Object.keys(edits).length > 0

  const commit = useCallback(async () => {
    if (!payload || !dirty) return
    setSave({ kind: 'saving' })
    const changes = Object.entries(edits).map(([key, value]) => ({ path: key.split('.'), value }))
    const result = await requestJson<Written>(
      fetchImpl,
      '/api/settings',
      jsonInit('PUT', { changes, revision: payload.revision }),
      t,
    )
    if (!result.ok) {
      // A stale file is the one failure with something to DO about it, and
      // the something is not "try again": the screen has to be re-read or
      // the save silently undoes somebody's terminal edit. It is the only
      // 409 this route answers.
      setSave({
        kind: 'failed',
        message:
          result.status === 409
            ? t('The file changed on disk since this screen read it. Reload to see it.')
            : result.status === 0
              ? t('The settings could not be saved.')
              : result.error,
      })
      return
    }
    const body = result.data ?? {}
    setPayload({
      ...payload,
      revision: body.revision ?? payload.revision,
      values: body.values ?? payload.values,
    })
    const slow = changes.some((change) =>
      payload.groups.some((group) =>
        group.settings.some(
          (spec) => keyOf(spec.path) === keyOf(change.path) && spec.applies === 'restart',
        ),
      ),
    )
    setEdits({})
    setSave({ kind: 'saved' })
    if (slow) setPending(true)
  }, [dirty, edits, fetchImpl, payload, t])

  const edit = useCallback((key: string, value: Value) => {
    setSave({ kind: 'idle' })
    setEdits((current) => ({ ...current, [key]: value }))
  }, [])

  return {
    payload,
    failed,
    stored,
    edits,
    dirty,
    save,
    pending,
    settled: () => setPending(false),
    quiet: () => setSave({ kind: 'idle' }),
    discard: () => setEdits({}),
    edit,
    commit,
    load,
  }
}
