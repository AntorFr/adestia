/** One plugin: its name, kind, words, origin, the problem it lives with, and its switch. */

import type { PluginProblem, PluginRow as Row } from '@antorfr/adestia-schemas'

import { Icon } from '../Icon.js'
import { say } from '../Problems.js'

type T = (key: string) => string

export function originLine(origin: Row['origin'], t: T): string {
  return origin.kind === 'source'
    ? t('found in source %name').replace('%name', origin.name)
    : t('found in the plugins folder')
}

export function PluginItem({
  row,
  disabled,
  busy,
  onFlip,
  t,
}: {
  readonly row: Row
  readonly disabled: boolean
  readonly busy: boolean
  readonly onFlip: (active: boolean) => void
  readonly t: T
}) {
  const core = row.kind === 'core'
  const pending = row.wanted !== row.loaded
  const hint = `plugin-${row.id}-hint`
  return (
    <li className="adestia-plugin" data-plugin={row.id}>
      <div className="adestia-plugin__head">
        <span className="adestia-plugin__name">{row.id}</span>
        <span className={`adestia-state adestia-state--kind${core ? ' adestia-state--core' : ''}`}>{row.kind}</span>
        {pending && (
          <span className="adestia-config__restart adestia-plugin__pending">
            <Icon name="rotate-ccw" />
            {row.wanted ? t('Active after restart') : t('Off after restart')}
          </span>
        )}
      </div>
      <input
        type="checkbox"
        role="switch"
        className="adestia-toggle"
        aria-label={row.id}
        {...(core ? { 'aria-describedby': hint } : {})}
        checked={row.wanted}
        disabled={disabled || core || busy}
        aria-busy={busy || undefined}
        onChange={(event) => onFlip(event.currentTarget.checked)}
      />
      <p className="adestia-plugin__text">{row.description}</p>
      <p className="adestia-plugin__origin">
        {originLine(row.origin, t)}
        {core && <span id={hint}> · {t('always on')}</span>}
      </p>
      {row.problems.map((problem, index) => (
        <p key={index} className="adestia-plugin__problem">
          <Icon name="triangle-alert" />
          {say(t, problem)}
        </p>
      ))}
    </li>
  )
}

export function RefusedItem({ problem, t }: { readonly problem: PluginProblem; readonly t: T }) {
  return (
    <li className="adestia-plugin adestia-plugin--refused" data-plugin={problem.id}>
      <div className="adestia-plugin__head">
        <span className="adestia-plugin__name">{problem.id}</span>
      </div>
      <p className="adestia-plugin__problem">
        <Icon name="circle-alert" />
        {say(t, problem)}
      </p>
    </li>
  )
}
