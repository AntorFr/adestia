// @vitest-environment jsdom
/**
 * Dragging between the folded panes.
 *
 * Two families of guard, and the first is the one this file exists for. The
 * gesture must be TAKEN — followed under the finger, and prevented so the
 * browser cannot decide half-way through that it was a scroll after all. The
 * version this replaced read a verdict only when the finger lifted, and lost
 * about half of them to `pointercancel` with nothing on screen to say so.
 *
 * The second family is the refusals. A swipe that fires when it should not is
 * not a small bug: it moves the screen out from under somebody who was
 * selecting text or reading a wide table, and it reads as the app changing
 * screen at random.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SWIPE_COMMIT, settleTo, swipeable, useSwipe } from '../src/app/useSwipe.js'

const WIDTH = 390

describe('where a drag settles', () => {
  it('crosses when the finger carried the track far enough', () => {
    expect(settleTo('chat', -WIDTH * 0.5, WIDTH)).toBe('canvas')
    expect(settleTo('canvas', -WIDTH * 0.5, WIDTH)).toBe('chat')
  })

  it('falls back to where it started when it did not', () => {
    // A hesitation is not a navigation, and snapping back is how the gesture
    // says so without anybody having to undo anything.
    expect(settleTo('chat', -WIDTH * 0.1, WIDTH)).toBe('chat')
    expect(settleTo('canvas', -WIDTH * 0.9, WIDTH)).toBe('canvas')
  })

  it('reads the same threshold in both directions', () => {
    const just = WIDTH * SWIPE_COMMIT + 1
    expect(settleTo('chat', -just, WIDTH)).toBe('canvas')
    expect(settleTo('canvas', -WIDTH + just, WIDTH)).toBe('chat')
  })

  it('stays put on a viewport of no width, rather than dividing by it', () => {
    expect(settleTo('chat', 0, 0)).toBe('chat')
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

/** A shell the hook can drag, holding the two things it must not steal. */
function Track({
  screen: at = 'chat' as const,
  onScreen = vi.fn(),
  enabled = true,
  mounted = true,
}: {
  screen?: 'chat' | 'canvas'
  onScreen?: (screen: 'chat' | 'canvas') => void
  enabled?: boolean
  /** False stands in for the boot render, where the shell does not exist yet. */
  mounted?: boolean
}) {
  const ref = useSwipe({ screen: at, onScreen, enabled })
  if (!mounted) return <main>Loading…</main>
  return (
    <div data-testid="shell" ref={ref}>
      <p>content</p>
      <textarea aria-label="field" />
    </div>
  )
}

/** A phone-sized viewport: the thresholds are fractions of it. */
function phone(): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: WIDTH })
}

const finger = (target: Element, x: number, y: number) => [{ clientX: x, clientY: y, target }]
const down = (el: Element, x: number, y: number) => fireEvent.touchStart(el, { touches: finger(el, x, y) })
const to = (el: Element, x: number, y: number) => fireEvent.touchMove(el, { touches: finger(el, x, y) })
const up = (el: Element) => fireEvent.touchEnd(el, { touches: [] })

