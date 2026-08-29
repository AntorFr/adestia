// @vitest-environment jsdom
/**
 * Editor behaviour, with the Milkdown mount injected.
 *
 * What matters here is not that ProseMirror renders — it does, and spike 1
 * proved the round-trip — but that the editor behaves correctly next to an
 * agent writing the same files: conflicts surfaced, refusals explained,
 * broken pages readable.
 */

import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Editor, SaveStatus, savePage, type PageDocument } from '../src/editor/Editor.js'

const page: PageDocument = {
  path: 'notes/garage.md',
  title: 'Le garage',
  markdown: '# Le garage\n',
  revision: '1000-12',
  editable: true,
  diagnostics: [],
}

function jsonFetch(status: number, body: unknown): typeof fetch {
  return (() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as unknown as Response)) as unknown as typeof fetch
}

/** A mount that just reports edits, standing in for Milkdown. */
const fakeMount =
  (edits: string[]) =>
  (element: HTMLElement, markdown: string, onChange: (md: string) => void) => {
    element.dataset['mounted'] = markdown
    edits.push(markdown)
    ;(element as HTMLElement & { edit: (md: string) => void }).edit = onChange
    return () => {
      delete element.dataset['mounted']
    }
  }

/**
 * Puts the page in writing posture, the way a reader does — by clicking the
 * pencil. Every test below that touches the document needs this now: reading
 * is the default, and that IS the behaviour under test.
 */
function startEditing() {
  fireEvent.click(screen.getByTitle('Edit'))
}

describe('savePage', () => {
  it('sends the revision it opened with', async () => {
    const calls: RequestInit[] = []
    const fetchImpl = ((_url: string, init: RequestInit) => {
      calls.push(init)
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ revision: '2000-14', normalized: false }),
      } as unknown as Response)
    }) as unknown as typeof fetch

    await savePage(page, '# Changed\n', fetchImpl)
    expect(JSON.parse(String(calls[0]?.body))).toEqual({
      markdown: '# Changed\n',
      revision: '1000-12',
    })
  })

  it('reports a conflict as such', async () => {
    const result = await savePage(page, '# x\n', jsonFetch(409, { error: 'changed' }))
    expect(result.state.kind).toBe('conflict')
  })

  it('carries the diagnostics of a refused save', async () => {
    const result = await savePage(
      page,
      ':::mystery\nx\n:::\n',
      jsonFetch(422, { diagnostics: [{ message: 'Unknown block ":::mystery"' }] }),
    )
    expect(result.state).toMatchObject({ kind: 'rejected' })
    if (result.state.kind !== 'rejected') throw new Error('expected a rejection')
    expect(result.state.diagnostics[0]?.message).toContain('mystery')
  })

  it('surfaces an unexpected failure with its message', async () => {
    const result = await savePage(page, '# x\n', jsonFetch(500, { error: 'disk full' }))
    expect(result.state).toEqual({ kind: 'failed', message: 'disk full' })
  })
})

describe('save status', () => {
  it('says when a save reformatted the file', () => {
    // A silent reformat looks like the editor mangled something untouched.
    render(<SaveStatus state={{ kind: 'saved', normalized: true }} />)
    expect(screen.getByText(/tidied to house style/)).toBeTruthy()
  })

  it('names the other author on a conflict', () => {
    render(<SaveStatus state={{ kind: 'conflict' }} />)
    expect(screen.getByText(/The agent changed this page/)).toBeTruthy()
  })
})

