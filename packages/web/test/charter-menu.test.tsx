// @vitest-environment jsdom
/**
 * The cog menu, the settings mosaic and the problems band, at the charter's
 * level: icons rather than emoji or text, a menu that gives focus back, and
 * sentences in the instance's language.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { translator } from '../src/app/i18n.js'
import { Preferences } from '../src/app/Preferences.js'
import { Problems } from '../src/app/Problems.js'
import { Settings } from '../src/app/Settings.js'
import { SettingsMenu } from '../src/app/SettingsMenu.js'

const json = (body: unknown, code = 200) =>
  Promise.resolve({ ok: code < 300, status: code, json: () => Promise.resolve(body) } as unknown as Response)

const quiet = vi.fn((url: unknown) => {
  const at = String(url)
  if (at === '/api/auth/driver') return json({ state: 'armed', source: 'managed', savedAt: '2026-06-01T00:00:00Z' })
  if (at === '/api/auth/driver/begin')
    return json({ sessionId: 's', mode: 'device-code', authorizeUrl: 'https://x.test/d', userCode: 'AB-12' })
  return json({ servers: [], files: [], paths: [] })
}) as unknown as typeof fetch

const PICTOGRAPH = /\p{Extended_Pictographic}/u

describe('the cog menu', () => {
  // Fails if Escape stops going through the popover's focus scope.
  it('closes on Escape and hands focus back to the cog', async () => {
    render(<SettingsMenu theme="" onTheme={() => {}} fetchImpl={quiet} />)
    const cog = screen.getByLabelText('Settings')
    cog.focus()
    fireEvent.click(cog)
    await screen.findByRole('radiogroup', { name: 'Theme' })
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(document.querySelector('.adestia-cog__panel')).toBeNull()
    expect(document.activeElement).toBe(cog)
    expect(cog.getAttribute('aria-expanded')).toBe('false')
  })

  // Fails if a text button comes back for the theme, or the choice is told by colour alone.
  it('offers the theme as three icon radios, and tells the chosen one by aria-checked', async () => {
    const onTheme = vi.fn()
    render(<SettingsMenu theme="dark" onTheme={onTheme} fetchImpl={quiet} />)
    fireEvent.click(screen.getByLabelText('Settings'))
    const group = await screen.findByRole('radiogroup', { name: 'Theme' })
    const radios = Array.from(group.querySelectorAll('[role=radio]'))
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['System', 'Light', 'Dark'])
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true'])
    for (const radio of radios) {
      expect(radio.textContent).toBe('')
      expect(radio.querySelector('svg')).toBeTruthy()
    }
    fireEvent.click(radios[1]!)
    expect(onTheme).toHaveBeenCalledWith('light')
  })

  // Fails if the menu clings to a press outside.
  it('closes on a press outside', async () => {
    render(<SettingsMenu theme="" onTheme={() => {}} fetchImpl={quiet} />)
    fireEvent.click(screen.getByLabelText('Settings'))
    await screen.findByRole('radiogroup')
    fireEvent.mouseDown(document.body)
    expect(document.querySelector('.adestia-cog__panel')).toBeNull()
  })

  // Fails if the sign-out loses its icon or shows for an instance with no session.
  it('shows sign-out with an icon only when somebody is signed in', async () => {
    const { rerender } = render(<SettingsMenu theme="" onTheme={() => {}} fetchImpl={quiet} signedIn="Léa" />)
    fireEvent.click(screen.getByLabelText('Settings'))
    const out = (await screen.findByText('Sign out')).closest('button')!
    expect(out.querySelector('svg')).toBeTruthy()
    rerender(<SettingsMenu theme="" onTheme={() => {}} fetchImpl={quiet} />)
    expect(screen.queryByText('Sign out')).toBeNull()
  })
})

describe('the token states', () => {
  // Fails if a state is told by colour alone.
  it.each([
    [{ state: 'armed', source: 'managed' }],
    [{ state: 'invalid', source: 'managed', reason: 'revoked' }],
    [{ state: 'absent', source: 'managed' }],
    [{ state: 'absent', source: 'cli-native' }],
  ])('draws an icon beside %j', async (status) => {
    const impl = vi.fn(() => json(status)) as unknown as typeof fetch
    const { container } = render(<Settings fetchImpl={impl} />)
    await waitFor(() => expect(container.querySelector('.adestia-token svg')).toBeTruthy())
    expect(container.querySelector('.adestia-token')?.textContent).not.toBe('')
  })

  // Fails if any sentence of the arming flow bypasses the translator.
  it('speaks French through the whole device-code flow', async () => {
    const { container } = render(<Settings fetchImpl={quiet} t={translator('fr')} locale="fr" />)
    fireEvent.click(await screen.findByText('Renouveler le jeton'))
    await screen.findByText('AB-12')
    const text = container.textContent ?? ''
    expect(text).toContain('Ouvrez la page de connexion et saisissez le code AB-12')
    expect(text).toContain('J’ai approuvé — terminer')
    expect(text).toContain('Annuler')
    expect(text).not.toMatch(/Open |approved|Cancel/)
  })
})

describe('the mosaic', () => {
  // Fails if an emoji comes back on a tile or the header.
  it('draws the four tiles and its header with icons, never an emoji', () => {
    const { container } = render(
      <Preferences page="" onPage={vi.fn()} onItem={vi.fn()} fetchImpl={quiet} t={(k) => k} />,
    )
    const tiles = Array.from(container.querySelectorAll('.adestia-tiles > li'))
    expect(tiles.length).toBe(4)
    expect(tiles.map((t) => t.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('MCP servers'),
        expect.stringContaining('Instructions'),
        expect.stringContaining('Configuration'),
        expect.stringContaining('Delegations'),
      ]),
    )
    for (const tile of tiles) expect(tile.querySelector('svg')).toBeTruthy()
    expect(container.querySelector('.adestia-chead svg')).toBeTruthy()
    expect(container.textContent).not.toMatch(PICTOGRAPH)
    expect(container.textContent).not.toContain('⚙')
  })
})

describe('the problems band', () => {
  const instance = {
    pluginProblems: [{ id: 'q', reason: 'soft', severity: 'degraded' }],
    backgroundTrouble: {
      code: 'unknown-code',
      servers: ['notion'],
      since: '2026-03-05T10:00:00Z',
    },
  } as never
  const pages = [
    { path: 'a', title: 'a', fields: { app: 'ghost' } },
    { path: 'b/c/d', title: 'd', fields: { app: 'x' } },
  ] as never

  const band = (locale: string) =>
    render(
      <Problems
        instance={instance}
        failures={[{ id: 'p', reason: 'boom' }]}
        loaded={[]}
        pages={pages}
        t={translator(locale === 'fr' ? 'fr' : 'en')}
        locale={locale}
      />,
    ).container

  // Fails if a severity loses its icon or a stray reason stays in English.
  it('draws an icon per kind and says the stray reasons in French', () => {
    const container = band('fr')
    const headings = Array.from(container.querySelectorAll('h2'))
    expect(headings.length).toBe(3)
    for (const h of headings) expect(h.querySelector('svg')).toBeTruthy()
    expect(container.textContent).not.toMatch(/no active plugin|is only read/)
    expect(container.textContent).toContain('aucun plugin actif ne s’appelle « ghost »')
    expect(container.textContent).toContain('« app » n’est lu que sur un dossier de premier niveau')
  })

  // Fails if the stray reason is not translated for English either (keys stay the English sentence).
  it('says the stray reasons in English with the plugin name filled in', () => {
    const container = band('en')
    expect(container.textContent).toContain('no active plugin is called "ghost"')
  })

  // Fails if the date uses the browser's language instead of the instance's.
  it('writes the date of a background fault in the instance’s language', () => {
    const fr = band('fr').querySelector('.adestia-problems--degraded p')!.textContent!
    expect(fr).toContain(new Date('2026-03-05T10:00:00Z').toLocaleString('fr'))
    document.body.innerHTML = ''
    const en = band('en-US').querySelector('.adestia-problems--degraded p')!.textContent!
    expect(en).toContain(new Date('2026-03-05T10:00:00Z').toLocaleString('en-US'))
    expect(fr).not.toBe(en)
  })
})
