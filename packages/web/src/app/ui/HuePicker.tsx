import { useRadioGroup } from './radiogroup.js'

/** The twelve named hues of tokens.css (`--adestia-hue-<name>`), in the order the picker draws them. */
export const HUE_NAMES = [
  'rouge', 'orange', 'ambre', 'vert', 'emeraude', 'turquoise',
  'bleu', 'indigo', 'violet', 'rose', 'gris', 'ardoise',
] as const
export type HueName = (typeof HUE_NAMES)[number]

export interface HuePickerProps {
  /** The hue chosen; `null` is « none ». */
  readonly value: HueName | null
  readonly onChange: (value: HueName | null) => void
  /** The accessible name of the group. */
  readonly label: string
  /** The name of the « none » option. */
  readonly noneLabel: string
  /** Each hue's name in the user's language — never a hexadecimal value. */
  readonly names: Record<HueName, string>
  readonly disabled?: boolean
}

/** `.adestia-hue-picker` (docs/charte.md § 4): a radiogroup of the twelve hues plus « none »; each swatch is named by its hue. */
export function HuePicker({ value, onChange, label, noneLabel, names, disabled }: HuePickerProps) {
  const choices: (HueName | null)[] = [null, ...HUE_NAMES]
  const checkedIndex = choices.findIndex((one) => one === value)
  const { group, tabIndexOf, onKeyDown } = useRadioGroup(choices.length, checkedIndex, (at) => onChange(choices[at]!))
  return (
    <div ref={group} className="adestia-hue-picker" role="radiogroup" aria-label={label} aria-disabled={disabled || undefined}>
      {choices.map((one, i) => {
        const name = one === null ? noneLabel : names[one]
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
            className={one === null ? 'adestia-hue-picker__item adestia-hue-picker__item--none' : 'adestia-hue-picker__item'}
            style={one === null ? undefined : { ['--hue' as string]: `var(--adestia-hue-${one})` }}
            onClick={() => onChange(one)}
            onKeyDown={(event) => onKeyDown(event, i)}
          >
            <span className="adestia-hue-picker__swatch" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
