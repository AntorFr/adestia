// @vitest-environment jsdom
/**
 * The instruction screen.
 *
 * What is asserted is what a person must be able to do and must not be able to
 * do: find the one they want among many, read it, correct it, save it byte for
 * byte — be told plainly when this engine has no such zone at all, and be
 * stopped from editing what the product delivers and rewrites at every start.
 */

import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Instructions, label, matches } from '../src/app/Instructions.js'

const FILES = [
  { path: 'CLAUDE.md', modified: '2026-08-25T10:00:00Z', bytes: 40, managed: false },
  {
    path: '.claude/skills/mes-regles/SKILL.md',
    modified: '2026-08-25T10:00:00Z',
    bytes: 80,
    managed: false,
  },
]

function server(
  options: {
    files?: unknown
    paths?: unknown
    status?: number
    onPut?: (body: unknown) => Response
  } = {},
) {
  return vi.fn((url: string, init?: RequestInit) => {
    const path = String(url)
    if (path === '/api/instructions') {
      const status = options.status ?? 200
      return Promise.resolve({
        ok: status === 200,
        status,
        json: () => Promise.resolve({ files: options.files ?? FILES, paths: options.paths ?? [] }),
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

/**
 * The screen with the shell's job done for it.
 *
 * `Instructions` is controlled: which file is open is a segment of the URL,
 * not a piece of the component's memory, so that a link to one is a link to
 * one. The tests supply the state the address bar supplies in the product.
 */
function Zone({ fetchImpl }: { fetchImpl: typeof fetch }) {
  const [open, setOpen] = useState<string | undefined>()
  return (
    <Instructions
      {...(open !== undefined ? { open } : {})}
      onOpen={setOpen}
      fetchImpl={fetchImpl}
    />
  )
}

describe('the instruction screen', () => {
  it('names a skill by its folder, not by SKILL.md', async () => {
    // Every one of them is called SKILL.md; the folder is what tells them
    // apart, so a wall of identical names would be useless.
    render(<Zone fetchImpl={server()} />)
    expect(await screen.findByText('mes-regles')).toBeTruthy()
    expect(screen.getByText('CLAUDE.md')).toBeTruthy()
  })

  it('finds one among many, by name or by where it sits', async () => {
    // The column of file names this replaced was built for four files. The
    // search is drawn from the first one: a field that appears at some
    // threshold is a field nobody knows is there below it.
    render(<Zone fetchImpl={server()} />)
    await screen.findByText('mes-regles')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'skills' } })
    await waitFor(() => expect(screen.queryByText('CLAUDE.md')).toBeNull())
    expect(screen.getByText('mes-regles')).toBeTruthy()
  })

  it('says nothing matched rather than showing an empty screen', async () => {
    render(<Zone fetchImpl={server()} />)
    await screen.findByText('mes-regles')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    expect(await screen.findByText('Nothing matches that.')).toBeTruthy()
  })

  it('opens a file and shows what is on disk', async () => {
    render(<Zone fetchImpl={server()} />)
    fireEvent.click(await screen.findByText('mes-regles'))
    await waitFor(() =>
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('# Relis mes emails\n'),
    )
  })

  it('offers Save only once something actually changed', async () => {
    // Lighting up on focus invites a rewrite nobody asked for.
    render(<Zone fetchImpl={server()} />)
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
    render(<Zone fetchImpl={fetchImpl} />)
    fireEvent.click(await screen.findByText('mes-regles'))
    await screen.findByRole('textbox')

    const typed = '---\nname: mes-regles\n---\n\n# Relis   mes emails\n\n\n'
    fireEvent.change(screen.getByRole('textbox'), { target: { value: typed } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toEqual({ markdown: typed })
  })

  it('shows what the product delivered, and offers no way to save it', async () => {
    // Listed rather than hidden: on an instance whose behaviour comes mostly
    // from plugin contracts, the rule somebody is hunting for is one of
    // these. Read-only, because the next start rewrites it.
    render(
      <Zone
        fetchImpl={server({
          files: [
            { path: '.claude/skills/todo/SKILL.md', modified: '', bytes: 900, managed: true },
          ],
        })}
      />,
    )
    fireEvent.click(await screen.findByText('todo'))
    const area = (await screen.findByRole('textbox')) as HTMLTextAreaElement
    expect(area.readOnly).toBe(true)
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(
      screen.getByText('Delivered with the product and rewritten at every start — shown, not edited.'),
    ).toBeTruthy()
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
    render(<Zone fetchImpl={fetchImpl} />)
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
    render(<Zone fetchImpl={server({ status: 404 })} />)
    expect(await screen.findByText('This engine keeps its instructions elsewhere.')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('invites writing when the zone is simply empty', async () => {
    render(<Zone fetchImpl={server({ files: [] })} />)
    expect(await screen.findByText('Nothing here yet — write one, or ask the agent to.')).toBeTruthy()
  })

  it('offers somewhere to write the first one', async () => {
    // Without this the screen was a dead end on a fresh instance: an empty
    // list and nothing to add to it. The places come from the driver, since
    // only it knows where its CLI reads prose.
    render(
      <Zone
        fetchImpl={server({
          files: [],
          paths: [
            { path: 'CLAUDE.md', kind: 'file', exists: false },
            { path: '.claude/skills', kind: 'folder', exists: true },
          ],
        })}
      />,
    )
    expect(await screen.findByRole('button', { name: '+ CLAUDE.md' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '+ New instruction' })).toBeTruthy()
  })

  it('does not offer to create a file that is already there', async () => {
    render(
      <Zone
        fetchImpl={server({
          files: [{ path: 'CLAUDE.md', modified: '', bytes: 10 }],
          paths: [{ path: 'CLAUDE.md', kind: 'file', exists: true }],
        })}
      />,
    )
    await screen.findByText('CLAUDE.md')
    expect(screen.queryByRole('button', { name: '+ CLAUDE.md' })).toBeNull()
  })

  it('opens a file that does not exist yet, ready to be written', async () => {
    const sent: unknown[] = []
    render(
      <Zone
        fetchImpl={server({
          files: [],
          paths: [{ path: 'CLAUDE.md', kind: 'file', exists: false }],
          onPut: (body) => {
            sent.push(body)
            return { ok: true, status: 200, json: () => Promise.resolve({}) } as unknown as Response
          },
        })}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: '+ CLAUDE.md' }))

    // Empty, and Save lights up at the first keystroke: nothing is on disk,
    // so anything typed is a change.
    const area = (await screen.findByRole('textbox')) as HTMLTextAreaElement
    expect(area.value).toBe('')
    fireEvent.change(area, { target: { value: '# Comment travailler ici' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(sent).toEqual([{ markdown: '# Comment travailler ici' }]))
  })
})

describe('finding one among many', () => {
  const file = (path: string) => ({ path, modified: '', bytes: 0 })

  it('reads the path as well as the name', () => {
    // Half of what distinguishes two instructions is where they sit: a search
    // over names alone answers "nothing" to somebody looking for the todo
    // plugin's.
    expect(matches(file('.claude/skills/todo/SKILL.md'), 'todo')).toBe(true)
    expect(matches(file('.claude/skills/todo/SKILL.md'), 'skills')).toBe(true)
    expect(matches(file('CLAUDE.md'), 'todo')).toBe(false)
  })

  it('ignores accents and case, because a keyboard does not', () => {
    expect(matches(file('notes/diététique.md'), 'dietetique')).toBe(true)
    expect(matches(file('CLAUDE.md'), 'claude')).toBe(true)
  })

  it('matches everything on an empty query', () => {
    expect(matches(file('CLAUDE.md'), '   ')).toBe(true)
  })
})

describe('naming a file', () => {
  it('uses the folder for a SKILL.md, and the name for anything else', () => {
    expect(label('.claude/skills/mes-regles/SKILL.md')).toBe('mes-regles')
    expect(label('CLAUDE.md')).toBe('CLAUDE.md')
    expect(label('notes/regles.md')).toBe('regles.md')
  })
})
