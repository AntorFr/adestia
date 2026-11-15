// @vitest-environment jsdom
/**
 * Task `adestia-pages-etat-projet-feuille` (B-30, E-36, AD-36), from its exit criterion:
 * the file name drawn from the title, the page the seed becomes, the stores tried in order,
 * and the sheet's refusals (taken by the index, taken by a 409, no useful character, refused write).
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NewFromTemplate } from '../src/app/NewFromTemplate.js'
import { pageFrom, slugOf, storeOrder, templateSources } from '../src/app/templates.js'

afterEach(cleanup)

const SEED = `---
template:
  name: {en: Test status, fr: Statut}
  description: Line
type: project-management
title: Seed title
---

Body
`

describe('slugOf', () => {
  it.each([
    ['Project status', 'project-status'],
    ['  Été   à Lisbonne !! ', 'ete-a-lisbonne'],
    ['---', ''],
    ['😀 ✓', ''],
    ['a/b\\c..d', 'a-b-c-d'],
    ['', ''],
  ])('%j -> %j', (title, slug) => expect(slugOf(title)).toBe(slug))
  it('cuts at 80 characters without a trailing dash', () => {
    const slug = slugOf(`${'a'.repeat(79)} b`)
    expect(slug).toBe('a'.repeat(79))
    expect(slugOf('a'.repeat(200))).toHaveLength(80)
  })
})

describe('pageFrom', () => {
  it('drops template:, sets the trimmed title, keeps the rest', () => {
    const page = pageFrom(SEED, '  My page ')
    expect(page).not.toMatch(/template:/)
    expect(page).not.toMatch(/Test status/)
    expect(page).toMatch(/title: My page\n/)
    expect(page).not.toMatch(/Seed title/)
    expect(page).toMatch(/type: project-management/)
    expect(page).toMatch(/\nBody\n/)
  })
  it('adds a title to a seed that has none', () => {
    expect(pageFrom('---\ntemplate: {name: X}\n---\nB\n', 'T')).toMatch(/title: T/)
  })
})

describe('storeOrder', () => {
  const stores = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B', default: true },
    { id: 'c', label: 'C' },
  ]
  const pages = [
    { path: 'f/x.md', title: 'x', fields: {}, store: 'a' },
    { path: 'f/y.md', title: 'y', fields: {}, store: 'b' },
    { path: 'f/z.md', title: 'z', fields: {}, store: 'c' },
    { path: 'g/z.md', title: 'z', fields: {}, store: 'c' },
  ]
  it('puts the default first, then the declared order, only stores holding the folder', () => {
    expect(storeOrder('f', pages, stores)).toEqual(['b', 'a', 'c'])
    expect(storeOrder('g', pages, stores)).toEqual(['c'])
  })
  it('is empty on a one-store instance and for a folder nobody shows', () => {
    expect(storeOrder('f', pages, stores.slice(0, 1))).toEqual([])
    expect(storeOrder('nope', pages, stores)).toEqual([])
  })
  it('does not match a folder by prefix of its name', () => {
    expect(storeOrder('f', [{ path: 'fo/x.md', title: '', fields: {}, store: 'a' }], stores)).toEqual([])
  })
})

describe('templateSources', () => {
  it('lists the loaded plugins seeds, none for a plugin without the key', () => {
    const s = templateSources([
      { id: 'pm', base: '/plugins/pm', templates: ['templates/a.md'] },
      { id: 'other', base: '/plugins/other/' },
    ] as never)
    expect(s.map((x) => [x.id, x.url])).toEqual([['pm/templates/a.md', '/plugins/pm/templates/a.md']])
  })
})

type Call = { url: string; method: string; body?: string }
function harness(answers: (call: Call) => { status: number; body?: unknown }, pages: any[] = [], stores: any[] = []) {
  const calls: Call[] = []
  const fetchImpl = vi.fn(async (url: any, init?: RequestInit) => {
    const call = { url: String(url), method: init?.method ?? 'GET', ...(init?.body ? { body: String(init.body) } : {}) }
    calls.push(call)
    if (call.method === 'GET') return new Response(SEED, { status: 200 })
    const { status, body } = answers(call)
    return new Response(JSON.stringify(body ?? {}), { status, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
  const openPage = vi.fn()
  render(
    <NewFromTemplate
      folder="projets"
      sources={[{ id: 'pm/templates/s.md', url: '/plugins/pm/templates/s.md' }]}
      pages={pages}
      stores={stores}
      fetchImpl={fetchImpl}
      locale="en"
      openPage={openPage}
      t={(k) => k}
    />,
  )
  return { calls, openPage }
}
async function openSheet(title: string) {
  fireEvent.click(screen.getByRole('button', { name: 'New from template' }))
  await screen.findByRole('radio', { name: /Test status/ })
  const input = screen.getByLabelText('Title') as HTMLInputElement
  fireEvent.change(input, { target: { value: title } })
  return input
}
const puts = (calls: Call[]) => calls.filter((c) => c.method === 'PUT')

describe('the sheet', () => {
  it('chooses the first card, creates the page without revision and opens it', async () => {
    const { calls, openPage } = harness(() => ({ status: 200, body: {} }))
    await openSheet('My Project')
    expect(screen.getByRole('radio', { name: /Test status/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(openPage).toHaveBeenCalledWith('projets/my-project.md', undefined))
    expect(puts(calls)).toHaveLength(1)
    expect(puts(calls)[0]!.url).toBe('/api/pages/projets/my-project.md')
    const sent = JSON.parse(puts(calls)[0]!.body!)
    expect(Object.keys(sent)).toEqual(['markdown'])
    expect(sent.markdown).not.toMatch(/template:/)
    expect(sent.markdown).toMatch(/title: My Project/)
  })

  it('refuses a title the index already holds, under the field, writing nothing', async () => {
    const { calls, openPage } = harness(() => ({ status: 200 }), [{ path: 'projets/my-project.md', title: 'x', fields: {} }])
    await openSheet('My Project')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await screen.findByText(/already exists here/)
    expect(puts(calls)).toHaveLength(0)
    expect(openPage).not.toHaveBeenCalled()
  })

  it('refuses on a 409 when the index was stale, keeps the sheet and the title', async () => {
    const { calls, openPage } = harness(() => ({ status: 409, body: { error: 'exists' } }))
    const input = await openSheet('My Project')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await screen.findByText(/already exists here/)
    expect(puts(calls)).toHaveLength(1)
    expect(openPage).not.toHaveBeenCalled()
    expect(input.value).toBe('My Project')
  })

  it('refuses a title with no useful character: Create is off, the sentence is under the field, nothing is written', async () => {
    const { calls } = harness(() => ({ status: 200 }))
    await openSheet('!!! ---')
    expect(screen.getByText(/at least one letter or digit/)).toBeTruthy()
    const create = screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
    fireEvent.submit(create.closest('form')!)
    await new Promise((r) => setTimeout(r, 20))
    expect(puts(calls)).toHaveLength(0)
  })

  it('keeps the sheet, the title and says the write failed on a refused write', async () => {
    const { openPage } = harness(() => ({ status: 403, body: { error: 'read only' } }))
    const input = await openSheet('My Project')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await screen.findByRole('alert')
    expect(screen.getByText('The page could not be written. Try again.')).toBeTruthy()
    expect(input.value).toBe('My Project')
    expect(openPage).not.toHaveBeenCalled()
  })

  it('tries the default store first, then the next holder when it refuses, and opens in the one that accepted', async () => {
    const stores = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', default: true }]
    const pages = [
      { path: 'projets/x.md', title: '', fields: {}, store: 'a' },
      { path: 'projets/y.md', title: '', fields: {}, store: 'b' },
    ]
    const { calls, openPage } = harness((c) => (c.url.includes('store=b') ? { status: 403 } : { status: 200 }), pages, stores)
    await openSheet('New one')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(openPage).toHaveBeenCalledWith('projets/new-one.md', 'a'))
    expect(puts(calls).map((c) => c.url)).toEqual(['/api/pages/projets/new-one.md?store=b', '/api/pages/projets/new-one.md?store=a'])
  })

  it('Escape closes the sheet without writing', async () => {
    const { calls } = harness(() => ({ status: 200 }))
    await openSheet('abc')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(puts(calls)).toHaveLength(0)
  })

  it('Enter in the title creates the page', async () => {
    const { openPage } = harness(() => ({ status: 200 }))
    const input = await openSheet('Enter me')
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(openPage).toHaveBeenCalledWith('projets/enter-me.md', undefined))
  })

  it('draws no button without a seed', () => {
    render(<NewFromTemplate folder="p" sources={[]} pages={[]} stores={[]} fetchImpl={fetch} locale="en" openPage={() => undefined} t={(k) => k} />)
    expect(screen.queryByRole('button', { name: 'New from template' })).toBeNull()
  })
})
