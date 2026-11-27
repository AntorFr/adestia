import { useId, type ReactNode } from 'react'

export interface SettingRowProps {
  readonly label: string
  readonly help?: string
  /** The control on the right (here the switch): it names itself through `labelId` / `helpId`. */
  readonly children: (ids: { labelId: string; helpId: string | undefined }) => ReactNode
}

/** `.adestia-setting-row` (docs/charte.md § 4): label and help on the left, the control on the right. */
export function SettingRow({ label, help, children }: SettingRowProps) {
  const uid = useId()
  const labelId = `${uid}-label`
  const helpId = help ? `${uid}-help` : undefined
  return (
    <div className="adestia-setting-row">
      <div className="adestia-setting-row__text">
        <span id={labelId} className="adestia-setting-row__label">{label}</span>
        {help ? <span id={helpId} className="adestia-setting-row__help">{help}</span> : null}
      </div>
      <div className="adestia-setting-row__control">{children({ labelId, helpId })}</div>
    </div>
  )
}