describe('editor', () => {
  it('opens a page for READING, mounting no editor at all', () => {
    // Opening a page to look at it used to mount ProseMirror, its toolbars
    // and its handles over a document nobody had asked to change.
    const edits: string[] = []
    const { container } = render(<Editor page={page} mount={fakeMount(edits)} />)
    expect(container.querySelector('[data-mounted]')).toBeNull()
    expect(container.querySelector('.demeura-reader')).toBeTruthy()
    expect(edits).toEqual([])
  })

  it('mounts the editor with the page markdown once writing is chosen', () => {
    const edits: string[] = []
    const { container } = render(<Editor page={page} mount={fakeMount(edits)} />)
    startEditing()
    expect(container.querySelector('[data-mounted]')?.getAttribute('data-mounted')).toBe(
      '# Le garage\n',
    )
  })

  it('keeps Save disabled until something changes', () => {
    render(<Editor page={page} mount={fakeMount([])} />)
    startEditing()
    expect(screen.getByText('Save').closest('button')?.disabled).toBe(true)
  })

  it('enables Save once the document is edited', () => {
    const { container } = render(<Editor page={page} mount={fakeMount([])} />)
    startEditing()
    const host = container.querySelector('[data-mounted]') as HTMLElement & {
      edit: (md: string) => void
    }
    // Wrapped in act(): the editor reports changes through a callback, not a
    // DOM event, so React has no reason to flush without being told.
    act(() => host.edit('# Changed\n'))
    expect(screen.getByText('Save').closest('button')?.disabled).toBe(false)
  })

  it('leaves writing posture behind when the reader moves on', () => {
    // Arriving somewhere new in a posture nobody chose is how people edit a
    // page they meant to read.
    const { container, rerender } = render(<Editor page={page} mount={fakeMount([])} />)
    startEditing()
    expect(container.querySelector('[data-mounted]')).toBeTruthy()
    rerender(<Editor page={{ ...page, path: 'notes/other.md' }} mount={fakeMount([])} />)
    expect(container.querySelector('[data-mounted]')).toBeNull()
  })

  it('abandoning an edit restores what was there', () => {
    // A half-typed sentence must not survive as a "dirty" page waiting to be
    // saved by accident.
    const { container } = render(<Editor page={page} mount={fakeMount([])} />)
    startEditing()
    const host = container.querySelector('[data-mounted]') as HTMLElement & {
      edit: (md: string) => void
    }
    act(() => host.edit('# Half a thought\n'))
    fireEvent.click(screen.getByText('Done'))
    startEditing()
    expect(screen.getByText('Save').closest('button')?.disabled).toBe(true)
  })

  it('shows a conflict instead of overwriting the agent', async () => {
    const { container } = render(
      <Editor page={page} mount={fakeMount([])} fetchImpl={jsonFetch(409, {})} />,
    )
    startEditing()
    const host = container.querySelector('[data-mounted]') as HTMLElement & {
      edit: (md: string) => void
    }
    act(() => host.edit('# Mine\n'))
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(screen.getByText(/The agent changed this page/)).toBeTruthy())
  })

  it('opens a broken page read-only, with its raw source and diagnostics', () => {
    // Refusing loses the file; rewriting loses the content. Neither is on.
    const broken: PageDocument = {
      ...page,
      editable: false,
      markdown: ':::mystery\nbody\n:::\n',
      diagnostics: [{ severity: 'error', message: 'Unknown block ":::mystery"', line: 1 }],
    }
    const mount = vi.fn()
    render(<Editor page={broken} mount={mount} />)

    expect(mount).not.toHaveBeenCalled()
    expect(screen.queryByText('Save')).toBeNull()
    expect(screen.getByText(/open read-only/)).toBeTruthy()
    // The diagnostic names the block AND the raw source shows it, so the query
    // has to say which one it means.
    expect(screen.getByText(/Unknown block/)).toBeTruthy()
    expect(document.querySelector('.demeura-editor__raw')?.textContent).toContain(':::mystery')
  })

  it('mounts the NEW document when writing resumes on another page', () => {
    // Two live instances on one host would leave the second reading the
    // first's document; the teardown is what prevents it.
    const { container, rerender } = render(<Editor page={page} mount={fakeMount([])} />)
    startEditing()
    rerender(<Editor page={{ ...page, path: 'other.md', markdown: '# Other\n' }} mount={fakeMount([])} />)
    startEditing()
    expect(container.querySelector('[data-mounted]')?.getAttribute('data-mounted')).toBe(
      '# Other\n',
    )
  })
})
