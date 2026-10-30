// @vitest-environment jsdom
/**
 * E-10, loading and failure of the declarations list (B-18, AD-24).
 * Expected values are written from the task's exit criterion, not from the code.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { McpServers } from '../src/app/McpServers.js'
import { translator } from '../src/app/i18n.js'

afterEach(cleanup)

const SERVERS = {
  servers: [
    { name: 'notion', source: 'ui', editable: true, transport: 'stdio', config: { name: 'notion', command: 'npx' } },
  ],
}
const res = (status: number, body: unknown) =>
  ({ ok: status < 300, status, json: () => Promise.resolve(body) }) as unknown as Response

type Handler = (url: string, init?: RequestInit) => Promise<Response>

function fetchWith(handler: Handler) {
  const calls: string[] = []
  const fetchImpl = vi.fn((input: unknown, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`
    calls.push(key)
    return handler(String(input), init)
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

/** A promise settled by the test. */
function held() {
  let settle!: (r: Response) => void
  const promise = new Promise<Response>((resolve) => { settle = resolve })
  return { promise, settle }
}

const queryNone = () => {
  expect(screen.queryByText('None wired yet — add one, or declare it in the configuration file.')).toBeNull()
  expect(screen.queryByText('Add a server')).toBeNull()
  expect(screen.queryByText('notion')).toBeNull()
  expect(document.querySelector('.adestia-tiles')).toBeNull()
}

