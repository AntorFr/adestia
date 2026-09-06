/**
 * Dragging between the chat and the canvas, when the shell is folded.
 *
 * The button in the header stays, and so do the edge handles — this is a
 * second way in, not a replacement, and a gesture nobody discovers must never
 * be the only route to a screen.
 *
 * WHY THIS FOLLOWS THE FINGER, rather than reading a verdict at the end.
 * The first version did the latter: the panes were `display: none`, the
 * gesture was measured from where it started to where it stopped, and the
 * screen swapped if that line was long enough and flat enough. It failed
 * about half the time, and the two reasons compound.
 *
 *   - Nothing moved during the gesture, so a refusal was INDISTINGUISHABLE
 *     from a dead app. A drag that shows the next screen arriving says "taken"
 *     while it is happening, and says how far there is left to go.
 *   - Nothing CLAIMED the gesture, so the browser kept it. The moment it
 *     decides a touch is a scroll it fires `pointercancel`, and a swipe that
 *     started a few degrees off the horizontal was cancelled before it could
 *     be read at all.
 *
 * So the gesture is claimed instead: the direction is locked after 8px, and
 * from that instant `preventDefault` keeps the browser out of it. Deliberately
 * NOT done with `touch-action: pan-y` on the shell, which would be the tidier
 * CSS: that restriction applies to the whole subtree, so it would also kill
 * sideways panning inside the wide tables and code blocks this file goes out
 * of its way to leave alone.
 *
 * Three refusals do the rest of the work, and each is a bug that would
 * otherwise be reported as "the app changes screen at random":
 *
 *   - a gesture that started in a FIELD is not a swipe. Dragging across a
 *     textarea selects what you wrote;
 *   - a gesture that started in something scrollable SIDEWAYS is not a swipe
 *     either. A wide table and a code block are read by dragging them, and
 *     stealing that would make their content unreachable;
 *   - a gesture the lock calls VERTICAL is released for good, so the thread
 *     scrolls exactly as it did before.
 *
 * Touch only. A mouse never swipes: dragging to select text on a desktop is
 * not a navigation, and the fold is reachable by narrowing a window.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export type Screen = 'chat' | 'canvas'

/**
 * How far the track must travel before the gesture counts as a crossing.
 *
 * A fraction of the screen rather than a distance in pixels: the same flick
 * has to mean the same thing on a 360px phone and on a 820px tablet.
 */
export const SWIPE_COMMIT = 0.28

/** Below this, the gesture has not yet said what it is. */
export const SWIPE_LOCK = 8

/**
 * How much more horizontal than vertical a gesture must be to be taken.
 *
 * Generous on purpose — a thumb travels in an arc, not on a rail — but the
 * bias is deliberately on the side of scrolling: a screen that moves under
 * somebody reading is resented far more than a swipe that has to be repeated.
 */
export const SWIPE_BIAS = 1.3

/**
 * Where the track lands when the finger lifts.
 *
 * Measured as distance travelled AWAY from the screen the gesture started on,
 * so the same threshold reads the same in both directions — the asymmetric
 * form (28% one way, 72% the other) says the same thing and hides it.
 */
export function settleTo(from: Screen, offset: number, width: number): Screen {
  if (width <= 0) return from
  const travelled = from === 'chat' ? -offset : offset + width
  if (travelled <= width * SWIPE_COMMIT) return from
  return from === 'chat' ? 'canvas' : 'chat'
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
  /** Which screen the shell is showing — where a gesture starts from. */
  readonly screen: Screen
  /** Where the finger left it. Called once, when the gesture settles. */
  readonly onScreen: (screen: Screen) => void
  /** False on a desktop, where the two panes are side by side already. */
  readonly enabled?: boolean
}

/** The offset, in px, at which the track shows `screen`. */
const restingAt = (screen: Screen, width: number): number => (screen === 'canvas' ? -width : 0)

/**
 * Returns the ref to put on the shell. The listeners are native and not
 * React's, because React's touch handlers are passive: `preventDefault` in one
 * does nothing, which is precisely the half of this that had to change.
 *
 * A ref CALLBACK held in state, not a ref object, and the bench is what
 * insisted: the shell does not exist on the first render — the instance has
 * not answered yet, and the app is a "Loading…" line. An effect keyed on
 * anything else runs once against a null node, never runs again when the
 * shell finally mounts, and the gesture is silently dead on every real boot
 * while every test that renders the shell outright passes.
 */
export function useSwipe(options: SwipeOptions): (node: HTMLDivElement | null) => void {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  // Read at gesture time rather than closed over, so the listeners are bound
  // once per fold instead of on every screen change.
  const latest = useRef(options)
  latest.current = options

  const enabled = options.enabled ?? true

  useEffect(() => {
    const el = host
    if (!el || !enabled) return undefined

    /** The screen the gesture started on; unset means no gesture is live. */
    let from: Screen | undefined
    let axis: 'undecided' | 'across' = 'undecided'
    let x0 = 0
    let y0 = 0
    let offset = 0

    const width = () => window.innerWidth
    const follow = (px: number) => {
      el.style.transform = `translateX(${px}px)`
    }

    const onStart = (event: TouchEvent) => {
      from = undefined
      axis = 'undecided'
      // A second finger is a pinch or a scroll, never a page turn.
      if (event.touches.length !== 1) return
      const touch = event.touches[0]!
      if (!swipeable(touch.target as Element, el)) return
      from = latest.current.screen
      x0 = touch.clientX
      y0 = touch.clientY
      offset = restingAt(from, width())
    }

    const onMove = (event: TouchEvent) => {
      if (from === undefined || event.touches.length !== 1) return
      const touch = event.touches[0]!
      const dx = touch.clientX - x0
      const dy = touch.clientY - y0

      if (axis === 'undecided') {
        if (Math.abs(dx) < SWIPE_LOCK && Math.abs(dy) < SWIPE_LOCK) return
        if (Math.abs(dx) <= Math.abs(dy) * SWIPE_BIAS) {
          // Vertical, and released for the whole gesture: reconsidering it
          // mid-scroll is how a thread jumps sideways while being read.
          from = undefined
          return
        }
        axis = 'across'
        el.dataset['swiping'] = 'true'
      }

      // Taken. Without this the browser scrolls behind the finger and then
      // cancels the touch, which is the defect this whole file exists for.
      event.preventDefault()
      const w = width()
      offset = Math.min(0, Math.max(-w, restingAt(from, w) + dx))
      follow(offset)
    }

    const onEnd = () => {
      const started = from
      from = undefined
      if (started === undefined || axis !== 'across') return
      axis = 'undecided'
      delete el.dataset['swiping']

      const settled = settleTo(started, offset, width())
      // Written here, and not left to the render that `onScreen` triggers:
      // the stylesheet holds the resting offset, so the attribute IS the
      // animation's destination. Setting it now lets the inline px offset go
      // in the same breath — the computed value does not change, so the
      // transition runs from where the finger left off, and no stale pixel
      // value survives to freeze the shell half-way after a rotation.
      el.dataset['screen'] = settled
      el.style.transform = ''
      latest.current.onScreen(settled)
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
      // A window widened past the fold mid-gesture must not leave the desktop
      // shell shifted by half a phone.
      delete el.dataset['swiping']
      el.style.transform = ''
    }
  }, [host, enabled])

  return useCallback((node: HTMLDivElement | null) => setHost(node), [])
}
