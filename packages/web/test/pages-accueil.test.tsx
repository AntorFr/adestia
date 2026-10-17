// @vitest-environment jsdom
/**
 * The home, sections, missing page and inactive app, held to the charte and to
 * ONE language: the criterion of the `pages-accueil` task, in hand-written words.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from '../src/app/App.js'
import { Canvas, type CanvasProps } from '../src/app/Canvas.js'
import { Home } from '../src/app/Home.js'
import { MissingPage } from '../src/app/MissingPage.js'
import { Section } from '../src/app/Section.js'
import { translator } from '../src/app/i18n.js'

const INSTANCE = {
  driver: { label: 'Test CLI', cliVersion: '1.0', capabilities: [] },
  auth: { mode: 'none' },
  user: { userId: 'local', displayName: 'Local user' },
  skin: 'default',
  plugins: [],
  pluginProblems: [],
  turns: { max: 3, running: 0 },
}

const BRIEF = { generatedAt: '2026-10-17T08:00:00Z', items: [{ title: 'Notes', target: { type: 'section', path: 'notes' } }] }

/** `held`: the index request waits for `release`. */
function apiFetch(locale: string, held?: Promise<void>): typeof fetch {
  const json = (body: unknown) =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response)
  return ((url: string) => {
    const path = String(url)
    if (path.startsWith('/api/instance')) return json({ ...INSTANCE, locale })
    if (path.startsWith('/api/home/brief')) return json(BRIEF)
    if (path.startsWith('/api/pages/index')) {
      const answer = () => json({ entries: [{ path: 'notes/INDEX.md', title: 'Notes', fields: {} }], stores: [] })
      return held ? held.then(answer) : answer()
    }
    return json({ entries: [], conversations: [] })
  }) as unknown as typeof fetch
}

afterEach(() => {
  cleanup()
  location.hash = ''
})

