// @vitest-environment jsdom
/**
 * The markup of a seeded chat, frozen before the chat was cut by lifetime.
 *
 * The snapshot file was written from the code as it stood BEFORE `Chat`,
 * `useConversations` and `Composer` were split: the split moves code, and this
 * is what says it moved nothing the reader sees.
 */

import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expect, it, onTestFinished, vi } from 'vitest'

import { Chat } from '../src/chat/Chat.js'

it('renders a seeded thread, its tab strip and its list as it always did', async () => {
  const store = new Map<string, string>([
    ['adestia.tabs', JSON.stringify({ open: ['c2', 'c1'], active: 'c1' })],
  ])
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
  onTestFinished(() => {
    vi.unstubAllGlobals()
  })
  const json = (body: unknown) =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response)
  const fetchImpl = vi.fn((url: string) => {
    const path = String(url)
    if (path.startsWith('/api/turn/attach')) {
      return Promise.resolve({ ok: true, status: 204, body: null } as unknown as Response)
    }
    const id = /\/api\/conversations\/(c\d)$/.exec(path)?.[1]
    if (id) {
      return json({
        id,
        title: id === 'c1' ? 'Fil un' : 'Fil deux',
        updatedAt: '',
        messages: [
          { id: 'm1', role: 'user', text: `question ${id}`, at: '' },
          { id: 'm2', role: 'agent', text: `**réponse** ${id}`, at: '' },
        ],
      })
    }
    if (path === '/api/models') return json({ models: [{ id: 'm-a', label: 'Modèle A' }] })
    return json({
      conversations: [
        { id: 'c1', title: 'Fil un', updatedAt: '' },
        { id: 'c2', title: 'Fil deux', updatedAt: '' },
        { id: 'c3', title: 'Fil trois', updatedAt: '' },
      ],
    })
  }) as unknown as typeof fetch

  const { container } = render(
    <Chat fetchImpl={fetchImpl} brand="Corps" onOpenCanvas={() => {}} extraButtons={[
      { key: 'x', glyph: '✦', title: 'Extra', api: null, onClick: () => {} },
    ]} />,
  )
  await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(2))
  expect(await screen.findAllByText('réponse')).toHaveLength(1)
  await screen.findByLabelText('Model')
  await act(async () => {
    fireEvent.click(screen.getByLabelText('Conversations'))
  })
  await screen.findByText('Fil trois')

  await expect(container.innerHTML.replace(/></g, '>\n<')).toMatchFileSnapshot(
    './__snapshots__/chat-markup.html',
  )
})
