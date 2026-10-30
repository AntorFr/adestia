// @vitest-environment jsdom
/**
 * E-33: removing an MCP server asks first, naming the server (B-20, AD-26).
 * Expected values are written from the task's exit criterion, not from the code.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { McpServers } from '../src/app/McpServers.js'
import { NamePrompt } from '../src/app/instructions/NamePrompt.js'
import { translator } from '../src/app/i18n.js'

const SERVERS = {
  servers: [
    { name: 'notion', source: 'ui', editable: true, transport: 'stdio', config: { name: 'notion', command: 'npx' } },
  ],
}

interface Bench {
  readonly fetchImpl: typeof fetch
  readonly deletes: string[]
  /** Settles the held DELETE. */
  readonly answer: (status: number, body?: unknown) => void
}

/** A fetch whose DELETE is held until the test answers it. */
function bench(): Bench {
  const deletes: string[] = []
  let release: (r: Response) => void = () => {}
  const fetchImpl = vi.fn((input: unknown, init?: RequestInit) => {
    const url = String(input)
    const res = (status: number, body: unknown) =>
      ({ ok: status < 300, status, json: () => Promise.resolve(body) }) as unknown as Response
    if (init?.method === 'DELETE') {
      deletes.push(url)
      return new Promise<Response>((resolve) => { release = resolve })
    }
    if (url === '/api/mcp/servers') return Promise.resolve(res(200, SERVERS))
    return Promise.resolve(res(200, { servers: [] }))
  }) as unknown as typeof fetch
  const answer = (status: number, body: unknown = {}) =>
    release({ ok: status < 300, status, json: () => Promise.resolve(body) } as unknown as Response)
  return { fetchImpl, deletes, answer }
}

async function open(t?: (key: string) => string) {
  const b = bench()
  const onOpen = vi.fn()
  render(<McpServers open="notion" onOpen={onOpen} fetchImpl={b.fetchImpl} {...(t ? { t } : {})} />)
  const remove = await screen.findByRole('button', { name: t ? t('Remove') : 'Remove' })
  return { ...b, onOpen, remove }
}

describe('E-33, the confirmation before removing a server', () => {
  it('remove_opens_the_sheet_naming_the_server_and_sends_nothing', async () => {
    const { remove, deletes } = await open()
    fireEvent.click(remove)
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('Remove server?')
    expect(dialog.querySelector('strong')?.textContent).toBe('notion')
    expect(deletes).toEqual([])
  })

  it.each([
    ['Cancel', () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['the cross', () => fireEvent.click(screen.getByRole('button', { name: 'Close' }))],
    ['the scrim', () => fireEvent.click(document.querySelector('.adestia-sheet') as Element)],
    ['Escape', () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })],
  ])('%s_keeps_the_server_sends_nothing_and_returns_focus_to_remove', async (_name, dismiss) => {
    const { remove, deletes, onOpen } = await open()
    remove.focus()
    fireEvent.click(remove)
    await screen.findByRole('dialog')
    dismiss()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(deletes).toEqual([])
    expect(onOpen).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(remove)
  })

  it('initial_focus_is_on_cancel_not_on_the_cross', async () => {
    const { remove } = await open()
    fireEvent.click(remove)
    const cancel = await screen.findByRole('button', { name: 'Cancel' })
    expect(document.activeElement).toBe(cancel)
  })

  it('confirming_sends_exactly_one_delete_even_on_two_fast_presses', async () => {
    const { remove, deletes, answer, onOpen } = await open()
    fireEvent.click(remove)
    await screen.findByRole('dialog')
    const confirm = screen.getAllByRole('button', { name: 'Remove' }).at(-1) as HTMLElement
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(deletes).toEqual(['/api/mcp/servers/notion'])
    expect(screen.queryByRole('dialog')).toBeNull()
    await act(async () => { answer(200) })
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(undefined))
    expect(deletes).toHaveLength(1)
  })

  it('e10_remove_is_disabled_until_the_delete_answers', async () => {
    const { remove, answer, deletes } = await open()
    fireEvent.click(remove)
    await screen.findByRole('dialog')
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' }).at(-1) as HTMLElement)
    expect((remove as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(remove)
    expect(screen.queryByRole('dialog')).toBeNull()
    await act(async () => { answer(500, { error: 'boom' }) })
    await waitFor(() => expect((remove as HTMLButtonElement).disabled).toBe(false))
    expect(deletes).toHaveLength(1)
  })

  it('a_failed_delete_shows_the_alert_in_the_bar_without_reopening_the_sheet', async () => {
    const { remove, answer } = await open()
    fireEvent.click(remove)
    await screen.findByRole('dialog')
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' }).at(-1) as HTMLElement)
    await act(async () => { answer(500, { error: 'server said no' }) })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('server said no')
    expect(screen.queryByRole('dialog')).toBeNull()
    // Pressing Remove again asks again.
    fireEvent.click(remove)
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('a_long_name_is_set_whole_in_the_body_and_french_texts_answer_the_button', async () => {
    const t = translator('fr')
    const { remove } = await open(t)
    expect(remove.textContent).toContain('Supprimer')
    fireEvent.click(remove)
    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('Supprimer le serveur ?')
    expect(dialog.querySelector('p')?.textContent).toBe('« notion » ne sera plus branché. Sa déclaration est supprimée de cette instance.')
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy()
  })
})

describe('the opt-in autofocus rule leaves other sheets alone', () => {
  it('name_prompt_keeps_its_initial_focus_on_the_first_focusable', async () => {
    render(<NamePrompt question="Name" onName={() => {}} onCancel={() => {}} t={(k) => k} />)
    const dialog = await screen.findByRole('dialog')
    // Before the task, focus went to the first focusable of the panel: the cross.
    expect(document.activeElement).toBe(dialog.querySelector('button[aria-label="Close"]'))
  })
})
