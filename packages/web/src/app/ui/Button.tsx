import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { Icon } from '../Icon.js'
import type { IconName } from '../icons.js'

type Variant = 'neutral' | 'accent' | 'danger' | 'ghost'

interface Common extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly variant?: Variant
  readonly small?: boolean
  /** Spinner replaces the icon, the label stays, `aria-busy` is set. */
  readonly busy?: boolean
}

/** An icon button has no visible label: `aria-label` is required, and the type says so. */
interface IconOnly extends Common {
  readonly icon: IconName
  readonly 'aria-label': string
  readonly children?: never
}

interface Labelled extends Common {
  readonly icon?: IconName
  readonly children: ReactNode
  readonly 'aria-label'?: string
}

export type ButtonProps = IconOnly | Labelled

/** `.adestia-btn` (docs/charte.md § 4). */
export function Button(props: ButtonProps) {
  const { variant = 'neutral', small, busy, icon, className, children, type = 'button', disabled, ...rest } = props
  const classes = ['adestia-btn']
  if (variant !== 'neutral') classes.push(`adestia-btn--${variant}`)
  if (children === undefined || children === null) classes.push('adestia-btn--icon')
  if (small) classes.push('adestia-btn--sm')
  if (className) classes.push(className)
  const shown: IconName | undefined = busy ? 'loader-circle' : icon
  return (
    <button {...rest} type={type} className={classes.join(' ')} disabled={disabled} aria-busy={busy ? true : undefined}>
      {shown ? <Icon name={shown} {...(busy ? { className: 'adestia-icon--spin' } : {})} /> : null}
      {children}
    </button>
  )
}
