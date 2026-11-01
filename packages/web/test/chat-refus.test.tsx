// @vitest-environment jsdom
/**
 * A turn refused at the concurrency limit (HTTP 429), in an EXISTING conversation.
 *
 * P-2 step 4 / E-16: the chat explains the refusal in the user's language with the
 * server's limit, under the message that was refused; the line survives rereading the
 * stored conversation and goes at the next send or when another conversation opens.
 * The server never files a refused message, so the reread cannot bring it back.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { translator } from '../src/app/i18n.js'
import { Chat } from '../src/chat/Chat.js'

beforeEach(() => {
  try {
    localStorage.clear()
  } catch {
    /* no storage, nothing to leak */
  }
})

type TurnAnswer = () => Promise<Response>

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Two stored conversations; the turn route answers whatever the test queues. */
function setup(answers: TurnAnswer[], reads: { delay?: Promise<void> } = {}) {
  const posts: { prompt: string; conversationId?: string }[] = []
  const reread = { c1: 0, c2: 0 }
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const path = String(url)
    if (path === '/api/turn') {
      posts.push(JSON.parse(String(init?.body)))
      const next = answers.shift()
      if (!next) throw new Error('no answer queued')
      return next()
    }
    if (path.startsWith('/api/turn/attach')) return { ok: true, status: 204, body: null } as unknown as Response
    if (path === '/api/conversations/c1' || path === '/api/conversations/c2') {
      if (reads.delay) await reads.delay
      const id = path.slice(-2) as 'c1' | 'c2'
      reread[id] += 1
      return json({
        id,
        title: id === 'c1' ? 'Premier' : 'Second',
        updatedAt: '',
        messages: [{ id: `${id}-m0`, role: 'user', text: `ancien ${id}`, at: '' }],
      })
    }
    if (path === '/api/models') return new Response('{}', { status: 404 })
    return json({
      conversations: [
        { id: 'c1', title: 'Premier', updatedAt: '' },
        { id: 'c2', title: 'Second', updatedAt: '' },
      ],
    })
  }) as unknown as typeof fetch
  return { fetchImpl, posts, reread }
}

async function open(title: string) {
  if (!screen.queryByText(title)) fireEvent.click(await screen.findByLabelText('Conversations'))
  await act(async () => {
    fireEvent.click(await screen.findByText(title))
  })
}

async function send(text: string) {
  const input = screen.getByRole('textbox')
  fireEvent.change(input, { target: { value: text } })
  await act(async () => {
    fireEvent.keyDown(input, { key: 'Enter' })
  })
}

