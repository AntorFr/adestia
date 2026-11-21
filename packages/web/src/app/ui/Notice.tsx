import type { ReactNode } from 'react'

import { Icon } from '../Icon.js'

export interface NoticeProps {
  /** The one sentence. */
  readonly text: string
  /** Buttons at the end of the line (Details, Close). */
  readonly actions?: ReactNode
  /** What the Details button unfolds, under the sentence. */
  readonly children?: ReactNode
  readonly id?: string
}

/**
 * `.adestia-notice` (docs/charte.md § 4, Reference notice): a line that says something
 * is left behind, in the flow under a header. Not a toast: it stays until closed. The
 * state is said by the icon, the words and the tint together.
 */
export function Notice({ text, actions, children, id }: NoticeProps) {
  return (
    <div className="adestia-notice" role="status" {...(id ? { id } : {})}>
      <p className="adestia-notice__text">
        <Icon name="triangle-alert" />
        <span>{text}</span>
      </p>
      {actions ? <div className="adestia-notice__actions">{actions}</div> : null}
      {children ? <div className="adestia-notice__list">{children}</div> : null}
    </div>
  )
}
