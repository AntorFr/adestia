// @vitest-environment jsdom
/**
 * B-35, E-37 rename sheet: the refusals the browser test does not play (400/422 with the
 * reason, 403, 404 with Close, other failure with Retry), and the success path that follows.
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
}

const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as unknown as Response)

function api(answers: Array<[number, unknown]>, sent: string[]): typeof fetch {
  return ((url: string, init?: RequestInit) => {
    const path = String(url)
    if (path.startsWith('/api/instance')) return json({ ...INSTANCE, locale: 'en' })
    if (path.startsWith('/api/pages/index'))
      return json({ entries: [], stores: [], writableFolders: ['', 'a'], folders: ['a'] })
    if (path === '/api/folders/rename' && init?.method === 'POST') {
      sent.push(String(init.body))
      const [status, body] = answers.length > 1 ? answers.shift()! : answers[0]!
      return json(body, status)
    }
    return json({ entries: [], conversations: [] })
  }) as unknown as typeof fetch
}

afterEach(() => {
  cleanup()
  location.hash = ''
})

async function openSheet(fetchImpl: typeof fetch, name: string) {
  location.hash = '#/section/a'
  render(<App fetchImpl={fetchImpl} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Rename' }))
  fireEvent.change(await screen.findByLabelText('Folder name'), { target: { value: name } })
}
const confirm = () => {
  const buttons = screen.getAllByRole('button', { name: 'Rename' })
  fireEvent.click(buttons[buttons.length - 1]!)
}

describe('rename sheet refusals', () => {
  it('sends the slug of the typed name with the current path', async () => {
    // red if the body carries the raw name or a wrong path
    const sent: string[] = []
    await openSheet(api([[200, { path: 'b-c', unrewritten: 0 }]], sent), 'B C')
    confirm()
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(JSON.parse(sent[0]!)).toEqual({ path: 'a', name: 'b-c' })
  })

  it('400 and 422 show the server reason under the field, sheet open', async () => {
    // red if the reason is replaced by a generic text or the sheet closes
    const sent: string[] = []
    await openSheet(api([[422, { error: 'folder owned by an app' }]], sent), 'bb')
    confirm()
    await screen.findByText('folder owned by an app')
    expect(screen.getByLabelText('Folder name')).toBeTruthy()
    expect(location.hash).toBe('#/section/a')
  })

  it('403 says the folder cannot be written; sheet open', async () => {
    const sent: string[] = []
    await openSheet(api([[403, {}]], sent), 'bb')
    confirm()
    await screen.findByText('this folder cannot be written')
    expect(location.hash).toBe('#/section/a')
  })

  it('404 says the folder is gone and swaps Rename for Close, which closes the sheet', async () => {
    // red if a retry is offered on a folder that cannot succeed
    const sent: string[] = []
    await openSheet(api([[404, {}]], sent), 'bb')
    confirm()
    await screen.findByText('this folder no longer exists')
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).not.toMatch(/Rename(?!\s*folder)/)
    fireEvent.click(Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Close')!)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('another failure offers Retry, which sends again and succeeds', async () => {
    // red if Retry does not re-send, or the sheet keeps the error after success
    const sent: string[] = []
    await openSheet(api([[500, {}], [200, { path: 'bb', unrewritten: 0 }]], sent), 'bb')
    confirm()
    await screen.findByText('Something went wrong. Try again.')
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(sent).toHaveLength(2))
    await waitFor(() => expect(location.hash).toBe('#/section/bb'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
