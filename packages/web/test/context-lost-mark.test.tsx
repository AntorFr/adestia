// @vitest-environment jsdom
/**
 * B-22 / P-16 step 7: a stored agent message with `contextLost` is preceded by a
 * `role="note"` line (`.adestia-thread__mark`) in English, then in French;
 * the others are not; the line survives a reread of the conversation.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { translator } from '../src/app/i18n.js'
import { Chat } from '../src/chat/Chat.js'

const EN = 'The engine no longer remembers the earlier messages.'
const FR = 'Le moteur ne se souvient plus des messages précédents.'

beforeEach(() => {
  try { localStorage.clear() } catch { /* nothing to leak */ }
  localStorage.setItem('adestia.tabs', JSON.stringify({ open: ['c1'], active: 'c1' }))
})
afterEach(cleanup)

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

const stored = [
  { id: 'm1', role: 'user', text: 'question un', at: '' },
  { id: 'm2', role: 'agent', text: 'réponse un', at: '' },
  { id: 'm3', role: 'user', text: 'question deux', at: '' },
  { id: 'm4', role: 'agent', text: 'réponse perdue', at: '', contextLost: true },
  { id: 'm5', role: 'agent', text: 'suite', at: '' },
]
const fetchImpl = ((url: string) => {
  const path = String(url)
  if (path.startsWith('/api/turn/attach')) return Promise.resolve(new Response(null, { status: 204 }))
  if (/\/api\/conversations\/c1$/.test(path)) return Promise.resolve(json({ id: 'c1', title: 'Fil', updatedAt: '', messages: stored }))
  if (path === '/api/models') return Promise.resolve(json({ models: [] }))
  return Promise.resolve(json({ conversations: [{ id: 'c1', title: 'Fil', updatedAt: '' }] }))
}) as unknown as typeof fetch

for (const [name, locale, sentence] of [['en', 'en', EN], ['fr', 'fr', FR]] as const) {
  it(`${name}: draws one note above the contextLost message only, and again after a reread`, async () => {
    const t = locale === 'fr' ? translator('fr') : (k: string) => k
    for (const pass of [1, 2]) {
      const { container, unmount } = render(<Chat fetchImpl={fetchImpl} t={t} />)
      await screen.findByText('réponse perdue')
      const notes = screen.getAllByRole('note')
      expect(notes, `pass ${pass}`).toHaveLength(1)
      expect(notes[0]!.textContent).toBe(sentence)
      expect(notes[0]!.classList.contains('adestia-thread__mark')).toBe(true)
      // Directly above the marked message, not above the others.
      const thread = container.querySelector('.adestia-chat__conversation')!
      const kids = [...thread.children]
      const at = kids.indexOf(notes[0]!)
      expect(kids[at + 1]!.textContent).toContain('réponse perdue')
      expect(kids[at - 1]!.textContent).toContain('question deux')
      await waitFor(() => expect(thread.textContent).toContain('suite'))
      unmount()
    }
  })
}

it('shows no note when no message carries the mark', async () => {
  const plain = ((url: string) =>
    /\/api\/conversations\/c1$/.test(String(url))
      ? Promise.resolve(json({ id: 'c1', title: 'Fil', updatedAt: '', messages: stored.map(({ id, role, text, at }) => ({ id, role, text, at })) }))
      : (fetchImpl as unknown as (u: string) => Promise<Response>)(url)) as unknown as typeof fetch
  render(<Chat fetchImpl={plain} />)
  await screen.findByText('réponse perdue')
  expect(screen.queryAllByRole('note')).toHaveLength(0)
})
