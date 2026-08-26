// @vitest-environment jsdom
/**
 * The settings screen.
 *
 * What it guards: that one subject is one row, that a row never opens a page
 * with nothing on it, and that the dialog around it says which page is open.
 * The failure this replaced was not ugliness — it was a feature (the MCP
 * readout) that existed and could not be found under a scroll.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Preferences, mcpLede, prefsTitle } from '../src/app/Preferences.js'
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
  onOpenInstructions: vi.fn(),
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

  it('leaves the dialog for the instruction screen', async () => {
    const onOpenInstructions = vi.fn()
    const onPage = vi.fn()
    render(<Preferences {...props(answering([]), { onOpenInstructions, onPage })} />)
    fireEvent.click(screen.getByText('Instructions'))
    expect(onOpenInstructions).toHaveBeenCalled()
    // Prose is edited on a screen, not in a dialog: this row is a door.
    expect(onPage).not.toHaveBeenCalled()
  })
})

describe('a settings page', () => {
  it('carries a way back to the list', async () => {
    const onPage = vi.fn()
    render(<Preferences {...props(answering([]), { page: 'credential', onPage })} />)
    fireEvent.click(await screen.findByText('‹ Settings'))
    expect(onPage).toHaveBeenCalledWith('')
  })

  it('draws the servers on the MCP page', async () => {
    render(<Preferences {...props(answering([{ name: 'notion', state: 'connected' }]), { page: 'mcp' })} />)
    await waitFor(() => expect(screen.getByText('notion')).toBeTruthy())
  })
})

describe('the dialog title', () => {
  it('names the page that is open', () => {
    // A frame still headed "Settings" three rows into a flow has lost track
    // of what it contains.
    const t = (key: string) => key
    expect(prefsTitle('', t)).toBe('Settings')
    expect(prefsTitle('credential', t)).toBe('Agent credential')
    expect(prefsTitle('mcp', t)).toBe('MCP servers')
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
