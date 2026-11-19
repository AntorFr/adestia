/**
 * What the instance found, and which of it the file turns on (E-37).
 *
 * The same contract as the Configuration page, for the same reasons: the file
 * stays the truth, a read-only mount is said and not hidden, and nothing
 * changes in place — a flip is written, and the instance applies it at the
 * restart the E-14 bar already knows how to ask for. A row sits in the group of
 * what is LOADED, and its switch shows what the file WANTS; the gap is the
 * "after restart" mark.
 */

import { Icon } from './Icon.js'
import { RestartBar } from './configuration/RestartBar.js'
import { useRestart } from './configuration/useRestart.js'
import { PluginItem, RefusedItem } from './plugins/PluginRow.js'
import { usePlugins } from './plugins/usePlugins.js'
import { Button, EmptyState, Failure, Loading } from './ui/index.js'

const TILE = { '--tile-color': 'var(--adestia-hue-ardoise, var(--accent))' } as Record<string, string>

export function Plugins({
  fetchImpl = fetch,
  t = (key: string) => key,
}: {
  readonly fetchImpl?: typeof fetch
  readonly t?: (key: string) => string
}) {
  const plugins = usePlugins(fetchImpl, t)
  const { payload, failure, busy, refused, stale, pending } = plugins
  const { restart, reboot } = useRestart(fetchImpl, t, plugins.load, plugins.quiet)

  if (failure?.kind === 'not-exposed') {
    return (
      <div className="adestia-prefs adestia-prefs__page" style={TILE}>
        <EmptyState icon="circle-alert" text={t('This instance does not expose its configuration.')} />
      </div>
    )
  }
  if (failure) {
    return (
      <div className="adestia-prefs adestia-prefs__page" style={TILE}>
        <Failure message={t('The plugins could not be read.')} onRetry={plugins.retry} t={t} />
      </div>
    )
  }
  if (!payload) {
    return (
      <div className="adestia-prefs adestia-prefs__page" style={TILE}>
        <Loading t={t} />
      </div>
    )
  }

  const locked = !payload.writable
  const active = payload.plugins.filter((row) => row.loaded)
  const inactive = payload.plugins.filter((row) => !row.loaded)
  const nothing = payload.plugins.length === 0 && payload.refused.length === 0

  const group = (key: string, title: string, rows: readonly typeof payload.plugins[number][]) =>
    rows.length === 0 ? null : (
      <section key={key} className="adestia-config__group" aria-label={title}>
        <h2>{title}</h2>
        <ul className="adestia-config__fields adestia-plugins">
          {rows.map((row) => (
            <PluginItem
              key={row.id}
              row={row}
              disabled={locked}
              busy={busy.has(row.id)}
              onFlip={(on) => void plugins.flip(row.id, on)}
              t={t}
            />
          ))}
        </ul>
      </section>
    )

  return (
    <div className="adestia-prefs adestia-prefs__page adestia-config" style={TILE}>
      <header className="adestia-chead">
        <span className="adestia-chead__icon" aria-hidden="true">
          <Icon name="plug" />
        </span>
        <div>
          <h1 className="adestia-chead__title">{t('Plugins')}</h1>
          <p className="adestia-chead__lede">
            {nothing
              ? t('Nothing is installed here yet.')
              : t('%n active of %m found').replace('%n', String(active.length)).replace('%m', String(payload.plugins.length))}
          </p>
        </div>
      </header>

      {locked && (
        <p className="adestia-config__locked" role="status">
          <Icon name="lock" />
          <span>
            <strong>{t('Read-only.')}</strong>{' '}
            {t(payload.readOnlyReason ?? 'this instance cannot write its configuration file')}.{' '}
            {t('The switches are inert; the plugins below are what it found.')}
          </span>
        </p>
      )}

      {refused !== undefined && (
        <p className="adestia-save adestia-save--error" role="alert">
          {refused}
        </p>
      )}
      {stale && (
        <p className="adestia-save adestia-save--error adestia-config__restart-line" role="alert">
          <span>{t('The file changed since this page loaded.')}</span>
          <Button variant="ghost" icon="rotate-ccw" onClick={() => void plugins.load()}>
            {t('Reload')}
          </Button>
        </p>
      )}

      {nothing && (
        <EmptyState
          icon="plug"
          text={`${t('No plugin found.')} ${t('Looked in')} ${payload.pluginsDir}`}
        />
      )}

      {group('active', t('Active'), active)}
      {group('inactive', t('Found, not active'), inactive)}
      {payload.refused.length > 0 && (
        <section className="adestia-config__group" aria-label={t('Refused')}>
          <h2>{t('Refused')}</h2>
          <ul className="adestia-config__fields adestia-plugins">
            {payload.refused.map((problem, index) => (
              <RefusedItem key={`${problem.id}-${index}`} problem={problem} t={t} />
            ))}
          </ul>
        </section>
      )}

      {pending && <RestartBar restart={restart} onRestart={(force) => void reboot(force)} t={t} />}
    </div>
  )
}
