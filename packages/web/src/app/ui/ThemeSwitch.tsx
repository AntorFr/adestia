import { useRef, type KeyboardEvent } from 'react'

import { Icon } from '../Icon.js'
import type { IconName } from '../icons.js'

const CHOICES: readonly { value: string; label: string; icon: IconName }[] = [
  { value: '', label: 'System', icon: 'monitor' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
]

export interface ThemeSwitchProps {
  /** `''` follows the device, `light`/`dark` override it (as `useTheme`). */
  readonly value: string
  readonly onChange: (value: string) => void
  readonly t?: (key: string) => string
}

/** `.adestia-segmented` (docs/charte.md § 4): System, Light, Dark as a radiogroup. */
export function ThemeSwitch({ value, onChange, t = (k) => k }: ThemeSwitchProps) {
  const group = useRef<HTMLDivElement>(null)
  const onKey = (event: KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = CHOICES[(index + step + CHOICES.length) % CHOICES.length]!
    onChange(next.value)
    group.current?.querySelectorAll<HTMLElement>('[role=radio]')[CHOICES.indexOf(next)]?.focus()
  }
  return (
    <div ref={group} className="adestia-segmented" role="radiogroup" aria-label={t('Theme')}>
      {CHOICES.map((c, i) => {
        const checked = c.value === value
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={t(c.label)}
            title={t(c.label)}
            tabIndex={checked ? 0 : -1}
            className="adestia-segmented__item"
            onClick={() => onChange(c.value)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <Icon name={c.icon} />
          </button>
        )
      })}
    </div>
  )
}
