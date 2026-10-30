// @vitest-environment jsdom
/**
 * The shared request pieces of AD-24 (B-18): the loading row, the failure
 * block and the `useRequest` hook. Every response is a promise the test
 * resolves itself: nothing here waits for a timer.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { translator } from '../src/app/i18n.js'
import { Failure, Loading } from '../src/app/ui/index.js'
import { useRequest } from '../src/app/useRequest.js'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/** A fetch whose every call is held until the test settles it. */
function held() {
  const calls: { url: string; ok: (status: number, body: unknown) => void; cut: (message: string) => void }[] = []
  const impl = vi.fn((input: unknown) => {
    return new Promise<Response>((resolve, reject) => {
      calls.push({
        url: String(input),
        ok: (status, body) =>
          resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response),
        cut: (message) => reject(new TypeError(message)),
      })
    })
  })
  return { impl: impl as unknown as typeof fetch, calls }
}

describe('Loading', () => {
  it('is a status carrying the wait word, with a spinner icon', () => {
    const { container } = render(<Loading />)
    const row = screen.getByRole('status')
    expect(row.textContent).toBe('Loading…')
    expect(row.classList.contains('adestia-loading')).toBe(true)
    expect(container.querySelector('.adestia-loading svg, .adestia-loading .adestia-icon')).not.toBeNull()
  })

  it('says it in French through the translator', () => {
    render(<Loading t={translator('fr')} />)
    expect(screen.getByRole('status').textContent).toBe('Chargement…')
  })
})

