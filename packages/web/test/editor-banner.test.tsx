// @vitest-environment jsdom
/**
 * The "page changed" banner (AD-21, B-17 editing): raised from `incoming`,
 * compared by REVISION against the one the editor holds, never touching the
 * typed text.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Editor, type PageDocument } from '../src/editor/Editor.js'

const page: PageDocument = {
  path: 'notes/garage.md',
  title: 'Le garage',
  markdown: '# Le garage\n',
  revision: '1000-12',
  editable: true,
  diagnostics: [],
}
const theirs: PageDocument = { ...page, markdown: '# Agent\n', revision: '2000-9' }

type Host = HTMLElement & { edit: (md: string) => void }
const mount = (element: HTMLElement, markdown: string, onChange: (md: string) => void) => {
  element.dataset['mounted'] = markdown
  ;(element as Host).edit = onChange
  return () => {
    delete element.dataset['mounted']
  }
}
const okFetch = (revision: string) =>
  (() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ revision, normalized: false }),
    } as unknown as Response)) as unknown as typeof fetch
const conflictFetch = (() =>
  Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({}) } as unknown as Response)) as unknown as typeof fetch

type Props = Partial<React.ComponentProps<typeof Editor>>
function open(props: Props = {}, fetchImpl: typeof fetch = okFetch('r2')) {
  const view = render(<Editor page={page} mount={mount} fetchImpl={fetchImpl} {...props} />)
  fireEvent.click(screen.getByTitle('Edit'))
  const host = () => view.container.querySelector('[data-mounted]') as Host
  const rerenderWith = (more: Props) =>
    view.rerender(<Editor page={page} mount={mount} fetchImpl={fetchImpl} {...props} {...more} />)
  return { ...view, host, rerenderWith }
}
const banner = () => screen.queryByRole('status', { name: '' }) && document.querySelector('.adestia-save--warn.adestia-editor__changed')

describe('changed banner', () => {
  it('a different revision raises it and leaves the typed text alone', () => {
    const { host, rerenderWith } = open()
    act(() => host().edit('# Typed\n'))
    const before = host().dataset['mounted']
    rerenderWith({ incoming: { page: theirs }, onReload: () => {} })
    expect(banner()).toBeTruthy()
    expect(screen.getByText('The page changed.')).toBeTruthy()
    expect(screen.getByText('Reload').className).toContain('adestia-btn')
    expect(banner()!.getAttribute('role')).toBe('status')
    expect(host().dataset['mounted']).toBe(before)
    expect(host().dataset['mounted']).not.toContain('Agent')
  })

  it('the editor’s own revision raises nothing', () => {
    open({ incoming: { page: { ...theirs, revision: page.revision } } })
    expect(banner()).toBeNull()
  })

  it('after a save returning R, incoming at R raises nothing', async () => {
    vi.useFakeTimers()
    try {
      const { host, rerenderWith } = open({}, okFetch('r2'))
      act(() => host().edit('# A\n'))
      await act(async () => void vi.advanceTimersByTime(1600))
      rerenderWith({ incoming: { page: { ...theirs, revision: 'r2' } } })
      expect(banner()).toBeNull()
      rerenderWith({ incoming: { page: { ...theirs, revision: 'r3' } } })
      expect(banner()).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('gone raises it', () => {
    open({ incoming: { gone: true } })
    expect(banner()).toBeTruthy()
  })

  it('stays raised across the user’s own save (even a 409)', async () => {
    vi.useFakeTimers()
    try {
      const { host } = open({ incoming: { page: theirs }, onReload: () => {} }, conflictFetch)
      act(() => host().edit('# A\n'))
      await act(async () => void vi.advanceTimersByTime(1600))
      expect(banner()).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stays raised across a successful save of a different revision', async () => {
    vi.useFakeTimers()
    try {
      const { host } = open({ incoming: { page: theirs }, onReload: () => {} }, okFetch('r2'))
      act(() => host().edit('# A\n'))
      await act(async () => void vi.advanceTimersByTime(1600))
      expect(banner()).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('Reload calls onReload once; once the page is reloaded the banner is gone and the editor holds the new text', () => {
    const onReload = vi.fn()
    const view = render(
      <Editor page={page} mount={mount} fetchImpl={okFetch('r2')} incoming={{ page: theirs }} onReload={onReload} />,
    )
    fireEvent.click(screen.getByTitle('Edit'))
    fireEvent.click(screen.getByText('Reload'))
    expect(onReload).toHaveBeenCalledTimes(1)
    view.rerender(<Editor page={theirs} mount={mount} fetchImpl={okFetch('r2')} onReload={onReload} />)
    expect(banner()).toBeNull()
    expect((view.container.querySelector('[data-mounted]') as Host).dataset['mounted']).toContain('Agent')
  })

  it('no incoming, no banner', () => {
    open()
    expect(banner()).toBeNull()
    expect(screen.queryByText('Reload')).toBeNull()
  })
})

const outer = mount
describe('changed banner — reload with same normalized text', () => {
  it('Reload of a new revision with the same text drops the typed text from the surface', () => {
    const same: PageDocument = { ...page, revision: '3000-1' }
    let mounts = 0
    const mount = (el: HTMLElement, md: string, cb: (m: string) => void) => {
      mounts++
      return outer(el, md, cb)
    }
    const view = render(
      <Editor page={page} mount={mount} fetchImpl={okFetch('r2')} incoming={{ page: same }} onReload={() => {}} />,
    )
    fireEvent.click(screen.getByTitle('Edit'))
    const h = () => view.container.querySelector('[data-mounted]') as Host
    act(() => h().edit('# Typed\n'))
    fireEvent.click(screen.getByText('Reload'))
    view.rerender(<Editor page={same} mount={mount} fetchImpl={okFetch('r2')} />)
    expect(banner()).toBeNull()
    expect(mounts).toBe(2)
  })
})

describe('changed banner — the surface under the typist', () => {
  it('the user’s own save does not remount the surface and keeps what was typed', async () => {
    vi.useFakeTimers()
    try {
      let mounts = 0
      const counting = (el: HTMLElement, md: string, cb: (m: string) => void) => {
        mounts++
        return outer(el, md, cb)
      }
      const view = render(
        <Editor page={page} mount={counting} fetchImpl={okFetch('r2')} incoming={{ page: theirs }} onReload={() => {}} />,
      )
      fireEvent.click(screen.getByTitle('Edit'))
      const h = () => view.container.querySelector('[data-mounted]') as Host
      act(() => h().edit('# Typed\n'))
      await act(async () => void vi.advanceTimersByTime(1600))
      expect(mounts).toBe(1)
      expect(h().dataset['mounted']).not.toContain('Agent')
      expect(banner()).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('gone: Reload calls onReload once', () => {
    const onReload = vi.fn()
    open({ incoming: { gone: true }, onReload })
    fireEvent.click(screen.getByText('Reload'))
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('a later agent write after a save raises the banner again', async () => {
    vi.useFakeTimers()
    try {
      const { host, rerenderWith } = open({}, okFetch('r2'))
      act(() => host().edit('# A\n'))
      await act(async () => void vi.advanceTimersByTime(1600))
      rerenderWith({ incoming: { page: { ...theirs, revision: 'r2' } } })
      expect(banner()).toBeNull()
      rerenderWith({ incoming: { gone: true } })
      expect(banner()).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })
})
