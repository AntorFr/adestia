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

import { App, appTrail, screenView } from '../src/app/App.js'

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

describe('the breadcrumb', () => {
  const CORPUS = [
    { path: 'domaines/voyages/INDEX.md', title: 'Voyages', fields: {} },
    { path: 'domaines/voyages/broceliande-2026/INDEX.md', title: 'Brocéliande 2026', fields: {} },
    { path: 'domaines/voyages/broceliande-2026/val-sans-retour.md', title: 'Val sans Retour', fields: {} },
  ]

  /** The crumbs, in order, and whether each is a way back. */
  function crumbs(container: HTMLElement): { label: string; walkable: boolean }[] {
    return [...(container.querySelector('.golem-crumbs')?.children ?? [])]
      .filter((node) => !node.classList.contains('golem-crumbs__sep'))
      .map((node) => ({
        label: node.textContent ?? '',
        walkable: node.tagName === 'BUTTON',
      }))
  }

  it('names every folder a page sits in, not merely the nearest one', async () => {
    // The defect: from inside a trip, the trail read "Home / Brocéliande 2026"
    // and the app the trip belongs to was nowhere on it.
    location.hash = '#/section/domaines%2Fvoyages%2Fbroceliande-2026'
    const { container } = render(<App fetchImpl={apiFetch({}, CORPUS)} />)

    await waitFor(() => expect(crumbs(container).length).toBeGreaterThan(1))
    expect(crumbs(container)).toEqual([
      { label: 'Home', walkable: true },
      { label: 'Voyages', walkable: true },
      // Where the reader IS: named, never a link to the screen under their eyes.
      { label: 'Brocéliande 2026', walkable: false },
    ])
    location.hash = ''
  })

  it('skips a grouping folder, which would lead to an empty screen', async () => {
    // `domaines/` holds no page of its own — it is a filing detail, not a place.
    location.hash = '#/section/domaines%2Fvoyages%2Fbroceliande-2026'
    const { container } = render(<App fetchImpl={apiFetch({}, CORPUS)} />)

    await waitFor(() => expect(crumbs(container).length).toBeGreaterThan(1))
    expect(crumbs(container).map((crumb) => crumb.label)).not.toContain('Domaines')
    location.hash = ''
  })
})

