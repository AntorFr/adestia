/**
 * The shell's modal.
 *
 * Written because settings were rendered INLINE at the top of the canvas:
 * arming a credential shoved the page down, and the panel competed with
 * whatever the person was actually looking at. A dialog is what that is.
 *
 * Three behaviours are the whole reason a modal is not just a styled box, and
 * all three are what people notice when they are missing: Escape closes it,
 * the backdrop closes it, and focus moves inside so a keyboard is not left
 * behind on the page underneath.
 */

import { useCallback, useEffect, useRef, type ReactNode } from 'react'

export function Modal({
  title,
  onClose,
  children,
}: {
  readonly title: string
  readonly onClose: () => void
  readonly children: ReactNode
}) {
  const card = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    // The first focusable thing inside, falling back to the card itself — a
    // dialog nobody can tab into is a dialog that traps the keyboard on the
    // page behind it.
    const first = card.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    ;(first ?? card.current)?.focus()
  }, [])

  const onBackdrop = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Only a click on the scrim itself: a drag that ends outside the card
      // must not dismiss what someone was in the middle of typing.
      if (event.target === event.currentTarget) onClose()
    },
    [onClose],
  )

  return (
    <div className="golem-modal" onMouseDown={onBackdrop}>
      <div
        className="golem-modal__card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={card}
      >
        <header className="golem-modal__header">
          <h2>{title}</h2>
          <button type="button" className="golem-ib" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="golem-modal__body">{children}</div>
      </div>
    </div>
  )
}
