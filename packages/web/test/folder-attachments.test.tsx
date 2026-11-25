// @vitest-environment jsdom
/**
 * The Attachments brick of a folder (B-38, E-3): what it draws from
 * GET /api/files?folder=, and when it is absent.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { translator } from '../src/app/i18n.js'
import { Section } from '../src/app/Section.js'

afterEach(cleanup)

const file = (name: string, kind = 'image', bytes = 2048) => ({
  path: `voyage/${name}`,
  name,
  kind,
  bytes,
})

const answer = (files: readonly unknown[]) =>
  vi.fn(async () => new Response(JSON.stringify({ files }), { status: 200 })) as unknown as typeof fetch

const entries = [
  { path: 'voyage/INDEX.md', title: 'Voyage', fields: { title: 'Voyage' } },
  { path: 'voyage/plan.md', title: 'plan', fields: {} },
]

const props = { path: 'voyage', title: 'Voyage', entries, openSection: () => {}, openPage: () => {} }

describe('the folder Attachments brick', () => {
  it('lists the three files under a title carrying 3, after the pages', async () => {
    const fetchImpl = answer([file('a.pdf', 'pdf'), file('b.jpg'), file('c.jpg')])
    const { container } = render(<Section {...props} fetchImpl={fetchImpl} />)
    await screen.findByText('b.jpg')
    expect(fetchImpl).toHaveBeenCalledWith('/api/files?folder=voyage', undefined)
    const heads = [...container.querySelectorAll('.adestia-section')].map((h) => h.textContent)
    expect(heads).toEqual(['Pages', 'Attachments 3'])
    expect(container.querySelectorAll('.adestia-folder-files li')).toHaveLength(3)
    expect(screen.getByText('a.pdf').closest('a')?.getAttribute('href')).toBe('/api/files/voyage/a.pdf')
    expect(screen.queryByText(/Show all/)).toBeNull()
  })

  it('opens a file in a tab like a page does', async () => {
    render(<Section {...props} fetchImpl={answer([file('a.pdf', 'pdf')])} />)
    const link = (await screen.findByText('a.pdf')).closest('a')!
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('draws nothing when the folder has no listable file', async () => {
    const fetchImpl = answer([])
    const { container } = render(<Section {...props} fetchImpl={fetchImpl} />)
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled())
    await waitFor(() => expect(container.querySelector('.adestia-loading')).toBeNull())
    expect(container.querySelector('.adestia-folder-files')).toBeNull()
    expect(container.textContent).not.toContain('Attachments')
    expect(container.querySelector('.adestia-card')).not.toBeNull()
  })

  it.each([
    ['a 500', async () => new Response('{"error":"boom"}', { status: 500 })],
    ['a network error', async () => Promise.reject(new Error('down'))],
    ['a body that is not JSON', async () => new Response('<html>', { status: 200 })],
  ])('is absent, without message, when the read fails (%s)', async (_name, impl) => {
    const fetchImpl = vi.fn(impl) as unknown as typeof fetch
    const { container } = render(<Section {...props} fetchImpl={fetchImpl} />)
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled())
    await waitFor(() => expect(container.querySelector('.adestia-loading')).toBeNull())
    expect(container.querySelector('.adestia-folder-files')).toBeNull()
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.textContent).not.toMatch(/boom|down|failed/)
    expect(container.textContent).toContain('plan')
  })

  it('is never asked for when the folder says attachments: false', async () => {
    const fetchImpl = answer([file('a.pdf', 'pdf')])
    const { container } = render(
      <Section {...props} fetchImpl={fetchImpl} folderSettings={{ voyage: { attachments: false } }} />,
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(container.querySelector('.adestia-folder-files')).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('shows the brick when attachments is true or unset', async () => {
    render(
      <Section {...props} fetchImpl={answer([file('a.pdf', 'pdf')])} folderSettings={{ voyage: { attachments: true } }} />,
    )
    await screen.findByText('a.pdf')
  })

  it('shows twelve rows then “Show all 13”, which reveals the thirteenth', async () => {
    const many = Array.from({ length: 13 }, (_, i) => file(`p${String(i).padStart(2, '0')}.jpg`))
    const { container } = render(<Section {...props} fetchImpl={answer(many)} />)
    await screen.findByText('p00.jpg')
    expect(container.querySelectorAll('.adestia-folder-files li')).toHaveLength(12)
    expect(container.querySelector('.adestia-folder-files h2')?.textContent).toBe('Attachments 13')
    fireEvent.click(screen.getByRole('button', { name: 'Show all 13' }))
    expect(container.querySelectorAll('.adestia-folder-files li')).toHaveLength(13)
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
  })

  it('shows exactly twelve files without a Show all button', async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => file(`p${i}.jpg`))
    const { container } = render(<Section {...props} fetchImpl={answer(twelve)} />)
    await screen.findByText('p0.jpg')
    expect(container.querySelectorAll('.adestia-folder-files li')).toHaveLength(12)
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
  })

  it('does not count files in the Inside tiles or the pages', async () => {
    const withRoom = [
      ...entries,
      { path: 'voyage/etape/INDEX.md', title: 'Étape', fields: { title: 'Étape' } },
      { path: 'voyage/etape/x.md', title: 'x', fields: {} },
    ]
    const { container } = render(
      <Section {...props} entries={withRoom} fetchImpl={answer([file('a.pdf', 'pdf'), file('b.jpg')])} />,
    )
    await screen.findByText('a.pdf')
    const inside = container.querySelector('.adestia-section + *')?.textContent ?? ''
    expect(inside).not.toMatch(/\b2\b/)
  })

  it('writes its title and button in French', async () => {
    const many = Array.from({ length: 13 }, (_, i) => file(`p${i}.jpg`))
    const t = translator('fr')
    render(<Section {...props} t={t} fetchImpl={answer(many)} />)
    await screen.findByText('p0.jpg')
    expect(screen.getByText('Pièces jointes')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tout afficher (13)' })).toBeTruthy()
  })

  it('does not ask before the index is ready', async () => {
    const fetchImpl = answer([file('a.pdf', 'pdf')])
    render(<Section {...props} ready={false} fetchImpl={fetchImpl} />)
    await new Promise((r) => setTimeout(r, 20))
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('keeps the empty state of an empty folder while the brick asks (no wait row)', async () => {
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    const fetchImpl = vi.fn(async () => {
      await held
      return new Response('{"files":[]}', { status: 200 })
    }) as unknown as typeof fetch
    const { container } = render(<Section {...props} entries={[]} fetchImpl={fetchImpl} />)
    expect(container.querySelector('.adestia-loading')).toBeNull()
    release()
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled())
  })

  it('shows the shell’s wait row while a full folder’s brick asks', async () => {
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    const fetchImpl = vi.fn(async () => {
      await held
      return new Response('{"files":[]}', { status: 200 })
    }) as unknown as typeof fetch
    const { container } = render(<Section {...props} fetchImpl={fetchImpl} />)
    expect(container.querySelector('.adestia-loading')).not.toBeNull()
    release()
    await waitFor(() => expect(container.querySelector('.adestia-loading')).toBeNull())
  })
})
