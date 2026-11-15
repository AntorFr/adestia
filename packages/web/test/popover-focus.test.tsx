// @vitest-environment jsdom
/**
 * Popover focus (docs/charte.md § 4): focus enters the panel once it is placed and visible,
 * never while it is still `visibility: hidden`; it returns to the opener on close.
 * jsdom grants focus even to a hidden element, so the proof spies `focus()` and reads the
 * panel's computed visibility at the call that targets it.
 */
import { act, cleanup, render } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Popover } from '../src/app/ui/index.js'

function Host() {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button ref={anchor} data-testid="cog" onClick={() => setOpen(true)}>cog</button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} label="Menu">
        <button data-testid="item">item</button>
      </Popover>
    </>
  )
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('Popover focus', () => {
  it('focuses into the panel only once it is visible, and gives the focus back to the opener on close', async () => {
    const seen: string[] = []
    const real = HTMLElement.prototype.focus
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, ...args) {
      const panel = this.closest('.adestia-popover')
      if (panel) seen.push(getComputedStyle(panel).visibility)
      return real.apply(this, args)
    })
    const view = render(<Host />)
    const cog = view.getByTestId('cog')
    cog.focus()
    await act(async () => { cog.click() })
    expect(seen.length).toBeGreaterThan(0)
    expect(seen).not.toContain('hidden')
    expect(document.activeElement).toBe(view.getByTestId('item'))

    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(document.querySelector('.adestia-popover')).toBeNull()
    expect(document.activeElement).toBe(cog)
  })

  it('places afresh on reopening: focus enters the panel again', async () => {
    const view = render(<Host />)
    const cog = view.getByTestId('cog')
    await act(async () => { cog.click() })
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    await act(async () => { cog.click() })
    expect(document.activeElement).toBe(view.getByTestId('item'))
  })
})
