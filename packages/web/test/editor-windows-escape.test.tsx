// @vitest-environment jsdom
/**
 * E-5 and E-6: Escape closes the window and focus goes back to the ⚙ that opened it.
 * Rendered the way the node views do: a host that mounts the window while `open`.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { VOCABULARY } from '@antorfr/adestia-content'

import { BlockSettings } from '../src/editor/BlockSettings.js'
import { PageSettings } from '../src/editor/PageSettings.js'

afterEach(cleanup)

function Host({ kind }: { kind: 'block' | 'page' }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement | null>(null)
  return (
    <>
      <button ref={anchor} data-testid="gear" onClick={() => setOpen(true)}>
        gear
      </button>
      {open && kind === 'block' && (
        <BlockSettings name="list" spec={VOCABULARY['list']} attributes={{}} anchor={anchor} onChange={() => {}} onClose={() => setOpen(false)} />
      )}
      {open && kind === 'page' && (
        <PageSettings fields={{}} opaque="" pages={[]} anchor={anchor} onChange={() => {}} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

describe.each([['block'], ['page']] as const)('%s settings window', (kind) => {
  it('closes on Escape and gives the focus back to its gear', () => {
    render(<Host kind={kind} />)
    const gear = screen.getByTestId('gear')
    gear.focus()
    act(() => gear.click())
    expect(document.activeElement).not.toBe(gear)
    expect(screen.queryAllByRole('button', { name: 'Close' }).length + document.querySelectorAll('[aria-label="Close"]').length).toBeGreaterThan(0)

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    expect(document.querySelectorAll('[aria-label="Close"]').length).toBe(0)
    expect(document.activeElement).toBe(gear)
  })
})
