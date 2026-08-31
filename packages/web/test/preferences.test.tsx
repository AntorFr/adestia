// @vitest-environment jsdom
/**
 * The settings app — the half of settings that is content.
 *
 * What it guards is the split. Two domains of this instance live here, the
 * servers it reaches and the prose it was told, and they are drawn the way
 * every other domain of this product is drawn: tiles. What does NOT live here
 * is the session-sized switches — the token, the theme, signing out — which
 * moved behind the cog, and a test that finds one of them on this screen is a
 * test finding the regression this file exists to prevent.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Preferences, isPrefsPage, mcpLede, prefsTitle } from '../src/app/Preferences.js'
import type { McpServerHealth } from '../src/app/Settings.js'

/** Every endpoint the screen reads, answered by route. */
const answering = (
  health: unknown,
  over: Record<string, unknown> = {},
): typeof fetch =>
  vi.fn((url: unknown) => {
    const at = String(url)
    if (at === '/api/mcp/status') {
      return Promise.resolve(
        health === undefined
          ? ({ ok: false, status: 404, json: () => Promise.resolve({}) } as unknown as Response)
          : ({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ servers: health }),
            } as unknown as Response),
      )
    }
    const body = over[at] ?? { servers: [], files: [], paths: [] }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as unknown as Response)
  }) as unknown as typeof fetch

const props = (fetchImpl: typeof fetch, over: Record<string, unknown> = {}) => ({
  page: '' as const,
  onPage: vi.fn(),
  onItem: vi.fn(),
  fetchImpl,
  ...over,
})

describe('the settings mosaic', () => {
  it('offers the two domains that need a canvas, and nothing else', async () => {
    render(<Preferences {...props(answering([]))} />)
    expect(screen.getByText('MCP servers')).toBeTruthy()
    expect(screen.getByText('Instructions')).toBeTruthy()
    // Behind the cog now: answered where somebody is standing rather than
    // reached by navigating away from whatever they were reading.
    expect(screen.queryByText('Agent credential')).toBeNull()
    expect(screen.queryByText('Appearance')).toBeNull()
  })

  it('offers the MCP tile even where the driver reports no health', async () => {
    // Health 404s on an engine that cannot report; the WIRING is knowable
    // either way, and the screen that adds a server must not disappear with
    // the status board — which is what the row it replaced used to do.
    render(<Preferences {...props(answering(undefined))} />)
    await screen.findByText('MCP servers')
  })

  it('says how much is behind a tile before it is opened', async () => {
    render(
      <Preferences
        {...props(
          answering(
            [
              { name: 'notion', state: 'connected' },
              { name: 'github', state: 'needs-auth' },
            ],
            {
              '/api/mcp/servers': { servers: [{ name: 'notion' }, { name: 'github' }] },
              '/api/instructions': { files: [{ path: 'CLAUDE.md' }] },
            },
          ),
        )}
      />,
    )
    // The whole point of the shape: a tile is informative shut.
    await screen.findByText('2 servers — 1 need attention')
    expect(screen.getByText('1 file')).toBeTruthy()
  })

  it('opens a page rather than scrolling to a section', async () => {
    const onPage = vi.fn()
    render(<Preferences {...props(answering([]), { onPage })} />)
    fireEvent.click(screen.getByText('MCP servers'))
    expect(onPage).toHaveBeenCalledWith('mcp')
    fireEvent.click(screen.getByText('Instructions'))
    expect(onPage).toHaveBeenCalledWith('instructions')
  })
})

describe('a settings page', () => {
  it('draws the servers on the MCP page', async () => {
    render(<Preferences {...props(answering([{ name: 'notion', state: 'connected' }]), { page: 'mcp' })} />)
    await waitFor(() => expect(screen.getAllByText('MCP servers').length).toBeGreaterThan(0))
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
    // The breadcrumb reads it: a trail still ending "Settings" while a file
    // fills the screen has lost track of where somebody is.
    const t = (key: string) => key
    expect(prefsTitle('', t)).toBe('Settings')
    expect(prefsTitle('mcp', t)).toBe('MCP servers')
    expect(prefsTitle('instructions', t)).toBe('Instructions')
  })
})

describe('the addresses of the pages', () => {
  it('answers for the pages it has, and for nothing else', () => {
    // `#/settings/…` is public and the address bar is user-writable: a
    // segment naming no page has to resolve to the mosaic rather than to a
    // title over an empty screen.
    expect(isPrefsPage('mcp')).toBe(true)
    expect(isPrefsPage('instructions')).toBe(true)
    expect(isPrefsPage('')).toBe(false)
    expect(isPrefsPage('whatever')).toBe(false)
    // Pages of this app until the switches moved behind the cog. A bookmark
    // to one is sent back to the mosaic, not rendered as a blank frame.
    expect(isPrefsPage('credential')).toBe(false)
    expect(isPrefsPage('appearance')).toBe(false)
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
