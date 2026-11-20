// @vitest-environment jsdom
/**
 * E-37 Plugins, rendered in jsdom against a small stand-in for the server.
 *
 * What the administrator must be able to do without opening the file: tell
 * what runs from what the file wants, flip a plugin, take the flip back, and
 * restart. The stand-in keeps a revision and refuses a stale write, as the
 * real route does, so a request built on an old read is caught.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PluginsPayload } from '@antorfr/adestia-schemas'

import { Plugins } from '../src/app/Plugins.js'
import { Preferences } from '../src/app/Preferences.js'

afterEach(cleanup)

// A stable translator, as App's memoised one: a fresh function per render would re-read the page forever.
const T = (key: string) => key

const BASE: PluginsPayload = {
  plugins: [
    { id: 'core', kind: 'core', description: 'The engine.', origin: { kind: 'folder' }, loaded: true, wanted: true, problems: [] },
    { id: 'meals', kind: 'app', description: 'Plan the meals.', origin: { kind: 'folder' }, loaded: true, wanted: true, problems: [] },
    {
      id: 'shaky',
      kind: 'tool',
      description: 'Works with a limit.',
      origin: { kind: 'source', name: 'friends' },
      loaded: true,
      wanted: true,
      problems: [{ id: 'shaky', reason: 'no network access' }],
    },
    { id: 'journal', kind: 'app', description: 'Keep a journal.', origin: { kind: 'folder' }, loaded: false, wanted: false, problems: [] },
  ],
  refused: [{ id: 'broken', reason: 'manifest.json is not valid JSON' }],
  file: '/app/adestia.config.yaml',
  writable: true,
  revision: 'r1',
  pluginsDir: '/app/plugins',
}

function response(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as unknown as Response)
}

/** A stand-in server: keeps `wanted`, bumps the revision on each write, refuses a stale one. */
function server(initial: PluginsPayload = BASE, opts: { putStatus?: number; putBody?: unknown } = {}) {
  let state = initial
  let n = 1
  const calls: string[] = []
  const puts: { id: string; body: { active: boolean; revision: string } }[] = []
  const impl = vi.fn((input: unknown, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push(`${method} ${url}`)
    if (url === '/api/health') return response(200, {})
    if (url === '/api/restart') {
      // The "restart": what is wanted becomes what is loaded.
      state = { ...state, plugins: state.plugins.map((row) => ({ ...row, loaded: row.wanted })) }
      return response(202, { restarting: true })
    }
    if (method === 'PUT') {
      const body = JSON.parse(String(init?.body))
      puts.push({ id: decodeURIComponent(url.split('/').pop() as string), body })
      if (opts.putStatus) return response(opts.putStatus, opts.putBody)
      if (body.revision !== state.revision) return response(409, { kind: 'stale', error: 'The file changed' })
      n += 1
      const id = decodeURIComponent(url.split('/').pop() as string)
      state = {
        ...state,
        revision: `r${n}`,
        plugins: state.plugins.map((row) => (row.id === id ? { ...row, wanted: body.active } : row)),
      }
      return response(200, { wanted: body.active, revision: state.revision })
    }
    return response(200, state)
  }) as unknown as typeof fetch
  return { impl, calls, puts }
}

const row = (container: HTMLElement, id: string) => container.querySelector(`[data-plugin="${id}"]`) as HTMLElement
const group = (name: string) => screen.getByRole('region', { name })

async function open(impl: typeof fetch) {
  const view = render(<Plugins fetchImpl={impl} t={T} />)
  await waitFor(() => expect(view.container.querySelector('[data-plugin]')).toBeTruthy())
  return view
}

