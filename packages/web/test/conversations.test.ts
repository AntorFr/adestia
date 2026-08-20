import { describe, expect, it } from 'vitest'

import {
  createConversation,
  deleteConversation,
  listConversations,
  readConversation,
  titleFrom,
} from '../src/chat/conversations.js'

const respond = (status: number, body: unknown): typeof fetch =>
  (() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as unknown as Response)) as unknown as typeof fetch

describe('listing', () => {
  it('returns the threads', async () => {
    const threads = [{ id: 'a', title: 'One', updatedAt: '2026-01-01T00:00:00Z' }]
    expect(await listConversations(respond(200, { conversations: threads }))).toEqual(threads)
  })

  it('is empty rather than throwing when the store is unreachable', async () => {
    // A thread list that throws takes the whole shell down with it, and the
    // chat works perfectly well without its history.
    expect(await listConversations(respond(500, {}))).toEqual([])
  })
})

describe('resilience', () => {
  it('survives a store that answers nonsense', async () => {
    // Not hypothetical: a proxy returning an HTML error page answers 200 with
    // a body that is not JSON.
    const broken = (() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error('not json')) } as unknown as Response)) as unknown as typeof fetch
    expect(await listConversations(broken)).toEqual([])
    expect(await createConversation(broken)).toBeUndefined()
  })

  it('survives a network that is simply down', async () => {
    const offline = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch
    expect(await listConversations(offline)).toEqual([])
    expect(await deleteConversation('a', offline)).toBe(false)
  })
})

describe('reading', () => {
  it('returns the thread with its messages', async () => {
    const conversation = {
      id: 'a',
      title: 'One',
      updatedAt: '',
      messages: [{ id: 'm', role: 'agent', text: 'hi', at: '' }],
    }
    expect(await readConversation('a', respond(200, conversation))).toEqual(conversation)
  })

  it('returns nothing for a thread that is not ours', async () => {
    expect(await readConversation('x', respond(404, {}))).toBeUndefined()
  })
})

describe('creating and deleting', () => {
  it('returns the new thread', async () => {
    const created = { id: 'new', title: 'New conversation', updatedAt: '' }
    expect(await createConversation(respond(200, created))).toEqual(created)
  })

  it('says so when creation failed', async () => {
    expect(await createConversation(respond(500, {}))).toBeUndefined()
  })

  it('reports a delete that matched nothing', async () => {
    expect(await deleteConversation('x', respond(404, {}))).toBe(false)
  })
})

describe('titles', () => {
  it('uses the first words of the thread', () => {
    expect(titleFrom('Comment ranger le garage ?')).toBe('Comment ranger le garage ?')
  })

  it('flattens and truncates a long opening', () => {
    const long = titleFrom(`${'a'.repeat(80)}\n\nmore`)
    expect(long).toHaveLength(48)
    expect(long.endsWith('…')).toBe(true)
    expect(long).not.toContain('\n')
  })
})
