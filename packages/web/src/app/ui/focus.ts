/**
 * The focus trap and its return, shared by Sheet and Popover (docs/charte.md § 4).
 *
 * On open, focus goes to the first focusable of the container (the container itself
 * when it holds none); on close it returns to the element that had it before.
 */

import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hidden && el.tabIndex >= 0)
}

/**
 * While `active`, move focus into `ref`, call `onEscape` on Escape, wrap Tab inside when
 * `trap`, and give focus back to the opener when `active` turns false or the host unmounts.
 */
export function useFocusScope(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  options: { trap: boolean; onEscape: () => void },
): void {
  const escape = useRef(options.onEscape)
  escape.current = options.onEscape
  const { trap } = options

  useEffect(() => {
    const root = ref.current
    if (!active || !root) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = focusables(root)[0]
    if (first) first.focus()
    else {
      if (root.tabIndex < 0) root.tabIndex = -1
      root.focus()
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        escape.current()
        return
      }
      if (event.key !== 'Tab' || !trap) return
      const items = focusables(root)
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const head = items[0]!
      const tail = items[items.length - 1]!
      const current = document.activeElement
      if (event.shiftKey && (current === head || !root.contains(current))) {
        event.preventDefault()
        tail.focus()
      } else if (!event.shiftKey && (current === tail || !root.contains(current))) {
        event.preventDefault()
        head.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener?.isConnected) opener.focus()
    }
  }, [ref, active, trap])
}
