import type { ReactNode } from 'react'

import { Icon } from '../Icon.js'
import type { IconName } from '../icons.js'

/** `.adestia-empty` (docs/charte.md § 4): an icon, one sentence, the action that fills it. */
export function EmptyState({ icon, text, action }: { icon: IconName; text: string; action?: ReactNode }) {
  return (
    <div className="adestia-empty adestia-empty--state">
      <span className="adestia-empty__icon"><Icon name={icon} /></span>
      <p className="adestia-empty__text">{text}</p>
      {action ? <div className="adestia-empty__action">{action}</div> : null}
    </div>
  )
}
