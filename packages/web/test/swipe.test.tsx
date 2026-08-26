// @vitest-environment jsdom
/**
 * Swiping between the folded panes.
 *
 * What it guards is mostly the REFUSALS. A swipe that fires when it should
 * not is not a small bug: it moves the screen out from under someone who was
 * selecting text or reading a wide table, and it reads as the app changing
 * screen at random.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  SWIPE_MAX_SLOPE,
  SWIPE_MIN_DISTANCE,
  swipeVerdict,
  swipeable,
  useSwipe,
} from '../src/app/useSwipe.js'

describe('reading a gesture', () => {
  it('names the direction the finger travelled', () => {
    expect(swipeVerdict(-120, 0)).toBe('left')
    expect(swipeVerdict(120, 0)).toBe('right')
  })

  it('ignores a tap that wandered', () => {
    expect(swipeVerdict(SWIPE_MIN_DISTANCE - 1, 0)).toBeUndefined()
    expect(swipeVerdict(0, 0)).toBeUndefined()
  })

  it('leaves scrolling alone', () => {
    // The reader is going down the page. Moving them sideways for it would be
    // the single most resented thing this hook could do.
    expect(swipeVerdict(80, 400)).toBeUndefined()
    expect(swipeVerdict(80, 80 * SWIPE_MAX_SLOPE + 1)).toBeUndefined()
  })

  it('tolerates the arc a thumb actually travels', () => {
    expect(swipeVerdict(-140, 40)).toBe('left')
  })
})

describe('where a swipe may start', () => {
  const host = () => {
    const root = document.createElement('div')
    document.body.append(root)
    return root
  }

  it('allows an ordinary place', () => {
    const root = host()
    const p = document.createElement('p')
    root.append(p)
    expect(swipeable(p, root)).toBe(true)
  })

  it('refuses a field, because dragging there selects text', () => {
    const root = host()
    for (const tag of ['input', 'textarea', 'select']) {
      const field = document.createElement(tag)
      root.append(field)
      expect(swipeable(field, root)).toBe(false)
    }
  })

  it('refuses editable prose', () => {
    const root = host()
    const box = document.createElement('div')
    // jsdom does not compute isContentEditable from the attribute.
    Object.defineProperty(box, 'isContentEditable', { value: true })
    root.append(box)
    expect(swipeable(box, root)).toBe(false)
  })

  it('refuses anything scrollable sideways, from any depth inside it', () => {
    // The finger lands on a cell; it is the scroller above it that must be
    // left alone, or a wide table becomes unreadable on a phone.
    const root = host()
    const scroller = document.createElement('div')
    const cell = document.createElement('td')
    scroller.append(cell)
    root.append(scroller)
    Object.defineProperty(scroller, 'scrollWidth', { value: 900 })
    Object.defineProperty(scroller, 'clientWidth', { value: 320 })
    expect(swipeable(cell, root)).toBe(false)
  })

  it('stops at the host, whose own overflow is not a veto', () => {
    const root = host()
    Object.defineProperty(root, 'scrollWidth', { value: 900 })
    Object.defineProperty(root, 'clientWidth', { value: 320 })
    const p = document.createElement('p')
    root.append(p)
    expect(swipeable(p, root)).toBe(true)
  })
})

/** A shell that reports what the hook decided. */
function Surface({ enabled = true, onLeft = vi.fn(), onRight = vi.fn() }) {
  const swipe = useSwipe({ enabled, onLeft, onRight })
  return (
    <div data-testid="shell" {...swipe}>
      <p>content</p>
      <textarea aria-label="field" />
    </div>
  )
}

const drag = (
  element: Element,
  from: { x: number; y: number },
  to: { x: number; y: number },
  init: Record<string, unknown> = {},
) => {
  fireEvent.pointerDown(element, { pointerId: 1, pointerType: 'touch', clientX: from.x, clientY: from.y, ...init })
  fireEvent.pointerUp(element, { pointerId: 1, pointerType: 'touch', clientX: to.x, clientY: to.y, ...init })
}

describe('the swipe handlers', () => {
  it('moves to the canvas on a leftward swipe, and back on a rightward one', () => {
    const onLeft = vi.fn()
    const onRight = vi.fn()
    render(<Surface onLeft={onLeft} onRight={onRight} />)
    const shell = screen.getByTestId('shell')

    drag(shell, { x: 300, y: 400 }, { x: 100, y: 410 })
    expect(onLeft).toHaveBeenCalledTimes(1)

    drag(shell, { x: 100, y: 400 }, { x: 300, y: 410 })
    expect(onRight).toHaveBeenCalledTimes(1)
  })

  it('never fires for a mouse', () => {
    // Dragging to select text on a desktop is not a navigation — and the fold
    // is reachable by narrowing a window.
    const onLeft = vi.fn()
    render(<Surface onLeft={onLeft} />)
    drag(screen.getByTestId('shell'), { x: 300, y: 400 }, { x: 100, y: 400 }, { pointerType: 'mouse' })
    expect(onLeft).not.toHaveBeenCalled()
  })

  it('does nothing at all on a desktop', () => {
    const onLeft = vi.fn()
    render(<Surface enabled={false} onLeft={onLeft} />)
    drag(screen.getByTestId('shell'), { x: 300, y: 400 }, { x: 100, y: 400 })
    expect(onLeft).not.toHaveBeenCalled()
  })

  it('ignores a drag that began in the composer', () => {
    const onLeft = vi.fn()
    render(<Surface onLeft={onLeft} />)
    const field = screen.getByLabelText('field')
    fireEvent.pointerDown(field, { pointerId: 1, pointerType: 'touch', clientX: 300, clientY: 400 })
    fireEvent.pointerUp(screen.getByTestId('shell'), {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 100,
      clientY: 400,
    })
    expect(onLeft).not.toHaveBeenCalled()
  })

  it('reads a release against the finger that started it', () => {
    const onLeft = vi.fn()
    render(<Surface onLeft={onLeft} />)
    const shell = screen.getByTestId('shell')
    fireEvent.pointerDown(shell, { pointerId: 1, pointerType: 'touch', clientX: 300, clientY: 400 })
    // A second finger lands and lifts: its release says nothing about the
    // first one's journey.
    fireEvent.pointerUp(shell, { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 400 })
    expect(onLeft).not.toHaveBeenCalled()
  })

  it('forgets a gesture the system took away', () => {
    const onLeft = vi.fn()
    render(<Surface onLeft={onLeft} />)
    const shell = screen.getByTestId('shell')
    fireEvent.pointerDown(shell, { pointerId: 1, pointerType: 'touch', clientX: 300, clientY: 400 })
    fireEvent.pointerCancel(shell, { pointerId: 1, pointerType: 'touch' })
    fireEvent.pointerUp(shell, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 400 })
    expect(onLeft).not.toHaveBeenCalled()
  })
})
