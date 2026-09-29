// @vitest-environment jsdom
/**
 * The signature card and the sheet that frames the ceremony.
 *
 * What matters here is who is listened to: the sheet closes and the agent is
 * relaunched on a stage name, so a message from anywhere but the ceremony's
 * own frame must change nothing.
 */

import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SignatureCards, type Signature } from '../src/chat/Signatures.js'
import { INITIAL_TURN, applyEvent } from '../src/chat/stream.js'

const CONSENT: Signature = {
  id: 'c1',
  kind: 'consent',
  url: 'https://tessera.example/consent/c1',
  expiresAt: '2999-01-01T00:00:00Z',
}

beforeEach(() => {
  // Whether this runtime has a localStorage at all varies; a fresh one per
  // test keeps a settled card from leaking into the next.
  const items = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    clear: () => items.clear(),
  })
})

function stage(stage: string, init: { origin?: string; source?: MessageEventSource | null } = {}) {
  const frame = document.querySelector('iframe')!
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { source: 'tessera-ceremony', stage, code: null },
        origin: init.origin ?? 'https://tessera.example',
        source: init.source === undefined ? frame.contentWindow : init.source,
      }),
    )
  })
}

describe('the turn reducer', () => {
  it('hangs a signature on the part being written, once', () => {
    const event = { type: 'signature-request', ...CONSENT } as const
    let state = applyEvent(INITIAL_TURN, { type: 'tool-use', name: 'mcp__g__send', id: 't' })
    state = applyEvent(state, event)
    state = applyEvent(state, event)
    expect(state.parts).toHaveLength(1)
    expect(state.parts[0]!.signatures).toEqual([CONSENT])
  })
})

describe('the signature card', () => {
  it('draws nothing when the instance names no façade', () => {
    const { container } = render(<SignatureCards signatures={[CONSENT]} signing={undefined} />)
    expect(container.innerHTML).toBe('')
  })

  it('opens the ceremony in a framed sheet, allowed to use a passkey', () => {
    render(<SignatureCards signatures={[CONSENT]} signing={{ embed: true, onSigned: () => {} }} />)
    fireEvent.click(screen.getByText('Sign'))
    const frame = document.querySelector('iframe')!
    expect(frame.getAttribute('src')).toBe(CONSENT.url)
    expect(frame.getAttribute('allow')).toBe('publickey-credentials-get')
    // The origin is said on the sheet: the frame cannot show where it is from.
    expect(screen.getByRole('dialog').textContent).toContain('tessera.example')
  })

  it('relaunches once on the frame’s own signature, and settles the card', () => {
    vi.useFakeTimers()
    try {
      const onSigned = vi.fn()
      render(<SignatureCards signatures={[CONSENT]} signing={{ embed: true, onSigned }} />)
      fireEvent.click(screen.getByText('Sign'))
      stage('assertion_ok')
      stage('assertion_ok')
      expect(onSigned).toHaveBeenCalledTimes(1)
      expect(onSigned).toHaveBeenCalledWith(CONSENT)
      act(() => {
        vi.advanceTimersByTime(1500)
      })
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.getByRole('status').textContent).toContain('Action signed')
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores a stage from another origin or another window', () => {
    const onSigned = vi.fn()
    render(<SignatureCards signatures={[CONSENT]} signing={{ embed: true, onSigned }} />)
    fireEvent.click(screen.getByText('Sign'))
    stage('assertion_ok', { origin: 'https://evil.example' })
    stage('assertion_ok', { source: window })
    expect(onSigned).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('marks a refusal without relaunching anything', () => {
    const onSigned = vi.fn()
    render(<SignatureCards signatures={[CONSENT]} signing={{ embed: true, onSigned }} />)
    fireEvent.click(screen.getByText('Sign'))
    stage('denied')
    expect(onSigned).not.toHaveBeenCalled()
    expect(screen.getAllByRole('status')[0]!.textContent).toContain('Signature refused')
  })

  it('opens a tab when the façade does not accept to be framed, and asks afterwards', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const onSigned = vi.fn()
    render(<SignatureCards signatures={[CONSENT]} signing={{ embed: false, onSigned }} />)
    fireEvent.click(screen.getByText('Sign'))
    expect(open).toHaveBeenCalledWith(CONSENT.url, '_blank', 'noopener')
    fireEvent.click(screen.getByText('I signed it'))
    expect(onSigned).toHaveBeenCalledWith(CONSENT)
    open.mockRestore()
  })

  it('offers nothing once a request has lapsed', () => {
    render(
      <SignatureCards
        signatures={[{ ...CONSENT, expiresAt: '2000-01-01T00:00:00Z' }]}
        signing={{ embed: true, onSigned: () => {} }}
      />,
    )
    expect(screen.queryByText('Sign')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('lapsed')
  })
})
