// @vitest-environment jsdom
/**
 * E-37 / AD-37 (core): the create contract, the list sheet, the empty-state buttons and the name sheet.
 * Expectations are written from the task's exit criterion, not from the code.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Creations, CreationButtons } from '../src/app/Creations.js'
import { creationsFor, needsCaption, type CreationDeclaration } from '../src/app/creations.js'
import { translator } from '../src/app/i18n.js'
import { NameSheet } from '../src/app/ui/NameSheet.js'

afterEach(cleanup)

const t = (key: string) => key
const HOME = { at: 'home' } as const
const inFolder = (folder: string) => ({ at: 'folder', folder }) as const
const decl = (id: string, label: string, over: Partial<CreationDeclaration> = {}): { plugin: string; declaration: CreationDeclaration } => ({
  plugin: `plug-${id}`,
  declaration: { id, label, line: `${label} line`, action: { template: id }, ...over },
})

describe('creations.ts — what the + offers', () => {
  it('offers New folder at home when the root is writable', () => {
    expect(creationsFor(HOME, ['']).map((c) => c.label)).toEqual(['New folder'])
  })
  it('offers nothing at home when no folder is writable', () => {
    expect(creationsFor(HOME, [])).toEqual([])
  })
  it('offers nothing at home when only a sub-folder is writable (the root is not)', () => {
    expect(creationsFor(HOME, ['Notes'])).toEqual([])
  })
  it('offers New folder in a writable folder', () => {
    expect(creationsFor(inFolder('Notes'), ['Notes']).map((c) => c.label)).toEqual(['New folder'])
  })
  it('offers nothing in a read-only folder, even when others are writable', () => {
    expect(creationsFor(inFolder('Lore'), ['', 'Notes'])).toEqual([])
  })
  it('does not offer an entry whose where excludes the place', () => {
    const homeOnly = decl('a', 'Only home', { where: ['home'] })
    const folderOnly = decl('b', 'Only folder', { where: ['folder'] })
    expect(creationsFor(HOME, [], [homeOnly, folderOnly]).map((c) => c.label)).toEqual(['Only home'])
    expect(creationsFor(inFolder('X'), [], [homeOnly, folderOnly]).map((c) => c.label)).toEqual(['Only folder'])
  })
  it('offers an entry without where in both places, and a template does not need a writable folder here', () => {
    const both = decl('c', 'Both')
    expect(creationsFor(HOME, [], [both]).map((c) => c.label)).toEqual(['Both'])
    expect(creationsFor(inFolder('X'), [], [both]).map((c) => c.label)).toEqual(['Both'])
  })
  it('keeps the core first, then the plugins in order, and tags the plugin', () => {
    const list = creationsFor(HOME, [''], [decl('x', 'X'), decl('y', 'Y')])
    expect(list.map((c) => c.label)).toEqual(['New folder', 'X', 'Y'])
    expect(list[1]?.plugin).toBe('plug-x')
    expect(list[0]?.plugin).toBeUndefined()
  })
  it('asks for a caption only when two labels look alike (case and spaces ignored)', () => {
    const list = creationsFor(HOME, [''], [decl('x', 'Journal'), decl('y', ' journal ')])
    expect(needsCaption(list[1]!, list)).toBe(true)
    expect(needsCaption(list[2]!, list)).toBe(true)
    expect(needsCaption(list[0]!, list)).toBe(false)
    const distinct = creationsFor(HOME, [''], [decl('x', 'Journal')])
    expect(needsCaption(distinct[1]!, distinct)).toBe(false)
  })
})

describe('E-37 — the create list sheet', () => {
  const list = creationsFor(HOME, [''], [decl('x', 'Journal')])
  it('draws one row per entry with its description', () => {
    render(<Creations creations={list} onChoose={() => undefined} onClose={() => undefined} t={t} />)
    const rows = document.querySelectorAll('button.adestia-action-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain('New folder')
    expect(rows[0]!.textContent).toContain('An empty folder to group pages.')
    expect(rows[1]!.textContent).toContain('Journal line')
  })
  it('choosing a row closes the sheet, then calls the action once with that entry', () => {
    const order: string[] = []
    render(<Creations creations={list} onChoose={(c) => order.push(`choose:${c.id}`)} onClose={() => order.push('close')} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: /New folder/ }))
    expect(order).toEqual(['close', 'choose:folder'])
  })
  it('shows the plugin name only on a row whose label looks like another', () => {
    const twins = creationsFor(HOME, [''], [decl('x', 'Journal'), decl('y', 'Journal')])
    render(<Creations creations={twins} onChoose={() => undefined} onClose={() => undefined} t={t} />)
    const rows = [...document.querySelectorAll('button.adestia-action-row')]
    expect(rows[0]!.textContent).not.toContain('plug-')
    expect(rows[1]!.textContent).toContain('plug-x')
    expect(rows[2]!.textContent).toContain('plug-y')
  })
  it('closes on Escape without acting', () => {
    const onChoose = vi.fn()
    const onClose = vi.fn()
    render(<Creations creations={list} onChoose={onChoose} onClose={onClose} t={t} />)
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
    expect(onChoose).not.toHaveBeenCalled()
  })
})

describe('E-37 — the empty-state buttons', () => {
  it('draw the same rows as the list, one <button> each, with the same action call (and no sheet to close)', () => {
    const list = creationsFor(HOME, [''], [decl('x', 'Journal')])
    const onChoose = vi.fn()
    const sheet = render(<Creations creations={list} onChoose={() => undefined} onClose={() => undefined} t={t} />)
    const inSheet = [...document.querySelectorAll('button.adestia-action-row')].map((b) => b.textContent)
    sheet.unmount()
    render(<CreationButtons creations={list} onChoose={onChoose} t={t} />)
    const buttons = [...document.querySelectorAll('button.adestia-action-row')]
    expect(buttons.map((b) => b.textContent)).toEqual(inSheet)
    expect(buttons).toHaveLength(2)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    fireEvent.click(buttons[1]!)
    expect(onChoose).toHaveBeenCalledTimes(1)
    expect(onChoose.mock.calls[0]![0].id).toBe('x')
  })
  it('draw nothing when nothing is offered', () => {
    render(<CreationButtons creations={[]} onChoose={() => undefined} t={t} />)
    expect(document.querySelectorAll('button')).toHaveLength(0)
  })
})

describe('NameSheet', () => {
  const open = (onSubmit: (n: string) => 'taken' | 'failed' | undefined | Promise<'taken' | 'failed' | undefined>, onCancel = () => undefined) =>
    render(<NameSheet title="New folder" question="Folder name" submitLabel="Create" onSubmit={onSubmit} onCancel={onCancel} t={t} />)
  const create = () => screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement
  const field = () => screen.getByRole('textbox') as HTMLInputElement

  it('keeps Create disabled while the field is empty or blank', () => {
    open(() => undefined)
    expect(create().disabled).toBe(true)
    fireEvent.change(field(), { target: { value: '   ' } })
    expect(create().disabled).toBe(true)
    fireEvent.change(field(), { target: { value: 'Lore' } })
    expect(create().disabled).toBe(false)
  })
  it('does not call onSubmit on Enter with an empty field', () => {
    const onSubmit = vi.fn()
    open(onSubmit)
    fireEvent.submit(field().closest('form')!)
    expect(onSubmit).not.toHaveBeenCalled()
  })
  it('creates on Enter (form submit) with the typed name', async () => {
    const onSubmit = vi.fn(() => undefined)
    open(onSubmit)
    fireEvent.change(field(), { target: { value: 'Lore' } })
    fireEvent.submit(field().closest('form')!)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Lore'))
  })
  it('creates on a click of Create', async () => {
    const onSubmit = vi.fn(() => undefined)
    open(onSubmit)
    fireEvent.change(field(), { target: { value: 'Lore' } })
    fireEvent.click(create())
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Lore'))
  })
  it('shows "name already taken" under the field when refused, keeps the name, clears it on typing', async () => {
    open(() => 'taken')
    fireEvent.change(field(), { target: { value: 'Lore' } })
    fireEvent.click(create())
    expect(await screen.findByText('name already taken')).toBeTruthy()
    expect(field().value).toBe('Lore')
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    fireEvent.change(field(), { target: { value: 'Lore2' } })
    expect(screen.queryByText('name already taken')).toBeNull()
  })
  it('stays open on a write error and says so; a rejected promise is a write error too', async () => {
    open(() => { throw new Error('boom') })
    fireEvent.change(field(), { target: { value: 'Lore' } })
    fireEvent.click(create())
    expect(await screen.findByText('Could not write the name. Try again.')).toBeTruthy()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    cleanup()
    open(() => Promise.reject(new Error('net')))
    fireEvent.change(field(), { target: { value: 'Lore' } })
    fireEvent.click(create())
    expect(await screen.findByText('Could not write the name. Try again.')).toBeTruthy()
  })
  it('does not submit twice while a submission is in flight', async () => {
    let release!: () => void
    const held = new Promise<undefined>((resolve) => { release = () => resolve(undefined) })
    const onSubmit = vi.fn(() => held)
    open(onSubmit)
    fireEvent.change(field(), { target: { value: 'Lore' } })
    fireEvent.submit(field().closest('form')!)
    fireEvent.submit(field().closest('form')!)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    release()
    await waitFor(() => expect(create().disabled).toBe(false))
  })
  it('Cancel and Escape close without submitting', () => {
    const onCancel = vi.fn()
    const onSubmit = vi.fn()
    open(onSubmit, onCancel)
    fireEvent.change(field(), { target: { value: 'Lore' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(onSubmit).not.toHaveBeenCalled()
  })
  it('uses the verb it is given on the confirming button', () => {
    render(<NameSheet title="x" question="q" submitLabel="Rename" onSubmit={() => undefined} onCancel={() => undefined} t={t} />)
    expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy()
  })
})

describe('texts', () => {
  const keys = [
    'New folder', 'An empty folder to group pages.', 'Folder name', 'name already taken',
    'Could not write the name. Try again.', 'Create', 'Cancel',
  ]
  it.each(keys)('%s is said in French, and English is the key itself', (key) => {
    expect(translator('en')(key)).toBe(key)
    const fr = translator('fr')(key)
    expect(fr).not.toBe('')
    expect(fr).not.toBe(key)
  })
})
