// @vitest-environment jsdom
/**
 * The MCP screen at the charter's level: every health state tells itself with
 * an icon, the buttons are the shell's, the fallback sentences are said in the
 * reader's language, and every sentence the screen can say has a French form.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { translator } from '../src/app/i18n.js'
import { McpServers } from '../src/app/McpServers.js'

const reply = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) } as unknown as Response)

const STATES = ['connected', 'failed', 'needs-auth', 'pending', 'disabled', 'unknown'] as const

function serving(over: Record<string, (init?: RequestInit) => Promise<Response>> = {}): typeof fetch {
  const servers = STATES.map((state) => ({
    name: `srv-${state}`,
    source: 'ui',
    editable: true,
    transport: 'stdio',
    config: { name: `srv-${state}`, command: 'npx' },
  }))
  return vi.fn((input: unknown, init?: RequestInit) => {
    const url = String(input)
    if (over[url]) return over[url]!(init)
    if (url === '/api/mcp/servers') return reply(200, { servers })
    if (url === '/api/mcp/status') return reply(200, { servers: STATES.map((state) => ({ name: `srv-${state}`, state })) })
    return reply(200, {})
  }) as unknown as typeof fetch
}

describe('the MCP screen, charter level', () => {
  // Fails if a health chip is left to its tint alone.
  it('gives each of the six health states its own icon on the tile', async () => {
    const { container } = render(<McpServers onOpen={() => {}} fetchImpl={serving()} />)
    await screen.findByText('srv-connected')
    await waitFor(() => expect(container.querySelectorAll('.adestia-chip').length).toBeGreaterThanOrEqual(6))
    const chips = Array.from(container.querySelectorAll('.adestia-chip'))
    expect(chips).toHaveLength(6)
    for (const chip of chips) expect(chip.querySelector('svg')).toBeTruthy()
    const shapes = chips.map((chip) => chip.querySelector('svg')!.innerHTML)
    expect(new Set(shapes).size).toBe(6)
  })

  // Fails if the detail's state loses its icon.
  it('draws the opened server’s health with an icon and the words', async () => {
    const { container } = render(<McpServers open="srv-needs-auth" onOpen={() => {}} fetchImpl={serving()} />)
    const stat = await waitFor(() => {
      const el = container.querySelector('.adestia-stat')
      expect(el).toBeTruthy()
      return el!
    })
    expect(stat.textContent).toBe('needs a sign-in')
    expect(stat.querySelector('svg')).toBeTruthy()
  })

  // Fails if the empty list goes back to a bare paragraph or the add tile disappears.
  it('says an empty list with the shared empty state and still offers to add', async () => {
    const f = serving({ '/api/mcp/servers': () => reply(200, { servers: [] }) })
    render(<McpServers onOpen={() => {}} fetchImpl={f} />)
    expect(await screen.findByText('None wired yet — add one, or declare it in the configuration file.')).toBeTruthy()
    expect(screen.getByText('Add a server')).toBeTruthy()
  })

  // Fails if the invalid-JSON message is posted instead of caught, or left in English.
  it('refuses invalid JSON in French without posting', async () => {
    const f = serving()
    const t = translator('fr')
    const { container } = render(<McpServers open="srv-failed" onOpen={() => {}} fetchImpl={f} t={t} />)
    const box = (await waitFor(() => {
      const el = container.querySelector('textarea')
      expect(el?.value).toContain('srv-failed')
      return el!
    })) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '{ nope' } })
    fireEvent.click(screen.getByText('Enregistrer'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('La déclaration n’est pas du JSON valide.')
    const puts = (f as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')
    expect(puts).toHaveLength(0)
  })

  // Fails if a refusal with no body shows the English fallback under the French locale.
  it('says a bodiless refusal on Save in French', async () => {
    const f = serving({ '/api/mcp/servers/srv-failed': () => reply(500, undefined) })
    const { container } = render(<McpServers open="srv-failed" onOpen={() => {}} fetchImpl={f} t={translator('fr')} />)
    const box = (await waitFor(() => {
      const el = container.querySelector('textarea')
      expect(el?.value).toContain('srv-failed')
      return el!
    })) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '{"name":"srv-failed","command":"x"}' } })
    fireEvent.click(screen.getByText('Enregistrer'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).not.toMatch(/request failed/)
    expect(alert.textContent).toContain('500')
  })

  // Fails if the declaration textarea becomes editable for a server owned elsewhere.
  it('keeps a config-owned declaration read-only, with no Save or Remove', async () => {
    const f = serving({
      '/api/mcp/servers': () =>
        reply(200, { servers: [{ name: 'ha', source: 'config', editable: false, transport: 'http', config: { name: 'ha' } }] }),
    })
    const { container } = render(<McpServers open="ha" onOpen={() => {}} fetchImpl={f} />)
    const box = (await waitFor(() => {
      const el = container.querySelector('textarea')
      expect(el?.value).toContain('"ha"')
      return el!
    })) as HTMLTextAreaElement
    expect(box.readOnly).toBe(true)
    expect(screen.queryByText('Save')).toBeNull()
    expect(screen.queryByText('Remove')).toBeNull()
  })

  // Fails if the read-only mark loses its lock (E-10), in either language.
  it.each([['en', 'read-only'], ['fr', 'lecture seule']])('marks a config-owned tile with a lock in %s', async (lang, word) => {
    const f = serving({
      '/api/mcp/servers': () =>
        reply(200, { servers: [{ name: 'ha', source: 'config', editable: false, transport: 'http', config: { name: 'ha' } }] }),
    })
    const { container } = render(<McpServers onOpen={() => {}} fetchImpl={f} t={translator(lang as 'en' | 'fr')} />)
    await screen.findByText('ha')
    const chip = await waitFor(() => {
      const el = Array.from(container.querySelectorAll('.adestia-chip')).find((c) => c.textContent?.includes(word))
      expect(el).toBeTruthy()
      return el!
    })
    expect(chip.querySelector('svg use')?.getAttribute('href') ?? chip.querySelector('svg')?.innerHTML).toContain('lock')
  })

  // Fails if hot chip text goes back to the decorative tile hue (Skippy light fell under AA).
  it('colours hot chip text with the text token, not the tile hue', () => {
    const css = readFileSync(resolve(__dirname, '../src/app/styles/tiles.css'), 'utf8')
    const rule = /\.adestia-chip--hot\s*\{([^}]*)\}/.exec(css)![1]!
    // The text twin first (contrast.test.ts measures it composed, AA per skin and theme); the plain hue
    // alone (`var(--tile-color)`) or a bare `--accent-text` that drops the tile's hue are not it.
    expect(rule).toMatch(/(^|[;\s])color:\s*var\(--tile-color-text,\s*var\(--tile-color,\s*var\(--accent-text\)\)\)\s*;/)
  })

  // Fails if any sentence the MCP files say is missing from the French table.
  it('has a French form for every sentence the MCP screen files say', () => {
    const fr = translator('fr')
    const files = ['McpServers.tsx', 'mcp/ServerDetail.tsx', 'mcp/ServerList.tsx', 'mcp/useDeclaration.ts', 'mcp/health.ts']
    const missing: string[] = []
    for (const file of files) {
      const source = readFileSync(resolve(__dirname, '../src/app', file), 'utf8')
      const keys = [...source.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'\s*\)/g)].map((m) => m[1]!.replace(/\\'/g, "'"))
      keys.push(...[...source.matchAll(/label: '([^']+)'/g)].map((m) => m[1]!))
      for (const key of keys) if (fr(key) === key) missing.push(`${file}: ${key}`)
    }
    expect(missing).toEqual([])
  })
})
