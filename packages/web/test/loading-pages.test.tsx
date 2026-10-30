// @vitest-environment jsdom
/**
 * B-18 for E-3, E-4 and E-8 (AD-24): the section, the page and the missing
 * page show their wait, and "the server could not" offers Retry. Every
 * response is a promise the test settles itself; nothing waits on a timer.
 */

import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from '../src/app/App.js'
import { MissingPage } from '../src/app/MissingPage.js'
import { Section } from '../src/app/Section.js'
import { usePage } from '../src/app/usePage.js'

afterEach(cleanup)

type Call = { url: string; ok: (status: number, body: unknown) => void; cut: () => void }

/** A fetch whose every call is held until the test settles it. */
function held() {
  const calls: Call[] = []
  const impl = vi.fn((input: unknown) => {
    return new Promise<Response>((resolve, reject) => {
      calls.push({
        url: String(input),
        ok: (status, body) =>
          resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response),
        cut: () => reject(new TypeError('fetch failed')),
      })
    })
  })
  return { impl: impl as unknown as typeof fetch, calls }
}

const doc = (path: string) => ({
  path,
  title: path,
  markdown: `Body of ${path}\n`,
  revision: '1-1',
  editable: true,
  diagnostics: [],
})

const hook = (fetchImpl: typeof fetch, pagePath: string | undefined) =>
  renderHook(({ p }) => usePage({ pagePath: p, pageStore: undefined, fetchImpl }), { initialProps: { p: pagePath } })

describe('usePage: loading, failure and retry', () => {
  it('is loading from the first render of a page address, then ready with the page', async () => {
    const { impl, calls } = held()
    const { result } = hook(impl, 'a.md')
    expect(result.current.loading).toBe(true)
    expect(result.current.page).toBeUndefined()
    expect(result.current.pageProblem).toBeUndefined()
    await waitFor(() => expect(calls).toHaveLength(1))
    await act(async () => { calls[0]!.ok(200, doc('a.md')) })
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 10000 })
    expect(result.current.page?.path).toBe('a.md')
    expect(result.current.pageProblem).toBeUndefined()
  })

  it('is not loading when no page is asked for', () => {
    const { impl } = held()
    const { result } = hook(impl, undefined)
    expect(result.current.loading).toBe(false)
  })

  it('fails on 500 with status 500 and on a cut network with status 0', async () => {
    for (const [settle, status] of [[(c: Call) => c.ok(500, { error: 'boom' }), 500], [(c: Call) => c.cut(), 0]] as const) {
      const { impl, calls } = held()
      const { result } = hook(impl, 'a.md')
      await waitFor(() => expect(calls).toHaveLength(1))
      await act(async () => { settle(calls[0]!) })
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.pageProblem).toEqual({ path: 'a.md', status })
      expect(result.current.page).toBeUndefined()
    }
  })

  it('retry() goes back to loading with no stale problem, asks again, and returns the page', async () => {
    const { impl, calls } = held()
    const { result } = hook(impl, 'a.md')
    await waitFor(() => expect(calls).toHaveLength(1))
    await act(async () => { calls[0]!.ok(500, {}) })
    await waitFor(() => expect(result.current.pageProblem?.status).toBe(500))
    act(() => { result.current.retry() })
    expect(result.current.loading).toBe(true)
    expect(result.current.pageProblem).toBeUndefined()
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1]!.url).toBe('/api/pages/a.md')
    await act(async () => { calls[1]!.ok(200, doc('a.md')) })
    await waitFor(() => expect(result.current.page?.path).toBe('a.md'))
    expect(result.current.loading).toBe(false)
    expect(result.current.pageProblem).toBeUndefined()
  })

  it('reports 404 and 403 as problems (no retry is the screen’s choice) and 409 leaves loading', async () => {
    for (const status of [404, 401, 403]) {
      const { impl, calls } = held()
      const { result } = hook(impl, 'a.md')
      await waitFor(() => expect(calls).toHaveLength(1))
      await act(async () => { calls[0]!.ok(status, {}) })
      await waitFor(() => expect(result.current.pageProblem?.status).toBe(status))
    }
    const { impl, calls } = held()
    const { result } = hook(impl, 'dossier/a.md')
    await waitFor(() => expect(calls).toHaveLength(1))
    await act(async () => { calls[0]!.ok(409, {}) })
    expect(location.hash).toBe('#/section/dossier')
    await waitFor(() => expect(result.current.loading).toBe(false))
    location.hash = ''
  })

  it('ignores the late answer of a page abandoned for another', async () => {
    const { impl, calls } = held()
    const { result, rerender } = hook(impl, 'a.md')
    await waitFor(() => expect(calls).toHaveLength(1))
    rerender({ p: 'b.md' })
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(calls).toHaveLength(2))
    await act(async () => { calls[1]!.ok(200, doc('b.md')) })
    await act(async () => { calls[0]!.ok(200, doc('a.md')) })
    await waitFor(() => expect(result.current.page?.path).toBe('b.md'))
    expect(result.current.loading).toBe(false)
  })
})