describe('Failure', () => {
  it('shows the message and a Retry button that calls onRetry once per click', () => {
    const onRetry = vi.fn()
    const { container } = render(<Failure message="Request failed (503)" onRetry={onRetry} />)
    expect(container.querySelector('.adestia-empty__text')?.textContent).toBe('Request failed (503)')
    const button = screen.getByRole('button', { name: 'Retry' })
    expect(onRetry).not.toHaveBeenCalled()
    fireEvent.click(button)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('says Réessayer in French', () => {
    render(<Failure message="x" onRetry={() => undefined} t={translator('fr')} />)
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })
})

describe('useRequest', () => {
  it('goes loading → ready with the data and the status', async () => {
    const { impl, calls } = held()
    const { result } = renderHook(() => useRequest<{ n: number }>(impl, '/api/x'))
    expect(result.current.status).toBe('loading')
    expect(result.current.data).toBeUndefined()
    await act(async () => { calls[0]!.ok(200, { n: 7 }) })
    expect(result.current.status).toBe('ready')
    expect(result.current.data).toEqual({ n: 7 })
    expect(result.current.httpStatus).toBe(200)
    expect(result.current.error).toBeUndefined()
  })

  it('goes loading → failed with the server sentence and the status', async () => {
    const { impl, calls } = held()
    const { result } = renderHook(() => useRequest(impl, '/api/x'))
    await act(async () => { calls[0]!.ok(500, { error: 'disk full' }) })
    expect(result.current.status).toBe('failed')
    expect(result.current.error).toBe('disk full')
    expect(result.current.httpStatus).toBe(500)
    expect(result.current.data).toBeUndefined()
  })

  it('says the fallback sentence in English and in French', async () => {
    for (const [locale, expected] of [['en', 'Request failed (502)'], ['fr', 'La requête a échoué (502)']] as const) {
      const { impl, calls } = held()
      const t = translator(locale)
      const { result } = renderHook(() => useRequest(impl, '/api/x', { t }))
      await act(async () => { calls[0]!.ok(502, null) })
      expect(result.current.error).toBe(expected)
      expect(result.current.httpStatus).toBe(502)
    }
  })

  it('says the unreachable-server words, never the raw fetch error, at status 0', async () => {
    for (const [locale, expected] of [['en', 'The server is not responding'], ['fr', 'Le serveur ne répond pas']] as const) {
      const { impl, calls } = held()
      const t = translator(locale)
      const { result } = renderHook(() => useRequest(impl, '/api/x', { t }))
      await act(async () => { calls[0]!.cut('fetch failed') })
      expect(result.current.status).toBe('failed')
      expect(result.current.httpStatus).toBe(0)
      expect(result.current.error).toBe(expected)
    }
  })

  it('retry() returns to loading, then ready, with a second request', async () => {
    const { impl, calls } = held()
    const { result } = renderHook(() => useRequest<string>(impl, '/api/x'))
    await act(async () => { calls[0]!.ok(503, {}) })
    expect(result.current.status).toBe('failed')
    act(() => { result.current.retry() })
    expect(result.current.status).toBe('loading')
    expect(result.current.error).toBeUndefined()
    expect(result.current.httpStatus).toBeUndefined()
    await waitFor(() => expect(calls).toHaveLength(2))
    await act(async () => { calls[1]!.ok(200, 'back') })
    expect(result.current.status).toBe('ready')
    expect(result.current.data).toBe('back')
  })

  it('ignores the late answer of a request retried meanwhile', async () => {
    const { impl, calls } = held()
    const { result } = renderHook(() => useRequest<string>(impl, '/api/x'))
    act(() => { result.current.retry() })
    await waitFor(() => expect(calls).toHaveLength(2))
    await act(async () => { calls[0]!.ok(200, 'old') })
    expect(result.current.status).toBe('loading')
    expect(result.current.data).toBeUndefined()
    await act(async () => { calls[1]!.ok(200, 'new') })
    expect(result.current.data).toBe('new')
  })

  it('ignores the answer of an abandoned url, even if it lands last', async () => {
    const { impl, calls } = held()
    const { result, rerender } = renderHook(({ url }) => useRequest<string>(impl, url), {
      initialProps: { url: '/api/a' },
    })
    rerender({ url: '/api/b' })
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(calls.map((call) => call.url)).toEqual(['/api/a', '/api/b']))
    await act(async () => { calls[1]!.ok(200, 'B') })
    await act(async () => { calls[0]!.ok(200, 'A') })
    expect(result.current.data).toBe('B')
    expect(result.current.status).toBe('ready')
  })

  it('ignores an abandoned url failing after the new one succeeded', async () => {
    const { impl, calls } = held()
    const { result, rerender } = renderHook(({ url }) => useRequest<string>(impl, url), {
      initialProps: { url: '/api/a' },
    })
    rerender({ url: '/api/b' })
    await waitFor(() => expect(calls).toHaveLength(2))
    await act(async () => { calls[1]!.ok(200, 'B') })
    await act(async () => { calls[0]!.cut('gone') })
    expect(result.current.status).toBe('ready')
    expect(result.current.error).toBeUndefined()
  })

  it('does not set state after unmount', async () => {
    const { impl, calls } = held()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { unmount } = renderHook(() => useRequest(impl, '/api/x'))
    unmount()
    await act(async () => { calls[0]!.ok(200, {}) })
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('does not fetch while disabled, and retry() does nothing', async () => {
    const { impl, calls } = held()
    const { result } = renderHook(() => useRequest(impl, '/api/x', { enabled: false }))
    expect(result.current.status).toBe('ready')
    act(() => { result.current.retry() })
    expect(result.current.status).toBe('ready')
    expect(calls).toHaveLength(0)
  })

  it('reads again when it becomes enabled', async () => {
    const { impl, calls } = held()
    const { result, rerender } = renderHook(({ enabled }) => useRequest<string>(impl, '/api/x', { enabled }), {
      initialProps: { enabled: false },
    })
    rerender({ enabled: true })
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(calls).toHaveLength(1))
    await act(async () => { calls[0]!.ok(200, 'on') })
    expect(result.current.data).toBe('on')
  })

  it('does not read again when the caller passes a new inline translator each render', async () => {
    const { impl, calls } = held()
    const { result, rerender } = renderHook(() => useRequest(impl, '/api/x', { t: (key: string) => key }))
    rerender()
    rerender()
    await act(async () => { calls[0]!.ok(200, {}) })
    expect(calls).toHaveLength(1)
    expect(result.current.status).toBe('ready')
  })

  it('uses the translator current at the time of the answer', async () => {
    const { impl, calls } = held()
    const { result, rerender } = renderHook(({ t }) => useRequest(impl, '/api/x', { t }), {
      initialProps: { t: translator('en') },
    })
    rerender({ t: translator('fr') })
    await act(async () => { calls[0]!.ok(500, null) })
    expect(result.current.error).toBe('La requête a échoué (500)')
    expect(calls).toHaveLength(1)
  })
})

describe('"Loading and failure" of docs/ecrans.md', () => {
  const doc = readFileSync(here('../../../docs/ecrans.md'), 'utf8')
  const start = doc.indexOf('### Loading and failure')
  const section = doc.slice(start, doc.indexOf('\n## ', start))
  // The classes named in code spans of the section's first two paragraphs.
  const named = [...new Set([...section.split('\n\n').slice(1, 3).join('\n\n').matchAll(/`((?:\.[a-z][a-z0-9_-]*)+)`/g)]
    .flatMap((match) => match[1]!.split('.').filter(Boolean)))]

  it('names the loading row, the failure block, its message, its action and the button', () => {
    expect(named).toEqual(expect.arrayContaining([
      'adestia-loading', 'adestia-empty', 'adestia-empty--state', 'adestia-empty__icon',
      'adestia-empty__text', 'adestia-empty__action', 'adestia-btn',
    ]))
  })

  it('finds every named class in the rendered components and the stylesheet', () => {
    const { container: loading } = render(<Loading />)
    const { container: failure } = render(<Failure message="m" onRetry={() => undefined} />)
    const markup = loading.innerHTML + failure.innerHTML
    const dir = here('../src/app/styles/')
    const css = readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(dir + f, 'utf8')).join('\n')
    for (const name of named) {
      expect(markup, `${name} in the markup`).toMatch(new RegExp(`class="[^"]*\\b${name}\\b`))
      expect(css, `${name} in the stylesheet`).toContain(`.${name}`)
    }
  })
})
