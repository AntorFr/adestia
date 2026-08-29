/**
 * The split view: chat rail against the apps canvas.
 *
 * Two things the predecessor got wrong and this must not: the drag was
 * mouse-only (nothing on a tablet, nothing from a keyboard), and the
 * breakpoint lived in two places that could disagree. Here the drag runs on
 * Pointer Events — which cover mouse, touch and pen with one code path — and
 * the breakpoint is read from the CSS token, so there is one number.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'demeura.rail'
const MIN_PX = 280
const MAX_FRACTION = 0.6
export const DEFAULT_RAIL = 33.333

export function clampRail(percent: number, viewportWidth: number): number {
  const minPercent = viewportWidth > 0 ? (MIN_PX / viewportWidth) * 100 : 20
  const max = MAX_FRACTION * 100
  // A rail that cannot show a sentence is not a rail; a rail wider than the
  // canvas is not a split. Both bounds are the point.
  return Math.min(Math.max(percent, Math.min(minPercent, max)), max)
}

function readStoredRail(storage: Pick<Storage, 'getItem'>): number | undefined {
  const raw = storage.getItem(STORAGE_KEY)
  if (raw === null) return undefined
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) ? value : undefined
}

export interface SplitOptions {
  readonly storage?: Pick<Storage, 'getItem' | 'setItem'>
  readonly viewportWidth?: number
}

export interface Split {
  readonly rail: number
  readonly dragging: boolean
  /** Props for the gutter element: pointer drag, keyboard, and a11y roles. */
  readonly gutterProps: Record<string, unknown>
  reset(): void
}

export function useSplit(options: SplitOptions = {}): Split {
  const storage = options.storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage)
  const [rail, setRail] = useState(() => (storage ? readStoredRail(storage) ?? DEFAULT_RAIL : DEFAULT_RAIL))
  const [dragging, setDragging] = useState(false)
  const frame = useRef<HTMLElement | null>(null)

  const width = useCallback(
    () => options.viewportWidth ?? (typeof window === 'undefined' ? 0 : window.innerWidth),
    [options.viewportWidth],
  )

  const commit = useCallback(
    (percent: number) => {
      const next = clampRail(percent, width())
      setRail(next)
      storage?.setItem(STORAGE_KEY, String(next))
    },
    [storage, width],
  )

  useEffect(() => {
    document.documentElement.style.setProperty('--rail', `${rail}%`)
  }, [rail])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      // Pointer capture is what makes a drag survive the cursor leaving the
      // 6px gutter — without it the split stops following the finger the
      // instant it strays, which reads as a broken control.
      event.currentTarget.setPointerCapture(event.pointerId)
      frame.current = event.currentTarget
      setDragging(true)
      event.preventDefault()
    },
    [],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!dragging) return
      commit((event.clientX / width()) * 100)
    },
    [commit, dragging, width],
  )

  const endDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (frame.current?.hasPointerCapture(event.pointerId)) {
      frame.current.releasePointerCapture(event.pointerId)
    }
    setDragging(false)
  }, [])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      // A splitter nobody can move from the keyboard is a splitter some people
      // simply cannot move.
      const step = event.shiftKey ? 5 : 1
      if (event.key === 'ArrowLeft') commit(rail - step)
      else if (event.key === 'ArrowRight') commit(rail + step)
      else if (event.key === 'Home') commit(0)
      else if (event.key === 'End') commit(100)
      else return
      event.preventDefault()
    },
    [commit, rail],
  )

  const reset = useCallback(() => commit(DEFAULT_RAIL), [commit])

  return {
    rail,
    dragging,
    reset,
    gutterProps: {
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-label': 'Resize the chat panel',
      'aria-valuenow': Math.round(rail),
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      tabIndex: 0,
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onKeyDown,
      onDoubleClick: reset,
    },
  }
}