describe('the shell speaks one language', () => {
  it.each([
    ['en', 'Highlights', 'Breadcrumb'],
    ['fr', 'À la une', 'Fil d’Ariane'],
  ])('%s: the home heading and breadcrumb are in %s only', async (locale, heading, crumbs) => {
    const { container } = render(<App fetchImpl={apiFetch(locale)} />)
    await waitFor(() => expect(container.querySelector('.adestia-brief')).toBeTruthy())
    expect(container.querySelector('.adestia-canvas__body h2.adestia-section')?.textContent).toContain(heading)
    expect(container.querySelector('.adestia-crumbs')?.getAttribute('aria-label')).toBe(crumbs)
    if (locale === 'en') {
      expect(container.textContent).not.toContain('À la une')
      expect(container.textContent).not.toContain('Chargement')
    } else {
      expect(container.textContent).not.toContain('Highlights')
      expect(container.querySelector('.adestia-crumbs')?.textContent).toBe('Accueil')
    }
  })

  it.each([
    ['en', 'Refresh my highlights'],
    ['fr', 'Rafraîchis ma une'],
  ])('%s: the refresh button asks in the instance language', (_locale, wanted) => {
    expect(translator(_locale as 'en' | 'fr')('Refresh my highlights')).toBe(wanted)
    expect(translator(_locale as 'en' | 'fr')('Open “%label”')).toBe(_locale === 'fr' ? 'Ouvre « %label »' : 'Open “%label”')
  })

  it('has no old glyph or French literal left in the screens it owns', () => {
    const dir = resolve(__dirname, '../src/app')
    for (const file of ['App', 'Home', 'Section', 'Collection', 'MissingPage', 'Canvas', 'CanvasHeader', 'Brief', 'Domains']) {
      const source = readFileSync(resolve(dir, `${file}.tsx`), 'utf8')
      const glyphs = source.replace(/⌘K/g, '').match(/[‹›＋▤▥✎↺✕×⌘]/g)
      expect(glyphs, file).toBeNull()
    }
    expect(readFileSync(resolve(dir, 'Brief.tsx'), 'utf8')).not.toMatch(/ask\??\.?\(['`](Rafra|Ouvre)/)
  })
})

describe('the home while the index is still out', () => {
  it('says Loading… (Chargement… in French) and never "Nothing to show yet."', async () => {
    for (const [locale, word] of [['en', 'Loading…'], ['fr', 'Chargement…']] as const) {
      let release!: () => void
      const held = new Promise<void>((done) => { release = done })
      const { container, unmount } = render(<App fetchImpl={apiFetch(locale, held)} />)
      await waitFor(() => expect(container.querySelector('.adestia-home')).toBeTruthy())
      expect(container.querySelector('[role="status"]')?.textContent).toBe(word)
      expect(container.querySelector('.adestia-tiles')).toBeNull()
      expect(container.querySelector('.adestia-brief')).toBeNull()
      expect(container.textContent).not.toContain('Nothing to show yet.')
      expect(container.textContent).not.toContain('Rien à afficher')
      await act(async () => release())
      await waitFor(() => expect(container.querySelector('.adestia-tiles')).toBeTruthy())
      expect(container.querySelector('[role="status"]')).toBeNull()
      unmount()
    }
  })

  it('shows the empty state once ready with nothing to show', () => {
    const { container } = render(<Home skin={{}} plugins={[]} entries={[]} openPlugin={() => {}} openSection={() => {}} openPage={() => {}} focusComposer={() => {}} />)
    expect(screen.getByText('Nothing to show yet.')).toBeTruthy()
    expect(container.querySelectorAll('.adestia-empty').length).toBe(1)
  })
})

describe('the way back names its destination', () => {
  it('an inactive app says Home, with the plug, and goes home', () => {
    const closeApp = vi.fn()
    const { container } = render(
      <Canvas
        {...({ openApp: 'ghost', loaded: [], closeApp, t: translator('en'), instance: INSTANCE, skin: {}, pages: [], stores: [] } as unknown as CanvasProps)}
      />,
    )
    expect(screen.getByText('That app is not active on this instance.')).toBeTruthy()
    expect(container.querySelectorAll('.adestia-empty').length).toBe(1)
    expect(container.querySelector('.adestia-empty use')?.getAttribute('href')).toBe('#adestia-i-plug')
    const back = screen.getByRole('button', { name: 'Home' })
    expect(back.textContent).toBe('Home')
    fireEvent.click(back)
    expect(closeApp).toHaveBeenCalledTimes(1)
  })

  it('the settings back keeps its own words, the French one included', async () => {
    location.hash = '#/settings/instructions'
    const { container } = render(<App fetchImpl={apiFetch('fr')} />)
    const back = await waitFor(() => {
      const found = container.querySelector('.adestia-canvas__body .adestia-switch')
      expect(found).toBeTruthy()
      return found as HTMLElement
    })
    expect(back.textContent).toBe('Réglages')
    expect(back.querySelector('use')?.getAttribute('href')).toBe('#adestia-i-chevron-left')
  })

  it('the phone canvas says Chat, in both languages, and returns to the chat', async () => {
    const restore = { width: window.innerWidth, matchMedia: window.matchMedia }
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 390 })
    window.matchMedia = ((media: string) => ({ media, matches: true, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
    try {
      for (const locale of ['en', 'fr']) {
        const { container, unmount } = render(<App fetchImpl={apiFetch(locale)} />)
        const back = await waitFor(() => {
          const found = container.querySelector('.adestia-canvas__header .adestia-switch')
          expect(found).toBeTruthy()
          return found as HTMLElement
        })
        expect(back.textContent).toBe('Chat')
        unmount()
      }
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: restore.width })
      window.matchMedia = restore.matchMedia
    }
  })
})

describe('the missing page', () => {
  it.each([
    [404, '#adestia-i-file-question'],
    [403, '#adestia-i-lock'],
    [500, '#adestia-i-circle-alert'],
  ])('a %i wears one empty state with its own icon', (status, href) => {
    const { container } = render(<MissingPage path="a/b.md" status={status} />)
    expect(container.querySelectorAll('.adestia-empty').length).toBe(1)
    expect(container.querySelector('.adestia-empty use')?.getAttribute('href')).toBe(href)
    expect(container.textContent).not.toMatch(/[‹›＋]/)
  })

  it('offers the folder above as a link with the folder-open icon', () => {
    const { container } = render(<MissingPage path="a/b.md" status={404} />)
    const link = container.querySelector('a')
    expect(link?.getAttribute('href')).toBe('#/section/a')
    expect(link?.querySelector('use')?.getAttribute('href')).toBe('#adestia-i-folder-open')
  })
})

describe('the keyboard reaches the home', () => {
  const css = (name: string) => readFileSync(resolve(__dirname, `../src/app/styles/${name}.css`), 'utf8')

  it('gives the tile, the brief item, the ask, the search and the chip a visible ring', () => {
    const all = css('home') + css('components')
    for (const selector of ['.adestia-home__ask:focus-visible', '.adestia-brief__item:focus-visible', '.adestia-tile:focus-visible', '.adestia-search input:focus-visible', 'button.adestia-chip:focus-visible']) {
      const at = all.indexOf(selector)
      expect(at, selector).toBeGreaterThanOrEqual(0)
      const block = all.slice(all.indexOf('{', at), all.indexOf('}', at))
      expect(block, selector).toMatch(/outline:\s*2px solid/)
    }
    expect(all).not.toMatch(/outline:\s*(none|0)/)
  })

  it('renders the search and the chips of a long section as focusable buttons/inputs', () => {
    const entries = [
      { path: 'd/INDEX.md', title: 'D', fields: {} },
      ...Array.from({ length: 6 }, (_, i) => ({ path: `d/p${i}.md`, title: `P${i}`, fields: { cat: i % 2 ? 'a' : 'b' } })),
    ]
    const { container } = render(<Section path="d" title="D" entries={entries} openSection={() => {}} openPage={() => {}} />)
    const input = screen.getByLabelText('Search this section')
    expect(input.tagName).toBe('INPUT')
    expect(input.tabIndex).toBe(0)
    const chips = [...container.querySelectorAll('button.adestia-chip')]
    expect(chips.map((c) => c.textContent)).toEqual(['All', 'a', 'b'])
    expect(chips.every((c) => c.tabIndex === 0)).toBe(true)
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(container.querySelectorAll('.adestia-empty').length).toBeLessThanOrEqual(1)
  })
})
