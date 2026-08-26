// @vitest-environment jsdom
/**
 * The landing canvas.
 *
 * What it guards: the order of the two mosaics, and that a real corpus never
 * arrives as a flat list again.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

import { Home } from '../src/app/Home.js'
import type { LoadedPlugin } from '../src/plugins/loader.js'

const plugin = (id: string, extra: Partial<LoadedPlugin> = {}): LoadedPlugin =>
  ({
    id,
    base: `/plugins/${id}/`,
    tile: { label: id, icon: '▣' },
    view: { component: () => null },
    ...extra,
  }) as LoadedPlugin

const entry = (path: string, fields: Record<string, unknown> = {}) => ({
  path,
  title: path.split('/').pop() ?? path,
  fields,
})

const CORPUS = [
  entry('domaines/diy/INDEX.md', { title: 'DIY', ico: '🪚', couleur: 'ambre' }),
  entry('domaines/diy/etabli.md'),
  entry('domaines/diy/scie.md'),
]

function noop() {}

const props = {
  skin: {},
  plugins: [plugin('todo')],
  entries: CORPUS,
  openPlugin: noop,
  openSection: noop,
  openPage: noop,
  focusComposer: noop,
}

describe('the landing canvas', () => {
  it('leads with the apps, then with what the workspace holds', () => {
    // The order is the whole point: what this instance can DO comes before
    // what it stores. The version this replaced put every page first and the
    // launcher below all of them.
    const { container } = render(<Home {...props} />)
    // The name, not the whole heading: it also carries the Arrange switch.
    expect([...container.querySelectorAll('.golem-section__name')].map((h) => h.textContent)).toEqual([
      'Apps',
      'Sections',
    ])
  })

  it('represents a body of pages as sections, never as a flat list', () => {
    const { container } = render(<Home {...props} />)
    expect(container.querySelector('.golem-pages')).toBeNull()
    expect(screen.getByText('DIY')).toBeTruthy()
    // The index page is not one of them: it IS the section.
    expect(screen.getByText('2 pages')).toBeTruthy()
  })

  it('greets by the hour, in the skin’s own words', () => {
    const skin = { greetingDay: 'Bonjour, Monsieur.', greetingEvening: 'Bonsoir, Monsieur.' }
    const morning = render(<Home {...props} skin={skin} now={new Date('2026-08-24T09:00:00')} />)
    expect(morning.getByText(/Bonjour/)).toBeTruthy()
    morning.unmount()

    const evening = render(<Home {...props} skin={skin} now={new Date('2026-08-24T20:00:00')} />)
    expect(evening.getByText(/Bonsoir/)).toBeTruthy()
  })

  it('falls back to plain words where a skin says nothing', () => {
    // A default instance must still be greeted; an empty banner would look
    // like a bug rather than like restraint.
    render(<Home {...props} now={new Date('2026-08-24T09:00:00')} />)
    expect(screen.getByText(/Good morning/)).toBeTruthy()
  })

  it('fills a tile in when the plugin answers, and renders it before that', async () => {
    const slow = plugin('todo', {
      view: {
        component: () => null,
        tileInfo: () => Promise.resolve({ chips: [{ text: '12 to do' }, { text: '3 late', hot: true }] }),
      },
    } as Partial<LoadedPlugin>)

    render(<Home {...props} plugins={[slow]} />)
    // The tile is there immediately — the count is an enrichment, never a
    // precondition for drawing the launcher.
    expect(screen.getByText('todo')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('12 to do')).toBeTruthy())
    expect(screen.getByText('3 late').className).toContain('hot')
  })

  it('keeps a tile when its plugin cannot count', async () => {
    const broken = plugin('todo', {
      view: { component: () => null, tileInfo: () => Promise.reject(new Error('nope')) },
    } as Partial<LoadedPlugin>)

    render(<Home {...props} plugins={[broken]} />)
    await waitFor(() => expect(screen.getByText('todo')).toBeTruthy())
  })

  it('opens a brief target on whoever owns its path, naming no plugin', async () => {
    // The shell used to spell `workbook` out here — atelier route and all —
    // so it knew one plugin by name and every future one needed its own line.
    // The same brief still works, now because the plugin CLAIMS the path.
    const atelier = plugin('atelier', {
      view: {
        component: () => null,
        route: '/atelier',
        routeFor: (path: string) =>
          path.startsWith('domaines/diy/projets/rangement-garage')
            ? '/atelier/rangement-garage'
            : undefined,
      },
    } as Partial<LoadedPlugin>)
    const brief = {
      generatedAt: new Date().toISOString(),
      items: [
        {
          title: 'Rangement garage',
          target: {
            type: 'workbook',
            path: 'domaines/diy/projets/rangement-garage/assets/workbook.json',
          },
        },
      ],
    }
    const fetchImpl = ((url: string) =>
      Promise.resolve({
        ok: String(url).includes('/api/home/brief'),
        json: () => Promise.resolve(brief),
      })) as unknown as typeof fetch

    render(<Home {...props} plugins={[atelier]} fetchImpl={fetchImpl} />)
    const card = await screen.findByText('Rangement garage')
    card.closest('button')?.click()
    expect(location.hash).toBe('#/atelier/rangement-garage')
    location.hash = ''
  })

  it('falls back to asking when nothing owns the path', async () => {
    const ask = vi.fn()
    const brief = {
      generatedAt: new Date().toISOString(),
      items: [{ title: 'Quelque chose', target: { type: 'workbook', path: 'nowhere/at/all.json' } }],
    }
    const fetchImpl = ((url: string) =>
      Promise.resolve({
        ok: String(url).includes('/api/home/brief'),
        json: () => Promise.resolve(brief),
      })) as unknown as typeof fetch

    render(<Home {...props} plugins={[]} fetchImpl={fetchImpl} ask={ask} />)
    const card = await screen.findByText('Quelque chose')
    card.closest('button')?.click()
    // Never a dead click: the person can still ask for it in words.
    expect(ask).toHaveBeenCalled()
  })

  it('says what to do when there is nothing at all', () => {
    render(<Home {...props} plugins={[]} entries={[]} />)
    expect(screen.getByText(/Nothing to show yet/)).toBeTruthy()
  })

  it('puts the cursor in the composer rather than offering a second input', () => {
    // A search box that was not the chat would split attention between two
    // fields that do different things.
    const focusComposer = vi.fn()
    render(<Home {...props} focusComposer={focusComposer} />)
    screen.getByRole('button', { name: /Ask/ }).click()
    expect(focusComposer).toHaveBeenCalled()
  })
})

describe('arranging the mosaics', () => {
  /** A localStorage the test can read back. */
  const store = () => {
    const map = new Map<string, string>()
    return {
      map,
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      removeItem: (key: string) => void map.delete(key),
      clear: () => map.clear(),
      key: () => null,
      length: 0,
    } as unknown as Storage & { map: Map<string, string> }
  }

  const withStorage = (): Map<string, string> => {
    const storage = store()
    const original = globalThis.localStorage
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
    onTestFinished(() => {
      Object.defineProperty(globalThis, 'localStorage', { value: original, configurable: true })
    })
    return storage.map
  }

  const three = [plugin('todo'), plugin('planif'), plugin('scan')]

  const home = (props: Record<string, unknown> = {}) =>
    render(
      <Home
        skin={{}}
        plugins={three}
        entries={[]}
        openPlugin={vi.fn()}
        openSection={vi.fn()}
        openPage={vi.fn()}
        focusComposer={vi.fn()}
        fetchImpl={vi.fn(() => Promise.reject(new Error('no brief'))) as unknown as typeof fetch}
        {...props}
      />,
    )

  const labels = () =>
    [...document.querySelectorAll('.golem-tiles .golem-tile__label')].map((node) => node.textContent)

  it('offers a way in to arranging, and a way out', () => {
    withStorage()
    home()
    const button = screen.getByRole('button', { name: 'Arrange' })
    // A button rather than a long-press: an invisible gesture on the screen
    // that is half the product's navigation is a gesture nobody finds.
    expect(button.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(button)
    expect(screen.getByRole('button', { name: 'Done' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('offers nothing to arrange when there is one tile', () => {
    withStorage()
    home({ plugins: [plugin('todo')] })
    expect(screen.queryByRole('button', { name: 'Arrange' })).toBeNull()
  })

  it('lays the tiles out as they were last left', () => {
    const map = withStorage()
    map.set('golem.order.apps', JSON.stringify(['scan', 'todo', 'planif']))
    home()
    // The shell's own tile closes the mosaic, whatever was arranged before it.
    expect(labels()).toEqual(['scan', 'todo', 'planif', 'Settings'])
  })

  it('moves a tile and remembers it', () => {
    const map = withStorage()
    home()
    fireEvent.click(screen.getByRole('button', { name: 'Arrange' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move later — todo' }))
    expect(labels()).toEqual(['planif', 'todo', 'scan', 'Settings'])
    // What is remembered is the arrangement of the APPS: the shell's tile is
    // not in the permutation, so it never lands in the stored order.
    expect(JSON.parse(map.get('golem.order.apps') as string)).toEqual(['planif', 'todo', 'scan'])
  })

  it('does nothing at the ends', () => {
    withStorage()
    home()
    fireEvent.click(screen.getByRole('button', { name: 'Arrange' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move earlier — todo' }))
    expect(labels()).toEqual(['todo', 'planif', 'scan', 'Settings'])
  })

  it('does not open a tile somebody is trying to pick up', () => {
    withStorage()
    const openPlugin = vi.fn()
    home({ openPlugin })
    fireEvent.click(screen.getByRole('button', { name: 'Arrange' }))
    // The classic way an edit mode betrays the person in it.
    const tile = document.querySelector('.golem-tiles .golem-tile') as HTMLElement
    fireEvent.click(tile)
    expect(openPlugin).not.toHaveBeenCalled()
  })

  it('opens a tile normally when not arranging', () => {
    withStorage()
    const openPlugin = vi.fn()
    home({ openPlugin })
    fireEvent.click(document.querySelector('.golem-tiles .golem-tile') as HTMLElement)
    expect(openPlugin).toHaveBeenCalled()
  })

  it('keeps a newly enabled app rather than hiding it', () => {
    const map = withStorage()
    map.set('golem.order.apps', JSON.stringify(['scan', 'todo']))
    home({ plugins: [...three, plugin('voyages')] })
    // Unmentioned goes last; nothing is lost to a stale preference.
    expect(labels()).toEqual(['scan', 'todo', 'planif', 'voyages', 'Settings'])
  })

  it('leaves no hole where a disabled app used to be', () => {
    const map = withStorage()
    map.set('golem.order.apps', JSON.stringify(['scan', 'planif', 'todo']))
    home({ plugins: [plugin('scan'), plugin('todo')] })
    expect(labels()).toEqual(['scan', 'todo', 'Settings'])
  })

  it('never lets the shell’s own tile be arranged away', () => {
    const map = withStorage()
    // A stale order that names it — written by hand, or by a version that
    // did put it in the permutation — must not move it or duplicate it.
    map.set('golem.order.apps', JSON.stringify(['Settings', 'scan']))
    home()
    expect(labels()).toEqual(['scan', 'todo', 'planif', 'Settings'])
  })
})