describe('E-10 loading', () => {
  it('held_list_request_shows_heading_and_loading_row_and_nothing_else', async () => {
    const list = held()
    const { fetchImpl } = fetchWith((url) =>
      url === '/api/mcp/servers' ? list.promise : Promise.resolve(res(200, { servers: [] })))
    render(<McpServers onOpen={vi.fn()} fetchImpl={fetchImpl} />)
    expect(screen.getByRole('heading', { name: 'MCP servers' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Loading…')
    queryNone()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    await act(async () => { list.settle(res(200, SERVERS)) })
    expect(await screen.findByText('notion')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText('Add a server')).toBeTruthy()
  })

  it('opened_address_while_held_shows_the_loading_row_not_the_tiles', async () => {
    const list = held()
    const { fetchImpl } = fetchWith((url) =>
      url === '/api/mcp/servers' ? list.promise : Promise.resolve(res(200, { servers: [] })))
    render(<McpServers open="notion" onOpen={vi.fn()} fetchImpl={fetchImpl} />)
    expect(screen.getByRole('heading', { name: 'MCP servers' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Loading…')
    queryNone()
    await act(async () => { list.settle(res(200, SERVERS)) })
    expect(await screen.findByRole('button', { name: 'Remove' })).toBeTruthy()
  })

  it('empty_list_after_answer_says_none_wired_yet_and_no_loading', async () => {
    const { fetchImpl } = fetchWith(() => Promise.resolve(res(200, { servers: [] })))
    render(<McpServers onOpen={vi.fn()} fetchImpl={fetchImpl} />)
    expect(await screen.findByText('None wired yet — add one, or declare it in the configuration file.')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('loading_text_is_french_under_the_fr_translator', async () => {
    const list = held()
    const { fetchImpl } = fetchWith(() => list.promise)
    render(<McpServers onOpen={vi.fn()} fetchImpl={fetchImpl} t={translator('fr')} />)
    expect(screen.getByRole('status').textContent).toContain('Chargement')
  })
})

describe('E-10 failure and Retry', () => {
  it('a_500_shows_the_message_and_retry_and_retry_refetches_and_draws_tiles', async () => {
    let attempt = 0
    const second = held()
    const { fetchImpl, calls } = fetchWith((url) => {
      if (url !== '/api/mcp/servers') return Promise.resolve(res(200, { servers: [] }))
      attempt += 1
      return attempt === 1 ? Promise.resolve(res(500, { error: 'boom from server' })) : second.promise
    })
    render(<McpServers onOpen={vi.fn()} fetchImpl={fetchImpl} />)
    expect(await screen.findByText(/boom from server/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'MCP servers' })).toBeTruthy()
    queryNone()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    // Retry brings the loading row back and asks again.
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Loading…'))
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(calls.filter((c) => c === 'GET /api/mcp/servers')).toHaveLength(2)
    await act(async () => { second.settle(res(200, SERVERS)) })
    expect(await screen.findByText('notion')).toBeTruthy()
    expect(screen.queryByText(/boom from server/)).toBeNull()
  })

  it('status_zero_network_failure_offers_retry_with_the_not_responding_message', async () => {
    const { fetchImpl } = fetchWith(() => Promise.reject(new TypeError('down')))
    render(<McpServers onOpen={vi.fn()} fetchImpl={fetchImpl} />)
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(screen.getByText('The server is not responding')).toBeTruthy()
    queryNone()
  })

  it('a_failed_open_address_shows_failure_not_the_detail', async () => {
    const { fetchImpl } = fetchWith(() => Promise.resolve(res(502, { error: 'gateway' })))
    render(<McpServers open="notion" onOpen={vi.fn()} fetchImpl={fetchImpl} />)
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
  })

  it.each([401, 403, 404])('a_%i_has_its_message_and_no_retry', async (status) => {
    const { fetchImpl } = fetchWith(() => Promise.resolve(res(status, { error: 'refused here' })))
    render(<McpServers onOpen={vi.fn()} fetchImpl={fetchImpl} />)
    expect(await screen.findByText(/refused here/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    queryNone()
  })

  it('health_failing_gives_neither_loading_nor_retry_and_the_tiles_stay', async () => {
    const { fetchImpl } = fetchWith((url) =>
      url === '/api/mcp/servers' ? Promise.resolve(res(200, SERVERS)) : Promise.resolve(res(500, { error: 'health down' })))
    render(<McpServers onOpen={vi.fn()} fetchImpl={fetchImpl} />)
    expect(await screen.findByText('notion')).toBeTruthy()
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledWith('/api/mcp/status', undefined))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.queryByText(/health down/)).toBeNull()
  })

  it('health_held_does_not_hold_the_list_in_loading', async () => {
    const health = held()
    const { fetchImpl } = fetchWith((url) =>
      url === '/api/mcp/servers' ? Promise.resolve(res(200, SERVERS)) : health.promise)
    render(<McpServers onOpen={vi.fn()} fetchImpl={fetchImpl} />)
    expect(await screen.findByText('notion')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('E-10 refetch after a write', () => {
  /** Keeps the address in state, as the shell does. */
  function Shell({ fetchImpl, start }: { fetchImpl: typeof fetch; start?: string }) {
    const [open, setOpen] = useState<string | undefined>(start)
    return <McpServers open={open} onOpen={setOpen} fetchImpl={fetchImpl} />
  }

  it('refetch_after_remove_never_shows_loading_and_a_failed_refetch_is_silent', async () => {
    let lists = 0
    const refetch = held()
    const { fetchImpl } = fetchWith((url, init) => {
      if (init?.method === 'DELETE') return Promise.resolve(res(200, {}))
      if (url === '/api/mcp/servers') {
        lists += 1
        return lists === 1 ? Promise.resolve(res(200, SERVERS)) : refetch.promise
      }
      return Promise.resolve(res(200, { servers: [] }))
    })
    render(<Shell fetchImpl={fetchImpl} start="notion" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' }).at(-1) as HTMLElement)
    await waitFor(() => expect(lists).toBe(2))
    // The refetch is held: no loading row, no failure.
    expect(screen.queryByRole('status')).toBeNull()
    await act(async () => { refetch.settle(res(500, { error: 'late failure' })) })
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.queryByText(/late failure/)).toBeNull()
  })

  it('refetch_after_save_never_shows_loading_while_held', async () => {
    let lists = 0
    const refetch = held()
    const { fetchImpl } = fetchWith((url, init) => {
      if (init?.method === 'PUT') return Promise.resolve(res(200, { server: { name: 'notion' } }))
      if (url === '/api/mcp/servers') {
        lists += 1
        return lists === 1 ? Promise.resolve(res(200, SERVERS)) : refetch.promise
      }
      return Promise.resolve(res(200, { servers: [] }))
    })
    render(<Shell fetchImpl={fetchImpl} start="notion" />)
    const area = await screen.findByRole('textbox')
    fireEvent.change(area, { target: { value: '{"name":"notion","command":"node"}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(lists).toBe(2))
    expect(screen.queryByText('Loading…')).toBeNull()
    await act(async () => { refetch.settle(res(200, SERVERS)) })
    expect(screen.queryByText('Loading…')).toBeNull()
  })

  it('refetch_after_adding_a_server_shows_tiles_not_loading_while_held', async () => {
    let lists = 0
    const refetch = held()
    const { fetchImpl } = fetchWith((url, init) => {
      if (init?.method === 'POST') return Promise.resolve(res(200, { server: { name: 'notion' } }))
      if (url === '/api/mcp/servers') {
        lists += 1
        return lists === 1 ? Promise.resolve(res(200, { servers: [] })) : refetch.promise
      }
      return Promise.resolve(res(200, { servers: [] }))
    })
    render(<Shell fetchImpl={fetchImpl} />)
    fireEvent.click(await screen.findByText('Add a server'))
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: '{"name":"notion","command":"npx"}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(lists).toBe(2))
    expect(screen.queryByText('Loading…')).toBeNull()
    await act(async () => { refetch.settle(res(200, SERVERS)) })
  })
})