describe('E-3: the section waits for the index', () => {
  const props = { path: 'notes', title: 'Notes', entries: [], openSection: () => {}, openPage: () => {} }

  it('shows Loading, no empty state and no Retry, while the index has not answered', () => {
    render(<Section {...props} ready={false} />)
    expect(screen.getByRole('status').textContent).toBe('Loading…')
    expect(screen.queryByText('This section holds nothing yet.')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('shows the empty state once the index answered empty, and no Loading', () => {
    render(<Section {...props} ready />)
    expect(screen.getByText('This section holds nothing yet.')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows the cards, not Loading, when the index holds some, even before ready', () => {
    const entries = [{ path: 'notes/x.md', title: 'Xylophone', fields: {} }]
    render(<Section {...props} entries={entries} ready={false} />)
    expect(screen.getByText('Xylophone')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('E-8: Retry only where the server could not', () => {
  it('offers Retry for 500 and 0, and it calls onRetry', () => {
    for (const status of [500, 502, 0]) {
      const onRetry = vi.fn()
      const { unmount } = render(<MissingPage path="a/b.md" status={status} onRetry={onRetry} />)
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      expect(onRetry).toHaveBeenCalledTimes(1)
      expect(screen.getByText('The server could not serve this page.')).toBeTruthy()
      unmount()
    }
  })

  it('has no button for 404, 401 and 403', () => {
    for (const status of [404, 401, 403]) {
      const { unmount } = render(<MissingPage path="a/b.md" status={status} onRetry={() => {}} />)
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
      unmount()
    }
  })
})

/** The whole shell, the index and the instance answered at once, pages held by the test. */
function shell() {
  const pages = held()
  const impl = ((input: unknown, init?: RequestInit) => {
    const url = String(input)
    const answer = (body: unknown) =>
      Promise.resolve({ ok: true, status: 200, json: async () => body } as unknown as Response)
    if (url.startsWith('/api/instance')) {
      return answer({
        driver: { label: 'Test CLI', cliVersion: '1.0', capabilities: [] },
        auth: { mode: 'none' },
        user: { userId: 'local', displayName: 'Local user' },
        skin: 'default',
        plugins: [],
        pluginProblems: [],
        turns: { max: 3, running: 0 },
      })
    }
    if (url.startsWith('/api/pages/index')) return answer({ entries: [], conversations: [] })
    if (url.startsWith('/api/pages/')) return pages.impl(input as RequestInfo, init)
    return answer({ entries: [], conversations: [] })
  }) as unknown as typeof fetch
  return { impl, calls: pages.calls }
}

describe('the shell: E-4 and E-8 end to end', () => {
  it('shows Loading while the page is fetched, then the page; never the home between', async () => {
    location.hash = '#/page/a.md'
    const { impl, calls } = shell()
    const { container } = render(<App fetchImpl={impl} />)
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(screen.getAllByRole('status').some((n) => n.textContent === 'Loading…')).toBe(true)
    expect(container.querySelector('.adestia-tiles')).toBeNull()
    await act(async () => { calls[0]!.ok(200, doc('a.md')) })
    await waitFor(() => expect(container.textContent).toContain('Body of a.md'))
    location.hash = ''
  })

  it('on a 500 shows the server-could-not block with Retry; Retry shows Loading then the page', async () => {
    location.hash = '#/page/a.md'
    const { impl, calls } = shell()
    const { container } = render(<App fetchImpl={impl} />)
    await waitFor(() => expect(calls).toHaveLength(1))
    await act(async () => { calls[0]!.ok(500, {}) })
    const retry = await screen.findByRole('button', { name: 'Retry' })
    expect(screen.getByText('The server could not serve this page.')).toBeTruthy()
    fireEvent.click(retry)
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.getAllByRole('status').some((n) => n.textContent === 'Loading…')).toBe(true)
    await waitFor(() => expect(calls).toHaveLength(2))
    await act(async () => { calls[1]!.ok(200, doc('a.md')) })
    await waitFor(() => expect(container.textContent).toContain('Body of a.md'))
    location.hash = ''
  })

  it('on a cut network shows Retry; on a 404 shows none', async () => {
    location.hash = '#/page/a.md'
    const { impl, calls } = shell()
    const first = render(<App fetchImpl={impl} />)
    await waitFor(() => expect(calls).toHaveLength(1))
    await act(async () => { calls[0]!.cut() })
    await screen.findByRole('button', { name: 'Retry' })
    first.unmount()

    location.hash = '#/page/b.md'
    const second = shell()
    render(<App fetchImpl={second.impl} />)
    await waitFor(() => expect(second.calls).toHaveLength(1))
    await act(async () => { second.calls[0]!.ok(404, {}) })
    await waitFor(() => expect(document.querySelector('.adestia-missing')).not.toBeNull())
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    location.hash = ''
  })

  it('going page to page keeps the first page on screen, with no Loading, until the second answers', async () => {
    location.hash = '#/page/a.md'
    const { impl, calls } = shell()
    const { container } = render(<App fetchImpl={impl} />)
    await waitFor(() => expect(calls).toHaveLength(1))
    await act(async () => { calls[0]!.ok(200, doc('a.md')) })
    await waitFor(() => expect(container.textContent).toContain('Body of a.md'))

    act(() => { location.hash = '#/page/b.md' })
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(container.textContent).toContain('Body of a.md')
    expect(screen.queryAllByRole('status').filter((n) => n.textContent === 'Loading…')).toHaveLength(0)
    await act(async () => { calls[1]!.ok(200, doc('b.md')) })
    await waitFor(() => expect(container.textContent).toContain('Body of b.md'))
    location.hash = ''
  })
})
