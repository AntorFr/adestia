// @vitest-environment jsdom
/**
 * The three setting components (docs/charte.md § 4): SettingRow, IconPicker, HuePicker.
 * Exit criterion: one Tab stop per picker, arrows choose and onChange gets the value
 * (null for « none »), aria-checked on the choice, twelve named hues plus « none » without
 * hexadecimal, the row renders label and control, the charter lists the three.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ICON_NAMES, type IconName } from '../src/app/icons.js'
import { HUE_NAMES, HuePicker, IconPicker, SettingRow, type HueName } from '../src/app/ui/index.js'

afterEach(cleanup)

const NAMES: Record<HueName, string> = {
  rouge: 'Rouge', orange: 'Orange', ambre: 'Ambre', vert: 'Vert', emeraude: 'Émeraude', turquoise: 'Turquoise',
  bleu: 'Bleu', indigo: 'Indigo', violet: 'Violet', rose: 'Rose', gris: 'Gris', ardoise: 'Ardoise',
}

function HueHost({ start = null, onChange = () => {} }: { start?: HueName | null; onChange?: (v: HueName | null) => void }) {
  const [v, setV] = useState<HueName | null>(start)
  return <HuePicker value={v} onChange={(x) => { onChange(x); setV(x) }} label="Teinte" noneLabel="Aucune" names={NAMES} />
}
function IconHost({ start = null, onChange = () => {} }: { start?: IconName | null; onChange?: (v: IconName | null) => void }) {
  const [v, setV] = useState<IconName | null>(start)
  return <IconPicker value={v} onChange={(x) => { onChange(x); setV(x) }} label="Icône" noneLabel="Aucune" />
}

const tabStops = (group: HTMLElement) => within(group).filter((el) => el.tabIndex === 0)
function within(group: HTMLElement) {
  const radios = Array.from(group.querySelectorAll<HTMLElement>('[role=radio]'))
  return { radios, filter: (f: (el: HTMLElement) => boolean) => radios.filter(f) }
}

describe('HuePicker', () => {
  it('offers « none » then twelve hues, each named by its hue and never by a hexadecimal value', () => {
    render(<HueHost />)
    const radios = screen.getByRole('radiogroup', { name: 'Teinte' }).querySelectorAll('[role=radio]')
    expect(radios).toHaveLength(13)
    const names = Array.from(radios).map((r) => r.getAttribute('aria-label')!)
    expect(names[0]).toBe('Aucune')
    expect(names.slice(1)).toEqual(HUE_NAMES.map((h) => NAMES[h]))
    expect(HUE_NAMES).toHaveLength(12)
    for (const r of Array.from(radios)) {
      expect(`${r.getAttribute('aria-label')} ${r.getAttribute('title')} ${r.textContent}`).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i)
    }
  })

  it('names exactly the hues tokens.css defines', () => {
    const css = readFileSync(resolve(__dirname, '../src/app/tokens.css'), 'utf8')
    const defined = [...css.matchAll(/--adestia-hue-([a-z]+):/g)].map((m) => m[1])
    expect([...HUE_NAMES].sort()).toEqual([...new Set(defined)].sort())
  })

  it('has one Tab stop: the first option when nothing is chosen, the checked one otherwise', () => {
    const { unmount } = render(<HueHost />)
    let group = screen.getByRole('radiogroup')
    let stops = tabStops(group)
    expect(stops).toHaveLength(1)
    expect(stops[0]!.getAttribute('aria-label')).toBe('Aucune')
    unmount()
    render(<HueHost start="bleu" />)
    group = screen.getByRole('radiogroup')
    stops = tabStops(group)
    expect(stops).toHaveLength(1)
    expect(stops[0]!.getAttribute('aria-label')).toBe('Bleu')
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1)
  })

  it('arrows choose, move focus, wrap; onChange gets the value and null for « none »', () => {
    const onChange = vi.fn()
    render(<HueHost onChange={onChange} />)
    const none = screen.getByRole('radio', { name: 'Aucune' })
    none.focus()
    fireEvent.keyDown(none, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('rouge')
    const rouge = screen.getByRole('radio', { name: 'Rouge' })
    expect(rouge.getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(rouge)
    expect(rouge.tabIndex).toBe(0)
    fireEvent.keyDown(rouge, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(screen.getByRole('radio', { name: 'Aucune' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Aucune' }), { key: 'ArrowUp' })
    expect(onChange).toHaveBeenLastCalledWith('ardoise')
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Ardoise' }), { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith(null)
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Aucune' }), { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith('ardoise')
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Ardoise' }), { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('a click chooses; a disabled picker chooses nothing; other keys do nothing', () => {
    const onChange = vi.fn()
    const { unmount } = render(<HueHost onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Vert' }))
    expect(onChange).toHaveBeenLastCalledWith('vert')
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Vert' }), { key: 'a' })
    expect(onChange).toHaveBeenCalledTimes(1)
    unmount()
    const spy = vi.fn()
    render(<HuePicker value={null} onChange={spy} label="T" noneLabel="N" names={NAMES} disabled />)
    for (const r of screen.getAllByRole('radio')) {
      expect((r as HTMLButtonElement).disabled).toBe(true)
      fireEvent.click(r)
    }
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('IconPicker', () => {
  it('offers « none » then every ICON_NAMES entry, named by the icon', () => {
    render(<IconHost />)
    const radios = screen.getByRole('radiogroup', { name: 'Icône' }).querySelectorAll('[role=radio]')
    expect(radios).toHaveLength(ICON_NAMES.length + 1)
    expect(radios[0]!.getAttribute('aria-label')).toBe('Aucune')
    expect(radios[0]!.querySelector('svg')).toBeNull()
    expect(Array.from(radios).slice(1).map((r) => r.getAttribute('aria-label'))).toEqual([...ICON_NAMES])
  })

  it('has one Tab stop on the checked option and arrows choose, with null for « none »', () => {
    const onChange = vi.fn()
    render(<IconHost start={ICON_NAMES[2]!} onChange={onChange} />)
    const group = screen.getByRole('radiogroup')
    const stops = tabStops(group)
    expect(stops).toHaveLength(1)
    expect(stops[0]!.getAttribute('aria-label')).toBe(ICON_NAMES[2])
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1)
    fireEvent.keyDown(stops[0]!, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(ICON_NAMES[3])
    expect(document.activeElement?.getAttribute('aria-label')).toBe(ICON_NAMES[3])
    fireEvent.keyDown(screen.getByRole('radio', { name: ICON_NAMES[3]! }), { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(screen.getByRole('radio', { name: 'Aucune' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Aucune' }), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith(ICON_NAMES[ICON_NAMES.length - 1])
  })

  it('a disabled picker chooses nothing', () => {
    const spy = vi.fn()
    render(<IconPicker value={null} onChange={spy} label="I" noneLabel="N" disabled />)
    for (const r of screen.getAllByRole('radio')) fireEvent.click(r)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('SettingRow', () => {
  it('renders its label and the control, which names itself through the label id', () => {
    const { container } = render(
      <SettingRow label="Ouvrir au démarrage">
        {({ labelId }) => <input type="checkbox" role="switch" aria-labelledby={labelId} />}
      </SettingRow>,
    )
    expect(screen.getByRole('switch', { name: 'Ouvrir au démarrage' })).toBeTruthy()
    expect(container.querySelector('.adestia-setting-row__control input')).toBeTruthy()
  })

  it('renders its help under the label and the control points at it', () => {
    const { container } = render(
      <SettingRow label="Pièces jointes" help="Affiche les fichiers du dossier">
        {({ labelId, helpId }) => <input type="checkbox" role="switch" aria-labelledby={labelId} aria-describedby={helpId} />}
      </SettingRow>,
    )
    const help = container.querySelector('.adestia-setting-row__help')!
    expect(help.textContent).toBe('Affiche les fichiers du dossier')
    const sw = screen.getByRole('switch', { name: 'Pièces jointes' })
    expect(sw.getAttribute('aria-describedby')).toBe(help.id)
    expect(help.id).not.toBe('')
    expect(container.querySelector('.adestia-setting-row__text')!.children[1]).toBe(help)
  })

  it('without help, draws no help node and gives the control no helpId', () => {
    let seen: string | undefined = 'unset'
    const { container } = render(
      <SettingRow label="Sans aide">{({ helpId }) => { seen = helpId; return <i /> }}</SettingRow>,
    )
    expect(seen).toBeUndefined()
    expect(container.querySelector('.adestia-setting-row__help')).toBeNull()
  })

  it('two rows with help get distinct help ids', () => {
    const ids: Array<string | undefined> = []
    render(<><SettingRow label="a" help="x">{({ helpId }) => { ids.push(helpId); return <i /> }}</SettingRow><SettingRow label="b" help="y">{({ helpId }) => { ids.push(helpId); return <i /> }}</SettingRow></>)
    expect(new Set(ids).size).toBe(2)
  })

  it('two rows get distinct ids', () => {
    const ids: string[] = []
    render(<><SettingRow label="a">{({ labelId }) => { ids.push(labelId); return <i /> }}</SettingRow><SettingRow label="b">{({ labelId }) => { ids.push(labelId); return <i /> }}</SettingRow></>)
    expect(new Set(ids).size).toBe(2)
  })
})

describe('the charter inventory (docs/charte.md § 4)', () => {
  const charte = readFileSync(resolve(__dirname, '../../../docs/charte.md'), 'utf8')
  const css = readFileSync(resolve(__dirname, '../src/app/styles/components.css'), 'utf8')
  it.each([
    ['Setting row', 'SettingRow.tsx', '.adestia-setting-row'],
    ['Icon picker', 'IconPicker.tsx', '.adestia-icon-picker'],
    ['Hue picker', 'HuePicker.tsx', '.adestia-hue-picker'],
  ])('lists %s with its file and its class, and components.css styles it', (name, file, cls) => {
    const row = charte.split('\n').find((l) => l.startsWith(`| ${name} |`))
    expect(row, `${name} missing from docs/charte.md`).toBeTruthy()
    expect(row).toContain(file)
    expect(row).toContain(cls)
    expect(css).toContain(cls)
  })
})