describe('the trail over an open app', () => {
  // The bug: `#/voyages/baden-2026` and `#/voyages` drew the same header —
  // "Accueil / Voyages" — because the shell can name the app and nothing
  // under it. The trip's title lives in a file only the plugin reads.
  const VOYAGES = { label: 'Voyages', root: '/voyages' }

  it('finishes the sentence with what the view says it is showing', () => {
    expect(
      appTrail(VOYAGES, [
        { label: 'Voyages', route: '/voyages' },
        { label: 'Baden 2026', route: '/voyages/baden-2026' },
      ]),
    ).toEqual([
      // The app's name becomes a way BACK, now that something sits below it.
      { label: 'Voyages', route: '/voyages' },
      { label: 'Baden 2026', route: '/voyages/baden-2026' },
    ])
  })

  it('drops the crumbs that repeat what the header already drew', () => {
    // A ported view says the whole trail from Home down; half of it is the
    // shell's own words.
    expect(
      appTrail({ label: "L'Atelier", root: '/atelier' }, [
        { label: 'Accueil', route: '/' },
        { label: "L'Atelier", route: '/atelier' },
        { label: 'Rangement garage', route: '/atelier/rangement-garage' },
      ]).map((crumb) => crumb.label),
    ).toEqual(["L'Atelier", 'Rangement garage'])
  })

  it('leaves the hub screen naming the app alone, and not as a link', () => {
    // `#/voyages` IS the app: a crumb linking to the screen under the
    // reader's eyes is furniture.
    expect(appTrail(VOYAGES, [{ label: 'Voyages', route: '/voyages' }])).toEqual([
      { label: 'Voyages' },
    ])
    expect(appTrail(VOYAGES, [])).toEqual([{ label: 'Voyages' }])
  })

  it('keeps a step that leads nowhere — a screen still loading says so', () => {
    // The engines publish a `…` crumb while a trip loads, with no hash.
    expect(appTrail(VOYAGES, [{ label: '…' }])).toEqual([
      { label: 'Voyages', route: '/voyages' },
      { label: '…' },
    ])
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

  // The chat re-attaches after every turn now; a fake that streams for any
  // URL would make that attach look like a running turn, forever.
  const attachIdle = (inner: typeof fetch): typeof fetch =>
    ((url: RequestInfo | URL, init?: RequestInit) =>
      String(url).startsWith('/api/turn/attach')
        ? Promise.resolve({ ok: true, status: 204, body: null } as unknown as Response)
        : (inner as (u: RequestInfo | URL, i?: RequestInit) => Promise<Response>)(
            url,
            init,
          )) as unknown as typeof fetch

  it('names the section it is showing, and stops naming it at home', async () => {
    // The wiring the unit tests above cannot see: the shell's own route and
    // breadcrumb reaching the composer's turn.
    const bodies: unknown[] = []
    location.hash = '#/section/notes'
    render(
      <App
        fetchImpl={attachIdle(
          shellFetch(
            [
              { path: 'notes/INDEX.md', title: 'Notes', fields: {} },
              { path: 'notes/one.md', title: 'One', fields: {} },
            ],
            (body) => bodies.push(body),
          ),
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

describe('settings, as an app of the shell', () => {
  /** Navigates the way the browser does, so the shell's listener fires. */
  const go = async (hash: string) => {
    await act(async () => {
      location.hash = hash
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
  }

  /** The shell, booted, with the landing canvas drawn. */
  const shell = async () => {
    const view = render(<App fetchImpl={apiFetch()} />)
    // The mosaic is there on any instance now — the shell's own tile is on it.
    await waitFor(() => expect(view.container.querySelector('.golem-tiles')).toBeTruthy())
    return view.container
  }

  /** The crumbs, in order, and whether each is a way back. */
  const crumbs = (container: HTMLElement) =>
    [...(container.querySelector('.golem-crumbs')?.children ?? [])]
      .filter((node) => !node.classList.contains('golem-crumbs__sep'))
      .map((node) => ({ label: node.textContent ?? '', walkable: node.tagName === 'BUTTON' }))

  it('stands on the landing canvas as an app, on any instance', async () => {
    // Even with no plugin at all: on a fresh instance that tile is the whole
    // way in, since the credential is armed from behind it.
    const container = await shell()
    const labels = [...container.querySelectorAll('.golem-tile__label')].map((n) => n.textContent)
    expect(labels).toEqual(['Settings'])
    location.hash = ''
  })

  it('opens on the canvas, under a trail that says where you are', async () => {
    // The whole move: settings stopped being a dialog over whatever screen
    // you were on. It is a screen, so it has an address and a place in the
    // trail — and the canvas, not a 460px card, to say itself in.
    const container = await shell()
    await go('#/settings')

    expect(await screen.findByText('Agent credential')).toBeTruthy()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(crumbs(container)).toEqual([
      { label: 'Home', walkable: true },
      // Where the reader IS: named, never a link to the screen under their eyes.
      { label: 'Settings', walkable: false },
    ])
    location.hash = ''
  })

  it('names the page open under it, and leads back to the list', async () => {
    const container = await shell()
    await go('#/settings/credential')

    await waitFor(() => expect(crumbs(container).length).toBe(3))
    expect(crumbs(container)).toEqual([
      { label: 'Home', walkable: true },
      { label: 'Settings', walkable: true },
      { label: 'Agent credential', walkable: false },
    ])
    location.hash = ''
  })

  it('opens the app from the gear rather than a dialog over the page', async () => {
    const container = await shell()
    const gear = container.querySelector('.golem-ib[aria-label="Settings"]') as HTMLElement
    await act(async () => {
      fireEvent.click(gear)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(location.hash).toBe('#/settings')
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    location.hash = ''
  })

  it('opens the address the instruction zone used to have', async () => {
    // `#/instructions` was its route back when prose could not be edited in a
    // dialog. A bookmark does not stop being one because a screen moved.
    await shell()
    await go('#/instructions')

    await waitFor(() => expect(location.hash).toBe('#/settings/instructions'))
    location.hash = ''
  })

  it('sends a page nobody has back to the list', async () => {
    // The address bar is user-writable: a title over an empty screen would be
    // a frame lying about what it holds.
    await shell()
    await go('#/settings/chartreuse')

    await waitFor(() => expect(location.hash).toBe('#/settings'))
    location.hash = ''
  })
})