describe('E-37 the three groups', () => {
  it('lists active, found-not-active and refused, with the count line', async () => {
    const { impl } = server()
    const { container } = await open(impl)
    expect(within(group('Active')).getAllByRole('switch').map((s) => s.getAttribute('aria-label'))).toEqual(['core', 'meals', 'shaky'])
    expect(within(group('Found, not active')).getAllByRole('switch').map((s) => s.getAttribute('aria-label'))).toEqual(['journal'])
    expect(container.querySelector('[data-plugin="broken"]')?.closest('section')?.getAttribute('aria-label')).toBe('Refused')
    expect(container.querySelector('.adestia-chead__lede')?.textContent).toBe('3 active of 4 found')
  })

  it('a refused row has no switch and says its reason', async () => {
    const { impl } = server()
    const { container } = await open(impl)
    const refused = row(container, 'broken')
    expect(within(refused).queryByRole('switch')).toBeNull()
    expect(refused.textContent).toContain('manifest.json is not valid JSON')
  })

  it('a degraded plugin keeps its place in Active with its problem', async () => {
    const { impl } = server()
    const { container } = await open(impl)
    expect(group('Active').contains(row(container, 'shaky'))).toBe(true)
    expect(row(container, 'shaky').textContent).toContain('no network access')
    expect(row(container, 'shaky').textContent).toContain('found in source friends')
  })

  it('core is on and inert, "always on"', async () => {
    const { impl, puts } = server()
    const { container } = await open(impl)
    const sw = within(row(container, 'core')).getByRole('switch') as HTMLInputElement
    expect(sw.checked).toBe(true)
    expect(sw.disabled).toBe(true)
    expect(row(container, 'core').textContent).toContain('always on')
    expect(puts).toEqual([])
  })

  it('draws no empty group', async () => {
    const { impl } = server({ ...BASE, plugins: BASE.plugins.filter((p) => p.loaded), refused: [] })
    await open(impl)
    expect(screen.queryByRole('region', { name: 'Found, not active' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Refused' })).toBeNull()
  })
})

describe('E-37 flipping, and taking it back', () => {
  it('writes the flip with the revision it read, marks the row, shows the bar; the row stays in its loaded group', async () => {
    const { impl, puts } = server()
    const { container } = await open(impl)
    expect(container.querySelector('.adestia-config__restart-bar')).toBeNull()
    fireEvent.click(within(row(container, 'journal')).getByRole('switch'))
    await waitFor(() => expect(row(container, 'journal').textContent).toContain('Active after restart'))
    expect(puts).toEqual([{ id: 'journal', body: { active: true, revision: 'r1' } }])
    expect(group('Found, not active').contains(row(container, 'journal'))).toBe(true)
    expect((within(row(container, 'journal')).getByRole('switch') as HTMLInputElement).checked).toBe(true)
    expect(container.querySelector('.adestia-config__restart-bar')).toBeTruthy()
  })

  it('turning an active plugin off says "Off after restart"', async () => {
    const { impl } = server()
    const { container } = await open(impl)
    fireEvent.click(within(row(container, 'meals')).getByRole('switch'))
    await waitFor(() => expect(row(container, 'meals').textContent).toContain('Off after restart'))
    expect(group('Active').contains(row(container, 'meals'))).toBe(true)
  })

  it('putting one back removes its chip, and the bar stays while the other is owed', async () => {
    const { impl, puts } = server()
    const { container } = await open(impl)
    fireEvent.click(within(row(container, 'journal')).getByRole('switch'))
    await waitFor(() => expect(row(container, 'journal').textContent).toContain('Active after restart'))
    fireEvent.click(within(row(container, 'meals')).getByRole('switch'))
    await waitFor(() => expect(row(container, 'meals').textContent).toContain('Off after restart'))
    // The second write must carry the revision the first one returned.
    expect(puts[1]?.body.revision).toBe('r2')
    fireEvent.click(within(row(container, 'journal')).getByRole('switch'))
    await waitFor(() => expect(row(container, 'journal').textContent).not.toContain('after restart'))
    expect(container.querySelector('.adestia-config__restart-bar')).toBeTruthy()
    fireEvent.click(within(row(container, 'meals')).getByRole('switch'))
    await waitFor(() => expect(container.querySelector('.adestia-config__restart-bar')).toBeNull())
  })

  it('two switches pressed before the first write answers do not turn the second into a stale refusal', async () => {
    const { impl } = server()
    const { container } = await open(impl)
    fireEvent.click(within(row(container, 'journal')).getByRole('switch'))
    fireEvent.click(within(row(container, 'meals')).getByRole('switch'))
    await waitFor(() => expect(row(container, 'journal').textContent).toContain('after restart'))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(row(container, 'meals').textContent).toContain('Off after restart')
  })

  it('the switch is busy until the write answers; the others stay usable', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    const inner = server()
    const impl = vi.fn(async (input: unknown, init?: RequestInit) => {
      if (init?.method === 'PUT') await held
      return (inner.impl as unknown as (i: unknown, n?: RequestInit) => Promise<Response>)(input, init)
    }) as unknown as typeof fetch
    const { container } = await open(impl)
    fireEvent.click(within(row(container, 'journal')).getByRole('switch'))
    await waitFor(() => expect((within(row(container, 'journal')).getByRole('switch') as HTMLInputElement).disabled).toBe(true))
    expect((within(row(container, 'meals')).getByRole('switch') as HTMLInputElement).disabled).toBe(false)
    release()
    await waitFor(() => expect((within(row(container, 'journal')).getByRole('switch') as HTMLInputElement).disabled).toBe(false))
  })

  it('a refused write says the server reason and the switch returns to its state', async () => {
    const { impl } = server(BASE, { putStatus: 500, putBody: { error: 'disk full' } })
    const { container } = await open(impl)
    fireEvent.click(within(row(container, 'journal')).getByRole('switch'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('disk full'))
    expect((within(row(container, 'journal')).getByRole('switch') as HTMLInputElement).checked).toBe(false)
    expect(row(container, 'journal').textContent).not.toContain('after restart')
    expect(container.querySelector('.adestia-config__restart-bar')).toBeNull()
  })

  it('a stale file says so and Reload reads again', async () => {
    const { impl, calls } = server(BASE, { putStatus: 409, putBody: { kind: 'stale', error: 'x' } })
    const { container } = await open(impl)
    fireEvent.click(within(row(container, 'journal')).getByRole('switch'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('The file changed since this page loaded.'))
    const before = calls.filter((c) => c === 'GET /api/plugins').length
    fireEvent.click(screen.getByText('Reload'))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(calls.filter((c) => c === 'GET /api/plugins').length).toBe(before + 1)
  })
})

describe('E-37 the restart', () => {
  it('after the real restart the rows sit in their new groups, no chip, no bar', async () => {
    const { impl, calls } = server()
    const { container } = await open(impl)
    fireEvent.click(within(row(container, 'journal')).getByRole('switch'))
    await waitFor(() => expect(row(container, 'journal').textContent).toContain('after restart'))
    fireEvent.click(within(row(container, 'meals')).getByRole('switch'))
    await waitFor(() => expect(row(container, 'meals').textContent).toContain('after restart'))
    fireEvent.click(screen.getByText('Restart now'))
    await waitFor(() => expect(container.querySelector('.adestia-config__restart-bar')).toBeNull(), { timeout: 5000 })
    await waitFor(() => expect(group('Active').contains(row(container, 'journal'))).toBe(true))
    expect(group('Found, not active').contains(row(container, 'meals'))).toBe(true)
    expect(container.textContent).not.toContain('after restart')
    expect(container.querySelector('.adestia-chead__lede')?.textContent).toBe('3 active of 4 found')
    expect(calls).toContain('POST /api/restart')
  })

  it('a running turn blocks the restart and offers to overrule', async () => {
    const inner = server()
    const impl = vi.fn((input: unknown, init?: RequestInit) =>
      String(input) === '/api/restart'
        ? response(409, { error: '2 turns are running', running: 2 })
        : (inner.impl as unknown as (i: unknown, n?: RequestInit) => Promise<Response>)(input, init),
    ) as unknown as typeof fetch
    const { container } = await open(impl)
    fireEvent.click(within(row(container, 'journal')).getByRole('switch'))
    await waitFor(() => expect(row(container, 'journal').textContent).toContain('after restart'))
    fireEvent.click(screen.getByText('Restart now'))
    await waitFor(() => expect(screen.getByText('Restart anyway')).toBeTruthy())
  })
})

describe('E-37 the states of the table', () => {
  it('loading: the shared loading row, no groups', () => {
    const impl = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch
    const { container } = render(<Plugins fetchImpl={impl} t={T} />)
    expect(container.querySelector('[data-plugin]')).toBeNull()
    expect(container.querySelector('section')).toBeNull()
  })

  it('read failed: an error line with Retry, no groups; Retry reads again', async () => {
    let fail = true
    const ok = server()
    const impl = vi.fn((input: unknown, init?: RequestInit) =>
      fail ? response(500, {}) : (ok.impl as unknown as (i: unknown, n?: RequestInit) => Promise<Response>)(input, init),
    ) as unknown as typeof fetch
    const { container } = render(<Plugins fetchImpl={impl} t={T} />)
    await waitFor(() => expect(screen.getByText('The plugins could not be read.')).toBeTruthy())
    expect(container.querySelector('[data-plugin]')).toBeNull()
    fail = false
    fireEvent.click(screen.getByText('Retry'))
    await waitFor(() => expect(container.querySelector('[data-plugin]')).toBeTruthy())
    expect(screen.queryByText('The plugins could not be read.')).toBeNull()
  })

  it('config not exposed (404): the E-14 sentence, no rows', async () => {
    const impl = vi.fn(() => response(404, {})) as unknown as typeof fetch
    const { container } = render(<Plugins fetchImpl={impl} t={T} />)
    await waitFor(() => expect(screen.getByText('This instance does not expose its configuration.')).toBeTruthy())
    expect(container.querySelector('[data-plugin]')).toBeNull()
  })

  it('nothing found: says so and where it looked', async () => {
    const { impl } = server({ ...BASE, plugins: [], refused: [] })
    const { container } = render(<Plugins fetchImpl={impl} t={T} />)
    await waitFor(() => expect(container.textContent).toContain('No plugin found.'))
    expect(container.textContent).toContain('/app/plugins')
    expect(container.querySelector('[data-plugin]')).toBeNull()
  })

  it('read-only file: the reason is said, every switch is inert, a click writes nothing', async () => {
    const { impl, puts } = server({ ...BASE, writable: false, readOnlyReason: 'the file is mounted read-only' })
    const { container } = await open(impl)
    expect(screen.getByRole('status').textContent).toContain('the file is mounted read-only')
    const switches = within(container).getAllByRole('switch') as HTMLInputElement[]
    expect(switches.length).toBe(4)
    expect(switches.every((s) => s.disabled)).toBe(true)
    expect(puts).toEqual([])
  })
})

describe('E-9 the Plugins tile', () => {
  it('opens E-37 and carries "N active of M"', async () => {
    const { impl } = server()
    const routed = vi.fn((input: unknown, init?: RequestInit) =>
      String(input) === '/api/plugins'
        ? (impl as unknown as (i: unknown, n?: RequestInit) => Promise<Response>)(input, init)
        : response(200, { servers: [], files: [], delegations: [] }),
    ) as unknown as typeof fetch
    const onPage = vi.fn()
    render(<Preferences page="" onPage={onPage} onItem={vi.fn()} fetchImpl={routed} t={T} {...({} as object)} />)
    await waitFor(() => expect(screen.getByText('3 active of 4 found')).toBeTruthy())
    fireEvent.click(screen.getByText('Plugins'))
    expect(onPage).toHaveBeenCalledWith('plugins')
  })

  it('a 404 leaves the tile drawn, without a figure', async () => {
    const routed = vi.fn((input: unknown) =>
      response(String(input) === '/api/plugins' ? 404 : 200, { servers: [], files: [], delegations: [] }),
    ) as unknown as typeof fetch
    render(<Preferences page="" onPage={vi.fn()} onItem={vi.fn()} fetchImpl={routed} t={T} {...({} as object)} />)
    await waitFor(() => expect(screen.getByText('Plugins')).toBeTruthy())
    expect(screen.queryByText(/active of/)).toBeNull()
  })
})
