import type { ReactNode } from 'react'

/**
 * One field of the two settings windows: `.adestia-field` (docs/charte.md § 4) —
 * the label, its control, its help — drawn as a `<label>` so the control is
 * named by wrapping, with no id to keep unique across a page of block windows.
 */
export function FieldRow({
  label,
  help,
  children,
}: {
  readonly label: ReactNode
  readonly help?: string | undefined
  readonly children: ReactNode
}) {
  return (
    <label className="adestia-field">
      <span className="adestia-field__label">{label}</span>
      {children}
      {help ? <p className="adestia-field__help">{help}</p> : null}
    </label>
  )
}
