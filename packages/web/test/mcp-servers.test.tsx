// @vitest-environment jsdom
/**
 * The MCP screen, rendered in jsdom.
 *
 * What is asserted is what an operator must be able to tell apart, and what
 * they must not be allowed to do by mistake: a server that is down from one
 * waiting to be signed into; a server they may edit from one the config or a
 * plugin owns; and a secret that leaves the server from one that does not.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { McpServers } from '../src/app/McpServers.js'

/** Answers per route, so the wiring and the health can disagree. */
function serving(routes: Record<string, { status?: number; body: unknown }>): typeof fetch {
  return vi.fn((input: unknown) => {
    const url = String(input)
    const found = routes[url] ?? { status: 404, body: { error: 'no' } }
    const status = found.status ?? 200
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(found.body),
    } as unknown as Response)
  }) as unknown as typeof fetch
}

const WIRING = {
  '/api/mcp/servers': {
    body: {
      servers: [
        {
          name: 'home-assistant',
          source: 'config',
          editable: false,
          transport: 'http',
          config: { name: 'home-assistant', url: 'https://ha.example/mcp', headers: { Authorization: '••••••' } },
        },
        {
          name: 'notion',
          source: 'ui',
          editable: true,
          transport: 'stdio',
          config: { name: 'notion', command: 'npx', args: ['-y', 'notion-mcp'] },
        },
      ],
    },
  },
  '/api/mcp/status': {
    body: {
      servers: [
        { name: 'home-assistant', state: 'connected' },
        { name: 'notion', state: 'needs-auth' },
      ],
    },
  },
}

describe('the MCP screen', () => {
  it('draws a tile per server, and one to add another', async () => {
    render(<McpServers onOpen={() => {}} fetchImpl={serving(WIRING)} />)
    await screen.findByText('home-assistant')
    expect(screen.getByText('notion')).toBeTruthy()
    // The way in for a server nobody has written yet. Without it the screen
    // is a status board on a fresh instance, which is where it started.
    expect(screen.getByText('Add a server')).toBeTruthy()
  })

  it('does not paint a sign-in as a failure', async () => {
    // Red would send somebody debugging a network while a server waits to be
    // logged into.
    const { container } = render(<McpServers onOpen={() => {}} fetchImpl={serving(WIRING)} />)
    await screen.findByText('needs a sign-in')
    expect(container.querySelector('.adestia-chip--hot')).toBeTruthy()
    expect(screen.getByText('connected')).toBeTruthy()
  })

  it('still lists the servers when the driver cannot report health', async () => {
    // A 404 on `/api/mcp/status` means "this engine does not report", never
    // "you have no servers" — the wiring is knowable either way, and the
    // screen that adds one must not vanish with the status board.
    render(
      <McpServers
        onOpen={() => {}}
        fetchImpl={serving({ '/api/mcp/servers': WIRING['/api/mcp/servers'] })}
      />,
    )
    await screen.findByText('home-assistant')
    expect(screen.queryByText('connected')).toBeNull()
  })

  it('says nothing is wired rather than showing an empty board', async () => {
    render(
      <McpServers onOpen={() => {}} fetchImpl={serving({ '/api/mcp/servers': { body: { servers: [] } } })} />,
    )
    await screen.findByText('None wired yet — add one, or declare it in the configuration file.')
  })

  it('opens a declaration, and refuses to edit one it does not own', async () => {
    const { container } = render(
      <McpServers open="home-assistant" onOpen={() => {}} fetchImpl={serving(WIRING)} />,
    )
    const box = (await waitFor(() => {
      const found = container.querySelector('textarea') as HTMLTextAreaElement
      // On the value, not on the element: the box exists a render before the
      // declaration reaches it, and asserting on the empty one is a race.
      expect(found?.value).toContain('https://ha.example/mcp')
      return found
    })) as HTMLTextAreaElement
    expect(box.readOnly).toBe(true)
    // The secret came back as bullets and stays bullets: the screen never
    // held the real header, so it cannot leak it.
    expect(box.value).toContain('••••••')
    expect(screen.getByText('Declared in the instance configuration', { exact: false })).toBeTruthy()
    expect(container.querySelector('.adestia-mcp__bar')).toBeNull()
  })

  it('saves an edit to a server it does own, as the declaration itself', async () => {
    const fetchImpl = serving({
      ...WIRING,
      '/api/mcp/servers/notion': { body: { server: { name: 'notion' } } },
    })
    const { container } = render(
      <McpServers open="notion" onOpen={() => {}} fetchImpl={fetchImpl} />,
    )
    const box = (await waitFor(() => {
      const found = container.querySelector('textarea') as HTMLTextAreaElement
      expect(found?.value).toContain('notion-mcp')
      return found
    })) as HTMLTextAreaElement
    expect(box.readOnly).toBe(false)

    // Save is dark until something actually changed: a button that is live on
    // arrival invites a write nobody meant.
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)

    fireEvent.change(box, {
      target: { value: '{"name":"notion","command":"npx","args":["-y","notion-mcp@2"]}' },
    })
    expect(save.disabled).toBe(false)
    fireEvent.click(save)

    await waitFor(() => {
      const calls = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls
      const put = calls.find((call) => (call[1] as { method?: string })?.method === 'PUT')
      expect(put).toBeTruthy()
      expect(String(put?.[0])).toBe('/api/mcp/servers/notion')
      expect(JSON.parse(String((put?.[1] as { body?: string })?.body)).args).toEqual([
        '-y',
        'notion-mcp@2',
      ])
    })
  })

  it('answers a broken declaration here rather than posting it', async () => {
    const fetchImpl = serving(WIRING)
    const { container } = render(
      <McpServers open="notion" onOpen={() => {}} fetchImpl={fetchImpl} />,
    )
    const box = (await waitFor(() => {
      const found = container.querySelector('textarea') as HTMLTextAreaElement
      expect(found?.value).toContain('notion-mcp')
      return found
    })) as HTMLTextAreaElement

    fireEvent.change(box, { target: { value: '{ not json' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await screen.findByRole('alert')
    const calls = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls
    expect(calls.some((call) => (call[1] as { method?: string })?.method === 'PUT')).toBe(false)
  })

  it('speaks the instance’s language', async () => {
    render(
      <McpServers
        onOpen={() => {}}
        fetchImpl={serving(WIRING)}
        t={(key) => (key === 'connected' ? 'connecté' : key)}
      />,
    )
    expect(await screen.findByText('connecté')).toBeTruthy()
  })
})
