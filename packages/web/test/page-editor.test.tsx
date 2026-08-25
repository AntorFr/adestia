// @vitest-environment jsdom
/**
 * The page editor a plugin embeds — the capability, not the editor.
 *
 * `Editor` itself is covered next door. What is under test here is the thing
 * a plugin actually depends on: that a screen made of several of these puts
 * ONE of them into writing posture, that each carries its own page and its
 * own revision, and that the shell's chrome (the attachment strip, the drop
 * target) stays out of a plugin's layout unless it asks.
 */

import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { makePageEditor } from '../src/plugins/PageEditor.js'
import { browserEnvironment } from '../src/plugins/loader.js'

const pages: Record<string, unknown> = {
  'journal/atelier/2026-08-25.md': {
    path: 'journal/atelier/2026-08-25.md',
    title: '2026-08-25',
    markdown: 'Le guide dérivait.\n',
    revision: '1000-12',
    editable: true,
    diagnostics: [],
  },
  'journal/atelier/2026-08-24.md': {
    path: 'journal/atelier/2026-08-24.md',
    title: '2026-08-24',
    markdown: 'Lame changée.\n',
    revision: '900-8',
    editable: true,
    diagnostics: [],
  },
}

/** Answers page reads from the table above, and takes any save. */
function workspaceFetch(saves: { url: string; body: unknown }[] = []): typeof fetch {
  return ((url: string, init?: RequestInit) => {
    const path = url.replace('/api/pages/', '')
    if (init?.method === 'PUT') {
      saves.push({ url, body: JSON.parse(String(init.body)) })
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ revision: '2000-20', normalized: false }),
      } as unknown as Response)
    }
    const page = pages[path]
    return Promise.resolve({
      ok: page !== undefined,
      status: page === undefined ? 404 : 200,
      json: () => Promise.resolve(page ?? { error: 'no such page' }),
    } as unknown as Response)
  }) as unknown as typeof fetch
}

/** A mount that stands in for Milkdown and reports what it was given. */
const fakeMount = (element: HTMLElement, markdown: string, onChange: (md: string) => void) => {
  element.dataset['mounted'] = markdown
  ;(element as HTMLElement & { edit: (md: string) => void }).edit = onChange
  return () => {
    delete element.dataset['mounted']
  }
}

const editor = (fetchImpl: typeof fetch) =>
  makePageEditor({
    locale: 'en',
    t: (key) => key,
    fetchImpl,
    loadMount: () => Promise.resolve(fakeMount),
  })

describe('the page editor lent to plugins', () => {
  it('fetches the page it was given a path for', async () => {
    const PageEditor = editor(workspaceFetch())
    render(<PageEditor path="journal/atelier/2026-08-25.md" />)

    expect(await screen.findByText('Le guide dérivait.')).toBeTruthy()
  })

  it('puts ONE entry into writing posture, leaving the others readable', async () => {
    const PageEditor = editor(workspaceFetch())
    render(
      <>
        <PageEditor path="journal/atelier/2026-08-25.md" />
        <PageEditor path="journal/atelier/2026-08-24.md" />
      </>,
    )

    await screen.findByText('Le guide dérivait.')
    await screen.findByText('Lame changée.')

    // This is the whole point of the capability: a journal shows its history
    // and one section of it goes into edit mode.
    const pencils = await screen.findAllByTitle('Edit')
    expect(pencils).toHaveLength(2)
    fireEvent.click(pencils[0]!)

    await waitFor(() => {
      expect(document.querySelectorAll('[data-mounted]')).toHaveLength(1)
    })
    // The second entry is still being read, not merely hidden.
    expect(screen.getByText('Lame changée.')).toBeTruthy()
  })

  it('saves with the revision that page was read at', async () => {
    const saves: { url: string; body: unknown }[] = []
    const PageEditor = editor(workspaceFetch(saves))
    const onSaved = vi.fn()
    render(<PageEditor path="journal/atelier/2026-08-24.md" onSaved={onSaved} />)

    await screen.findByText('Lame changée.')
    fireEvent.click(screen.getByTitle('Edit'))
    await waitFor(() => expect(document.querySelector('[data-mounted]')).toBeTruthy())

    const surface = document.querySelector('[data-mounted]') as HTMLElement & {
      edit: (md: string) => void
    }
    act(() => surface.edit('Lame changée, et affûtée.\n'))
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(saves).toHaveLength(1))
    expect(saves[0]).toMatchObject({
      url: '/api/pages/journal/atelier/2026-08-24.md',
      body: { revision: '900-8', markdown: 'Lame changée, et affûtée.\n' },
    })
    // The list a plugin drew from the index is stale the moment a save lands.
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('leaves the attachment strip out of a plugin layout unless asked', async () => {
    const asked: string[] = []
    const fetchImpl = ((url: string, init?: RequestInit) => {
      asked.push(url)
      return workspaceFetch()(url, init)
    }) as unknown as typeof fetch

    const PageEditor = editor(fetchImpl)
    render(<PageEditor path="journal/atelier/2026-08-25.md" />)
    await screen.findByText('Le guide dérivait.')

    // A strip of documents under every entry is furniture — and one request
    // per entry, which is what a thirty-entry journal cannot afford.
    expect(asked.some((url) => url.startsWith('/api/files'))).toBe(false)
  })

  it('says so where the editor would be when the page is gone', async () => {
    const PageEditor = editor(workspaceFetch())
    render(<PageEditor path="journal/atelier/nowhere.md" />)

    expect(await screen.findByText(/404/)).toBeTruthy()
  })
})

describe('the api a plugin factory receives', () => {
  it('carries the page editor the shell built', () => {
    const Given = () => null
    const environment = browserEnvironment(
      () => undefined,
      () => undefined,
      'fr',
      () => undefined,
      Given,
    )
    const api = environment.makeApi({ id: 'journal', kind: 'app', base: '/plugins/journal/' })

    expect(api.PageEditor).toBe(Given)
    expect(api.locale).toBe('fr')
  })

  it('answers with a notice rather than a blank when no shell provided one', () => {
    const environment = browserEnvironment(
      () => undefined,
      () => undefined,
    )
    const api = environment.makeApi({ id: 'journal', kind: 'app', base: '/plugins/journal/' })

    const Fallback = api.PageEditor
    render(<Fallback path="whatever.md" />)
    expect(screen.getByText(/No page editor/)).toBeTruthy()
  })
})
