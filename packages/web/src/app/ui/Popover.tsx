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
  /**
   * What the panel must leave readable (the block whose settings it is): it goes below it,
   * else above, else beside it, else — on a screen with no such room — in the larger of the
   * two gaps, scrolling inside. Without room anywhere it hangs from the anchor as usual.
   */
  readonly avoid?: RefObject<HTMLElement | null>
}

/** The least height worth showing a panel at when it has to shrink to leave a block visible. */
const LEAST = 176

const GAP = 8

/**
 * `.adestia-popover` (docs/charte.md § 4): 8 px from its anchor, below it, above when
 * there is no room, bounded below its canvas chrome and inside the visible viewport.
 * It follows scrolling and resizing. Escape or a press outside closes it; focus returns to the opener.
 */
export function Popover({ anchor, open, onClose, children, label, className, avoid }: PopoverProps) {
  const panel = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  useFocusScope(panel, open, { trap: false, onEscape: onClose })

  useLayoutEffect(() => {
    const host = anchor.current
    const box = panel.current
    if (!open || !host || !box) return
    const canvas = host.closest('.adestia-canvas')
    const boundaries = canvas
      ? [...canvas.querySelectorAll<HTMLElement>('.adestia-canvas__header, .adestia-console-host, .adestia-problems, .adestia-editor__readonly')]
      : []
    const viewport = window.visualViewport
    let frame = 0
    const place = () => {
      const a = host.getBoundingClientRect()
      const viewportTop = viewport?.offsetTop ?? 0
      const viewportLeft = viewport?.offsetLeft ?? 0
      const bottom = viewportTop + (viewport?.height ?? window.innerHeight) - GAP
      const right = viewportLeft + (viewport?.width ?? window.innerWidth) - GAP
      // Only this anchor's canvas contributes chrome: a chat menu must not
      // inherit the page's bands on the other side of the split.
      const ceiling = boundaries.reduce((edge, element) => {
        const r = element.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && r.bottom > viewportTop && r.top < bottom
          ? Math.max(edge, r.bottom + GAP)
          : edge
      }, viewportTop + GAP)
      const topLimit = Math.min(ceiling, bottom)
      const available = Math.max(0, bottom - topLimit)
      // Measure the CSS-limited height afresh, so a previously shortened panel
      // can grow again. Preserve its internal scroll through this measurement.
      const previousMax = box.style.maxHeight
      const scrollTop = box.scrollTop
      box.style.maxHeight = ''
      const h = Math.min(box.offsetHeight, available)
      const w = box.offsetWidth
      box.style.maxHeight = previousMax
      box.scrollTop = scrollTop
      const below = a.bottom + GAP
      const above = a.top - GAP - h
      const preferred = below + h > bottom && above >= topLimit ? above : below
      let top = Math.max(topLimit, Math.min(preferred, bottom - h))
      let left = Math.max(viewportLeft + GAP, Math.min(a.left, right - w))
      let height = h
      const block = avoid?.current?.getBoundingClientRect()
      if (block && block.width > 0 && block.height > 0) {
        const full = Math.min(box.scrollHeight + 2, available) // the panel's own height, uncut
        const roomBelow = bottom - (block.bottom + GAP)
        const roomAbove = block.top - GAP - topLimit
        const hClamp = (v: number) => Math.max(topLimit, Math.min(v, bottom - full))
        if (roomBelow >= full) { top = block.bottom + GAP; height = full }
        else if (roomAbove >= full) { top = block.top - GAP - full; height = full }
        else if (right - (block.right + GAP) >= w) {
          left = block.right + GAP
          top = hClamp(Math.max(block.top, topLimit)); height = full
        } else if (block.left - GAP - viewportLeft - GAP >= w) {
          left = block.left - GAP - w
          top = hClamp(Math.max(block.top, topLimit)); height = full
        } else if (Math.max(roomBelow, roomAbove) >= LEAST) {
          if (roomBelow >= roomAbove) { top = block.bottom + GAP; height = roomBelow }
          else { top = topLimit; height = roomAbove }
        }
      }
      const next = { top, left, maxHeight: height }
      setPos((previous) => previous?.top === next.top && previous.left === next.left && previous.maxHeight === next.maxHeight ? previous : next)
    }
    const schedule = (event?: Event) => {
      // Scrolling the form itself changes neither anchor nor canvas geometry.
      if (event?.target instanceof Node && box.contains(event.target)) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(place)
    }
    place()
    document.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    viewport?.addEventListener('resize', schedule)
    viewport?.addEventListener('scroll', schedule)
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => schedule())
    for (const element of [host, box, ...boundaries]) observer?.observe(element)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
      observer?.disconnect()
    }
  }, [open, anchor, avoid])

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
      style={pos ? { top: pos.top, left: pos.left, maxHeight: pos.maxHeight } : { top: 0, left: 0, visibility: 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  )
}
