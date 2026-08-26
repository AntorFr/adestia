// @vitest-environment jsdom
/**
 * The settings screen.
 *
 * What it guards: that one subject is one row, that a row never opens a page
 * with nothing on it, and that the screen names the page that is open. The
 * failure this replaced was not ugliness — it was a feature (the MCP readout)
 * that existed and could not be found under a scroll.
 *
 * Every row now opens a PAGE, Instructions included: it was a door out of the
 * dialog only because prose cannot be edited in a box 520px wide, and there
 * is no dialog left to leave.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Preferences, isPrefsPage, mcpLede, prefsTitle, themeLede } from '../src/app/Preferences.js'
import type { McpServerHealth } from '../src/app/Settings.js'

/** The two endpoints the screen reads, answered together. */
const answering = (servers: unknown, credential = 404): typeof fetch =>
  vi.fn((url: unknown) => {
    if (String(url) === '/api/mcp/status') {
      return Promise.resolve(
        servers === undefined
          ? ({ ok: false, status: 404, json: () => Promise.resolve({}) } as unknown as Response)
          : ({ ok: true, status: 200, json: () => Promise.resolve({ servers }) } as unknown as Response),
      )
    }
    return Promise.resolve({
      ok: credential === 200,
      status: credential,
      json: () => Promise.resolve({ state: 'absent', source: 'managed' }),
    } as unknown as Response)
  }) as unknown as typeof fetch

const props = (fetchImpl: typeof fetch, over: Record<string, unknown> = {}) => ({
  page: '' as const,
  onPage: vi.fn(),
  fetchImpl,
  ...over,
})

describe('the settings list', () => {
  it('offers a row per subject, credential and instructions always', async () => {
    render(<Preferences {...props(answering([]))} />)
    expect(screen.getByText('Agent credential')).toBeTruthy()
    expect(screen.getByText('Instructions')).toBeTruthy()
  })

  it('offers no MCP row when the driver does not report', async () => {
    // A row that opened a page with nothing on it is worse than no row: it
    // sends somebody looking for a feature this engine does not have.
    render(<Preferences {...props(answering(undefined))} />)
    await screen.findByText('Agent credential')
    expect(screen.queryByText('MCP servers')).toBeNull()
  })

  it('offers no MCP row when the driver reports none', async () => {
    render(<Preferences {...props(answering([]))} />)
    await screen.findByText('Agent credential')
    // Distinct from the 404 above, and the same verdict: an empty page.
    expect(screen.queryByText('MCP servers')).toBeNull()
  })

  it('says what is behind the MCP row before it is opened', async () => {
    render(
      <Preferences
        {...props(
          answering([
            { name: 'notion', state: 'connected' },
            { name: 'github', state: 'needs-auth' },
          ]),
        )}
      />,
    )
    await screen.findByText('MCP servers')
    // The whole point of the shape: the row is informative shut.
    expect(screen.getByText('2 servers — 1 need attention')).toBeTruthy()
  })

  it('opens a page rather than scrolling to a section', async () => {
    const onPage = vi.fn()
    render(<Preferences {...props(answering([]), { onPage })} />)
    fireEvent.click(screen.getByText('Agent credential'))
    expect(onPage).toHaveBeenCalledWith('credential')
  })

  it('opens the instructions in here rather than leaving for them', async () => {
    // The row used to be a DOOR: prose is not edited in a dialog, and the
    // dialog was the reason. On a screen it is a page like the others.
    const onPage = vi.fn()
    render(<Preferences {...props(answering([]), { onPage })} />)
    fireEvent.click(screen.getByText('Instructions'))
    expect(onPage).toHaveBeenCalledWith('instructions')
  })

  it('says which way the appearance is set before it is opened', () => {
    render(<Preferences {...props(answering([]), { theme: 'dark' })} />)
    // Same virtue as the MCP count: the row is informative shut.
    expect(screen.getByText('Dark')).toBeTruthy()
  })
})

describe('a settings page', () => {
  it('names itself, now that no frame is doing it', async () => {
    render(<Preferences {...props(answering([]), { page: 'credential' })} />)
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Agent credential')
  })

  it('draws the servers on the MCP page', async () => {
    render(<Preferences {...props(answering([{ name: 'notion', state: 'connected' }]), { page: 'mcp' })} />)
    await waitFor(() => expect(screen.getByText('notion')).toBeTruthy())
  })

  it('offers the theme as named choices, and says which is in force', () => {
    const onTheme = vi.fn()
    render(<Preferences {...props(answering([]), { page: 'appearance', theme: '', onTheme })} />)
    // The header's cycling glyph can only be inferred; these SAY it.
    expect(screen.getByRole('radio', { name: 'System' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(onTheme).toHaveBeenCalledWith('dark')
  })

  it('edits the instructions in place rather than sending somebody away', async () => {
    render(<Preferences {...props(answering([]), { page: 'instructions' })} />)
    // The instruction zone brings its own head — the screen does not add a
    // second one over it.
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 1 }).length).toBe(1))
  })
})

describe('the screen title', () => {
  it('names the page that is open', () => {
    // The breadcrumb reads it: a trail still ending "Settings" three rows
    // into the credential flow has lost track of where somebody is.
    const t = (key: string) => key
    expect(prefsTitle('', t)).toBe('Settings')
    expect(prefsTitle('credential', t)).toBe('Agent credential')
    expect(prefsTitle('mcp', t)).toBe('MCP servers')
    expect(prefsTitle('appearance', t)).toBe('Appearance')
    expect(prefsTitle('instructions', t)).toBe('Instructions')
  })
})

describe('the addresses of the pages', () => {
  it('answers for the pages it has, and for nothing else', () => {
    // `#/settings/…` is public and the address bar is user-writable: a
    // segment naming no page has to resolve to the list rather than to a
    // title over an empty screen.
    expect(isPrefsPage('credential')).toBe(true)
    expect(isPrefsPage('instructions')).toBe(true)
    expect(isPrefsPage('')).toBe(false)
    expect(isPrefsPage('whatever')).toBe(false)
  })
})

describe('the appearance lede', () => {
  const t = (key: string) => key

  it('says the choice in force, never a description of the subject', () => {
    expect(themeLede('', t)).toBe('Follows this device')
    expect(themeLede('light', t)).toBe('Light')
    expect(themeLede('dark', t)).toBe('Dark')
  })

  it('falls back to the device for a value nobody offers', () => {
    // localStorage is user-writable, like the order of the tiles.
    expect(themeLede('chartreuse', t)).toBe('Follows this device')
  })
})

describe('the MCP lede', () => {
  const t = (key: string) => key
  const server = (state: McpServerHealth['state']): McpServerHealth => ({ name: state, state })

  it('counts, and says so in the singular when there is one', () => {
    expect(mcpLede([server('connected')], t)).toBe('1 server')
  })

  it('stays quiet when nothing needs a person', () => {
    expect(mcpLede([server('connected'), server('pending')], t)).toBe('2 servers')
  })

  it('names both kinds of trouble, and only those', () => {
    // `disabled` and `unknown` are facts about the config and about time,
    // not jobs waiting for somebody.
    expect(mcpLede([server('failed'), server('needs-auth'), server('disabled')], t)).toBe(
      '3 servers — 2 need attention',
    )
  })
})
