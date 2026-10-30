// @vitest-environment jsdom
/**
 * AD-21 / B-17 (reading side): `usePage` follows the change feed's last batch.
 * Every response is a promise the test settles itself; no timer is awaited.
 */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { usePage, type PageChanges } from '../src/app/usePage.js'

afterEach(cleanup)

type Call = { url: string; ok: (status: number, body: unknown) => void; cut: () => void }

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

const doc = (path: string, revision = '1-1') => ({
  path,
  title: path,
  markdown: `Body of ${path} ${revision}\n`,
  revision,
  editable: true,
  diagnostics: [],
})

async function opened(store?: string) {
  const { impl, calls } = held()
  const view = renderHook(
    ({ changes }: { changes: PageChanges }) =>
      usePage({ pagePath: 'a.md', pageStore: store, fetchImpl: impl, pageChanges: changes }),
    { initialProps: { changes: { seq: 0, paths: [] } as PageChanges } },
  )
  await waitFor(() => expect(calls).toHaveLength(1))
  await act(async () => { calls[0]!.ok(200, doc('a.md')) })
  await waitFor(() => expect(view.result.current.page?.revision).toBe('1-1'))
  const batch = (seq: number, paths: string[]) => view.rerender({ changes: { seq, paths } })
  return { ...view, calls, batch }
}

describe('usePage following the feed, reading', () => {
  it('a batch naming the path rereads and replaces the page without loading', async () => {
    const t = await opened()
    t.batch(1, ['a.md'])
    await waitFor(() => expect(t.calls).toHaveLength(2))
    expect(t.calls[1]!.url).toBe('/api/pages/a.md')
    expect(t.result.current.loading).toBe(false)
    expect(t.result.current.page?.revision).toBe('1-1')
    await act(async () => { t.calls[1]!.ok(200, doc('a.md', '2-2')) })
    expect(t.result.current.page?.revision).toBe('2-2')
    expect(t.result.current.loading).toBe(false)
    expect(t.result.current.pageProblem).toBeUndefined()
  })

  it('a batch that does not name the path, or seq 0, rereads nothing', async () => {
    const t = await opened()
    t.batch(1, ['b.md'])
    t.batch(2, [])
    await act(async () => {})
    expect(t.calls).toHaveLength(1)
  })

  it('two batches naming the same path reread twice', async () => {
    const t = await opened()
    t.batch(1, ['a.md'])
    await waitFor(() => expect(t.calls).toHaveLength(2))
    await act(async () => { t.calls[1]!.ok(200, doc('a.md', '2-2')) })
    t.batch(2, ['a.md'])
    await waitFor(() => expect(t.calls).toHaveLength(3))
    await act(async () => { t.calls[2]!.ok(200, doc('a.md', '3-3')) })
    expect(t.result.current.page?.revision).toBe('3-3')
  })

  it('404 on the reread is E-8; 500 and a cut network change nothing', async () => {
    for (const settle of [(c: Call) => c.ok(500, {}), (c: Call) => c.cut()]) {
      const t = await opened()
      t.batch(1, ['a.md'])
      await waitFor(() => expect(t.calls).toHaveLength(2))
      await act(async () => { settle(t.calls[1]!) })
      expect(t.result.current.page?.revision).toBe('1-1')
      expect(t.result.current.pageProblem).toBeUndefined()
      expect(t.result.current.loading).toBe(false)
      t.unmount()
    }
    const t = await opened()
    t.batch(1, ['a.md'])
    await waitFor(() => expect(t.calls).toHaveLength(2))
    await act(async () => { t.calls[1]!.ok(404, {}) })
    expect(t.result.current.pageProblem).toEqual({ path: 'a.md', status: 404 })
    expect(t.result.current.page).toBeUndefined()
    expect(t.result.current.loading).toBe(false)
  })

  it('a page of a second store is reread with its ?store=', async () => {
    const t = await opened('team')
    expect(t.calls[0]!.url).toBe('/api/pages/a.md?store=team')
    t.batch(1, ['a.md'])
    await waitFor(() => expect(t.calls).toHaveLength(2))
    expect(t.calls[1]!.url).toBe('/api/pages/a.md?store=team')
  })

  it('an answer arriving after the address moved is dropped', async () => {
    const { impl, calls } = held()
    const view = renderHook(
      ({ p, changes }: { p: string; changes: PageChanges }) =>
        usePage({ pagePath: p, pageStore: undefined, fetchImpl: impl, pageChanges: changes }),
      { initialProps: { p: 'a.md', changes: { seq: 0, paths: [] } as PageChanges } },
    )
    await waitFor(() => expect(calls).toHaveLength(1))
    await act(async () => { calls[0]!.ok(200, doc('a.md')) })
    await waitFor(() => expect(view.result.current.page?.path).toBe('a.md'))
    view.rerender({ p: 'a.md', changes: { seq: 1, paths: ['a.md'] } })
    await waitFor(() => expect(calls).toHaveLength(2))
    view.rerender({ p: 'b.md', changes: { seq: 1, paths: ['a.md'] } })
    await waitFor(() => expect(calls).toHaveLength(3))
    await act(async () => { calls[1]!.ok(200, doc('a.md', '9-9')) })
    await act(async () => { calls[2]!.ok(200, doc('b.md')) })
    await waitFor(() => expect(view.result.current.page?.path).toBe('b.md'))
  })
})

