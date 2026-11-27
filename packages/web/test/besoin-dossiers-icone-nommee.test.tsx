// @vitest-environment jsdom
/**
 * Recette B-39: an icon chosen in the folder sheet is stored by NAME (`ico: file-text`).
 * Every tile that wears a folder's icon draws the pictogram for a name of the shell's set,
 * keeps drawing a stored glyph (an emoji) as text, and falls back to the folder icon.
 */

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Home } from '../src/app/Home.js'
import { Section } from '../src/app/Section.js'
import { iconId, knownIcon } from '../src/app/icons.js'

afterEach(cleanup)

const entry = (path: string, fields: Record<string, unknown> = {}) => ({
  path,
  title: path.split('/').pop() ?? path,
  fields,
})

const noop = () => {}

describe('knownIcon', () => {
  it('names an icon of the set, and nothing else', () => {
    expect(knownIcon('file-text')).toBe('file-text')
    expect(knownIcon('🪚')).toBeUndefined()
    expect(knownIcon('nope')).toBeUndefined()
    expect(knownIcon('')).toBeUndefined()
    expect(knownIcon(undefined)).toBeUndefined()
  })
})

describe('the home tile of a folder', () => {
  const home = (ico: string | undefined) => {
    const settings = { diy: { title: 'DIY', ...(ico ? { ico } : {}), revision: 'r' } }
    const { container } = render(
      <Home
        skin={{}}
        plugins={[]}
        entries={[entry('diy/INDEX.md'), entry('diy/etabli.md')]}
        folderSettings={settings}
        openPlugin={noop}
        openSection={noop}
        openPage={noop}
        focusComposer={noop}
      />,
    )
    return container.querySelector('.adestia-tile__icon')!
  }

  it('draws the pictogram for a stored name, not the word', () => {
    const icon = home('file-text')
    expect(icon.querySelector('use')?.getAttribute('href')).toBe(`#${iconId('file-text')}`)
    expect(icon.textContent).not.toContain('file-text')
  })

  it('keeps an emoji as text', () => {
    const icon = home('🪚')
    expect(icon.textContent).toContain('🪚')
    expect(icon.querySelector('use')).toBeNull()
  })

  it('falls back to the folder pictogram when nothing is stored', () => {
    expect(home(undefined).querySelector('use')?.getAttribute('href')).toBe(`#${iconId('folder')}`)
  })
})

describe('the E-3 header and the rooms of a section', () => {
  const base = { path: 'diy', title: 'DIY', entries: [entry('diy/INDEX.md')], openSection: noop, openPage: noop }

  const head = (icon: string | undefined) =>
    render(<Section {...base} tile={{ key: 'diy', label: 'DIY', ...(icon ? { icon } : {}) } as never} />).container.querySelector(
      '.adestia-chead__icon',
    )!

  it('header: a name draws the pictogram, an emoji stays text, none is the folder', () => {
    const named = head('file-text')
    expect(named.querySelector('use')?.getAttribute('href')).toBe(`#${iconId('file-text')}`)
    expect(named.textContent).not.toContain('file-text')
    cleanup()
    const glyph = head('🪚')
    expect(glyph.textContent).toContain('🪚')
    expect(glyph.querySelector('use')).toBeNull()
    cleanup()
    expect(head(undefined).querySelector('use')?.getAttribute('href')).toBe(`#${iconId('folder')}`)
  })

  it('a room wears the pictogram of its stored name', () => {
    const { container } = render(
      <Section
        {...base}
        entries={[entry('diy/INDEX.md'), entry('diy/atelier/INDEX.md'), entry('diy/atelier/x.md')]}
        folderSettings={{ 'diy/atelier': { title: 'Atelier', ico: 'image', revision: 'r' } }}
      />,
    )
    const icon = container.querySelector('.adestia-tile .adestia-tile__icon')!
    expect(icon.querySelector('use')?.getAttribute('href')).toBe(`#${iconId('image')}`)
    expect(icon.textContent).not.toContain('image')
  })
})
