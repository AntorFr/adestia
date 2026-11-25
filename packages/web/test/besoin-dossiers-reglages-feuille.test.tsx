// @vitest-environment jsdom
/**
 * B-39, B-40, P-23, E-39 (folder settings sheet, opened from the E-3 header): the states the
 * criterion lists. Expectations are written by hand from the task's criterion, not from the code.
 *
 *   - the button is drawn only where the folder is writable
 *   - saving: Save disabled while the write is in flight; the body carries the six keys and the revision read
 *   - refused write: error line inside the sheet, sheet still open
 *   - revision conflict (409): the phrase and a Reload button; Reload reads the index again
 *   - folder without page: the choice is disabled and a sentence says why
 *   - Escape and Cancel write nothing
 *   - the three header buttons of E-3 keep their name as the accessible name (icon-only under 820 px by CSS)
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  locale: 'en',
}

const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as unknown as Response)

interface Setup {
  writable?: string[]
  entries?: unknown[]
  settings?: Record<string, unknown>
  put: (body: any) => Promise<Response>
  puts: any[]
  indexReads: { n: number }
}

function api(s: Setup): typeof fetch {
  return ((url: string, init?: RequestInit) => {
    const path = String(url)
    if (path.startsWith('/api/instance')) return json(INSTANCE)
    if (path.startsWith('/api/pages/index')) {
      s.indexReads.n++
      return json({
        entries: s.entries ?? [],
        stores: [],
        writableFolders: s.writable ?? ['', 'a'],
        folders: ['a'],
        folderSettings: s.settings ?? {},
      })
    }
    if (path === '/api/folders/settings' && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body))
      s.puts.push(body)
      return s.put(body)
    }
    return json({ entries: [], conversations: [] })
  }) as unknown as typeof fetch
}

const setup = (over: Partial<Setup> = {}): Setup => ({
  put: () => json({ revision: 'r2' }),
  puts: [],
  indexReads: { n: 0 },
  entries: [{ path: 'a/one.md', title: 'One', fields: {} }, { path: 'a/two.md', title: 'Two', fields: {} }],
  ...over,
})

afterEach(() => {
  cleanup()
  location.hash = ''
})

async function open(s: Setup) {
  // `?classic`: the classic view, whatever page the settings choose (B-40)
  location.hash = '#/section/a?classic'
  render(<App fetchImpl={api(s)} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Folder settings' }))
  return screen.findByRole('dialog')
}
const save = () => screen.getByRole('button', { name: /^Sav(e|ing…)$/ }) as HTMLButtonElement

describe('E-3 header and the E-39 sheet', () => {
  it('draws Folder settings only where the folder is writable', async () => {
    // red if the button is drawn for a read-only folder
    location.hash = '#/section/a'
    render(<App fetchImpl={api(setup({ writable: [''] }))} />)
    await screen.findByText('One')
    expect(screen.queryByRole('button', { name: 'Folder settings' })).toBeNull()
  })

  it('draws it where the folder is writable, beside Rename, each named', async () => {
    location.hash = '#/section/a'
    render(<App fetchImpl={api(setup())} />)
    await screen.findByRole('button', { name: 'Folder settings' })
    expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy()
    // under 820 px the word is hidden by CSS: the name must remain on the button, not only in the word
    expect(screen.getByRole('button', { name: 'Folder settings' }).getAttribute('aria-label')).toBe('Folder settings')
  })

  it('Save writes the six keys with the revision read, disables itself while writing, then closes', async () => {
    // red if the body drops the revision or a key, or Save stays enabled during the write
    let release!: () => void
    const held = new Promise<void>((r) => { release = r })
    const s = setup({
      settings: { a: { title: 'Old', ico: 'plus', couleur: 'bleu', revision: 'r1' } },
      put: async () => { await held; return json({ revision: 'r2' }) },
    })
    const dialog = await open(s)
    expect((screen.getByLabelText('Name shown') as HTMLInputElement).value).toBe('Old')
    fireEvent.change(screen.getByLabelText('Name shown'), { target: { value: 'Garage' } })
    fireEvent.click(screen.getByRole('switch', { name: 'Show attachments' }))
    fireEvent.change(screen.getByLabelText('Replacement page'), { target: { value: 'two.md' } })
    fireEvent.click(save())
    await waitFor(() => expect(s.puts).toHaveLength(1))
    expect(save().disabled).toBe(true)
    release()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(s.puts[0]).toEqual({
      path: 'a',
      settings: { title: 'Garage', ico: 'plus', couleur: 'bleu', attachments: false, page: 'two.md' },
      revision: 'r1',
    })
    expect(dialog.isConnected).toBe(false)
    expect(s.indexReads.n).toBeGreaterThan(1)
  })

  it('a refused write shows an error line in the sheet, which stays open and can retry', async () => {
    // red if the sheet closes on failure or the error is not shown
    const s = setup({ put: () => json({ error: 'nope' }, 500) })
    await open(s)
    fireEvent.click(save())
    await screen.findByText('The settings could not be written. Try again.')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(save().disabled).toBe(false)
  })

  it('403 says the folder can no longer be changed and keeps Save off', async () => {
    const s = setup({ put: () => json({}, 403) })
    await open(s)
    fireEvent.click(save())
    await screen.findByText('You can no longer change this folder.')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(save().disabled).toBe(true)
  })

  it('a revision conflict says the settings changed, and Reload reads the index again', async () => {
    // red if the phrase is missing, or Reload does not read the index nor re-seed the form from it
    const s = setup({ settings: { a: { title: 'Old', revision: 'r1' } }, put: () => json({ error: 'stale' }, 409) })
    await open(s)
    fireEvent.click(save())
    await screen.findByText(/The folder settings changed\./)
    const before = s.indexReads.n
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(s.indexReads.n).toBeGreaterThan(before))
    await waitFor(() => expect(screen.queryByText(/The folder settings changed\./)).toBeNull())
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(save().disabled).toBe(false)
  })

  it('a folder without page disables the choice and says so', async () => {
    // red if the select stays usable on an empty folder
    await open(setup({ entries: [] }))
    expect((screen.getByLabelText('Replacement page') as HTMLSelectElement).disabled).toBe(true)
    expect(screen.getByText('This folder holds no page yet.')).toBeTruthy()
  })

  it('a page pointing at a missing file is shown as missing and selected, not an error screen', async () => {
    await open(setup({ settings: { a: { page: 'gone.md', revision: 'r1' } } }))
    const select = screen.getByLabelText('Replacement page') as HTMLSelectElement
    expect(select.value).toBe('gone.md')
    expect(select.selectedOptions[0]!.textContent).toContain('(missing)')
  })

  it('offers the classic view as the empty choice, and saving it writes no page key', async () => {
    const s = setup({ settings: { a: { page: 'one.md', revision: 'r1' } } })
    await open(s)
    fireEvent.change(screen.getByLabelText('Replacement page'), { target: { value: '' } })
    fireEvent.click(save())
    await waitFor(() => expect(s.puts).toHaveLength(1))
    expect(s.puts[0].settings).toEqual({})
  })

  it('the app: line is read-only and goes back as it was read', async () => {
    const s = setup({ settings: { a: { app: 'project-management', revision: 'r1' } } })
    await open(s)
    expect(screen.getByText('Opens as the project-management screen')).toBeTruthy()
    fireEvent.click(save())
    await waitFor(() => expect(s.puts).toHaveLength(1))
    expect(s.puts[0].settings).toEqual({ app: 'project-management' })
  })

  it('Escape closes the sheet and writes nothing', async () => {
    const s = setup()
    await open(s)
    fireEvent.change(screen.getByLabelText('Name shown'), { target: { value: 'X' } })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(s.puts).toHaveLength(0)
  })

  it('Cancel closes the sheet and writes nothing, and a reopening starts from the stored values', async () => {
    const s = setup()
    await open(s)
    fireEvent.change(screen.getByLabelText('Name shown'), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(s.puts).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Folder settings' }))
    expect((await screen.findByLabelText('Name shown') as HTMLInputElement).value).toBe('')
  })
})

describe('E-3 header under 820 px', () => {
  it('the three header buttons share the fold class, whose word is hidden at 820 px, and keep an accessible name', async () => {
    // red if one of the three keeps its word at phone width, or loses its name
    const css = (await import('node:fs')).readFileSync(`${process.cwd()}/packages/web/src/app/styles/components.css`, 'utf8')
    expect(css).toMatch(/@media \(max-width: 820px\)\s*\{[^}]*\.adestia-btn--fold \.adestia-btn__word\s*\{\s*display:\s*none/)
    location.hash = '#/section/a?classic'
    render(<App fetchImpl={api(setup({ entries: [{ path: 'a/one.md', title: 'One', fields: {} }] }))} />)
    await screen.findByRole('button', { name: 'Folder settings' })
    for (const name of ['Folder settings', 'Rename']) {
      const button = screen.getByRole('button', { name })
      expect(button.classList.contains('adestia-btn--fold'), name).toBe(true)
      expect(button.querySelector('.adestia-btn__word')?.textContent, name).toBe(name)
    }
  })
})

describe('E-3 header, New from template (needs a template source, which jsdom does not seed)', () => {
  it('uses the same fold class as the two other buttons', async () => {
    const source = (await import('node:fs')).readFileSync(`${process.cwd()}/packages/web/src/app/NewFromTemplate.tsx`, 'utf8')
    expect(source).toContain('adestia-btn--fold')
    expect(source).not.toContain('adestia-btn--rename')
  })
})
