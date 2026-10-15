// @vitest-environment jsdom
/**
 * The catalogue pop-in, from the exit criterion: a button on Instructions opens
 * the declared repositories with a way to add one; entering one shows its
 * scanned items with an import gesture each; an item whose kind has no zone is
 * visible with the gesture disabled; importing makes the item appear in the
 * global list without a page reload.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Instructions } from '../src/app/Instructions.js'

afterEach(cleanup)

const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as unknown as Response)

function world() {
  const state = {
    files: [] as unknown[],
    catalogues: [{ id: 'homelab', repo: 'https://x/homelab.git', ref: 'main', imports: [] as unknown[] }],
    imported: new Set<string>(),
    calls: [] as string[],
  }
  const items = () => [
    { itemPath: 'skills/mail', kind: 'skill', name: 'mail', description: 'Relire le courrier', importable: true, imported: state.imported.has('skills/mail') },
    { itemPath: 'agents/rev.md', kind: 'agent', name: 'rev', description: 'Reviewer', importable: false, imported: false },
  ]
  const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    state.calls.push(`${method} ${url}`)
    if (url === '/api/instructions') return json({ files: state.files, paths: [] })
    if (url === '/api/instruction-catalogues' && method === 'GET') return json({ catalogues: state.catalogues })
    if (url === '/api/instruction-catalogues' && method === 'POST') {
      const body = JSON.parse(String(init?.body))
      if (body.repo === 'bad') return json({ error: 'repo unreachable' }, 502)
      state.catalogues.push({ id: 'new', repo: body.repo, ref: body.ref, imports: [] })
      return json({}, 201)
    }
    if (url === '/api/instruction-catalogues/homelab/items') return json({ items: items() })
    if (url === '/api/instruction-catalogues/homelab/items/skills/mail') {
      if (method === 'PUT') {
        state.imported.add('skills/mail')
        state.files = [{ path: '.claude/skills/mail/SKILL.md', modified: '2026-08-25T10:00:00Z', bytes: 1, managed: false, kind: 'skill', name: 'mail' }]
      } else {
        state.imported.delete('skills/mail')
        state.files = []
      }
      return json({})
    }
    return json({}, 404)
  })
  return { state, fetchImpl: fetchImpl as unknown as typeof fetch }
}

const screenWith = (fetchImpl: typeof fetch) =>
  render(<Instructions onOpen={() => undefined} fetchImpl={fetchImpl} />)

async function enter() {
  fireEvent.click(await screen.findByRole('button', { name: 'Catalogues' }))
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(await within(dialog).findByText('homelab'))
  await within(dialog).findByText('Relire le courrier')
  return dialog
}

describe('the catalogue pop-in', () => {
  it('lists the declared repositories, with a form to add one', async () => {
    const { fetchImpl } = world()
    screenWith(fetchImpl)
    fireEvent.click(await screen.findByRole('button', { name: 'Catalogues' }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('homelab')).toBeTruthy()
    expect(within(dialog).getByLabelText('Repository address')).toBeTruthy()
  })

  it('adds a repository and shows it; shows the server refusal otherwise', async () => {
    const { fetchImpl } = world()
    screenWith(fetchImpl)
    fireEvent.click(await screen.findByRole('button', { name: 'Catalogues' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('homelab')
    fireEvent.change(within(dialog).getByLabelText('Repository address'), { target: { value: 'bad' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }))
    expect((await within(dialog).findByRole('alert')).textContent).toContain('repo unreachable')
    fireEvent.change(within(dialog).getByLabelText('Repository address'), { target: { value: 'https://x/new.git' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }))
    expect(await within(dialog).findByText('new')).toBeTruthy()
  })

  it('shows items with name and description; an item with no zone is visible but disabled', async () => {
    const { fetchImpl } = world()
    screenWith(fetchImpl)
    const dialog = await enter()
    expect(within(dialog).getByText('Reviewer')).toBeTruthy()
    expect((within(dialog).getByRole('button', { name: /Import mail/ }) as HTMLButtonElement).disabled).toBe(false)
    expect((within(dialog).getByRole('button', { name: /Import rev/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('importing makes the item appear in the global list without a reload, and removing takes it away', async () => {
    const { fetchImpl, state } = world()
    screenWith(fetchImpl)
    const dialog = await enter()
    expect(screen.queryAllByText('mail').length).toBe(1) // only in the pop-in
    fireEvent.click(within(dialog).getByRole('button', { name: /Import mail/ }))
    await within(dialog).findByRole('button', { name: /Remove mail/ })
    await waitFor(() => expect(screen.queryAllByText('mail').length).toBeGreaterThan(1))
    expect(state.calls).toContain('PUT /api/instruction-catalogues/homelab/items/skills/mail')
    fireEvent.click(within(dialog).getByRole('button', { name: /Remove mail/ }))
    await within(dialog).findByRole('button', { name: /Import mail/ })
    await waitFor(() => expect(screen.queryAllByText('mail').length).toBe(1))
  })

  it('shows the failure of an import and does not report a change', async () => {
    const { fetchImpl, state } = world()
    screenWith(fetchImpl)
    const dialog = await enter()
    const base = fetchImpl as unknown as ReturnType<typeof vi.fn>
    const inner = base.getMockImplementation()!
    base.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === 'PUT' ? json({ error: 'collision' }, 409) : inner(url, init))
    fireEvent.click(within(dialog).getByRole('button', { name: /Import mail/ }))
    expect((await within(dialog).findByRole('alert')).textContent).toContain('collision')
    expect(state.files).toEqual([])
  })

  describe('withdrawing a repository', () => {
    const open = async (fetchImpl: typeof fetch) => {
      screenWith(fetchImpl)
      fireEvent.click(await screen.findByRole('button', { name: 'Catalogues' }))
      const dialog = await screen.findByRole('dialog')
      await within(dialog).findByText('homelab')
      return dialog
    }
    const withDelete = (w: ReturnType<typeof world>, onDelete: () => Promise<Response>) => {
      const base = w.fetchImpl as unknown as ReturnType<typeof vi.fn>
      const inner = base.getMockImplementation()!
      base.mockImplementation((url: string, init?: RequestInit) =>
        init?.method === 'DELETE' ? onDelete() : inner(url, init))
    }

    // Fails if the pop-in offers no control to withdraw a repository, or sends no DELETE.
    it('removes the repository from the list with a DELETE, keeping the others', async () => {
      const w = world()
      w.state.catalogues.push({ id: 'other', repo: 'https://x/other.git', ref: 'main', imports: [] })
      const base = w.fetchImpl as unknown as ReturnType<typeof vi.fn>
      const inner = base.getMockImplementation()!
      base.mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          w.state.calls.push(`DELETE ${url}`)
          w.state.catalogues = w.state.catalogues.filter((c) => `/api/instruction-catalogues/${c.id}` !== url)
          return json({})
        }
        return inner(url, init)
      })
      const dialog = await open(w.fetchImpl)
      fireEvent.click(within(dialog).getByRole('button', { name: /Remove catalogue homelab|Retirer le catalogue homelab/ }))
      await waitFor(() => expect(within(dialog).queryByText('homelab')).toBeNull())
      expect(w.state.calls).toContain('DELETE /api/instruction-catalogues/homelab')
      expect(within(dialog).getByText('other')).toBeTruthy()
    })

    // Fails if the screen's list is not re-read after the withdrawal (imports left on screen).
    it('re-reads the instructions so the withdrawn repository imports leave the global list', async () => {
      const w = world()
      const dialog = await open(w.fetchImpl)
      w.state.files = [{ path: '.claude/skills/mail/SKILL.md', modified: '2026-08-25T10:00:00Z', bytes: 1, managed: false, kind: 'skill', name: 'mail' }]
      withDelete(w, () => { w.state.files = []; w.state.catalogues = []; return json({}) })
      const before = w.state.calls.filter((c) => c === 'GET /api/instructions').length
      fireEvent.click(within(dialog).getByRole('button', { name: /Remove catalogue homelab|Retirer le catalogue homelab/ }))
      await waitFor(() => expect(w.state.calls.filter((c) => c === 'GET /api/instructions').length).toBeGreaterThan(before))
      await waitFor(() => expect(screen.queryAllByText('mail').length).toBe(0))
    })

    // Fails if a refused DELETE still drops the repository from the screen.
    it('keeps the repository and shows the refusal when the server refuses', async () => {
      const w = world()
      const dialog = await open(w.fetchImpl)
      withDelete(w, () => json({ error: 'cannot withdraw' }, 503))
      fireEvent.click(within(dialog).getByRole('button', { name: /Remove catalogue homelab|Retirer le catalogue homelab/ }))
      expect((await within(dialog).findByRole('alert')).textContent).toContain('cannot withdraw')
      expect(within(dialog).getByText('homelab')).toBeTruthy()
    })

    // Fails if a network failure on DELETE is swallowed or drops the repository.
    it('keeps the repository and shows the error when the network fails', async () => {
      const w = world()
      const dialog = await open(w.fetchImpl)
      withDelete(w, () => Promise.reject(new Error('network down')))
      fireEvent.click(within(dialog).getByRole('button', { name: /Remove catalogue homelab|Retirer le catalogue homelab/ }))
      expect((await within(dialog).findByRole('alert')).textContent).toContain('network down')
      expect(within(dialog).getByText('homelab')).toBeTruthy()
    })
  })
})
