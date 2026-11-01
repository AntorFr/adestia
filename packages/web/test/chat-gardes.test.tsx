// @vitest-environment jsdom
/**
 * Guards of the chat tranche (E-13/P-13 step 7, E-16/E-18 fold): a delegated
 * transcript never draws signature cards, and the folded composer answers an
 * empty fill by focusing the field without touching the draft.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Delegations } from '../src/app/Delegations.js'
import { Composer } from '../src/chat/Composer.js'

afterEach(cleanup)

const json = (body: unknown): typeof fetch =>
  (() =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response)) as unknown as typeof fetch

describe('a delegated transcript carrying signatures', () => {
  // Panne : si Delegations passe `signatures: true` (ou retire l'option), une carte .adestia-sign apparaît.
  it('reads the text and draws no signature card', async () => {
    const conversation = {
      caller: 'alfred',
      id: 'c1',
      title: 'Signer',
      messages: [
        { id: 'm1', role: 'user', text: 'fais signer', at: '2026-09-06T10:00:00Z' },
        {
          id: 'm2',
          role: 'agent',
          text: 'voici le lien',
          at: '2026-09-06T10:01:00Z',
          signatures: [
            { id: 's1', kind: 'consent', url: 'https://sign.example/a' },
            { id: 's2', kind: 'grant', url: 'https://sign.example/b', expiresAt: '2099-01-01T00:00:00Z' },
          ],
        },
      ],
    }
    const { container } = render(<Delegations open="alfred/c1" onOpen={() => {}} fetchImpl={json(conversation)} />)
    await waitFor(() => expect(screen.getByText('voici le lien')).toBeTruthy())
    expect(container.querySelector('[class*="adestia-sign"]')).toBeNull()
    expect(screen.queryByText('Sign')).toBeNull()
    expect(screen.queryByText(/sign\.example/)).toBeNull()
  })
})

describe('the folded composer given an empty fill', () => {
  const setup = () => {
    let fill!: (text: string) => void
    const onSend = vi.fn()
    const view = render(
      <Composer onSend={onSend} onStop={vi.fn()} busy={false} folded onFill={(f) => { fill = f }} />,
    )
    const area = view.container.querySelector('textarea') as HTMLTextAreaElement
    return { area, onSend, fill: (text: string) => act(() => fill(text)) }
  }

  // Panne : un remplissage vide qui n'appelle pas focus(), ou qui efface/écrase le brouillon.
  it.each(['', '   ', '\n\t'])('focuses the field and keeps the draft exactly for %j', (empty) => {
    const { area, onSend, fill } = setup()
    fireEvent.change(area, { target: { value: '  mon brouillon  ' } })
    ;(document.activeElement as HTMLElement | null)?.blur()
    expect(document.activeElement).not.toBe(area)
    fill(empty)
    expect(document.activeElement).toBe(area)
    expect(area.value).toBe('  mon brouillon  ')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('also focuses an empty field and leaves it empty', () => {
    const { area, fill } = setup()
    fill('')
    expect(document.activeElement).toBe(area)
    expect(area.value).toBe('')
  })

  it('still appends non-empty text after the draft (the fill is not broken by the guard)', () => {
    const { area, fill } = setup()
    fireEvent.change(area, { target: { value: 'avant ' } })
    fill('code')
    expect(area.value).toBe('avant code')
  })

  it('keeps the draft when a plugin button of the opened fold fills nothing', () => {
    let fill!: (text: string) => void
    const view = render(
      <Composer
        onSend={vi.fn()}
        onStop={vi.fn()}
        busy={false}
        folded
        onFill={(f) => { fill = f }}
        extraButtons={[{ key: 'scan', glyph: '◈', title: 'Run scan', api: {}, onClick: () => act(() => fill('')) }]}
      />,
    )
    const area = view.container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.change(area, { target: { value: 'brouillon' } })
    fireEvent.click(screen.getByLabelText('More'))
    fireEvent.click(screen.getByText('Run scan'))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(area)
    expect(area.value).toBe('brouillon')
  })
})
