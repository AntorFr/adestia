// @vitest-environment jsdom
/**
 * The autosave contract, pinned from the criterion of the split: the 1.6 s
 * cadence, the revision carried from one save to the next, and a refusal that
 * stops the loop but never the explicit Done.
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

type Host = HTMLElement & { edit: (md: string) => void }

const mount = (element: HTMLElement, markdown: string, onChange: (md: string) => void) => {
  element.dataset['mounted'] = markdown
  ;(element as Host).edit = onChange
  return () => {
    delete element.dataset['mounted']
  }
}

function scripted(replies: { status: number; body: unknown }[], puts: { body: { revision: string; markdown: string } }[]) {
  let n = 0
  return ((_url: string, init?: RequestInit) => {
    puts.push({ body: JSON.parse(String(init?.body)) })
    const reply = replies[Math.min(n++, replies.length - 1)]!
    return Promise.resolve({
      ok: reply.status < 300,
      status: reply.status,
      json: () => Promise.resolve(reply.body),
    } as unknown as Response)
  }) as unknown as typeof fetch
}

function open(fetchImpl: typeof fetch) {
  const view = render(<Editor page={page} mount={mount} fetchImpl={fetchImpl} />)
  fireEvent.click(screen.getByTitle('Edit'))
  return { ...view, host: view.container.querySelector('[data-mounted]') as Host }
}

describe('autosave', () => {
  it('fires at 1600 ms and not a tick before', async () => {
    vi.useFakeTimers()
    try {
      const puts: { body: { revision: string; markdown: string } }[] = []
      const { host } = open(scripted([{ status: 200, body: { revision: 'r2', normalized: false } }], puts))
      act(() => host.edit('# A\n'))
      await act(async () => void vi.advanceTimersByTime(1599))
      expect(puts).toHaveLength(0)
      await act(async () => void vi.advanceTimersByTime(1))
      expect(puts).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('restarts the wait on each keystroke', async () => {
    vi.useFakeTimers()
    try {
      const puts: { body: { revision: string; markdown: string } }[] = []
      const { host } = open(scripted([{ status: 200, body: { revision: 'r2', normalized: false } }], puts))
      act(() => host.edit('# A\n'))
      await act(async () => void vi.advanceTimersByTime(1000))
      act(() => host.edit('# AB\n'))
      await act(async () => void vi.advanceTimersByTime(1000))
      expect(puts).toHaveLength(0)
      await act(async () => void vi.advanceTimersByTime(600))
      expect(puts).toHaveLength(1)
      expect(puts[0]!.body.markdown).toBe('# AB\n')
    } finally {
      vi.useRealTimers()
    }
  })

  it('sends the revision the previous save returned', async () => {
    vi.useFakeTimers()
    try {
      const puts: { body: { revision: string; markdown: string } }[] = []
      const { host } = open(scripted([{ status: 200, body: { revision: 'r2', normalized: false } }], puts))
      act(() => host.edit('# A\n'))
      await act(async () => void vi.advanceTimersByTime(1600))
      act(() => host.edit('# B\n'))
      await act(async () => void vi.advanceTimersByTime(1600))
      expect(puts.map((p) => p.body.revision)).toEqual(['1000-12', 'r2'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops on a 422 and shows the diagnostics, yet Done still tries', async () => {
    vi.useFakeTimers()
    try {
      const puts: { body: { revision: string; markdown: string } }[] = []
      const { host } = open(
        scripted([{ status: 422, body: { diagnostics: [{ message: 'Unknown block ":::mystery"' }] } }], puts),
      )
      act(() => host.edit('# A\n'))
      await act(async () => void vi.advanceTimersByTime(1600))
      expect(puts).toHaveLength(1)
      expect(screen.getByText(/mystery/)).toBeTruthy()
      act(() => host.edit('# AB\n'))
      await act(async () => void vi.advanceTimersByTime(20_000))
      expect(puts).toHaveLength(1)
      await act(async () => void fireEvent.click(screen.getByText('Done')))
      expect(puts).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('Done retries after a 409', async () => {
    vi.useFakeTimers()
    try {
      const puts: { body: { revision: string; markdown: string } }[] = []
      const { host } = open(scripted([{ status: 409, body: {} }], puts))
      act(() => host.edit('# A\n'))
      await act(async () => void vi.advanceTimersByTime(1600))
      await act(async () => void vi.advanceTimersByTime(20_000))
      expect(puts).toHaveLength(1)
      await act(async () => void fireEvent.click(screen.getByText('Done')))
      expect(puts).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a new page resets the document, revision and status', async () => {
    vi.useFakeTimers()
    try {
      const puts: { body: { revision: string; markdown: string } }[] = []
      const fetchImpl = scripted([{ status: 409, body: {} }], puts)
      const view = render(<Editor page={page} mount={mount} fetchImpl={fetchImpl} />)
      fireEvent.click(screen.getByTitle('Edit'))
      act(() => (view.container.querySelector('[data-mounted]') as Host).edit('# A\n'))
      await act(async () => void vi.advanceTimersByTime(1600))
      expect(screen.getByText(/The agent changed this page/)).toBeTruthy()
      view.rerender(
        <Editor page={{ ...page, path: 'notes/b.md', revision: '77-1', markdown: 'B\n' }} mount={mount} fetchImpl={fetchImpl} />,
      )
      expect(screen.queryByText(/The agent changed this page/)).toBeNull()
      fireEvent.click(screen.getByTitle('Edit'))
      act(() => (view.container.querySelector('[data-mounted]') as Host).edit('B2\n'))
      await act(async () => void vi.advanceTimersByTime(1600))
      expect(puts[1]!.body.revision).toBe('77-1')
    } finally {
      vi.useRealTimers()
    }
  })
})
