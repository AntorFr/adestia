import { cloneElement, useId, type ReactElement } from 'react'

import { Icon } from '../Icon.js'

export interface FieldProps {
  readonly label: string
  readonly help?: string
  readonly error?: string
  /** One control: `.adestia-input`, `-select`, `-textarea` or `.adestia-toggle`. It gets the id, the description and `aria-invalid`. */
  readonly children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>
}

/** `.adestia-field` (docs/charte.md § 4): label, control, help and error bound by `aria-describedby`. */
export function Field({ label, help, error, children }: FieldProps) {
  const uid = useId()
  const id = children.props.id ?? `${uid}-control`
  const helpId = `${uid}-help`
  const errorId = `${uid}-error`
  const described = [help ? helpId : '', error ? errorId : '', children.props['aria-describedby'] ?? '']
    .filter(Boolean)
    .join(' ')
  return (
    <div className="adestia-field">
      <label className="adestia-field__label" htmlFor={id}>{label}</label>
      {cloneElement(children, {
        id,
        ...(described ? { 'aria-describedby': described } : {}),
        ...(error ? { 'aria-invalid': true } : {}),
      })}
      {help ? <p id={helpId} className="adestia-field__help">{help}</p> : null}
      {error ? (
        <p id={errorId} className="adestia-field__error">
          <Icon name="circle-alert" />
          {error}
        </p>
      ) : null}
    </div>
  )
}