describe('the drag', () => {
  it('follows the finger, and says so while it is happening', () => {
    phone()
    const onScreen = vi.fn()
    render(<Track onScreen={onScreen} />)
    const shell = screen.getByTestId('shell')

    down(shell, 300, 400)
    to(shell, 150, 405)
    // The track is under the finger — 150px of it, past the 28% that commits
    // on a 390px screen — and the easing is off for as long as it stays there.
    expect(shell.style.transform).toBe('translateX(-150px)')
    expect(shell.dataset['swiping']).toBe('true')
    expect(onScreen).not.toHaveBeenCalled()

    up(shell)
    expect(shell.dataset['swiping']).toBeUndefined()
    expect(onScreen).toHaveBeenCalledWith('canvas')
    // Handed back to the stylesheet, which is what survives a rotation.
    expect(shell.style.transform).toBe('')
    expect(shell.dataset['screen']).toBe('canvas')
  })

  it('binds when the shell mounts, not when the hook first runs', () => {
    // The shell does not exist on the first render: the instance has not
    // answered and the app is a "Loading…" line. A hook that bound once,
    // against nothing, was dead on every real boot while every test that
    // rendered the shell outright passed. Found at the bench, not here.
    phone()
    const onScreen = vi.fn()
    const { rerender } = render(<Track mounted={false} onScreen={onScreen} />)
    rerender(<Track mounted onScreen={onScreen} />)
    const shell = screen.getByTestId('shell')

    down(shell, 300, 400)
    to(shell, 150, 405)
    up(shell)
    expect(onScreen).toHaveBeenCalledWith('canvas')
  })

  it('claims the gesture, so the browser cannot cancel it half-way', () => {
    // The whole defect: without this the browser starts scrolling behind the
    // finger, fires pointercancel, and the swipe is lost with nothing on
    // screen having moved.
    phone()
    render(<Track />)
    const shell = screen.getByTestId('shell')
    down(shell, 300, 400)
    const move = createTouchMove(shell, 200, 405)
    expect(move.defaultPrevented).toBe(true)
  })

  it('snaps back when the finger did not carry it far enough', () => {
    phone()
    const onScreen = vi.fn()
    render(<Track onScreen={onScreen} />)
    const shell = screen.getByTestId('shell')

    down(shell, 300, 400)
    to(shell, 260, 400)
    up(shell)
    expect(onScreen).toHaveBeenCalledWith('chat')
    expect(shell.style.transform).toBe('')
  })

  it('comes back from the canvas the same way', () => {
    phone()
    const onScreen = vi.fn()
    render(<Track screen="canvas" onScreen={onScreen} />)
    const shell = screen.getByTestId('shell')

    down(shell, 100, 400)
    to(shell, 300, 410)
    expect(shell.style.transform).toBe(`translateX(${-WIDTH + 200}px)`)
    up(shell)
    expect(onScreen).toHaveBeenCalledWith('chat')
  })

  it('releases a vertical gesture for good, and never takes it back', () => {
    // Reconsidering mid-scroll is how a thread jumps sideways while somebody
    // is reading it.
    phone()
    const onScreen = vi.fn()
    render(<Track onScreen={onScreen} />)
    const shell = screen.getByTestId('shell')

    down(shell, 300, 400)
    to(shell, 302, 340)
    expect(shell.dataset['swiping']).toBeUndefined()
    // Now the finger turns hard sideways — too late, the gesture is a scroll.
    to(shell, 100, 340)
    expect(shell.style.transform).toBe('')
    up(shell)
    expect(onScreen).not.toHaveBeenCalled()
  })

  it('ignores a drag that began in the composer', () => {
    phone()
    const onScreen = vi.fn()
    render(<Track onScreen={onScreen} />)
    const shell = screen.getByTestId('shell')
    const field = screen.getByLabelText('field')

    fireEvent.touchStart(shell, { touches: finger(field, 300, 400) })
    to(shell, 100, 400)
    up(shell)
    expect(onScreen).not.toHaveBeenCalled()
    expect(shell.style.transform).toBe('')
  })

  it('ignores a second finger, which is a pinch and not a page turn', () => {
    phone()
    const onScreen = vi.fn()
    render(<Track onScreen={onScreen} />)
    const shell = screen.getByTestId('shell')

    fireEvent.touchStart(shell, { touches: [...finger(shell, 300, 400), ...finger(shell, 200, 500)] })
    to(shell, 100, 400)
    up(shell)
    expect(onScreen).not.toHaveBeenCalled()
  })

  it('does nothing at all on a desktop', () => {
    phone()
    const onScreen = vi.fn()
    render(<Track enabled={false} onScreen={onScreen} />)
    const shell = screen.getByTestId('shell')

    down(shell, 300, 400)
    to(shell, 100, 400)
    up(shell)
    expect(onScreen).not.toHaveBeenCalled()
    expect(shell.style.transform).toBe('')
  })
})

/** Dispatch a move and hand back the event, to read whether it was claimed. */
function createTouchMove(element: Element, x: number, y: number): Event {
  const event = new Event('touchmove', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'touches', { value: finger(element, x, y) })
  fireEvent(element, event)
  return event
}
