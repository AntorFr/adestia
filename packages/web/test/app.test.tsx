// @vitest-environment jsdom
/**
 * The shell's boot path.
 *
 * What matters here is what a user sees when something is not right: a status
 * code is never an answer, and "sign in" and "you will never be let in" must
 * not look the same.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { App, screenView } from '../src/app/App.js'

const INSTANCE = {
  driver: { label: 'Test CLI', cliVersion: '1.0', capabilities: [] },
  auth: { mode: 'none' },
  user: { userId: 'local', displayName: 'Local user' },
  skin: 'default',
  plugins: [],
  pluginProblems: [],
  turns: { max: 3, running: 0 },
}

function apiFetch(
  instance: { status?: number; body?: unknown } = {},
  pages?: { path: string; title: string; fields: Record<string, unknown> }[],
): typeof fetch {
  return ((url: string) => {
    if (String(url).startsWith('/api/instance')) {
      const status = instance.status ?? 200
      return Promise.resolve({
        ok: status < 400,
        status,
        json: () => Promise.resolve(instance.body ?? INSTANCE),
      } as unknown as Response)
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ entries: pages ?? [], conversations: [] }),
    } as unknown as Response)
  }) as unknown as typeof fetch
}

describe('the landing canvas', () => {
  const TILED = {
    ...INSTANCE,
    plugins: [{ id: 'todo', kind: 'app', base: '/plugins/todo/', tile: { label: 'Todo', icon: '\u2611' } }],
  }

  it('never renders the whole corpus as a flat list on the landing canvas', async () => {
    // The defect this exists for: at two hundred pages the home became a wall
    // of links with no hierarchy, and the apps were unreachable without
    // scrolling past all of it.
    const pages = [
      { path: 'notes/INDEX.md', title: 'Notes', fields: {} },
      ...Array.from({ length: 40 }, (_, index) => ({
        path: `notes/page-${index}.md`,
        title: `Page ${index}`,
        fields: {},
      })),
    ]
    const { container } = render(<App fetchImpl={apiFetch({ body: TILED }, pages)} />)

    await waitFor(() => expect(container.querySelector('.golem-tiles')).toBeTruthy())
    expect(container.querySelector('.golem-pages')).toBeNull()
    // The forty pages are represented, as one section carrying its count.
    expect(screen.getByText('40 pages')).toBeTruthy()
  })

})

describe('boot', () => {
  it('renders the shell once the instance answers', async () => {
    const { container } = render(<App fetchImpl={apiFetch()} />)
    await waitFor(() => expect(container.querySelector('.golem-shell')).toBeTruthy())
    expect(screen.getByText(/Test CLI/)).toBeTruthy()
  })

  it('invites the user to sign in on a 401', async () => {
    // A status code is not an answer: it leaves the user reading a number with
    // no way forward.
    render(<App fetchImpl={apiFetch({ status: 401 })} />)
    await waitFor(() => expect(screen.getByText('Sign in')).toBeTruthy())
    expect(screen.getByText('Sign in').getAttribute('href')).toContain('/auth/login')
  })

  it('says plainly when an account will never be admitted', async () => {
    // 403 is a different fact from 401: sending them back to login would loop
    // them forever.
    render(<App fetchImpl={apiFetch({ status: 403 })} />)
    await waitFor(() => expect(screen.getByText('Not allowed')).toBeTruthy())
    expect(screen.queryByText('Sign in')).toBeNull()
  })

  it('names a failure it cannot interpret rather than rendering nothing', async () => {
    // A blank page makes its user reload forever.
    render(<App fetchImpl={apiFetch({ status: 500 })} />)
    await waitFor(() => expect(screen.getByText(/could not start/)).toBeTruthy())
  })

  it('offers sign-out only where there is a session to end', async () => {
    render(<App fetchImpl={apiFetch()} />)
    await waitFor(() => expect(screen.getByText(/Test CLI/)).toBeTruthy())
    expect(screen.queryByText('Sign out')).toBeNull()
  })

  it('offers sign-out in oidc mode', async () => {
    const body = { ...INSTANCE, auth: { mode: 'oidc' } }
    render(<App fetchImpl={apiFetch({ body })} />)
    await waitFor(() => expect(screen.getByText('Sign out')).toBeTruthy())
  })

  it('surfaces refused extensions where the user will see them', async () => {
    const body = {
      ...INSTANCE,
      pluginProblems: [{ id: 'broken', reason: 'manifest is not valid JSON' }],
    }
    render(<App fetchImpl={apiFetch({ body })} />)
    await waitFor(() => expect(screen.getByText(/not valid JSON/)).toBeTruthy())
  })
})

describe('the screen reported next to the chat', () => {
  it('names the route and its trail', () => {
    expect(
      screenView({ route: '/page/trips/baden.md', watched: true, trail: ['Trips', 'Baden 2026'] }),
    ).toEqual({ route: '/page/trips/baden.md', title: 'Trips › Baden 2026' })
  })

  it('sends the route alone while the trail is still loading', () => {
    // A page's title arrives with the page, one fetch after the route
    // changed. The route already says more than an empty crumb would.
    expect(screenView({ route: '/parcours', watched: true, trail: [] })).toEqual({
      route: '/parcours',
    })
  })

  it('reports nothing from the landing canvas', () => {
    // Home is every thread and no page: there is no screen to narrate.
    expect(screenView({ route: '', watched: true, trail: [] })).toBeUndefined()
  })

  it('reports nothing when the shell is folded onto the chat', () => {
    // On a phone the canvas is BEHIND the chat, not beside it — describing a
    // page nobody is looking at invents a subject.
    expect(screenView({ route: '/parcours', watched: false, trail: ['Parcours'] })).toBeUndefined()
  })
})

describe('the shell joins its screen to a message', () => {
  /** Boot payloads plus a turn whose body is captured rather than streamed at length. */
  function shellFetch(
    pages: { path: string; title: string; fields: Record<string, unknown> }[],
    onTurn: (body: unknown) => void,
  ): typeof fetch {
    return ((url: string, init?: RequestInit) => {
      const target = String(url)
      if (target.startsWith('/api/instance')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(INSTANCE) } as unknown as Response)
      }
      if (target.startsWith('/api/turn') && init?.body) onTurn(JSON.parse(String(init.body)))
      if (target.startsWith('/api/conversations')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve(
              init?.method === 'POST' ? { id: 'c1', title: 'x', updatedAt: '' } : { conversations: [] },
            ),
        } as unknown as Response)
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
        json: () => Promise.resolve({ entries: pages, conversations: [] }),
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ type: 'result', sessionId: 's', stopped: false })}\n\n`),
            )
            controller.close()
          },
        }),
      } as unknown as Response)
    }) as unknown as typeof fetch
  }

  it('names the section it is showing, and stops naming it at home', async () => {
    // The wiring the unit tests above cannot see: the shell's own route and
    // breadcrumb reaching the composer's turn.
    const bodies: unknown[] = []
    location.hash = '#/section/notes'
    render(
      <App
        fetchImpl={shellFetch(
          [
            { path: 'notes/INDEX.md', title: 'Notes', fields: {} },
            { path: 'notes/one.md', title: 'One', fields: {} },
          ],
          (body) => bodies.push(body),
        )}
      />,
    )

    const input = await screen.findByRole('textbox')
    fireEvent.change(input, { target: { value: 'range ça' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    await waitFor(() => expect(bodies.length).toBe(1))
    expect((bodies[0] as { view?: unknown }).view).toEqual({ route: '/section/notes', title: 'Notes' })

    await act(async () => {
      location.hash = ''
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'et là ?' } })
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    })
    await waitFor(() => expect(bodies.length).toBe(2))
    expect('view' in (bodies[1] as Record<string, unknown>)).toBe(false)
  })
})
