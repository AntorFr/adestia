// @vitest-environment jsdom
/**
 * Task `adestia-decouverte-plugins-modele` (B-34, E-36, E-37, AD-37): a `template` creation opens E-36 on
 * its own template, with the Folder field from the home, from the exit criterion.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CreateEntry } from '../src/app/CreateEntry.js'
import { translator } from '../src/app/i18n.js'
import type { CreationPlace } from '../src/app/creations.js'

afterEach(cleanup)

const SEED = `---\ntemplate:\n  name: Brief\n  description: Line\ntype: note\n---\n\nBody\n`
const plugin = (id: string, label: string, template = 'seeds/brief.md', listed = false) =>
  ({
    id, kind: 'feature', base: `/plugins/${id}`, ...(listed ? { templates: [template] } : {}),
    creations: [{ id: 'brief', label, line: 'A brief', action: { template } }],
  }) as never

type Call = { url: string; method: string; body?: string }
function mount(opts: {
  place?: CreationPlace
  writable?: readonly string[]
  plugins?: readonly unknown[]
  pages?: any[]
  get?: () => Response
  put?: () => Response
  locale?: 'en' | 'fr'
}) {
  const calls: Call[] = []
  const fetchImpl = vi.fn(async (url: any, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    calls.push({ url: String(url), method, ...(init?.body ? { body: String(init.body) } : {}) })
    if (method === 'GET') return opts.get ? opts.get() : new Response(SEED, { status: 200 })
    return opts.put ? opts.put() : new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
  const openPage = vi.fn()
  const t = translator(opts.locale ?? 'en')
  render(
    <CreateEntry
      place={opts.place ?? { at: 'home' }}
      writableFolders={opts.writable ?? ['']}
      variant="plus"
      fetchImpl={fetchImpl}
      onCreated={() => undefined}
      plugins={(opts.plugins ?? [plugin('p', 'Brief')]) as never}
      pages={opts.pages ?? []}
      stores={[]}
      locale={opts.locale ?? 'en'}
      openPage={openPage}
      t={t}
    />,
  )
  return { calls, openPage }
}
const open = async (name = 'Brief') => {
  fireEvent.click(screen.getByRole('button', { name: t0('New…') }))
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(name) }))
}
const t0 = translator('en')
const options = (label = 'Folder') => within(screen.getByLabelText(label) as HTMLElement).getAllByRole('option').map((o) => o.textContent)
const title = (v: string) => fireEvent.change(screen.getByLabelText('Title'), { target: { value: v } })
const puts = (calls: Call[]) => calls.filter((c) => c.method === 'PUT')

describe('a template creation opens E-36 on its template', () => {
  it('from the home: Folder lists the root first, then writable folders by path, never a read-only one', async () => {
    mount({ writable: ['b', '', 'a/z', 'a'] })
    await open()
    await screen.findByText('Brief', { selector: '*' })
    const field = screen.getByLabelText('Folder') as HTMLSelectElement
    expect(field.tagName).toBe('SELECT')
    expect(field.className).toContain('adestia-select')
    expect(options()).toEqual(['Root', 'a', 'a/z', 'b'])
    expect(field.value).toBe('')
    expect(options()).not.toContain('ro')
  })

  it('without a writable root the list starts at the first writable folder, preselected', async () => {
    mount({ writable: ['z', 'm'] })
    await open()
    await screen.findByLabelText('Folder')
    expect(options()).toEqual(['m', 'z'])
    expect((screen.getByLabelText('Folder') as HTMLSelectElement).value).toBe('m')
  })

  it('reads the creation’s own file by the plugin route, listed in templates or not, without the gallery', async () => {
    for (const listed of [false, true]) {
      const { calls } = mount({ plugins: [plugin('p', 'Brief', 'seeds/brief.md', listed)] })
      await open()
      await screen.findByRole('radio', { name: /Brief/ })
      expect(calls.filter((c) => c.method === 'GET').map((c) => c.url)).toEqual(['/plugins/p/seeds/brief.md'])
      expect(screen.getAllByRole('radio')).toHaveLength(1)
      cleanup()
    }
  })

  it('creates the page in the chosen folder', async () => {
    const { calls, openPage } = mount({ writable: ['', 'a', 'b'] })
    await open()
    await screen.findByLabelText('Folder')
    fireEvent.change(screen.getByLabelText('Folder'), { target: { value: 'b' } })
    title('Hello')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(openPage).toHaveBeenCalled())
    expect(puts(calls)[0]!.url).toBe('/api/pages/b/hello.md')
    expect(openPage.mock.calls[0]![0]).toBe('b/hello.md')
  })

  it('creates at the root without a leading slash', async () => {
    const { calls } = mount({ writable: ['', 'a'] })
    await open()
    await screen.findByLabelText('Folder')
    title('Hello')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(puts(calls)).toHaveLength(1))
    expect(puts(calls)[0]!.url).toBe('/api/pages/hello.md')
  })

  it('from a folder: no Folder field, the page is created in that folder', async () => {
    const { calls } = mount({ place: { at: 'folder', folder: 'proj' }, writable: ['proj', 'other'] })
    await open()
    await screen.findByRole('radio', { name: /Brief/ })
    expect(screen.queryByLabelText('Folder')).toBeNull()
    title('Hello')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(puts(calls)).toHaveLength(1))
    expect(puts(calls)[0]!.url).toBe('/api/pages/proj/hello.md')
  })

  it('an unreadable template replaces the card by the sentence and leaves Create inert', async () => {
    const { calls } = mount({ get: () => new Response('no', { status: 404 }) })
    await open()
    await screen.findByText('This template cannot be read')
    title('Hello')
    const create = screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
    fireEvent.submit(create.closest('form')!)
    expect(puts(calls)).toHaveLength(0)
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('no writable folder known: no Folder field and Create is inert', async () => {
    // the home never offers it then; the sheet itself is still inert if it is reached
    const { TemplateSheet } = await import('../src/app/NewFromTemplate.js')
    const fetchImpl = vi.fn(async () => new Response(SEED, { status: 200 })) as unknown as typeof fetch
    render(
      <TemplateSheet creation writableFolders={undefined} sources={[{ id: 'p/s', url: '/plugins/p/s' }]} pages={[]} stores={[]}
        fetchImpl={fetchImpl} locale="en" openPage={vi.fn()} t={(k) => k} onClose={() => undefined} />,
    )
    await screen.findByRole('radio')
    expect(screen.queryByLabelText('Folder')).toBeNull()
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Hello' } })
    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('“name taken” names the chosen folder, and follows a change of folder', async () => {
    const { calls } = mount({
      writable: ['', 'a'],
      pages: [{ path: 'a/hello.md', title: 'x', fields: {} }],
    })
    await open()
    await screen.findByLabelText('Folder')
    fireEvent.change(screen.getByLabelText('Folder'), { target: { value: 'a' } })
    title('Hello')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await screen.findByText(/already exists in a\./)
    expect(puts(calls)).toHaveLength(0)
    // the same title in the root is free
    fireEvent.change(screen.getByLabelText('Folder'), { target: { value: '' } })
    expect(screen.queryByText(/already exists/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(puts(calls)).toHaveLength(1))
  })

  it('“name taken” on the root names it « Root »', async () => {
    mount({ writable: [''], pages: [{ path: 'hello.md', title: 'x', fields: {} }] })
    await open()
    await screen.findByLabelText('Folder')
    title('Hello')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await screen.findByText(/already exists in Root\./)
  })

  it('“write refused” names the chosen folder', async () => {
    mount({ writable: ['', 'a'], put: () => new Response('{}', { status: 403 }) })
    await open()
    await screen.findByLabelText('Folder')
    fireEvent.change(screen.getByLabelText('Folder'), { target: { value: 'a' } })
    title('Hello')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await screen.findByText('The page could not be written in a. Try again.')
  })

  it('in French: Racine, Dossier, and the three sentences', async () => {
    mount({ writable: ['', 'a'], locale: 'fr', put: () => new Response('{}', { status: 403 }),
      pages: [{ path: 'hello.md', title: 'x', fields: {} }] })
    fireEvent.click(screen.getByRole('button', { name: translator('fr')('New…') }))
    fireEvent.click(await screen.findByRole('button', { name: /Brief/ }))
    await screen.findByLabelText('Dossier')
    expect(options('Dossier')).toEqual(['Racine', 'a'])
    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))
    await screen.findByText(/existe déjà dans Racine/)
  })
})

describe('E-37: the plugin’s name when two entries share a label', () => {
  it('captions both, and not a lone entry', async () => {
    mount({ plugins: [plugin('alpha', 'Brief'), plugin('beta', 'Brief')] })
    fireEvent.click(screen.getByRole('button', { name: 'New…' }))
    await screen.findByText('alpha')
    expect(screen.getByText('beta')).toBeTruthy()
    cleanup()
    mount({ plugins: [plugin('alpha', 'Brief')] })
    fireEvent.click(screen.getByRole('button', { name: 'New…' }))
    await screen.findByRole('button', { name: /Brief/ })
    expect(screen.queryByText('alpha')).toBeNull()
  })
})
