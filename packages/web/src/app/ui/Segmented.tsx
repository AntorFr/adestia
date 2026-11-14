import { useRef, type KeyboardEvent, type ReactNode } from 'react'

export interface SegmentedChoice {
  readonly value: string
  /** The accessible name, always; shown as text unless `image` is given. */
  readonly label: string
  /** A small drawing standing for the choice; the label then sits under it. */
  readonly image?: ReactNode
}

export interface SegmentedProps {
  readonly choices: readonly SegmentedChoice[]
  /** The value checked; `undefined` when none is (nothing is checked by default). */
  readonly value: string | undefined
  readonly onChange: (value: string) => void
  readonly label: string
  /** `text` : words in the segments (a width) ; `image` : a drawing above its word (a variant). */
  readonly kind?: 'text' | 'image'
}

/**
 * `.adestia-segmented` (docs/charte.md § 4) as a radiogroup: one tab stop, arrows move AND choose.
 * `kind="text"` is the variant with words in the segments; `kind="image"` the one with drawings.
 */
export function Segmented({ choices, value, onChange, label, kind = 'text' }: SegmentedProps) {
  const group = useRef<HTMLDivElement>(null)
  const checkedIndex = choices.findIndex((one) => one.value === value)
  const onKey = (event: KeyboardEvent, index: number) => {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const at = (index + step + choices.length) % choices.length
    onChange(choices[at]!.value)
    group.current?.querySelectorAll<HTMLElement>('[role=radio]')[at]?.focus()
  }
  return (
    <div ref={group} className={`adestia-segmented adestia-segmented--${kind}`} role="radiogroup" aria-label={label}>
      {choices.map((one, i) => {
        const checked = i === checkedIndex
        return (
          <button
            key={one.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={one.label}
            title={one.label}
            tabIndex={checked || (checkedIndex < 0 && i === 0) ? 0 : -1}
            className="adestia-segmented__item"
            onClick={() => {
              if (!checked) onChange(one.value)
            }}
            onKeyDown={(event) => onKey(event, i)}
          >
            {one.image}
            {kind === 'image' || !one.image ? <span aria-hidden="true">{one.label}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
