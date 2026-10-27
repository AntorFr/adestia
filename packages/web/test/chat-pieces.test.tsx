// @vitest-environment jsdom
/**
 * E-16: the message just sent shows its attachments as the held one does —
 * the `paperclip` icon and the names, never a text 📎 in the message text —
 * and the model select keeps its native control with a translated empty option.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { Chat } from '../src/chat/Chat.js'
import { ModelPicker } from '../src/chat/ModelPicker.js'
import { stamped } from '../src/chat/useConversations.js'

beforeEach(() => {
  try {
    localStorage.clear()
  } catch {
    /* no storage, nothing to leak */
  }
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('stamped: the user half as data', () => {
  it('keeps the text clean and the names apart (no 📎 in the text)', () => {
    const m = stamped('u0', 'bonjour', [
      { id: 'a', name: 'plan.pdf' },
      { id: 'b', name: 'carte.png' },
    ])
    expect(m).toEqual({ id: 'u0', role: 'user', text: 'bonjour', attachments: ['plan.pdf', 'carte.png'] })
    expect(m.text).not.toContain('📎')
  })

  it('carries no attachments key when nothing was attached', () => {
    expect(stamped('u1', 'seul', [])).toEqual({ id: 'u1', role: 'user', text: 'seul' })
  })

  it('leaves an attachment-only message with an empty text, not a lone emoji', () => {
    const m = stamped('u2', '', [{ id: 'a', name: 'plan.pdf' }])
    expect(m.text).toBe('')
  })
})

function setup() {
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const path = String(url)
    if (path === '/api/upload') {
      return json({ attachments: [{ id: 'a', name: 'plan.pdf' }, { id: 'b', name: 'carte.png' }] })
    }
    if (path === '/api/turn') {
      void init
      return {
        ok: true,
        status: 200,
        body: new ReadableStream<Uint8Array>({ start() {} }),
      } as unknown as Response
    }
    if (path.startsWith('/api/turn/attach')) return { ok: true, status: 204, body: null } as unknown as Response
    if (init?.method === 'POST' && path === '/api/conversations') return json({ id: 'c1', title: 't', updatedAt: '' })
    return json({ conversations: [] })
  }) as unknown as typeof fetch
  return fetchImpl
}

async function attachAndSend(container: HTMLElement, text: string) {
  const picker = container.querySelector('input[type=file]') as HTMLInputElement
  await act(async () => {
    fireEvent.change(picker, {
      target: { files: [new File(['x'], 'plan.pdf'), new File(['y'], 'carte.png')] },
    })
  })
  await screen.findByText(/plan\.pdf/)
  const input = screen.getByRole('textbox')
  if (text) fireEvent.change(input, { target: { value: text } })
  await act(async () => {
    fireEvent.keyDown(input, { key: 'Enter' })
  })
}

describe('the bubble of a message sent with attachments', () => {
  it('draws the paperclip icon and the names under the text, with no 📎', async () => {
    const { container } = render(<Chat fetchImpl={setup()} />)
    await attachAndSend(container, 'regarde')
    const bubble = await waitFor(() => {
      const el = container.querySelector('.adestia-bubble--user')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    expect(bubble.textContent).not.toContain('📎')
    expect(bubble.textContent).toContain('regarde')
    const line = bubble.querySelector('.adestia-bubble__attachments') as HTMLElement
    expect(line.querySelector('use')?.getAttribute('href')).toContain('paperclip')
    expect(line.textContent?.trim()).toBe('plan.pdf, carte.png')
    // The text itself is just the text.
    expect(bubble.querySelector('.adestia-bubble__text')?.textContent).toBe('regarde')
  })

  it('shows an attachments-only message with the icon and names, no empty text bubble line', async () => {
    const { container } = render(<Chat fetchImpl={setup()} />)
    await attachAndSend(container, '')
    const bubble = await waitFor(() => {
      const el = container.querySelector('.adestia-bubble--user')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    expect(bubble.textContent).not.toContain('📎')
    expect(bubble.querySelector('use')?.getAttribute('href')).toContain('paperclip')
    expect(bubble.textContent).toContain('plan.pdf, carte.png')
  })
})

describe('the model select', () => {
  it('takes its empty option from t() and stays a native .adestia-select', () => {
    render(
      <ModelPicker
        models={[{ id: 'm1' }]}
        model=""
        t={(key) => (key === 'Auto' ? 'Automatique' : key === 'Model' ? 'Modèle' : key)}
      />,
    )
    const select = screen.getByLabelText('Modèle') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect(select.classList.contains('adestia-select')).toBe(true)
    expect(select.options[0]?.value).toBe('')
    expect(select.options[0]?.textContent).toBe('Automatique')
  })
})
