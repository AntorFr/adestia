import { describe, expect, it } from 'vitest'

import { toMessage } from '../src/chat/messages.js'
import type { StoredMessage } from '../src/chat/conversations.js'

const signed = {
  id: 'm1',
  role: 'assistant',
  text: 'bonjour',
  signatures: [{ id: 's1', status: 'pending' }],
  stopped: true,
  error: 'boom',
} as unknown as StoredMessage

describe('toMessage', () => {
  it('keeps the signatures by default', () => {
    expect(toMessage(signed).signatures).toEqual([{ id: 's1', status: 'pending' }])
  })

  it('keeps them with { signatures: true } too', () => {
    expect(toMessage(signed, { signatures: true }).signatures).toEqual([{ id: 's1', status: 'pending' }])
  })

  it('drops them with { signatures: false }, keeping the rest', () => {
    const message = toMessage(signed, { signatures: false })
    expect('signatures' in message).toBe(false)
    expect(message).toEqual({ id: 'm1', role: 'assistant', text: 'bonjour', stopped: true, error: 'boom' })
  })

  it('adds no key a stored message does not carry', () => {
    const bare = { id: 'm2', role: 'user', text: 'salut' } as unknown as StoredMessage
    expect(toMessage(bare)).toEqual({ id: 'm2', role: 'user', text: 'salut' })
  })
})