/** Waits for the reread that follows the refusal (the open made the first read), then flushes it. */
async function afterReread(s: { reread: { c1: number } }) {
  await waitFor(() => expect(s.reread.c1).toBeGreaterThanOrEqual(2))
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

const refuse = (status: number, body: unknown): TurnAnswer => () => Promise.resolve(json(body, status))
const pending: TurnAnswer = () =>
  Promise.resolve({ ok: true, status: 200, body: new ReadableStream<Uint8Array>({ start() {} }) } as unknown as Response)

const EN_3 = 'Turn limit reached (3 at a time) — try again in a moment.'
const FR_3 = 'Limite de tours atteinte (3 à la fois) — réessayez dans un instant.'

describe('a turn refused with 429 in an existing conversation', () => {
  it('keeps its explanation, with the server limit, and the refused message, after the reread (en)', async () => {
    const s = setup([refuse(429, { error: 'too many turns running', max: 3 })])
    render(<Chat fetchImpl={s.fetchImpl} t={translator('en')} />)
    await open('Premier')
    await screen.findByText('ancien c1')
    await send('trop tard')
    await waitFor(() => expect(s.posts).toHaveLength(1))
    expect(s.posts[0]).toMatchObject({ conversationId: 'c1' })

    expect((await screen.findByRole('alert')).textContent).toContain(EN_3)
    // The reread has run (it is what used to wipe the line): give it its turn, then look again.
    await afterReread(s)
    expect(screen.getByRole('alert').textContent).toContain(EN_3)
    expect(screen.queryByText('too many turns running')).toBeNull()
    expect(screen.getByText('trop tard')).toBeTruthy()
    expect(screen.getByText('ancien c1')).toBeTruthy()
  })

  it('says it in French with the limit of THAT refusal', async () => {
    const s = setup([refuse(429, { error: 'too many turns running', max: 3 })])
    render(<Chat fetchImpl={s.fetchImpl} t={translator('fr')} />)
    await open('Premier')
    await screen.findByText('ancien c1')
    await send('trop tard')
    expect((await screen.findByRole('alert')).textContent).toContain(FR_3)
    await afterReread(s)
    expect(screen.getByRole('alert').textContent).toContain(FR_3)
    expect(screen.getByText('trop tard')).toBeTruthy()
  })

  it('still explains a refusal whose body carries no limit', async () => {
    const s = setup([refuse(429, { error: 'too many turns running' })])
    render(<Chat fetchImpl={s.fetchImpl} t={translator('en')} />)
    await open('Premier')
    await screen.findByText('ancien c1')
    await send('trop tard')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Turn limit reached')
    expect(alert.textContent).not.toContain('undefined')
    expect(alert.textContent).not.toContain('%n')
  })

  it('goes at the next send', async () => {
    const s = setup([refuse(429, { error: 'too many turns running', max: 3 }), pending])
    render(<Chat fetchImpl={s.fetchImpl} t={translator('en')} />)
    await open('Premier')
    await screen.findByText('ancien c1')
    await send('trop tard')
    await screen.findByRole('alert')
    await send('encore')
    await waitFor(() => expect(s.posts).toHaveLength(2))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('goes when another conversation is opened, and does not come back with the first', async () => {
    const s = setup([refuse(429, { error: 'too many turns running', max: 3 })])
    render(<Chat fetchImpl={s.fetchImpl} t={translator('en')} />)
    await open('Premier')
    await screen.findByText('ancien c1')
    await send('trop tard')
    await screen.findByRole('alert')

    await open('Second')
    await screen.findByText('ancien c2')
    expect(screen.queryByRole('alert')).toBeNull()

    await open('Premier')
    await screen.findByText('ancien c1')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(EN_3)).toBeNull()
  })

  it('is not revived by a reread that finishes after the reader left and came back', async () => {
    let release!: () => void
    const delay = new Promise<void>((resolve) => {
      release = resolve
    })
    // First open reads immediately; hold only the reread that follows the refusal.
    const gate: { delay?: Promise<void> } = {}
    const s = setup([refuse(429, { error: 'too many turns running', max: 3 })], gate)
    render(<Chat fetchImpl={s.fetchImpl} t={translator('en')} />)
    await open('Premier')
    await screen.findByText('ancien c1')
    gate.delay = delay
    await send('trop tard')
    await screen.findByRole('alert')
    await open('Second')
    delete gate.delay
    await open('Premier')
    await act(async () => release())
    await afterReread(s)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('other failures of a turn', () => {
  it('keeps the server’s own words for a refusal that is not a 429, after the reread', async () => {
    const s = setup([refuse(503, { error: 'engine overloaded' })])
    render(<Chat fetchImpl={s.fetchImpl} t={translator('fr')} />)
    await open('Premier')
    await screen.findByText('ancien c1')
    await send('essai')
    expect((await screen.findByRole('alert')).textContent).toContain('engine overloaded')
    await afterReread(s)
    expect(screen.getByRole('alert').textContent).toContain('engine overloaded')
    expect(screen.queryByText(/Limite de tours/)).toBeNull()
  })

  it('keeps the line of a server that cannot be reached, after the reread', async () => {
    const s = setup([() => Promise.reject(new TypeError('Load failed'))])
    render(<Chat fetchImpl={s.fetchImpl} t={translator('en')} />)
    await open('Premier')
    await screen.findByText('ancien c1')
    await send('essai')
    expect((await screen.findByRole('alert')).textContent).toContain('Load failed')
    await afterReread(s)
    expect(screen.getByRole('alert').textContent).toContain('Load failed')
    expect(screen.getByText('essai')).toBeTruthy()
  })
})
