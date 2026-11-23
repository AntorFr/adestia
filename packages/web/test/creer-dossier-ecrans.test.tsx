// @vitest-environment jsdom
/**
 * Task `adestia-decouverte-creer-dossier-ecrans` (B-32, B-33, E-2, E-3, E-37), from its exit
 * criterion: the + beside Ask, New folder end to end (slug, refusal, tile, empty folder with
 * its own +), the empty home and empty folder with entries as buttons, read-only folders.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { App } from '../src/app/App.js'

const INSTANCE = {
  driver: { label: 'Test CLI', cliVersion: '1.0', capabilities: [] },
  auth: { mode: 'none' },
  user: { userId: 'local', displayName: 'Local user' },
  skin: 'default',
  plugins: [],
  pluginProblems: [],
  turns: { max: 3, running: 0 },
}

interface World {
  entries: unknown[]
  folders: string[]
  writable: string[]
  posts: string[]
}

/** A tiny stateful server: POST /api/folders adds to `folders`, 409 on a repeat. */
function api(locale: string, world: World): typeof fetch {
  const json = (body: unknown, status = 200) =>
    Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as unknown as Response)
  return ((url: string, init?: RequestInit) => {
    const path = String(url)
    if (path.startsWith('/api/instance')) return json({ ...INSTANCE, locale })
    if (path.startsWith('/api/pages/index'))
      return json({ entries: world.entries, stores: [], writableFolders: world.writable, folders: world.folders })
    if (path === '/api/folders' && init?.method === 'POST') {
      const sent = JSON.parse(String(init.body)).path as string
      world.posts.push(sent)
      if (world.folders.includes(sent)) return json({ error: 'exists' }, 409)
      world.folders.push(sent)
      world.writable.push(sent)
      return json({ path: sent }, 201)
    }
    return json({ entries: [], conversations: [] })
  }) as unknown as typeof fetch
}

const world = (over: Partial<World> = {}): World => ({
  entries: [],
  folders: [],
  writable: [''],
  posts: [],
  ...over,
})

const dialog = async () => screen.findByRole('dialog')
/** The New folder row of the open list (the empty places draw the same button behind it). */
const inList = async () => within(await dialog()).getByRole('button', { name: /New folder/ })

afterEach(() => {
  cleanup()
  location.hash = ''
})

