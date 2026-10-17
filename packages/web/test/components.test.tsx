// @vitest-environment jsdom
/**
 * The shell's React wrappers (docs/charte.md § 4): Sheet, Popover, Button, ThemeSwitch,
 * EmptyState, Field — behaviour the criterion names, plus the class/skill contract.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Button, EmptyState, Field, Popover, Sheet, ThemeSwitch } from '../src/app/ui/index.js'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

function SheetHost({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>opener</button>
      <Sheet open={open} title="Titre" onClose={() => { onClose(); setOpen(false) }} footer={<button>last</button>}>
        <input aria-label="champ" />
      </Sheet>
    </>
  )
}

describe('Sheet', () => {
  it('is a labelled modal dialog on the body, closed by Escape, focus returned', () => {
    const onClose = vi.fn()
    render(<SheetHost onClose={onClose} />)
    const opener = screen.getByText('opener')
    opener.focus()
    fireEvent.click(opener)
    const dlg = screen.getByRole('dialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    expect(dlg.closest('.adestia-sheet')?.parentElement).toBe(document.body)
    expect(screen.getByRole('dialog', { name: 'Titre' })).toBe(dlg)
    expect(dlg.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('keeps Tab and Shift+Tab inside the panel', () => {
    render(<SheetHost />)
    fireEvent.click(screen.getByText('opener'))
    const dlg = screen.getByRole('dialog')
    const last = screen.getByText('last')
    last.focus()
    const tab = fireEvent.keyDown(last, { key: 'Tab' })
    expect(tab).toBe(false) // default prevented: focus wrapped by hand
    expect(dlg.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(last)
    const first = document.activeElement as HTMLElement
    const back = fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(back).toBe(false)
    expect(document.activeElement).toBe(last)
    // focus that escaped the panel is pulled back
    screen.getByText('opener').focus()
    fireEvent.keyDown(document.body, { key: 'Tab' })
    expect(dlg.contains(document.activeElement)).toBe(true)
  })

  it('closes on a click on the scrim, not on the panel; renders nothing when closed', () => {
    const onClose = vi.fn()
    const { rerender } = render(<Sheet open={false} title="T" onClose={onClose}>x</Sheet>)
    expect(document.querySelector('.adestia-sheet')).toBeNull()
    rerender(<Sheet open title="T" onClose={onClose}>x</Sheet>)
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(document.querySelector('.adestia-sheet')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('has a translated, labelled close button', () => {
    render(<Sheet open title="T" onClose={() => {}} t={(k) => `fr:${k}`}>x</Sheet>)
    expect(screen.getByRole('button', { name: 'fr:Close' })).toBeTruthy()
  })

  it('focuses the panel itself when it holds nothing focusable', () => {
    render(<Popover anchor={{ current: document.body }} open onClose={() => {}}>texte</Popover>)
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
  })
})

function PopHost({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={anchor} onClick={() => setOpen(true)}>anchor</button>
      <p>outside</p>
      <Popover anchor={anchor} open={open} onClose={() => { onClose(); setOpen(false) }} label="Menu">
        <button>inside</button>
      </Popover>
    </>
  )
}

describe('Popover', () => {
  it('closes on Escape and gives focus back', () => {
    const onClose = vi.fn()
    render(<PopHost onClose={onClose} />)
    const anchor = screen.getByText('anchor')
    anchor.focus()
    fireEvent.click(anchor)
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByText('inside'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(anchor)
  })

  it('closes on a press outside, not on a press inside or on the anchor', () => {
    const onClose = vi.fn()
    render(<PopHost onClose={onClose} />)
    fireEvent.click(screen.getByText('anchor'))
    fireEvent.mouseDown(screen.getByText('inside'))
    fireEvent.mouseDown(screen.getByText('anchor'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(screen.getByText('outside'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not trap Tab', () => {
    render(<PopHost />)
    fireEvent.click(screen.getByText('anchor'))
    expect(fireEvent.keyDown(screen.getByText('inside'), { key: 'Tab' })).toBe(true)
  })
})

describe('Button', () => {
  it('an icon button without aria-label does not compile', () => {
    // @ts-expect-error — icon only, no children, no aria-label
    const bad = <Button icon="x" />
    expect(bad).toBeTruthy()
    const ok = <Button icon="x" aria-label="Close" />
    render(ok)
    const b = screen.getByRole('button', { name: 'Close' })
    expect(b.className).toContain('adestia-btn--icon')
    expect(b.getAttribute('type')).toBe('button')
  })

  it('applies variants and size, and busy swaps the icon and sets aria-busy', () => {
    render(<Button variant="danger" small busy icon="trash-2" className="x">Go</Button>)
    const b = screen.getByRole('button')
    expect(b.className).toBe('adestia-btn adestia-btn--danger adestia-btn--sm x')
    expect(b.getAttribute('aria-busy')).toBe('true')
    expect(b.querySelector('use')?.getAttribute('href')).toContain('loader-circle')
    expect(b.querySelector('.adestia-icon--spin')).toBeTruthy()
    expect(b.textContent).toContain('Go')
  })

  it('a disabled button does not click', () => {
    const on = vi.fn()
    render(<Button disabled onClick={on}>Go</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(on).not.toHaveBeenCalled()
  })
})

describe('ThemeSwitch', () => {
  it('is a radiogroup of System, Light, Dark with the current one checked', () => {
    render(<ThemeSwitch value="dark" onChange={() => {}} />)
    expect(screen.getByRole('radiogroup')).toBeTruthy()
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['System', 'Light', 'Dark'])
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true'])
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, -1, 0])
  })

  it('reports the value on click and on arrow keys, wrapping round', () => {
    const on = vi.fn()
    render(<ThemeSwitch value="" onChange={on} />)
    const [sys, light, dark] = screen.getAllByRole('radio') as [HTMLElement, HTMLElement, HTMLElement]
    fireEvent.click(light)
    expect(on).toHaveBeenLastCalledWith('light')
    fireEvent.keyDown(sys, { key: 'ArrowRight' })
    expect(on).toHaveBeenLastCalledWith('light')
    fireEvent.keyDown(sys, { key: 'ArrowLeft' })
    expect(on).toHaveBeenLastCalledWith('dark')
    expect(document.activeElement).toBe(dark)
  })
})

describe('EmptyState', () => {
  it('renders its text, and its action only when given', () => {
    const { rerender } = render(<EmptyState icon="folder" text="Rien ici" />)
    expect(screen.getByText('Rien ici')).toBeTruthy()
    expect(document.querySelector('.adestia-empty__action')).toBeNull()
    rerender(<EmptyState icon="folder" text="Rien ici" action={<button>Créer</button>} />)
    expect(screen.getByRole('button', { name: 'Créer' })).toBeTruthy()
  })
})

describe('Field', () => {
  it('binds help and error to the control and shows the alert icon with the error', () => {
    render(
      <Field label="Nom" help="Aide" error="Faux">
        <input className="adestia-input" />
      </Field>,
    )
    const input = screen.getByLabelText('Nom')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const ids = input.getAttribute('aria-describedby')!.split(' ')
    expect(ids).toHaveLength(2)
    const texts = ids.map((id) => document.getElementById(id)?.textContent)
    expect(texts).toEqual(['Aide', 'Faux'])
    const err = document.getElementById(ids[1]!)!
    expect(err.querySelector('use')?.getAttribute('href')).toContain('circle-alert')
  })

  it('without help or error sets no description and no invalid flag', () => {
    render(<Field label="Nom"><input /></Field>)
    const input = screen.getByLabelText('Nom')
    expect(input.hasAttribute('aria-describedby')).toBe(false)
    expect(input.hasAttribute('aria-invalid')).toBe(false)
    expect(document.querySelector('.adestia-field__error')).toBeNull()
  })

  it('keeps the control own id and own description', () => {
    render(<Field label="Nom" help="Aide"><input id="mine" aria-describedby="ext" /></Field>)
    const input = screen.getByLabelText('Nom')
    expect(input.id).toBe('mine')
    expect(input.getAttribute('aria-describedby')).toContain('ext')
  })
})

describe('stylesheet and skill contract', () => {
  const root = resolve(__dirname, '../../..')
  it('chat.css no longer carries the sheet rules', () => {
    expect(readFileSync(resolve(root, 'packages/web/src/app/styles/chat.css'), 'utf8')).not.toContain('adestia-sheet')
  })
  it('the shared stylesheet defines, and the plugin-author skill names, every § 4 class', () => {
    const css = readFileSync(resolve(root, 'packages/web/src/app/styles/components.css'), 'utf8')
    const skill = readFileSync(resolve(root, 'skills/plugin-author/SKILL.md'), 'utf8')
    for (const cls of ['adestia-btn', 'adestia-sheet', 'adestia-popover', 'adestia-empty', 'adestia-field',
      'adestia-input', 'adestia-select', 'adestia-textarea', 'adestia-toggle', 'adestia-segmented']) {
      expect(css, cls).toContain(`.${cls}`)
      expect(skill, cls).toContain(`.${cls}`)
    }
    expect(css).toMatch(/@media[^{]*820px/)
  })
})
