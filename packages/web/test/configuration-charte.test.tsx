// @vitest-environment jsdom
/**
 * E-13 / E-14 at the charte's level: a loading state before the form, the
 * tile's colour on every rendering, an icon on every restart state, and no
 * English left on screen in French. Expected values are written by hand.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SETTING_GROUPS } from '@antorfr/adestia-schemas'

import { Configuration } from '../src/app/Configuration.js'
import { Delegations } from '../src/app/Delegations.js'
import { translator } from '../src/app/i18n.js'

const PAYLOAD = {
  groups: SETTING_GROUPS,
  values: [{ path: ['workspace', 'watch', 'enabled'], value: true, source: 'file' }],
  file: '/app/adestia.config.yaml',
  writable: true,
  revision: '1',
}

function reply(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as unknown as Response
}

/** Records every key the screen asks to translate. */
function spy(locale: 'fr' | 'en') {
  const asked = new Set<string>()
  const inner = translator(locale)
  return {
    asked,
    t: (key: string) => {
      asked.add(key)
      return inner(key)
    },
  }
}

/** Keys whose French is legitimately the same word. */
const SAME_IN_FRENCH = new Set(['Configuration', 'Restart', 'Delegations', 'Actions'])

function untranslated(asked: ReadonlySet<string>): string[] {
  const fr = translator('fr')
  return [...asked].filter((key) => /[A-Za-z]{3}/.test(key) && fr(key) === key && !SAME_IN_FRENCH.has(key))
}

function restartFetch(restart: { status: number; body: unknown } | 'hang', writable = true) {
  return vi.fn((input: unknown, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/restart') return restart === 'hang' ? new Promise<Response>(() => {}) : Promise.resolve(reply(restart.status, restart.body))
    if (url === '/api/health') return Promise.resolve(reply(503, {}))
    if (init?.method === 'PUT') return Promise.resolve(reply(200, { revision: '2', values: PAYLOAD.values }))
    return Promise.resolve(reply(200, { ...PAYLOAD, writable }))
  }) as unknown as typeof fetch
}

async function owedRestart(impl: typeof fetch, t?: (key: string) => string) {
  const view = render(<Configuration fetchImpl={impl} {...(t ? { t } : {})} />)
  await waitFor(() => expect(view.container.querySelector('.adestia-config__field')).toBeTruthy())
  fireEvent.click(view.container.querySelector('#setting-workspace\\.watch\\.polling') as HTMLInputElement)
  fireEvent.click(view.container.querySelector('.adestia-config__bar button:last-child') as HTMLButtonElement)
  await waitFor(() => expect(view.container.querySelector('.adestia-config__restart-bar')).toBeTruthy())
  return view
}

