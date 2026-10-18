// @vitest-environment jsdom
/**
 * Review of the permission question and the signature sheet against the
 * criterion of adestia-qualite-chat-ecran-permission-signature: the ceremony
 * sheet closes on Escape and hands focus back to the card that opened it, the
 * cards say their state with an icon AND words, and nothing is drawn with a
 * glyph or left in the other language.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { translator } from '../src/app/i18n.js'
import { AskPrompt } from '../src/chat/AskPrompt.js'
import { SignatureCards, type Signature } from '../src/chat/Signatures.js'

const CONSENT: Signature = {
  id: 's1',
  kind: 'consent',
  url: 'https://tessera.example/consent/s1',
  expiresAt: '2999-01-01T00:00:00Z',
}
const GLYPHS = /[✓✕⌛✍🔒↗]/u

beforeEach(() => {
  const items = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    clear: () => items.clear(),
  })
})
afterEach(cleanup)

const iconsOf = (el: Element) => Array.from(el.querySelectorAll('use')).map((u) => u.getAttribute('href'))

describe('the ceremony sheet', () => {
  // Fails if Escape stops closing the sheet, or focus is not handed back.
  it('closes on Escape and returns focus to the Sign button that opened it', () => {
    render(<SignatureCards signatures={[CONSENT]} signing={{ embed: true, onSigned: () => {} }} />)
    const sign = screen.getByText('Sign').closest('button')!
    sign.focus()
    fireEvent.click(sign)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(sign)
  })

  // Fails if the sheet gets a second close control, or loses its single x.
  it('has one close control, drawn as an x icon, and the lock beside the host', () => {
    render(<SignatureCards signatures={[CONSENT]} signing={{ embed: true, onSigned: () => {} }} />)
    fireEvent.click(screen.getByText('Sign'))
    const dialog = screen.getByRole('dialog')
    const closers = dialog.querySelectorAll('button[aria-label="Close"]')
    expect(closers).toHaveLength(1)
    expect(iconsOf(closers[0]!)).toEqual(['#adestia-i-x'])
    expect(dialog.querySelector('.adestia-sheet__origin')!.textContent).toBe('tessera.example')
    expect(iconsOf(dialog.querySelector('.adestia-sheet__origin')!)).toEqual(['#adestia-i-lock'])
    expect(dialog.textContent).not.toMatch(GLYPHS)
    // The scrim is single: one sheet in the document.
    expect(document.querySelectorAll('.adestia-sheet')).toHaveLength(1)
  })

  // Fails if "Open in a tab" stops being a link to the ceremony or loses its icon.
  it('offers the ceremony in a tab, with the external-link icon, and closes the sheet', () => {
    render(<SignatureCards signatures={[CONSENT]} signing={{ embed: true, onSigned: () => {} }} />)
    fireEvent.click(screen.getByText('Sign'))
    const link = screen.getByText('Open in a tab').closest('a')!
    expect(link.getAttribute('href')).toBe(CONSENT.url)
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(iconsOf(link)).toEqual(['#adestia-i-external-link'])
    link.addEventListener('click', (e) => e.preventDefault())
    fireEvent.click(link)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // Fails if Tab from the last control escapes the dialog.
  it('keeps Tab inside the dialog from its last control', () => {
    render(<SignatureCards signatures={[CONSENT]} signing={{ embed: true, onSigned: () => {} }} />)
    fireEvent.click(screen.getByText('Sign'))
    const dialog = screen.getByRole('dialog')
    const iframe = dialog.querySelector('iframe')!
    iframe.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(iframe)
  })
})

describe('the signature cards say their state in words and an icon', () => {
  const lapsed = { ...CONSENT, id: 's2', expiresAt: '2000-01-01T00:00:00Z' }
  // Fails if a state loses its icon or its words (colour alone).
  it.each([
    ['pending', CONSENT, '#adestia-i-pen-line', 'waits for your signature'],
    ['expired', lapsed, '#adestia-i-clock', 'lapsed unsigned'],
  ])('%s', (_name, signature, icon, words) => {
    const { container } = render(<SignatureCards signatures={[signature]} signing={{ embed: true, onSigned: () => {} }} />)
    expect(iconsOf(container.querySelector('.adestia-sign')!)).toContain(icon)
    expect(container.textContent).toContain(words)
    expect(container.textContent).not.toMatch(GLYPHS)
  })

  it('signed shows check, refused shows x', () => {
    vi.useFakeTimers()
    try {
      const { container } = render(
        <SignatureCards signatures={[CONSENT, { ...CONSENT, id: 's3' }]} signing={{ embed: true, onSigned: () => {} }} />,
      )
      const say = (stage: string, nth: number) => {
        fireEvent.click(screen.getAllByText('Sign')[0]!)
        const frame = document.querySelector('iframe')!
        act(() => {
          window.dispatchEvent(new MessageEvent('message', {
            data: { source: 'tessera-ceremony', stage },
            origin: 'https://tessera.example',
            source: frame.contentWindow,
          }))
          vi.advanceTimersByTime(1500)
        })
        void nth
      }
      say('assertion_ok', 0)
      say('denied', 1)
      const cards = container.querySelectorAll('.adestia-sign')
      expect(iconsOf(cards[0]!)).toContain('#adestia-i-check')
      expect(cards[0]!.textContent).toContain('Action signed')
      expect(iconsOf(cards[1]!)).toContain('#adestia-i-x')
      expect(cards[1]!.textContent).toContain('Signature refused')
    } finally {
      vi.useRealTimers()
    }
  })

  // Fails if "until" or the card text is left in English under fr.
  it('speaks French under fr, "jusqu’à" included', () => {
    const t = translator('fr')
    const { container } = render(
      <SignatureCards signatures={[CONSENT]} signing={{ embed: true, onSigned: () => {} }} t={t} />,
    )
    expect(container.textContent).toContain('Une action attend votre signature.')
    expect(container.textContent).toContain('jusqu’à')
    expect(container.textContent).not.toContain(' until ')
    fireEvent.click(screen.getByText('Signer').closest('button')!)
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Ouvrir dans un onglet')
    expect(dialog.querySelector('button[aria-label="Fermer"]')).toBeTruthy()
    expect(dialog.querySelector('iframe')!.getAttribute('title')).toBe('Cérémonie de signature')
  })
})

describe('the permission question', () => {
  const ASK = { id: 'q1', tool: 'Bash', title: 'Claude wants to run ls', remembering: true }

  // Fails if the alert loses its icon or buttons change order/variant.
  it('draws triangle-alert and the three answers, Always last and accent', () => {
    const { container } = render(<AskPrompt ask={ASK} onAnswer={vi.fn()} />)
    expect(iconsOf(container)).toEqual(['#adestia-i-triangle-alert'])
    const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent)
    expect(buttons).toEqual(['Refuse', 'Just this once', 'Always'])
    expect(container.textContent).not.toMatch(GLYPHS)
  })

  // Fails if Always is shown (even disabled) when nothing is rememberable, or the explanation vanishes.
  it('without a rule: two buttons, and the explanation line', () => {
    const { container } = render(<AskPrompt ask={{ ...ASK, remembering: false }} onAnswer={vi.fn()} />)
    expect(Array.from(container.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Refuse', 'Just this once'])
    expect(container.textContent).toContain('No lasting rule for this one')
  })

  it('answers deny / once with the question id, in French too', () => {
    const onAnswer = vi.fn()
    render(<AskPrompt ask={ASK} onAnswer={onAnswer} t={translator('fr')} />)
    fireEvent.click(screen.getByText('Refuser'))
    fireEvent.click(screen.getByText('Cette fois'))
    fireEvent.click(screen.getByText('Toujours'))
    expect(onAnswer.mock.calls).toEqual([['q1', 'deny'], ['q1', 'once'], ['q1', 'always']])
  })
})
