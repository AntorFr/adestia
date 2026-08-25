// @vitest-environment jsdom
/**
 * The dialog's three behaviours — the ones people notice when missing.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Modal } from '../src/app/Modal.js'

describe('Modal', () => {
  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<Modal title="Settings" onClose={onClose}>body</Modal>)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on a click on the scrim', () => {
    const onClose = vi.fn()
    const { container } = render(<Modal title="Settings" onClose={onClose}>body</Modal>)
    container.querySelector('.golem-modal')?.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT close on a click inside the card', () => {
    // The failure this guards: a drag that ends outside dismissing what
    // somebody was in the middle of typing.
    const onClose = vi.fn()
    const { container } = render(<Modal title="Settings" onClose={onClose}>body</Modal>)
    container.querySelector('.golem-modal__card')?.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true }),
    )
    expect(onClose).not.toHaveBeenCalled()
  })

  it('moves focus inside, so the keyboard is not left on the page behind', () => {
    render(
      <Modal title="Settings" onClose={() => {}}>
        <button type="button">Arm</button>
      </Modal>,
    )
    // The close button is the first focusable thing in the card.
    expect(document.activeElement).toBe(screen.getByLabelText('Close'))
  })

  it('announces itself as a dialog', () => {
    render(<Modal title="Settings" onClose={() => {}}>body</Modal>)
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBe('Settings')
  })
})
