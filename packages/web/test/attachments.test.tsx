// @vitest-environment jsdom
/**
 * A page's other files: the ones that are not markdown.
 *
 * Two questions this covers, and they are the ones the predecessor answered
 * and Adestia did not: does a relative link written in a page reach the file
 * next to it, and can somebody see the documents a page carries without
 * opening a terminal.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Attachments, humanSize, referencedNames } from '../src/editor/Attachments.js'
import { Editor, type PageDocument } from '../src/editor/Editor.js'
import { carriesFiles, fileDropMessage } from '../src/editor/filedrop.js'
import { Reader, resolveHref } from '../src/editor/Reader.js'

const files = (list: unknown): typeof fetch =>
  (() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ files: list }),
    } as unknown as Response)) as unknown as typeof fetch

describe('resolveHref', () => {
  it('resolves a relative file against the page’s folder', () => {
    expect(resolveHref('assets/avant.jpg', 'diy/projets')).toEqual({
      kind: 'file',
      href: '/api/files/diy/projets/assets/avant.jpg',
    })
    expect(resolveHref('./devis.pdf', 'diy')).toEqual({
      kind: 'file',
      href: '/api/files/diy/devis.pdf',
    })
    expect(resolveHref('../plan.pdf', 'diy/projets')).toEqual({
      kind: 'file',
      href: '/api/files/diy/plan.pdf',
    })
  })

  it('calls a neighbouring page a page, so it opens in place', () => {
    expect(resolveHref('cuisine.md', 'diy')).toEqual({ kind: 'page', path: 'diy/cuisine.md' })
  })

  it('leaves alone anything that already knows where it points', () => {
    // Rewriting one of these would break the single case where somebody was
    // being explicit.
    expect(resolveHref('https://example.org/x.png', 'diy').kind).toBe('external')
    expect(resolveHref('/api/files/diy/x.png', 'diy')).toEqual({
      kind: 'external',
      href: '/api/files/diy/x.png',
    })
    expect(resolveHref('#section', 'diy').kind).toBe('external')
    expect(resolveHref('mailto:x@example.org', 'diy').kind).toBe('external')
  })

  it('never climbs out of the workspace', () => {
    expect(resolveHref('../../../etc/passwd', 'diy')).toEqual({
      kind: 'file',
      href: '/api/files/etc/passwd',
    })
  })
})

describe('the reader', () => {
  it('points a page’s image at the file route', () => {
    render(<Reader markdown={'![Avant](assets/avant.jpg)\n'} path="diy/garage.md" />)
    expect(screen.getByAltText('Avant').getAttribute('src')).toBe(
      '/api/files/diy/assets/avant.jpg',
    )
  })

  it('leaves a relative image as written when it renders outside any page', () => {
    // Resolving against the root would point it at a file that is not there,
    // which is a worse answer than the one the author wrote.
    render(<Reader markdown={'![Avant](avant.jpg)\n'} />)
    expect(screen.getByAltText('Avant').getAttribute('src')).toBe('avant.jpg')
  })

  it('resolves against the root for a page that lives there', () => {
    render(<Reader markdown={'![Avant](avant.jpg)\n'} path="notes.md" />)
    expect(screen.getByAltText('Avant').getAttribute('src')).toBe('/api/files/avant.jpg')
  })

  it('links a document next to the page', () => {
    render(<Reader markdown={'[Le devis](devis.pdf)\n'} path="diy/garage.md" />)
    expect(screen.getByText('Le devis').getAttribute('href')).toBe('/api/files/diy/devis.pdf')
  })
})

describe('referencedNames', () => {
  it('finds what the page already shows, however it spells it', () => {
    const names = referencedNames('![a](./assets/avant.jpg)\n[b](../plan.pdf)\n')
    expect([...names].sort()).toEqual(['avant.jpg', 'plan.pdf'])
  })

  it('ignores anything off-instance', () => {
    expect([...referencedNames('![a](https://example.org/avant.jpg)')]).toEqual([])
  })
})

describe('humanSize', () => {
  it('reads as a size somebody can judge', () => {
    expect(humanSize(412)).toBe('412 B')
    expect(humanSize(412_000)).toBe('412 kB')
    expect(humanSize(4_120_000)).toBe('4.1 MB')
  })
})

describe('<Attachments>', () => {
  const list = [
    { path: 'diy/plan.pdf', name: 'plan.pdf', bytes: 412_000, modified: '', kind: 'pdf' },
    { path: 'diy/assets/avant.jpg', name: 'avant.jpg', bytes: 90_000, modified: '', kind: 'image' },
  ]

  it('shows what the page carries', async () => {
    render(<Attachments path="diy/garage.md" markdown="# Garage" fetchImpl={files(list)} />)

    expect(await screen.findByText('plan.pdf')).toBeTruthy()
    expect(screen.getByAltText('avant.jpg').getAttribute('src')).toBe(
      '/api/files/diy/assets/avant.jpg',
    )
  })

  it('does not repeat a file the page already displays', async () => {
    render(
      <Attachments
        path="diy/garage.md"
        markdown={'![Avant](assets/avant.jpg)\n'}
        fetchImpl={files(list)}
      />,
    )

    expect(await screen.findByText('plan.pdf')).toBeTruthy()
    expect(screen.queryByAltText('avant.jpg')).toBeNull()
  })

  it('draws nothing at all when a page carries nothing', async () => {
    const { container } = render(
      <Attachments path="diy/garage.md" markdown="# Garage" fetchImpl={files([])} />,
    )
    await waitFor(() => expect(container.querySelector('.adestia-page-files')).toBeNull())
  })
})

describe('dropping a file on a page', () => {
  const page: PageDocument = {
    path: 'diy/garage.md',
    title: 'Rangement du garage',
    markdown: '# Rangement du garage\n',
    revision: '1000-12',
    editable: true,
    diagnostics: [],
  }

  const dropped = (name: string) => new File(['x'], name, { type: 'application/pdf' })
  const transfer = (list: readonly File[]) => ({ files: list, types: ['Files'] })

  it('tells a file drag from text dragged inside the page', () => {
    expect(carriesFiles({ types: ['Files'] })).toBe(true)
    expect(carriesFiles({ types: ['text/plain'] })).toBe(false)
    expect(carriesFiles(null)).toBe(false)
  })

  it('names the page both ways in what it composes', () => {
    // The title is what the person recognises before sending; the path is what
    // settles it for the agent when two pages are called "Notes".
    expect(fileDropMessage(page)).toBe(
      'File the attached files with the page “Rangement du garage” (diy/garage.md).',
    )
  })

  it('hands the file to the chat and pre-fills the request, unsent', async () => {
    const attach = vi.fn(async () => undefined)
    const compose = vi.fn()
    const { container } = render(
      <Editor page={page} fetchImpl={files([])} attach={attach} compose={compose} />,
    )

    const surface = container.querySelector('.adestia-editor')!
    const file = dropped('plan.pdf')
    await act(async () => {
      fireEvent.drop(surface, { dataTransfer: transfer([file]) })
    })

    expect(attach).toHaveBeenCalledWith([file])
    // Composed, never sent: "range-la mais renomme-la" is a thought somebody
    // has while the file is under the cursor.
    expect(compose).toHaveBeenCalledWith(
      'File the attached files with the page “Rangement du garage” (diy/garage.md).',
    )
  })

  it('shows the page is taking the drop, and only for files', () => {
    const { container } = render(
      <Editor page={page} fetchImpl={files([])} attach={vi.fn()} compose={vi.fn()} />,
    )
    const surface = container.querySelector('.adestia-editor')!

    fireEvent.dragEnter(surface, { dataTransfer: { types: ['text/plain'] } })
    expect(container.querySelector('.adestia-editor__dropzone')).toBeNull()

    fireEvent.dragEnter(surface, { dataTransfer: transfer([]) })
    expect(container.querySelector('.adestia-editor__dropzone')).toBeTruthy()

    fireEvent.dragLeave(surface)
    expect(container.querySelector('.adestia-editor__dropzone')).toBeNull()
  })

  it('does nothing at all where there is no chat to carry the file', async () => {
    // Accepting a drop nothing can deliver would be a file the person believes
    // the agent has.
    const { container } = render(<Editor page={page} fetchImpl={files([])} />)
    const surface = container.querySelector('.adestia-editor')!

    fireEvent.dragEnter(surface, { dataTransfer: transfer([]) })
    expect(container.querySelector('.adestia-editor__dropzone')).toBeNull()
  })
})
