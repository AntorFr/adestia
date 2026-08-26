import { useEffect, useRef, useState } from 'react'

/**
 * How often a growing answer is redrawn as markdown, in milliseconds.
 *
 * The live bubble grows by DELTAS — a few characters at a time, hundreds of
 * times in a turn — and markdown has to be re-parsed from the top on every
 * one of them, because a `**` typed now decides what a `**` typed earlier
 * meant. That is quadratic, and it was measured rather than assumed: on this
 * machine, re-parsing a 20 000-character answer at every 4-character delta
 * costs 21 seconds of CPU for one turn (a 3 400-character one costs 0.7s, so
 * the short answers everybody tests with never show it). Redrawing on a
 * cadence instead makes the cost proportional to the DURATION of the turn
 * rather than to the square of its length: ~150 redraws over a 20-second
 * answer, whatever its size.
 *
 * 150ms is under the ~200ms at which a change stops reading as immediate, and
 * far above the frame budget it has to fit in.
 */
export const PROSE_CADENCE_MS = 150

/**
 * A value that trails another by at most `ms`, coalescing everything between.
 *
 * The trailing edge is the load-bearing half: the last delta of a turn must
 * arrive on screen even though nothing follows it to push it there. So a tick
 * is always scheduled while the two differ, and the value converges within
 * `ms` of the source going quiet.
 */
export function useCadence<T>(value: T, ms: number): T {
  const [shown, setShown] = useState(value)
  const latest = useRef(value)
  latest.current = value
  const tick = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    // One tick in flight at a time: every delta arriving during the wait is
    // absorbed by the one already scheduled, which is the whole saving.
    if (value === shown || tick.current !== undefined) return
    tick.current = setTimeout(() => {
      tick.current = undefined
      setShown(latest.current)
    }, ms)
  }, [value, shown, ms])

  useEffect(
    () => () => {
      if (tick.current !== undefined) clearTimeout(tick.current)
    },
    [],
  )

  return shown
}