describe('E-14 before and around the form', () => {
  it('shows a loading state, and no form, while the answer is late', () => {
    const never = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch
    const { container } = render(<Configuration fetchImpl={never} />)
    expect(screen.getByRole('status').textContent).toContain('Loading…')
    expect(container.querySelector('.adestia-config__field')).toBeNull()
  })

  it('carries the tile colour while loading', () => {
    const never = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch
    const { container } = render(<Configuration fetchImpl={never} />)
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--tile-color')).not.toBe('')
  })

  it('carries the tile colour on the error rendering', async () => {
    const impl = vi.fn(() => Promise.resolve(reply(500, {}))) as unknown as typeof fetch
    const { container } = render(<Configuration fetchImpl={impl} />)
    await waitFor(() => expect(screen.getByText('The settings could not be read.')).toBeTruthy())
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--tile-color')).not.toBe('')
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('carries the tile colour and says so when there is no group', async () => {
    const impl = vi.fn(() => Promise.resolve(reply(200, { ...PAYLOAD, groups: [] }))) as unknown as typeof fetch
    const { container } = render(<Configuration fetchImpl={impl} />)
    await waitFor(() => expect(screen.getByText('No setting to show.')).toBeTruthy())
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--tile-color')).not.toBe('')
  })

  it('keeps the shell’s button labels: Save, Discard', async () => {
    render(<Configuration fetchImpl={restartFetch('hang')} />)
    await waitFor(() => expect(screen.getByText('Save')).toBeTruthy())
    expect(screen.getByText('Discard')).toBeTruthy()
  })
})

describe('every restart state carries an icon', () => {
  const states: Array<[string, { status: number; body: unknown } | 'hang', RegExp]> = [
    ['asking', 'hang', /Restart now|Coming back/],
    ['blocked', { status: 409, body: { running: 2 } }, /Restart anyway/],
    ['failed', { status: 500, body: {} }, /Restart now/],
  ]
  for (const [name, restart, label] of states) {
    it(`${name}: the line and the button each hold an svg`, async () => {
      const { container } = await owedRestart(restartFetch(restart))
      fireEvent.click(screen.getByText('Restart now'))
      await waitFor(() => expect(container.querySelector('.adestia-config__restart-bar')?.textContent).toMatch(label))
      if (name === 'blocked') await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('2 turn(s) running'))
      if (name === 'failed') await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not be restarted'))
      const bar = container.querySelector('.adestia-config__restart-bar') as HTMLElement
      for (const line of bar.querySelectorAll('.adestia-config__restart-line')) {
        expect(line.querySelector('svg'), line.textContent ?? '').toBeTruthy()
      }
      expect(bar.querySelector('button svg')).toBeTruthy()
    })
  }

  it('waiting: the button reads “Coming back…” and is disabled', async () => {
    const impl = restartFetch({ status: 202, body: {} })
    const { container } = await owedRestart(impl)
    fireEvent.click(screen.getByText('Restart now'))
    await waitFor(() => expect(screen.getByText('Coming back…')).toBeTruthy())
    expect((screen.getByText('Coming back…').closest('button') as HTMLButtonElement).disabled).toBe(true)
    expect(container.querySelector('.adestia-config__restart-line svg')).toBeTruthy()
  })
})

describe('no English left in French', () => {
  it('writable form with a pending restart, blocked and failed', async () => {
    const { asked, t } = spy('fr')
    const { container } = await owedRestart(restartFetch({ status: 409, body: { running: 1 } }), t)
    fireEvent.click(container.querySelector('.adestia-config__restart-bar button') as HTMLButtonElement)
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(untranslated(asked)).toEqual([])
  })

  it('read-only form, error and empty renderings', async () => {
    const a = spy('fr')
    const ro = restartFetch('hang', false)
    const view = render(<Configuration fetchImpl={ro} t={a.t} />)
    await waitFor(() => expect(view.container.querySelector('.adestia-config__locked')).toBeTruthy())
    view.unmount()
    const b = spy('fr')
    const bad = vi.fn(() => Promise.resolve(reply(404, {}))) as unknown as typeof fetch
    render(<Configuration fetchImpl={bad} t={b.t} />)
    await waitFor(() => expect(b.asked.has('This instance does not expose its configuration.')).toBe(true))
    expect(untranslated(new Set([...a.asked, ...b.asked]))).toEqual([])
  })

  it('a locked screen translates the server’s known read-only reason', async () => {
    const impl = vi.fn(() =>
      Promise.resolve(reply(200, { ...PAYLOAD, writable: false, readOnlyReason: 'the configuration file is not writable by this instance' })),
    ) as unknown as typeof fetch
    const { container } = render(<Configuration fetchImpl={impl} t={translator('fr')} />)
    await waitFor(() => expect(container.querySelector('.adestia-config__locked')).toBeTruthy())
    expect(container.querySelector('.adestia-config__locked')?.textContent).toContain('pas modifiable')
    expect(container.querySelector('.adestia-config__locked')?.textContent).not.toContain('not writable')
  })

  it('delegations: list, chips and empty state', async () => {
    const { asked, t } = spy('fr')
    const rows = [
      { caller: 'alfred', id: 'a', title: 'Ranger', updatedAt: '2026-09-06T10:00:00Z', turn: 'running' },
      { caller: 'alfred', id: 'b', title: 'Trier', updatedAt: '2026-09-06T10:00:00Z', turn: 'waiting' },
    ]
    const impl = vi.fn(() => Promise.resolve(reply(200, { delegations: rows }))) as unknown as typeof fetch
    const view = render(<Delegations onOpen={() => {}} fetchImpl={impl} t={t} />)
    await waitFor(() => expect(screen.getByText('Ranger')).toBeTruthy())
    expect(view.container.textContent).toContain('en cours')
    expect(view.container.textContent).toContain('en attente')
    view.unmount()
    const empty = vi.fn(() => Promise.resolve(reply(200, { delegations: [] }))) as unknown as typeof fetch
    render(<Delegations onOpen={() => {}} fetchImpl={empty} t={t} />)
    await waitFor(() => expect(screen.getByText(/Aucune tâche déléguée|pas encore/i)).toBeTruthy())
    expect(untranslated(asked)).toEqual([])
  })
})

describe('E-13 chips', () => {
  it('each state chip holds an icon and its word; a row with no turn has none', async () => {
    const rows = [
      { caller: 'alfred', id: 'a', title: 'Ranger', updatedAt: '2026-09-06T10:00:00Z', turn: 'running' },
      { caller: 'alfred', id: 'b', title: 'Trier', updatedAt: '2026-09-06T10:00:00Z', turn: 'waiting' },
      { caller: 'alfred', id: 'c', title: 'Fini', updatedAt: '2026-09-06T10:00:00Z' },
    ]
    const impl = vi.fn(() => Promise.resolve(reply(200, { delegations: rows }))) as unknown as typeof fetch
    const { container } = render(<Delegations onOpen={() => {}} fetchImpl={impl} />)
    await waitFor(() => expect(screen.getByText('Fini')).toBeTruthy())
    const chips = [...container.querySelectorAll('.adestia-deleg__state')]
    expect(chips.map((c) => c.textContent)).toEqual(['running', 'waiting'])
    for (const chip of chips) expect(chip.querySelector('svg')).toBeTruthy()
  })
})
