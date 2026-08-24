// @vitest-environment jsdom
/**
 * The slot mount: imperative skin markup living inside React without either
 * side touching the other's nodes.
 */

import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SkinSlot } from '../src/app/SkinSlot.js'

const context = { ask: () => {}, compose: () => {}, focusComposer: () => {} }

describe('SkinSlot', () => {
  it('hands the slot a host and mounts what it draws', () => {
    const { container } = render(
      <SkinSlot
        context={context}
        render={(host) => {
          host.innerHTML = '<span class="mascot">🐇</span>'
        }}
      />,
    )
    expect(container.querySelector('.mascot')).toBeTruthy()
  })

  it('runs the teardown on unmount, then empties the host regardless', () => {
    const teardown = vi.fn()
    const { container, unmount } = render(
      <SkinSlot
        context={context}
        render={(host) => {
          host.innerHTML = '<i>beating</i>'
          return teardown
        }}
      />,
    )
    unmount()
    expect(teardown).toHaveBeenCalledTimes(1)
    expect(container.innerHTML).toBe('')
  })

  it('survives a slot that throws, costing only its own box', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(
      <SkinSlot
        context={context}
        className="host"
        render={() => {
          throw new Error('bad livery')
        }}
      />,
    )
    expect(container.querySelector('.host')).toBeTruthy()
    spy.mockRestore()
  })

  it('reaches the CURRENT context even from a handler bound at mount', () => {
    // The context object changes every shell render; remounting the slot on
    // each would restart animations mid-beat, so handlers read through a ref.
    let clicked: string[] = []
    const { container, rerender } = render(
      <SkinSlot
        context={{ ...context, ask: (p) => clicked.push(`v1:${p}`) }}
        render={(host, ctx) => {
          const button = document.createElement('button')
          button.addEventListener('click', () => ctx.ask('go'))
          host.append(button)
        }}
      />,
    )
    rerender(
      <SkinSlot
        context={{ ...context, ask: (p) => clicked.push(`v2:${p}`) }}
        render={(host, ctx) => {
          const button = document.createElement('button')
          button.addEventListener('click', () => ctx.ask('go'))
          host.append(button)
        }}
      />,
    )
    container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(clicked).toEqual(['v2:go'])
  })
})
