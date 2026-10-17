import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import { useFocusScope } from './focus.js'

export interface PopoverProps {
  readonly anchor: RefObject<HTMLElement | null>
  readonly open: boolean
  readonly onClose: () => void
  readonly children: ReactNode
  readonly label?: string
  readonly className?: string
}

const GAP = 8

/**
 * `.adestia-popover` (docs/charte.md § 4): 8 px from its anchor, below it, above when
 * there is no room. Escape or a press outside closes it; focus returns to the opener.
 */
export function Popover({ anchor, open, onClose, children, label, className }: PopoverProps) {
  const panel = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  useFocusScope(panel, open, { trap: false, onEscape: onClose })

  useLayoutEffect(() => {
    const host = anchor.current
    const box = panel.current
    if (!open || !host || !box) return
    const a = host.getBoundingClientRect()
    const h = box.offsetHeight
    const w = box.offsetWidth
    const below = a.bottom + GAP
    const flip = below + h > window.innerHeight && a.top - GAP - h >= 0
    const left = Math.max(GAP, Math.min(a.left, window.innerWidth - w - GAP))
    setPos({ top: flip ? a.top - GAP - h : below, left })
  }, [open, anchor])

  useEffect(() => {
    if (!open) return
    const onDown = (event: Event) => {
      const target = event.target as Node
      if (panel.current?.contains(target) || anchor.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, anchor, onClose])

  if (!open) return null
  return createPortal(
    <div
      ref={panel}
      className={className ? `adestia-popover ${className}` : 'adestia-popover'}
      role="dialog"
      aria-label={label}
      style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  )
}
