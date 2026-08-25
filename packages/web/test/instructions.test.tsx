// @vitest-environment jsdom
/**
 * The instruction screen.
 *
 * What is asserted is what a person must be able to do and must not be able to
 * do: read what they told the agent, correct it, save it byte for byte — and
 * be told plainly when this engine has no such zone at all.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Instructions } from '../src/app/Instructions.js'

const FILES = [
  { path: 'CLAUDE.md', modified: '2026-08-25T10:00:00Z', bytes: 40 },
  { path: '.claude/skills/mes-regles/SKILL.md', modified: '2026-08-25T10:00:00Z', bytes: 80 },
]

function server(options: { files?: unknown; status?: number; onPut?: (body: unknown) => Response } = {}) {
  return vi.fn((url: string, init?: RequestInit) => {
    const path = String(url)
    if (path === '/api/instructions') {
      const status = options.status ?? 200
      return Promise.resolve({
        ok: status === 200,
        status,
        json: () => Promise.resolve({ files: options.files ?? FILES }),
      } as unknown as Response)
    }
    if (init?.method === 'PUT') {
      return Promise.resolve(
        options.onPut?.(JSON.parse(String(init.body))) ??
          ({ ok: true, status: 200, json: () => Promise.resolve({}) } as unknown as Response),
      )
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ markdown: '# Relis mes emails\n' }),
    } as unknown as Response)
  }) as unknown as typeof fetch
}

describe('the instruction screen', () => {
  it('names a skill by its folder, not by SKILL.md', async () => {
    // Every one of them is called SKILL.md; the folder is what tells them
    // apart, so a list of six identical names would be useless.
    render(<Instructions fetchImpl={server()} />)
    expect(await screen.findByText('mes-regles')).toBeTruthy()
    expect(screen.getByText('CLAUDE.md')).toBeTruthy()
  })

  it('opens a file and shows what is on disk', async () => {
    render(<Instructions fetchImpl={server()} />)
    fireEvent.click(await screen.findByText('mes-regles'))
    await waitFor(() =>
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('# Relis mes emails\n'),
    )
  })

  it('offers Save only once something actually changed', async () => {
    // Lighting up on focus invites a rewrite nobody asked for.
    render(<Instructions fetchImpl={server()} />)
    fireEvent.click(await screen.findByText('mes-regles'))
    const save = await screen.findByRole('button', { name: 'Save' })
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(true))

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '# autre chose' } })
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false))
  })

  it('sends exactly what was typed', async () => {
    // Instructions are read by a CLI: their frontmatter and whitespace mean
    // something we do not own, so nothing normalizes them on the way out.
    const sent: unknown[] = []
    const fetchImpl = server({
      onPut: (body) => {
        sent.push(body)
        return { ok: true, status: 200, json: () => Promise.resolve({}) } as unknown as Response
      },
    })
    render(<Instructions fetchImpl={fetchImpl} />)
    fireEvent.click(await screen.findByText('mes-regles'))
    await screen.findByRole('textbox')

    const typed = '---\nname: mes-regles\n---\n\n# Relis   mes emails\n\n\n'
    fireEvent.change(screen.getByRole('textbox'), { target: { value: typed } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toEqual({ markdown: typed })
  })

  it('says what went wrong instead of pretending it saved', async () => {
    const fetchImpl = server({
      onPut: () =>
        ({
          ok: false,
          status: 409,
          json: () =>
            Promise.resolve({ error: 'this file is delivered with the product and is rewritten at every start' }),
        }) as unknown as Response,
    })
    render(<Instructions fetchImpl={fetchImpl} />)
    fireEvent.click(await screen.findByText('mes-regles'))
    await screen.findByRole('textbox')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'this file is delivered with the product and is rewritten at every start',
    )
  })

  it('says so when the engine has no such zone', async () => {
    // A 404 is "this engine keeps them elsewhere", not "you have written
    // none" — offering an empty editor for either would be a lie.
    render(<Instructions fetchImpl={server({ status: 404 })} />)
    expect(await screen.findByText('This engine keeps its instructions elsewhere.')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('invites writing when the zone is simply empty', async () => {
    render(<Instructions fetchImpl={server({ files: [] })} />)
    expect(
      await screen.findByText('Nothing here yet — ask the agent to write down how you want it to work.'),
    ).toBeTruthy()
  })
})
