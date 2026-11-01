// @vitest-environment jsdom
/**
 * Exit criterion of adestia-correctifs-shell-textes: the MCP tile counts the
 * listed servers once, a code-less manifest refusal is headed in the reader's
 * language with the validator's lines untouched, refresh() shows what it
 * throws, the token field refuses autocomplete, and the spin rule is declared once.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CataloguePopin } from '../src/app/CataloguePopin.js'
import { translator } from '../src/app/i18n.js'
import { Preferences, mcpLede } from '../src/app/Preferences.js'
import { Problems } from '../src/app/Problems.js'
import { Settings } from '../src/app/Settings.js'

afterEach(cleanup)

const reply = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as unknown as Response)

const named = (count: number) => Array.from({ length: count }, (_, i) => ({ name: `s${i + 1}` }))
const health = (rows: [string, string][]) =>
  rows.map(([name, state]) => ({ name, state, tools: [] }))

describe('E-9/E-10 — one count for the MCP tile', () => {
  const tile = async (listed: unknown[], status: unknown[]) => {
    const fetchImpl = vi.fn((url: unknown) => {
      const at = String(url)
      if (at === '/api/mcp/status') return reply({ servers: status })
      if (at === '/api/mcp/servers') return reply({ servers: listed })
      return reply({ servers: [], files: [], paths: [] })
    }) as unknown as typeof fetch
    render(<Preferences page="" onPage={vi.fn()} onItem={vi.fn()} fetchImpl={fetchImpl} />)
    await screen.findByText('6 servers', { selector: '.adestia-chip, .adestia-chip *' }).catch(() => undefined)
    return document.body
  }

  it('6 listed, 7 reported by health (the 7th failed): chip and subtitle say 6, none needs attention', async () => {
    const status = health([
      ['s1', 'connected'], ['s2', 'connected'], ['s3', 'connected'],
      ['s4', 'connected'], ['s5', 'connected'], ['s6', 'connected'], ['ghost', 'failed'],
    ])
    const body = await tile(named(6), status)
    await waitFor(() => expect(body.textContent).toContain('6 servers'))
    expect(body.textContent).not.toContain('7 servers')
    expect(body.textContent).not.toContain('need attention')
    // Both the chip and the subtitle carry the count.
    expect((body.textContent!.match(/6 servers/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('counts attention only among the listed ones', async () => {
    const status = health([
      ['s1', 'failed'], ['s2', 'needs-auth'], ['s3', 'connected'],
      ['s4', 'connected'], ['s5', 'connected'], ['s6', 'connected'], ['ghost', 'failed'],
    ])
    const body = await tile(named(6), status)
    await waitFor(() => expect(body.textContent).toContain('6 servers — 2 need attention'))
  })

  it('mcpLede: listed count, attention joined by name', () => {
    const t = (k: string) => k
    const status = health([['a', 'failed'], ['z', 'failed']])
    expect(mcpLede(status as never, t, [{ name: 'a' }, { name: 'b' }])).toBe('2 servers — 1 need attention')
    expect(mcpLede(status as never, t, [{ name: 'b' }])).toBe('1 server')
    expect(mcpLede([], t, [])).toBe('0 servers')
  })
})

describe('E-19 — manifest refusal headed in the reader’s language', () => {
  const lines = '\n  - id: must be lowercase\n  - description: expected a string'
  const band = (reason: string, locale: 'en' | 'fr', code?: string) =>
    render(
      <Problems
        instance={{ pluginProblems: [{ id: 'bench-invalid', reason, ...(code ? { code } : {}) }] } as never}
        failures={[]}
        loaded={[]}
        pages={[]}
        t={translator(locale)}
        locale={locale}
      />,
    ).container.textContent ?? ''

  it('fr: plugin heading without a folder name, lines intact', () => {
    const text = band(`Invalid plugin manifest:${lines}`, 'fr')
    expect(text).toContain(`Manifeste de plugin invalide:${lines}`)
    expect(text).not.toContain('Invalid plugin manifest')
  })

  it('fr: plugin and skin headings with the folder name', () => {
    expect(band(`Invalid plugin manifest for "bench-invalid":${lines}`, 'fr'))
      .toContain(`Manifeste de plugin invalide pour "bench-invalid":${lines}`)
    expect(band(`Invalid skin manifest for "dobby":${lines}`, 'fr'))
      .toContain(`Manifeste d’habillage invalide pour "dobby":${lines}`)
    expect(band(`Invalid skin manifest:${lines}`, 'fr')).toContain(`Manifeste d’habillage invalide:${lines}`)
  })

  it('en: the sentence is unchanged', () => {
    expect(band(`Invalid plugin manifest for "x":${lines}`, 'en')).toContain(`Invalid plugin manifest for "x":${lines}`)
  })

  it('a "%name" folder name and a "$&" are not interpreted', () => {
    expect(band(`Invalid plugin manifest for "a$&%name":${lines}`, 'fr'))
      .toContain(`Manifeste de plugin invalide pour "a$&%name":${lines}`)
  })

  it('does not rewrite other reasons, nor one that carries a code, nor a mid-sentence mention', () => {
    expect(band('manifest is not valid JSON: x', 'fr')).toContain('manifest is not valid JSON: x')
    expect(band('see Invalid plugin manifest: x', 'fr')).toContain('see Invalid plugin manifest: x')
    expect(band(`Invalid plugin manifest:${lines}`, 'fr', 'missing-secret')).not.toContain('Manifeste de plugin invalide')
  })
})

describe('E-12 — refresh() shows what is thrown', () => {
  it('onChanged throwing puts its message in the pop-in and frees the button', async () => {
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (url === '/api/instructions') return reply({ files: [], paths: [] })
      if (url === '/api/instruction-catalogues' && method === 'GET')
        return reply({ catalogues: [{ id: 'homelab', repo: 'https://x/h.git', ref: 'main', imports: [] }] })
      if (url === '/api/instruction-catalogues/homelab/refresh') return reply({ refreshed: [], missing: [] })
      if (url === '/api/instruction-catalogues/homelab/items') return reply({ items: [] })
      return reply({}, 404)
    }) as unknown as typeof fetch
    render(<CataloguePopin fetchImpl={fetchImpl} onClose={() => undefined} onChanged={() => { throw new Error('kaboom') }} />)
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(await within(dialog).findByText('homelab'))
    const button = await within(dialog).findByRole('button', { name: /Refresh/i })
    fireEvent.click(button)
    await waitFor(() => expect(within(dialog).queryByText(/kaboom/)).toBeTruthy())
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false))
  })
})

describe('token field', () => {
  it('keeps autoComplete="off" (not reproduced: already so since 64dee0f)', async () => {
    const fetchImpl = ((url: string, init?: RequestInit) => {
      if (url === '/api/auth/driver' && (init?.method ?? 'GET') === 'GET')
        return reply({ state: 'absent', source: 'managed' })
      if (url === '/api/auth/driver/begin')
        return reply({ sessionId: 's', mode: 'url+code', authorizeUrl: 'https://x/a', inputLabel: 'Paste the code' })
      return reply({})
    }) as unknown as typeof fetch
    render(<Settings fetchImpl={fetchImpl} />)
    fireEvent.click(await screen.findByText('Arm a token'))
    await screen.findByText('Paste the code')
    expect(screen.getByRole('textbox').getAttribute('autocomplete')).toBe('off')
  })
})

describe('icons.css', () => {
  it('declares the spin rule and its keyframes once across the stylesheets', () => {
    const dir = resolve(process.cwd(), 'packages/web/src')
    const sheets: string[] = []
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = resolve(d, e.name)
        if (e.isDirectory()) walk(p)
        else if (e.name.endsWith('.css')) sheets.push(readFileSync(p, 'utf8'))
      }
    }
    walk(dir)
    const css = sheets.join('\n')
    // The reduced-motion override is a second selector use, not a second declaration of the spin.
    const outsideMedia = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
    expect((outsideMedia.match(/\.adestia-icon--spin\s*\{/g) ?? []).length).toBe(1)
    expect((css.match(/@keyframes\s+adestia-icon-spin/g) ?? []).length).toBe(1)
  })
})
