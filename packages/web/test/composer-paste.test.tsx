// @vitest-environment jsdom
/** E-16 · pasting into the composer (B-paste-1, P-2 step 7). */
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Composer } from '../src/chat/Composer.js'

afterEach(cleanup)

const png = () => new File(['x'], 'cells.png', { type: 'image/png' })
const clip = (files: File[], data: Record<string, string>) => ({
  files,
  getData: (type: string) => data[type] ?? '',
})

function paste(area: HTMLElement, clipboardData: unknown) {
  const event = createEvent.paste(area)
  Object.defineProperty(event, 'clipboardData', { value: clipboardData })
  fireEvent(area, event)
  return event
}

function setup() {
  const fetchImpl = vi.fn(() =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ attachments: [{ id: 'a1', name: 'cells.png' }] }) } as unknown as Response),
  )
  render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy={false} folded={false} fetchImpl={fetchImpl as unknown as typeof fetch} />)
  return { area: screen.getByRole('textbox') as HTMLTextAreaElement, fetchImpl }
}

const HTML = '<table><tr><td>Nom</td><td>Age</td></tr><tr><td>Ann</td><td>30</td></tr></table>'

describe('E-16 composer paste', () => {
  it('inserts a Markdown table and attaches nothing when an image comes with a table', async () => {
    const { area, fetchImpl } = setup()
    const event = paste(area, clip([png()], { 'text/html': HTML, 'text/plain': 'Nom\tAge\nAnn\t30' }))
    expect(event.defaultPrevented).toBe(true)
    await waitFor(() => expect(area.value).toBe('| Nom | Age |\n| --- | --- |\n| Ann | 30 |'))
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(screen.queryByText('cells.png')).toBeNull()
  })

  it('inserts at the cursor, replacing the selection', async () => {
    const { area } = setup()
    fireEvent.change(area, { target: { value: 'avant XX après' } })
    area.setSelectionRange(6, 8)
    paste(area, clip([png()], { 'text/plain': 'mot' }))
    await waitFor(() => expect(area.value).toBe('avant mot après'))
  })

  it('attaches an image pasted alone', async () => {
    const { area, fetchImpl } = setup()
    const event = paste(area, clip([png()], {}))
    expect(event.defaultPrevented).toBe(true)
    await waitFor(() => expect(screen.getByText('cells.png')).toBeTruthy())
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(area.value).toBe('')
  })

  it('leaves a paste without a file to the browser', () => {
    const { area, fetchImpl } = setup()
    const event = paste(area, clip([], { 'text/plain': 'a\tb\n1\t2' }))
    expect(event.defaultPrevented).toBe(false)
    expect(area.value).toBe('')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
