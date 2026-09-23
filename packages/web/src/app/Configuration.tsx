/**
 * The instance's own settings, as a form rather than a file.
 *
 * Turning a value on used to mean: reach the machine, open a text editor,
 * find the right block in a 470-line commented YAML, and restart. Fine for
 * whoever deployed the instance, impossible from a phone, and the first thing
 * it cost was diagnosis — nothing anywhere said which mode the file watcher
 * was in, so "why does my page not refresh" had no answer short of an SSH
 * session.
 *
 * Three rules, and each is about not lying to the operator.
 *
 * **The file is still the truth.** A click edits `adestia.config.yaml`, in
 * place, comments and all. There is no second store shadowing it — the value
 * a field shows is the value the next boot will read, and an operator who
 * greps their file finds what the screen said.
 *
 * **A default is not a decision.** A field says whether its value was written
 * by somebody or is simply what the instance does absent an instruction. Those
 * are different statements, and "false" read as a decision when nobody made
 * one is how an operator concludes the setting is wrong rather than unset.
 *
 * **Read-only is a first-class answer.** On the deployments this product is
 * built for, that file is a Kubernetes ConfigMap or a `:ro` bind mount, and
 * nothing here can write it. The screen says so at the top, before a form is
 * filled, and keeps showing every value — seeing the instance's own settings
 * is worth the screen on its own, which is the half that was missing.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

import type {
  SettingSpec,
  SettingView,
  SettingsPayload,
} from '@antorfr/adestia-schemas'

type Value = boolean | number | string

/** A key path as one string, for React keys and lookups. */
const keyOf = (path: readonly string[]): string => path.join('.')

interface SaveState {
  readonly kind: 'idle' | 'saving' | 'saved' | 'failed'
  readonly message?: string
}

/**
 * The restart, as the screen lives it.
 *
 * `waiting` is the half a naive implementation forgets: the server answers
 * 202 and only THEN closes, so the moment after the click is a gap where
 * nothing is listening. Polling health until it answers is what turns that
 * gap into a state the screen can draw, instead of a spinner that ends on a
 * failed fetch nobody can interpret.
 */
type RestartState =
  | { readonly kind: 'none' }
  | { readonly kind: 'asking' }
  | { readonly kind: 'waiting' }
  | { readonly kind: 'blocked'; readonly running: number }
  | { readonly kind: 'failed'; readonly message: string }

/**
 * One field, drawn from its declaration.
 *
 * The control comes from `kind` rather than from the key's name: a setting
 * added to the catalogue tomorrow draws itself here with no change to this
 * file, which is the whole reason the catalogue exists.
 */
function Field({
  spec,
  value,
  source,
  disabled,
  onChange,
  t,
}: {
  readonly spec: SettingSpec
  readonly value: Value
  readonly source: 'file' | 'default' | 'edited'
  readonly disabled: boolean
  readonly onChange: (value: Value) => void
  readonly t: (key: string) => string
}) {
  const id = `setting-${keyOf(spec.path)}`
  return (
    <li className="adestia-config__field">
      <div className="adestia-config__head">
        <label className="adestia-config__label" htmlFor={id}>
          {t(spec.label)}
        </label>
        {/* Where this value comes from. Silent for a value somebody wrote —
            that is the ordinary case, and a badge on every row is a badge
            nobody reads. */}
        {source === 'default' && (
          <span className="adestia-config__from">{t('default')}</span>
        )}
        {source === 'edited' && (
          <span className="adestia-config__from adestia-config__from--edited">
            {t('not saved yet')}
          </span>
        )}
        {spec.applies === 'restart' && (
          <span className="adestia-config__restart">{t('applies after a restart')}</span>
        )}
      </div>

      {spec.kind === 'toggle' && (
        <input
          id={id}
          type="checkbox"
          className="adestia-config__toggle"
          checked={value === true}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
      )}
      {spec.kind === 'number' && (
        <span className="adestia-config__number">
          <input
            id={id}
            type="number"
            inputMode="numeric"
            value={String(value)}
            {...(spec.min !== undefined ? { min: spec.min } : {})}
            {...(spec.max !== undefined ? { max: spec.max } : {})}
            disabled={disabled}
            onChange={(event) => onChange(event.currentTarget.value)}
          />
          {spec.unit && <em>{spec.unit}</em>}
        </span>
      )}
      {spec.kind === 'choice' && (
        <select
          id={id}
          value={String(value)}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
        >
          {(spec.choices ?? []).map((choice) => (
            <option key={choice.value} value={choice.value}>
              {t(choice.label)}
            </option>
          ))}
        </select>
      )}
      {spec.kind === 'text' && (
        <input
          id={id}
          type="text"
          value={String(value)}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      )}

      <p className="adestia-config__help">{t(spec.help)}</p>
    </li>
  )
}

