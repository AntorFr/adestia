/**
 * Swiping between the chat and the canvas, when the shell is folded.
 *
 * The button in the header stays — this is a second way in, not a
 * replacement, and a gesture nobody discovers must never be the only route to
 * a screen. What it adds is the one interaction a phone user already expects
 * from two side-by-side panes: push the one you are reading aside.
 *
 * Three refusals do most of the work here, and each of them is a bug that
 * would otherwise be reported as "the app changes screen at random":
 *
 *   - a MOUSE never swipes. Dragging to select text on a desktop is not a
 *     navigation, and the fold can be reached with a narrow window open;
 *   - a gesture that started in a FIELD is not a swipe. Dragging across a
 *     textarea selects what you wrote;
 *   - a gesture that started in something scrollable SIDEWAYS is not a swipe
 *     either. A wide table and a code block are read by dragging them, and
 *     stealing that would make their content unreachable.
 *
 * Nothing is prevented and nothing is captured: the verdict is read at the
 * END of the gesture, so vertical scrolling is untouched and a swipe that
 * turns out to be a scroll simply is one.
 */

import { useCallback, useRef } from 'react'

/** Below this, a gesture is a tap that wandered. */
export const SWIPE_MIN_DISTANCE = 60
/**
 * How diagonal a swipe may be before it counts as scrolling.
 *
 * Generous on purpose (a thumb travels in an arc, not on a rail) but well
 * under 1: at 45° the reader is scrolling and would resent being moved.
 */
export const SWIPE_MAX_SLOPE = 0.7

export type SwipeVerdict = 'left' | 'right' | undefined

export function swipeVerdict(dx: number, dy: number): SwipeVerdict {
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return undefined
  if (Math.abs(dy) > Math.abs(dx) * SWIPE_MAX_SLOPE) return undefined
  return dx < 0 ? 'left' : 'right'
}

/**
 * May a gesture starting here become a swipe?
 *
 * Walks up from the target rather than testing it alone: the finger lands on
 * a `<td>`, and it is the scroller three levels above that must be left
 * alone. Stops at the host, so the shell's own vertical scrolling — which is
 * every ancestor — never disqualifies anything.
 */
export function swipeable(from: Element | null, host: Element | null): boolean {
  for (let node = from; node && node !== host; node = node.parentElement) {
    const tag = node.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false
    if ((node as HTMLElement).isContentEditable) return false
    // Content wider than its box, in a box that lets you drag to see the
    // rest: a table, a code block, a row of thumbnails.
    if (node.scrollWidth > node.clientWidth + 1) return false
  }
  return true
}

export interface SwipeOptions {
  /** The finger travelled leftward: bring in what sits to the right. */
  readonly onLeft?: () => void
  /** The finger travelled rightward: go back to what sits to the left. */
  readonly onRight?: () => void
  /** False on a desktop, where the two panes are side by side already. */
  readonly enabled?: boolean
}

export function useSwipe(options: SwipeOptions): Record<string, unknown> {
  const { onLeft, onRight, enabled = true } = options
  const from = useRef<{ x: number; y: number; id: number } | undefined>(undefined)

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      from.current = undefined
      if (!enabled || event.pointerType === 'mouse') return
      if (!swipeable(event.target as Element, event.currentTarget)) return
      from.current = { x: event.clientX, y: event.clientY, id: event.pointerId }
    },
    [enabled],
  )

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const start = from.current
      from.current = undefined
      // Matched by id: a second finger landing mid-gesture must not have its
      // release read against the first one's start.
      if (!start || start.id !== event.pointerId) return
      const verdict = swipeVerdict(event.clientX - start.x, event.clientY - start.y)
      if (verdict === 'left') onLeft?.()
      else if (verdict === 'right') onRight?.()
    },
    [onLeft, onRight],
  )

  const forget = useCallback(() => {
    from.current = undefined
  }, [])

  return { onPointerDown, onPointerUp, onPointerCancel: forget, onPointerLeave: forget }
}
