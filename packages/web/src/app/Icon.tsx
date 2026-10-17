import { iconId, type IconName } from './icons.js'

/** A Lucide icon from the sprite mounted at boot (docs/charte.md § 7.3). Decorative: the control that holds it carries the label. */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className ? `adestia-icon ${className}` : 'adestia-icon'} aria-hidden="true" focusable="false">
      <use href={`#${iconId(name)}`} />
    </svg>
  )
}
