import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { Button } from './Button.js'
import { useFocusScope } from './focus.js'

export interface SheetProps {
  readonly open: boolean
  readonly title: string
  /** Optional visible heading; title remains the accessible dialog name. */
  readonly heading?: ReactNode
  readonly headerActions?: ReactNode
  readonly onClose: () => void
  readonly children: ReactNode
  readonly footer?: ReactNode
  /** Extra class on the panel. */
  readonly className?: string
  readonly t?: (key: string) => string
}

/**
 * `.adestia-sheet` (docs/charte.md § 4): a modal dialog over a scrim, a bottom sheet
 * under `--breakpoint-mobile`. Portalled to the body: the shell folds its panes with
 * transforms, and a fixed element inside a transformed one is fixed to THAT.
 */
export function Sheet({ open, title, heading, headerActions, onClose, children, footer, className, t = (k) => k }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useFocusScope(panel, open, { trap: true, onEscape: onClose })
  if (!open) return null
  return createPortal(
    <div className="adestia-sheet" onClick={onClose}>
      <div
        ref={panel}
        className={className ? `adestia-sheet__panel ${className}` : 'adestia-sheet__panel'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="adestia-sheet__head">
          <h2 id={titleId} className="adestia-sheet__title" aria-label={heading ? title : undefined}>{heading ?? title}</h2>
          {headerActions}
          <Button variant="ghost" small icon="x" aria-label={t('Close')} onClick={onClose} />
        </header>
        <div className="adestia-sheet__body">{children}</div>
        {footer ? <footer className="adestia-sheet__foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}
