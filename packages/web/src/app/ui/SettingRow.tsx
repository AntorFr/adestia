import { useId, type ReactNode } from 'react'

export interface SettingRowProps {
  readonly label: string
  /** The control on the right (here the switch): it names itself through `labelId`. */
  readonly children: (ids: { labelId: string }) => ReactNode
}

/** `.adestia-setting-row` (docs/charte.md § 4): label on the left, the control on the right. */
export function SettingRow({ label, children }: SettingRowProps) {
  const uid = useId()
  const labelId = `${uid}-label`
  return (
    <div className="adestia-setting-row">
      <div className="adestia-setting-row__text">
        <span id={labelId} className="adestia-setting-row__label">{label}</span>
      </div>
      <div className="adestia-setting-row__control">{children({ labelId })}</div>
    </div>
  )
}
