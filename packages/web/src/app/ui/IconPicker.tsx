import { Icon } from '../Icon.js'
import { ICON_NAMES, type IconName } from '../icons.js'
import { useRadioGroup } from './radiogroup.js'

export interface IconPickerProps {
  /** The icon chosen; `null` is « none ». */
  readonly value: IconName | null
  readonly onChange: (value: IconName | null) => void
  /** The accessible name of the group. */
  readonly label: string
  /** The name of the « none » option (translated by the screen). */
  readonly noneLabel: string
  readonly disabled?: boolean
}

/** `.adestia-icon-picker` (docs/charte.md § 4): a radiogroup grid of `ICON_NAMES` plus « none ». */
export function IconPicker({ value, onChange, label, noneLabel, disabled }: IconPickerProps) {
  const choices: (IconName | null)[] = [null, ...ICON_NAMES]
  const checkedIndex = choices.findIndex((one) => one === value)
  const { group, tabIndexOf, onKeyDown } = useRadioGroup(choices.length, checkedIndex, (at) => onChange(choices[at]!))
  return (
    <div ref={group} className="adestia-icon-picker" role="radiogroup" aria-label={label} aria-disabled={disabled || undefined}>
      {choices.map((one, i) => {
        const name = one === null ? noneLabel : one
        return (
          <button
            key={one ?? '∅'}
            type="button"
            role="radio"
            aria-checked={i === checkedIndex}
            aria-label={name}
            title={name}
            disabled={disabled}
            tabIndex={tabIndexOf(i)}
            className={one === null ? 'adestia-icon-picker__item adestia-icon-picker__item--none' : 'adestia-icon-picker__item'}
            onClick={() => onChange(one)}
            onKeyDown={(event) => onKeyDown(event, i)}
          >
            {one === null ? <span className="adestia-icon-picker__none" aria-hidden="true" /> : <Icon name={one} />}
          </button>
        )
      })}
    </div>
  )
}
