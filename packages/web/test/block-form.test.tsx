// @vitest-environment jsdom
/**
 * The data form of a block (E-35, B-27), judged from the criterion: add,
 * reorder and remove a row; a bad number is refused under its field and Apply
 * stays disabled; Raw says the same lines; Apply with nothing touched hands
 * back the fixture's lines byte for byte; an unreadable line is kept; Cancel,
 * ✕ and Escape hand back nothing. Expected lines are written by hand.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PluginGalleryFields } from '@antorfr/adestia-schemas'

import { BlockForm } from '../src/editor/BlockForm.js'

afterEach(cleanup)

const fixture = (name: string): string[] => {
  const page = readFileSync(resolve(process.cwd(), 'packages/web/test/fixtures/blockform', `${name}.md`), 'utf8').split('\n')
  const open = page.findIndex((l) => l.startsWith(':::'))
  return page.slice(open + 1, page.indexOf(':::', open + 1))
}

const FIGURES: PluginGalleryFields = {
  line: 'label-value-caption',
  columns: [
    { key: 'label', kind: 'text', label: 'Label', required: true },
    { key: 'value', kind: 'number', label: 'Value', required: true },
    { key: 'caption', kind: 'text', label: 'Caption' },
  ],
}
const TIMELINE: PluginGalleryFields = {
  line: 'label-range',
  columns: [
    { key: 'label', kind: 'text', label: 'Phase', required: true },
    { key: 'start', kind: 'date', label: 'Start' },
    { key: 'due', kind: 'date', label: 'Due', required: true },
  ],
}
const TABLE: PluginGalleryFields = { line: 'table', columns: [] }

function setup(fields: PluginGalleryFields, lines: string[], extra: Record<string, unknown> = {}) {
  const onApply = vi.fn()
  const onClose = vi.fn()
  render(<BlockForm name="Figures" fields={fields} lines={lines} onApply={onApply} onClose={onClose} {...extra} />)
  return { onApply, onClose }
}
const apply = () => screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement
const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-row]'))
const inputsOf = (row: HTMLElement) => Array.from(row.querySelectorAll<HTMLInputElement>('input')).map((i) => i.value)

describe('BlockForm — figures', () => {
  it('Apply with nothing touched returns the fixture lines byte for byte, unreadable ones in place', () => {
    const lines = fixture('figures')
    const { onApply } = setup(FIGURES, lines)
    expect(apply().disabled).toBe(false)
    fireEvent.click(apply())
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledWith(lines)
  })

  it('lists the unreadable lines under « Kept as written »', () => {
    setup(FIGURES, fixture('figures'))
    const kept = screen.getByRole('region', { name: 'Kept as written' })
    expect(within(kept).getByText('Un commentaire que personne ne sait lire')).toBeTruthy()
    expect(within(kept).getByText('- Sans libellé')).toBeTruthy()
  })

  it('titles the sheet « <Bloc> — data »', () => {
    setup(FIGURES, [])
    expect(screen.getByRole('dialog', { name: 'Figures — data' })).toBeTruthy()
  })

  it('Add appends a row, focuses its first field, and writes only that new line', () => {
    const { onApply } = setup(FIGURES, ['- A: 1', '- B: 2'])
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(rows()).toHaveLength(3)
    const fresh = rows()[2]!.querySelector('input')!
    expect(document.activeElement).toBe(fresh)
    // the blank new row is invalid: required label and value
    expect(apply().disabled).toBe(true)
    fireEvent.change(fresh, { target: { value: 'C' } })
    fireEvent.change(rows()[2]!.querySelectorAll('input')[1]!, { target: { value: '3' } })
    expect(apply().disabled).toBe(false)
    fireEvent.click(apply())
    expect(onApply).toHaveBeenCalledWith(['- A: 1', '- B: 2', '- C: 3'])
  })

  it('Move down / Move up reorder rows, and the edge ones are disabled', () => {
    const { onApply } = setup(FIGURES, ['- A: 1', '- B: 2', '- C: 3'])
    expect((within(rows()[0]!).getByRole('button', { name: 'Move up' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(rows()[2]!).getByRole('button', { name: 'Move down' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(rows()[0]!).getByRole('button', { name: 'Move down' }))
    expect(rows().map((r) => inputsOf(r)[0])).toEqual(['B', 'A', 'C'])
    fireEvent.click(within(rows()[2]!).getByRole('button', { name: 'Move up' }))
    expect(rows().map((r) => inputsOf(r)[0])).toEqual(['B', 'C', 'A'])
    fireEvent.click(apply())
    expect(onApply).toHaveBeenCalledWith(['- B: 2', '- C: 3', '- A: 1'])
  })

  it('Alt+ArrowDown / Alt+ArrowUp in a row move it', () => {
    setup(FIGURES, ['- A: 1', '- B: 2'])
    fireEvent.keyDown(rows()[0]!.querySelector('input')!, { key: 'ArrowDown', altKey: true })
    expect(rows().map((r) => inputsOf(r)[0])).toEqual(['B', 'A'])
    fireEvent.keyDown(rows()[1]!.querySelector('input')!, { key: 'ArrowUp', altKey: true })
    expect(rows().map((r) => inputsOf(r)[0])).toEqual(['A', 'B'])
  })

  it('Remove row drops the row but keeps the unreadable line', () => {
    const { onApply } = setup(FIGURES, ['- A: 1', 'prose', '- B: 2'])
    fireEvent.click(within(rows()[0]!).getByRole('button', { name: 'Remove row' }))
    fireEvent.click(apply())
    const out = onApply.mock.calls[0]![0] as string[]
    expect(out).toContain('prose')
    expect(out).toContain('- B: 2')
    expect(out.join('\n')).not.toContain('A: 1')
  })

  it('refuses a bad number under its field, disables Apply, and says it in the live region', () => {
    setup(FIGURES, ['- A: 1'])
    fireEvent.change(rows()[0]!.querySelectorAll('input')[1]!, { target: { value: 'three' } })
    expect(apply().disabled).toBe(true)
    const field = rows()[0]!.querySelectorAll('input')[1]!.closest('.adestia-field')!
    expect(field.textContent).toMatch(/number/i)
    expect(document.querySelector('[role="status"]')!.textContent).toMatch(/Value.*number/i)
    fireEvent.change(rows()[0]!.querySelectorAll('input')[1]!, { target: { value: '4 %' } })
    expect(apply().disabled).toBe(false)
  })

  it('a row read from the page is not judged until touched', () => {
    setup(FIGURES, ['- Retards: trois'])
    expect(apply().disabled).toBe(false)
  })

  it('Cancel, ✕ and Escape apply nothing and close', () => {
    for (const close of [
      () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })),
      () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' }),
    ]) {
      const { onApply, onClose } = setup(FIGURES, ['- A: 1'])
      fireEvent.change(rows()[0]!.querySelectorAll('input')[0]!, { target: { value: 'Z' } })
      close()
      expect(onApply).not.toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
      cleanup()
    }
  })

  it('the scrim and the ✕ button abandon too', () => {
    const { onApply, onClose } = setup(FIGURES, ['- A: 1'])
    const dialog = screen.getByRole('dialog')
    const x = within(dialog).queryByRole('button', { name: /close/i })
    expect(x).not.toBeNull()
    fireEvent.click(x!)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('Raw shows the same lines, and what is edited there is what Apply returns', () => {
    const lines = fixture('figures')
    const { onApply } = setup(FIGURES, lines)
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }))
    const area = screen.getByLabelText('Raw') as HTMLTextAreaElement
    expect(area.value).toBe(lines.join('\n'))
    fireEvent.change(area, { target: { value: '- X: 9\n- Y: 8' } })
    fireEvent.click(apply())
    expect(onApply).toHaveBeenCalledWith(['- X: 9', '- Y: 8'])
  })

  it('Raw → form reads the edited text back, a bad line goes under Kept as written', () => {
    setup(FIGURES, ['- A: 1'])
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }))
    fireEvent.change(screen.getByLabelText('Raw'), { target: { value: '- A: 1\nnot a figure' } })
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }))
    expect(rows()).toHaveLength(1)
    expect(within(screen.getByRole('region', { name: 'Kept as written' })).getByText('not a figure')).toBeTruthy()
  })

  it('an empty block shows the empty state with Add', () => {
    setup(FIGURES, [])
    expect(screen.getByText('Nothing here yet.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(rows()).toHaveLength(1)
  })

  it('a stale block blocks Apply', () => {
    setup(FIGURES, ['- A: 1'], { stale: true })
    expect(apply().disabled).toBe(true)
  })

  it('shows the line that will be written under the form', () => {
    setup(FIGURES, ['- A: 1'])
    expect(document.querySelector('.adestia-blockform__writes code')!.textContent).toBe('- A: 1')
  })
})

describe('BlockForm — timeline', () => {
  it('Apply with nothing touched returns the fixture lines byte for byte', () => {
    const lines = fixture('timeline')
    const { onApply } = setup(TIMELINE, lines)
    fireEvent.click(apply())
    expect(onApply).toHaveBeenCalledWith(lines)
  })

  it('has no Status field', () => {
    setup(TIMELINE, fixture('timeline'))
    expect(screen.queryByText(/status/i)).toBeNull()
  })

  it('refuses a due date before the start', () => {
    setup(TIMELINE, ['- A: 2026-03-01 → 2026-04-01'])
    const inputs = rows()[0]!.querySelectorAll('input')
    fireEvent.change(inputs[2]!, { target: { value: '2026-02-01' } })
    expect(apply().disabled).toBe(true)
  })
})

describe('BlockForm — list and table', () => {
  it('list: Apply with nothing touched returns the fixture lines', () => {
    const lines = fixture('list')
    const { onApply } = setup({ line: 'label-value', columns: [
      { key: 'label', kind: 'text', label: 'Label', required: true },
      { key: 'value', kind: 'text', label: 'Value' },
    ] }, lines)
    fireEvent.click(apply())
    expect(onApply).toHaveBeenCalledWith(lines)
  })

  it('table: Apply with nothing touched returns the fixture lines', () => {
    const lines = fixture('table')
    const { onApply } = setup(TABLE, lines)
    fireEvent.click(apply())
    expect(onApply).toHaveBeenCalledWith(lines)
  })

  it('table: adds and removes a row and a column', () => {
    const { onApply } = setup(TABLE, ['| a | b |', '| --- | --- |', '| 1 | 2 |'])
    const before = rows().length
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(rows()).toHaveLength(before + 1)
    fireEvent.click(screen.getByRole('button', { name: 'Add column' }))
    expect(rows()[0]!.querySelectorAll('input')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Remove column 3' }))
    expect(rows()[0]!.querySelectorAll('input')).toHaveLength(2)
    fireEvent.click(within(rows()[rows().length - 1]!).getByRole('button', { name: 'Remove row' }))
    expect(rows()).toHaveLength(before)
    fireEvent.click(apply())
    expect(onApply).toHaveBeenCalledWith(['| a | b |', '| --- | --- |', '| 1 | 2 |'])
  })
})
