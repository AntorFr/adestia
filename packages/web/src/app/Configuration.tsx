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

import { Icon } from './Icon.js'
import { RestartBar } from './configuration/RestartBar.js'
import { SettingField } from './configuration/SettingField.js'
import { keyOf, type Value } from './configuration/model.js'
import { useRestart } from './configuration/useRestart.js'
import { useSettings } from './configuration/useSettings.js'
import { Button, EmptyState, Loading } from './ui/index.js'

/** The tile's colour on every rendering of the screen, loading and failing included. */
const TILE = { '--tile-color': 'var(--adestia-hue-ardoise, var(--accent))' } as Record<string, string>

export function Configuration({
  fetchImpl = fetch,
  t = (key: string) => key,
}: {
  readonly fetchImpl?: typeof fetch
  readonly t?: (key: string) => string
}) {
  const settings = useSettings(fetchImpl, t)
  const { payload, failed, stored, edits, dirty, save, pending } = settings
  const { restart, reboot } = useRestart(
    fetchImpl,
    t,
    async () => {
      // The instance answers again: nothing waits on a restart any more.
      settings.settled()
      await settings.load()
    },
    settings.quiet,
  )

  if (failed) {
    return (
      <div className="adestia-prefs adestia-prefs__page" style={TILE}>
        <EmptyState icon="circle-alert" text={failed} />
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

  return (
    <div className="adestia-prefs adestia-prefs__page adestia-config" style={TILE}>
      <header className="adestia-chead">
        <span className="adestia-chead__icon" aria-hidden="true">
          <Icon name="sliders-horizontal" />
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
          <Icon name="lock" />
          <span>
            <strong>{t('Read-only.')}</strong>{' '}
            {t(payload.readOnlyReason ?? 'this instance cannot write its configuration file')}.{' '}
            {t('The values below are what it is running; changing them means changing the mount.')}
          </span>
        </p>
      )}

      {payload.groups.length === 0 && <EmptyState icon="sliders-horizontal" text={t('No setting to show.')} />}

      {payload.groups.map((group) => (
        <section key={group.id} className="adestia-config__group">
          <h2>{t(group.label)}</h2>
          <p className="adestia-config__lede">{t(group.lede)}</p>
          <ul className="adestia-config__fields">
            {group.settings.map((spec) => {
              const key = keyOf(spec.path)
              const edited = Object.prototype.hasOwnProperty.call(edits, key)
              return (
                <SettingField
                  key={key}
                  spec={spec}
                  value={edited ? (edits[key] as Value) : (stored.get(key)?.value ?? spec.fallback)}
                  source={edited ? 'edited' : (stored.get(key)?.source ?? 'default')}
                  disabled={locked}
                  onChange={(value) => settings.edit(key, value)}
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
          {save.kind === 'saved' && !dirty && <span className="adestia-save">{t('Written to the file')}</span>}
          <Button variant="ghost" onClick={settings.discard} disabled={!dirty}>
            {t('Discard')}
          </Button>
          <Button
            variant="accent"
            busy={save.kind === 'saving'}
            onClick={() => void settings.commit()}
            disabled={!dirty || save.kind === 'saving'}
          >
            {save.kind === 'saving' ? t('Saving…') : t('Save')}
          </Button>
        </div>
      )}

      {pending && <RestartBar restart={restart} onRestart={(force) => void reboot(force)} t={t} />}
    </div>
  )
}
