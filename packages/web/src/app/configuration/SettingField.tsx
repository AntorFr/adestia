/** One setting, drawn from its declaration with the shell's controls. */

import type { SettingSpec } from '@antorfr/adestia-schemas'

import { keyOf, type Value } from './model.js'

/**
 * The control comes from `kind` rather than from the key's name: a setting
 * added to the catalogue tomorrow draws itself here with no change to this
 * file, which is the whole reason the catalogue exists.
 */
export function SettingField({
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
        {source === 'default' && <span className="adestia-config__from">{t('default')}</span>}
        {source === 'edited' && (
          <span className="adestia-config__from adestia-config__from--edited">{t('not saved yet')}</span>
        )}
        {spec.applies === 'restart' && (
          <span className="adestia-config__restart">{t('applies after a restart')}</span>
        )}
      </div>
      <Control spec={spec} id={id} value={value} disabled={disabled} onChange={onChange} t={t} />
      <p className="adestia-config__help">{t(spec.help)}</p>
    </li>
  )
}

function Control({
  spec,
  id,
  value,
  disabled,
  onChange,
  t,
}: {
  readonly spec: SettingSpec
  readonly id: string
  readonly value: Value
  readonly disabled: boolean
  readonly onChange: (value: Value) => void
  readonly t: (key: string) => string
}) {
  if (spec.kind === 'toggle') {
    return (
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="adestia-toggle"
        checked={value === true}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    )
  }
  if (spec.kind === 'number') {
    return (
      <span className="adestia-config__number">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          className="adestia-input"
          value={String(value)}
          {...(spec.min !== undefined ? { min: spec.min } : {})}
          {...(spec.max !== undefined ? { max: spec.max } : {})}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        {spec.unit && <em>{t(spec.unit)}</em>}
      </span>
    )
  }
  if (spec.kind === 'choice') {
    return (
      <select
        id={id}
        className="adestia-select"
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
    )
  }
  return (
    <input
      id={id}
      type="text"
      className="adestia-input"
      value={String(value)}
      disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  )
}