describe('usePage following the feed, editing', () => {
  it('keeps page, parks the read in incoming, reload() applies it', async () => {
    const t = await opened()
    const first = t.result.current.page
    act(() => t.result.current.onEditing(true))
    t.batch(1, ['a.md'])
    await waitFor(() => expect(t.calls).toHaveLength(2))
    await act(async () => { t.calls[1]!.ok(200, doc('a.md', '2-2')) })
    expect(t.result.current.page).toBe(first)
    expect(t.result.current.incoming).toEqual({ page: doc('a.md', '2-2') })
    act(() => t.result.current.reload())
    expect(t.result.current.page?.revision).toBe('2-2')
    expect(t.result.current.incoming).toBeUndefined()
  })

  it('latest batch wins; an older answer arriving late is ignored', async () => {
    const t = await opened()
    act(() => t.result.current.onEditing(true))
    t.batch(1, ['a.md'])
    await waitFor(() => expect(t.calls).toHaveLength(2))
    t.batch(2, ['a.md'])
    await waitFor(() => expect(t.calls).toHaveLength(3))
    await act(async () => { t.calls[2]!.ok(200, doc('a.md', '3-3')) })
    await act(async () => { t.calls[1]!.ok(200, doc('a.md', '2-2')) })
    expect(t.result.current.incoming).toEqual({ page: doc('a.md', '3-3') })
  })

  it('404 gives gone; reload() shows E-8', async () => {
    const t = await opened()
    act(() => t.result.current.onEditing(true))
    t.batch(1, ['a.md'])
    await waitFor(() => expect(t.calls).toHaveLength(2))
    await act(async () => { t.calls[1]!.ok(404, {}) })
    expect(t.result.current.incoming).toEqual({ gone: true })
    expect(t.result.current.page?.revision).toBe('1-1')
    act(() => t.result.current.reload())
    expect(t.result.current.pageProblem).toEqual({ path: 'a.md', status: 404 })
    expect(t.result.current.page).toBeUndefined()
  })

  it('a failed side read leaves incoming and page intact', async () => {
    const t = await opened()
    act(() => t.result.current.onEditing(true))
    t.batch(1, ['a.md'])
    await waitFor(() => expect(t.calls).toHaveLength(2))
    await act(async () => { t.calls[1]!.ok(200, doc('a.md', '2-2')) })
    t.batch(2, ['a.md'])
    await waitFor(() => expect(t.calls).toHaveLength(3))
    await act(async () => { t.calls[2]!.ok(500, {}) })
    expect(t.result.current.incoming).toEqual({ page: doc('a.md', '2-2') })
    expect(t.result.current.page?.revision).toBe('1-1')
    t.batch(3, ['a.md'])
    await waitFor(() => expect(t.calls).toHaveLength(4))
    await act(async () => { t.calls[3]!.cut() })
    expect(t.result.current.incoming).toEqual({ page: doc('a.md', '2-2') })
  })

  it('closing the editor applies the pending incoming; gone gives E-8', async () => {
    const t = await opened()
    act(() => t.result.current.onEditing(true))
    t.batch(1, ['a.md'])
    await waitFor(() => expect(t.calls).toHaveLength(2))
    await act(async () => { t.calls[1]!.ok(200, doc('a.md', '2-2')) })
    act(() => t.result.current.onEditing(false))
    expect(t.result.current.page?.revision).toBe('2-2')
    expect(t.result.current.incoming).toBeUndefined()

    act(() => t.result.current.onEditing(true))
    t.batch(2, ['a.md'])
    await waitFor(() => expect(t.calls).toHaveLength(3))
    await act(async () => { t.calls[2]!.ok(404, {}) })
    act(() => t.result.current.onEditing(false))
    expect(t.result.current.pageProblem).toEqual({ path: 'a.md', status: 404 })
  })

  it('a read that left while reading but answers once editing parks in incoming', async () => {
    const t = await opened()
    t.batch(1, ['a.md'])
    await waitFor(() => expect(t.calls).toHaveLength(2))
    act(() => t.result.current.onEditing(true))
    await act(async () => { t.calls[1]!.ok(200, doc('a.md', '2-2')) })
    expect(t.result.current.page?.revision).toBe('1-1')
    expect(t.result.current.incoming).toEqual({ page: doc('a.md', '2-2') })
  })

  it('closing the editor with nothing pending changes nothing', async () => {
    const t = await opened()
    act(() => t.result.current.onEditing(true))
    act(() => t.result.current.onEditing(false))
    expect(t.calls).toHaveLength(1)
    expect(t.result.current.page?.revision).toBe('1-1')
  })
})