export function Configuration({
  fetchImpl = fetch,
  t = (key: string) => key,
}: {
  readonly fetchImpl?: typeof fetch
  readonly t?: (key: string) => string
}) {
  const [payload, setPayload] = useState<SettingsPayload | undefined>()
  const [failed, setFailed] = useState<string | undefined>()
  /** Only what the operator touched, so an untouched key is never rewritten. */
  const [edits, setEdits] = useState<Record<string, Value>>({})
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })
  const [restart, setRestart] = useState<RestartState>({ kind: 'none' })
  /**
   * Whether a value that only takes effect on a restart has been WRITTEN.
   *
   * Not "whether such a setting exists" — that is always true and would leave
   * the button standing there forever, which is how a button stops being read.
   * It appears because something is now pending, and goes when it is not.
   */
  const [pending, setPending] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await fetchImpl('/api/settings')
      if (!response.ok) {
        // 404 is the shape the other capability-gated routes use: this
        // instance does not offer the screen, which is a fact to state rather
        // than an error to retry.
        setFailed(
          response.status === 404
            ? t('This instance does not expose its configuration.')
            : t('The settings could not be read.'),
        )
        return
      }
      setPayload((await response.json()) as SettingsPayload)
      setEdits({})
      setFailed(undefined)
    } catch {
      setFailed(t('The settings could not be read.'))
    }
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
    const changes = Object.entries(edits).map(([key, value]) => ({
      path: key.split('.'),
      value,
    }))
    try {
      const response = await fetchImpl('/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ changes, revision: payload.revision }),
      })
      const body = (await response.json()) as {
        error?: string
        kind?: string
        revision?: string
        values?: readonly SettingView[]
      }
      if (!response.ok) {
        // A stale file is the one failure with something to DO about it, and
        // the something is not "try again": the screen has to be re-read or
        // the save silently undoes somebody's terminal edit.
        setSave({
          kind: 'failed',
          message:
            body.kind === 'stale'
              ? t('The file changed on disk since this screen read it. Reload to see it.')
              : (body.error ?? t('The settings could not be saved.')),
        })
        return
      }
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
    } catch {
      setSave({ kind: 'failed', message: t('The settings could not be saved.') })
    }
  }, [dirty, edits, fetchImpl, payload, t])

  /**
   * Asks for a restart, then waits for the instance to answer again.
   *
   * Nothing exits: the server closes its instance and starts a new one in the
   * same process, so the wait is short — but it is a real gap, and a fetch
   * that lands inside it fails. Hence the poll, and hence `AbortSignal`-free
   * plain retries: a failure here is EXPECTED for a moment, and only becomes
   * news once it lasts.
   */
  const reboot = useCallback(
    async (force: boolean) => {
      setSave({ kind: 'idle' })
      setRestart({ kind: 'asking' })
      try {
        const response = await fetchImpl('/api/restart', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(force ? { force: true } : {}),
        })
        if (response.status === 409) {
          const body = (await response.json()) as { running?: number }
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
        try {
          const health = await fetchImpl('/api/health')
          if (health.ok) {
            setPending(false)
            setRestart({ kind: 'none' })
            await load()
            return
          }
        } catch {
          // Still down. That is what waiting looks like.
        }
      }
      setRestart({
        kind: 'failed',
        message: t('The instance did not come back. Check the logs where it runs.'),
      })
    },
    [fetchImpl, load, t],
  )

  if (failed) {
    return (
      <div className="adestia-prefs adestia-prefs__page">
        <p className="adestia-instructions__empty">{failed}</p>
      </div>
    )
  }
  if (!payload) return <div className="adestia-prefs adestia-prefs__page" />

  const locked = !payload.writable

  return (
    <div className="adestia-prefs adestia-prefs__page adestia-config">
      <header
        className="adestia-chead"
        style={{ '--tile-color': 'var(--adestia-hue-ardoise, var(--accent))' } as Record<string, string>}
      >
        <span className="adestia-chead__icon" aria-hidden="true">
          🎛
        </span>
        <div>
          <h1 className="adestia-chead__title">{t('Configuration')}</h1>
          {/* The file is named on purpose: it stays the source of truth, and
              an operator who edits it by hand must know this screen writes
              the very same one. */}
          <p className="adestia-chead__lede">
            {t('Written straight into')} <code>{payload.file}</code>
          </p>
        </div>
      </header>

      {locked && (
        <p className="adestia-config__locked" role="status">
          <strong>{t('Read-only.')}</strong>{' '}
          {payload.readOnlyReason ?? t('this instance cannot write its configuration file')}.{' '}
          {t('The values below are what it is running; changing them means changing the mount.')}
        </p>
      )}

      {payload.groups.map((group) => (
        <section key={group.id} className="adestia-config__group">
          <h2>{t(group.label)}</h2>
          <p className="adestia-config__lede">{t(group.lede)}</p>
          <ul className="adestia-config__fields">
            {group.settings.map((spec) => {
              const key = keyOf(spec.path)
              const view = stored.get(key)
              const edited = Object.prototype.hasOwnProperty.call(edits, key)
              return (
                <Field
                  key={key}
                  spec={spec}
                  value={edited ? (edits[key] as Value) : (view?.value ?? spec.fallback)}
                  source={edited ? 'edited' : (view?.source ?? 'default')}
                  disabled={locked}
                  onChange={(value) => {
                    setSave({ kind: 'idle' })
                    setEdits((current) => ({ ...current, [key]: value }))
                  }}
                  t={t}
                />
              )
            })}
          </ul>
        </section>
      ))}

      {!locked && (
        <div className="adestia-config__bar">
          {save.kind === 'failed' && (
            <span className="adestia-save adestia-save--error" role="alert">
              {save.message}
            </span>
          )}
          {save.kind === 'saved' && !dirty && (
            <span className="adestia-save">{t('Written to the file')}</span>
          )}
          <button type="button" onClick={() => setEdits({})} disabled={!dirty}>
            {t('Discard')}
          </button>
          <button type="button" onClick={() => void commit()} disabled={!dirty || save.kind === 'saving'}>
            {save.kind === 'saving' ? t('Saving…') : t('Save')}
          </button>
        </div>
      )}

      {/* The restart, offered only once something is actually waiting on one.
          It is not a quit button: the server closes its instance and starts a
          new one in the same process, so what runs it — a container, a pod, a
          terminal — never notices. */}
      {pending && (
        <div className="adestia-config__restart-bar" role="group">
          <p>
            <strong>{t('Saved, and waiting for a restart.')}</strong>{' '}
            {t('The instance is still running the values it booted with.')}
          </p>

          {restart.kind === 'blocked' && (
            <p className="adestia-save adestia-save--error" role="alert">
              {t('%n turn(s) running — restarting now would lose that work.').replace(
                '%n',
                String(restart.running),
              )}
            </p>
          )}
          {restart.kind === 'failed' && (
            <p className="adestia-save adestia-save--error" role="alert">
              {restart.message}
            </p>
          )}

          <button
            type="button"
            onClick={() => void reboot(restart.kind === 'blocked')}
            disabled={restart.kind === 'asking' || restart.kind === 'waiting'}
          >
            {restart.kind === 'waiting'
              ? t('Coming back…')
              : restart.kind === 'blocked'
                ? t('Restart anyway')
                : t('Restart now')}
          </button>
        </div>
      )}
    </div>
  )
}