describe('the + and New folder, end to end', () => {
  it('+ opens the list with New folder and its line; Notes creates `notes`, an empty folder with its own +; the home then tiles it; Notes again is refused', async () => {
    const w = world()
    const { container } = render(<App fetchImpl={api('en', w)} />)
    const plus = await screen.findAllByRole('button', { name: 'New…' })
    // Beside Ask, in the same row.
    const ask = container.querySelector('.adestia-home__ask')!
    expect(ask.parentElement!.contains(plus[0]!)).toBe(true)

    fireEvent.click(plus[0]!)
    expect(within(await dialog()).getByText('An empty folder to group pages.')).toBeTruthy()
    fireEvent.click(await inList())

    const input = await screen.findByLabelText('Folder name')
    fireEvent.change(input, { target: { value: 'Notes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(w.posts).toEqual(['notes']))

    // It opens as an empty folder, which has its own + and the entry as a button.
    await waitFor(() => expect(location.hash).toContain('notes'))
    await screen.findByText('This section holds nothing yet.')
    expect(screen.getAllByRole('button', { name: 'New…' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /New folder/ }).length).toBeGreaterThan(0)

    // Back home: a tile.
    location.hash = '#/'
    await waitFor(() => expect(container.querySelector('.adestia-home')).toBeTruthy())
    await waitFor(() => expect(container.querySelector('.adestia-tiles')?.textContent).toMatch(/notes/i))

    // Again: refused under the field, sheet stays.
    fireEvent.click(screen.getAllByRole('button', { name: 'New…' })[0]!)
    fireEvent.click(await inList())
    fireEvent.change(await screen.findByLabelText('Folder name'), { target: { value: 'Notes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await screen.findByText('name already taken')
    expect(screen.getByLabelText('Folder name')).toBeTruthy()
  })

  it('a name that slugOf reduces to nothing leaves Create disabled and sends nothing', async () => {
    const w = world()
    render(<App fetchImpl={api('en', w)} />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'New…' }))[0]!)
    fireEvent.click(await inList())
    fireEvent.change(await screen.findByLabelText('Folder name'), { target: { value: '---' } })
    const create = screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
    fireEvent.submit(document.getElementById('adestia-nameprompt')!)
    expect(w.posts).toEqual([])
  })

  it('a sub-folder is made from a folder: the path carries the parent', async () => {
    const w = world({ folders: ['notes'], writable: ['', 'notes'] })
    location.hash = '#/section/notes'
    render(<App fetchImpl={api('en', w)} />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'New…' }))[0]!)
    fireEvent.click(await inList())
    fireEvent.change(await screen.findByLabelText('Folder name'), { target: { value: 'Ideas Box' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(w.posts).toEqual(['notes/ideas-box']))
  })

  it('a server failure shows the failure under the field', async () => {
    const w = world()
    const base = api('en', w)
    const failing = ((url: string, init?: RequestInit) =>
      String(url) === '/api/folders'
        ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as unknown as Response)
        : base(url, init)) as typeof fetch
    render(<App fetchImpl={failing} />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'New…' }))[0]!)
    fireEvent.click(await inList())
    fireEvent.change(await screen.findByLabelText('Folder name'), { target: { value: 'Notes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await screen.findByText('Could not write the name. Try again.')
  })
})

describe('the + with tiles, the empty home, read-only folders', () => {
  it('the + is there when the home has tiles', async () => {
    const w = world({ entries: [{ path: 'diy/a.md', title: 'a', fields: {} }], folders: ['diy'] })
    render(<App fetchImpl={api('en', w)} />)
    expect((await screen.findAllByRole('button', { name: 'New…' })).length).toBeGreaterThan(0)
  })

  it.each([
    ['en', 'Nothing to show yet.', 'New folder', 'New…', 'or turn a plugin on in', 'Settings'],
    ['fr', 'Rien à afficher pour l’instant.', 'Nouveau dossier', 'Nouveau…', 'ou activez un plugin dans les', 'Réglages'],
  ])('%s: the empty home keeps its text, shows New folder as a button and links Settings to the Plugins page', async (locale, nothing, label, plusName, hint, settings) => {
    const w = world()
    const { container } = render(<App fetchImpl={api(locale, w)} />)
    await screen.findAllByRole('button', { name: plusName })
    await waitFor(() => expect(container.querySelector('.adestia-empty')).toBeTruthy())
    const empty = container.querySelector('.adestia-empty') as HTMLElement
    expect(empty.textContent).toContain(nothing)
    expect(within(empty).getByRole('button', { name: new RegExp(label) })).toBeTruthy()
    expect(empty.textContent).toContain(hint)
    const link = within(empty).getByRole('link', { name: settings })
    expect(link.getAttribute('href')).toBe('#/settings/plugins')
    // Charter: no browser-default blue; the link carries the class the stylesheet colours.
    expect(link.classList.contains('adestia-empty__link')).toBe(true)
    const css = readFileSync(resolve(__dirname, '../src/app/styles/tiles.css'), 'utf8')
    expect(css).toMatch(/\.adestia-empty__link\s*\{[^}]*color:\s*var\(--accent-text\)/)
    expect(empty.querySelector('code')).toBeNull()
    expect(empty.textContent).not.toContain('adestia.config.yaml')
  })

  it('a read-only root keeps the configuration hint, with no button and no Settings line', async () => {
    const w = world({ writable: [] })
    const { container } = render(<App fetchImpl={api('en', w)} />)
    await waitFor(() => expect(container.querySelector('.adestia-empty code')?.textContent).toBe('adestia.config.yaml'))
    const empty = container.querySelector('.adestia-empty') as HTMLElement
    expect(within(empty).queryByRole('button', { name: /New folder/ })).toBeNull()
    expect(empty.textContent).not.toContain('or turn a plugin on in')
  })

  it('a read-only folder draws neither the + nor New folder, empty or not', async () => {
    const w = world({ entries: [{ path: 'ro/a.md', title: 'a', fields: {} }], folders: ['ro', 'ro-empty'], writable: [''] })
    location.hash = '#/section/ro'
    const { container } = render(<App fetchImpl={api('en', w)} />)
    await waitFor(() => expect(container.querySelector('.adestia-chead')).toBeTruthy())
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull())
    expect(screen.queryByRole('button', { name: 'New…' })).toBeNull()
    expect(screen.queryByRole('button', { name: /New folder/ })).toBeNull()
    // The home's + (the root is writable) does not leak into the folder.
    location.hash = '#/section/ro-empty'
    await screen.findByText('This section holds nothing yet.')
    expect(screen.queryByRole('button', { name: 'New…' })).toBeNull()
    expect(screen.queryByRole('button', { name: /New folder/ })).toBeNull()
  })
})
