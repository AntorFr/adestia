import type { ButtonHTMLAttributes } from 'react'

import { Icon } from './Icon.js'

/** A return names its destination; skins retain their switch hook. */
export function BackButton({ label, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { readonly label: string }) {
  return <button {...props} type="button" className="adestia-switch adestia-btn adestia-btn--ghost adestia-btn--sm"><Icon name="chevron-left" />{label}</button>
}
