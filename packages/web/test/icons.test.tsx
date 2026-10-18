// @vitest-environment jsdom
/**
 * The Lucide sprite (docs/charte.md § 2, AD-9): every name of the closed list renders
 * an <Icon> whose <use> resolves to a symbol in the mounted sprite; the sprite is
 * mounted once; a name outside the list does not compile; no network for an icon.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Icon } from '../src/app/Icon.js'
import { ICON_NAMES, mountSprite, type IconName } from '../src/app/icons.js'

// Written by hand from the charte's list, not derived from the code.
const CHARTE = [
  'plus', 'x', 'chevron-left', 'chevron-right', 'settings', 'pencil', 'rotate-ccw', 'save',
  'trash-2', 'search', 'folder', 'file-text', 'sparkles', 'plug', 'book-open',
  'sliders-horizontal', 'handshake', 'monitor', 'sun', 'moon', 'log-out', 'key-round', 'lock',
  'users', 'check', 'circle-alert', 'triangle-alert', 'info', 'wifi-off', 'refresh-cw', 'copy',
  'external-link', 'loader-circle', 'file-question', 'folder-open', 'search-x',
  // The page and its editor (adestia-qualite-pages-editeur)
  'grip-vertical', 'eye', 'code', 'corner-left-up', 'corner-down-left', 'image', 'music', 'film',
  'table', 'paperclip', 'list', 'chart-column',
]

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('icon sprite', () => {
  it('holds exactly the charte list', () => {
    expect([...ICON_NAMES].sort()).toEqual([...CHARTE].sort())
  })

  it.each(CHARTE)('%s: <use> resolves to a non-empty symbol in the document', (name) => {
    mountSprite()
    const { container } = render(<Icon name={name as IconName} />)
    const use = container.querySelector('svg.adestia-icon use')
    expect(use?.getAttribute('href')).toBe(`#adestia-i-${name}`)
    const symbol = document.getElementById(`adestia-i-${name}`)
    expect(symbol?.tagName.toLowerCase()).toBe('symbol')
    expect(symbol?.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(symbol?.children.length).toBeGreaterThan(0)
  })

  it('mounts once however many times it is called', () => {
    mountSprite()
    mountSprite()
    expect(document.querySelectorAll('#adestia-icon-sprite')).toHaveLength(1)
    expect(document.querySelectorAll('symbol')).toHaveLength(48)
  })

  it('is decorative and takes the text colour, not a hard-coded one', () => {
    mountSprite()
    const { container } = render(<Icon name="plus" className="adestia-icon--sm" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('class')).toBe('adestia-icon adestia-icon--sm')
    expect(document.getElementById('adestia-icon-sprite')!.innerHTML).not.toMatch(/stroke="(?!currentColor)|fill="#|stroke="#/)
    const css = readFileSync(resolve(process.cwd(), 'packages/web/src/app/styles/icons.css'), 'utf8')
    expect(css).toMatch(/\.adestia-icon\s*{[^}]*stroke:\s*currentColor/)
    expect(css).toMatch(/\.adestia-icon\s*{[^}]*width:\s*1em/)
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*{\s*\.adestia-icon--spin\s*{\s*animation:\s*none/)
  })

  it('needs no network: mounting and rendering never fetch', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    mountSprite()
    render(<Icon name="search" />)
    expect(fetchSpy).not.toHaveBeenCalled()
    const use = document.querySelector('use')!
    expect(use.getAttribute('href')!.startsWith('#')).toBe(true)
  })

  it('a name outside the list does not compile', () => {
    // @ts-expect-error — "banana" is not a Lucide name of the closed list
    const bad = <Icon name="banana" />
    expect(bad).toBeTruthy()
  })

  it('adds no runtime dependency', () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'packages/web/package.json'), 'utf8'))
    expect(Object.keys(pkg.dependencies ?? {}).some((d) => /lucide/.test(d))).toBe(false)
  })
})
