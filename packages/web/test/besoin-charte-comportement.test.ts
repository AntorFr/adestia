/**
 * What the charter's shared components and the redrawn screens DO, seen through a driven
 * browser on the bench instance (B-1 unchanged behaviour, B-7, P-1, P-7 to P-10, P-13,
 * P-14; E-1, E-9 to E-15, E-19, E-21; Q-20, Q-21, Q-23). Expectations are those of
 * docs/ecrans.md § "The charter's screens, as built" and docs/charte.md § 4.
 * Skipped without Playwright (see charte-browser.ts).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Browser, type Page, type Size, launch, newBrowser, open, playwright } from './charte-browser.js'

async function visit(browser: Browser, seed: string, options: { size?: Size; locale?: string; route: string; theme?: 'light' | 'dark'; before?: (page: Page, base: string) => Promise<void> }, run: (page: Page, base: string) => Promise<void>) {
  const instance = await launch(seed, '', options.locale ?? 'en')
  const { context, page } = await open(browser, instance.url, { theme: options.theme ?? 'light', size: options.size ?? 'desk', locale: options.locale ?? 'en', route: options.route, before: options.before })
  try {
    await page.waitForSelector('.adestia-prefs, .adestia-canvas__body', { timeout: 20_000 })
    await page.waitForTimeout(600)
    await run(page, instance.url)
  } finally {
    await context.close()
    await instance.stop()
  }
}

const iconsOf = (page: Page, selector: string) =>
  page.evaluate((s: string) => [...document.querySelectorAll(s)].map((el) => el.querySelector('use')?.getAttribute('href') ?? null), selector)

describe.skipIf(!playwright)('charter — behaviour of the shared components on the settings and entry screens', () => {
  let browser: Browser
  beforeAll(async () => {
    browser = await newBrowser()
  }, 60_000)
  afterAll(async () => {
    await browser?.close()
  })

  describe('E-9 settings mosaic', () => {
    it('keeps four tiles in the order MCP servers, Instructions, Configuration, Delegations, each with its Lucide icon, the Configuration tile included (Q-21)', async () => {
      await visit(browser, 'base', { route: '/settings' }, async (page) => {
        const labels = await page.evaluate(() => [...document.querySelectorAll('.adestia-prefs .adestia-tile__label')].map((n) => n.textContent))
        expect(labels).toEqual(['MCP servers', 'Instructions', 'Configuration', 'Delegations'])
        expect(await iconsOf(page, '.adestia-prefs .adestia-tile__icon')).toEqual(['#adestia-i-plug', '#adestia-i-book-open', '#adestia-i-sliders-horizontal', '#adestia-i-handshake'])
      })
    })
  })

  describe('E-10 MCP servers', () => {
    it('shows each health tone with an icon, and says nothing wired in the shared empty state when none is', async () => {
      await visit(browser, 'base', { route: '/settings/mcp' }, async (page) => {
        const tones = await page.evaluate(() =>
          [...document.querySelectorAll('.adestia-prefs__page .adestia-chip')]
            .filter((c) => ['connected', 'failed', 'needs a sign-in', 'starting', 'disabled'].includes((c.textContent ?? '').trim()))
            .map((c) => `${(c.textContent ?? '').trim()}=${c.querySelector('use')?.getAttribute('href') ?? 'none'}`),
        )
        expect([...new Set(tones)].sort()).toEqual(['connected=#adestia-i-check', 'disabled=#adestia-i-x', 'failed=#adestia-i-circle-alert', 'needs a sign-in=#adestia-i-key-round', 'starting=#adestia-i-loader-circle'])
      })
      await visit(browser, 'empty', { route: '/settings/mcp' }, async (page) => {
        const empty = await page.evaluate(() => {
          const el = document.querySelector('.adestia-prefs__page .adestia-empty')
          return el ? { text: el.textContent, icon: el.querySelector('.adestia-empty__icon use') !== null } : null
        })
        expect(empty?.icon).toBe(true)
        expect(empty?.text).toContain('None wired yet')
      })
    })

    it('marks a read-only declaration with the lock icon (docs/ecrans.md: delivered / read-only = lock)', async () => {
      await visit(browser, 'base', { route: '/settings/mcp' }, async (page) => {
        const hrefs = await page.evaluate(() => [...document.querySelectorAll('.adestia-prefs__page .adestia-chip')].filter((c) => (c.textContent ?? '').trim() === 'read-only').map((c) => c.querySelector('use')?.getAttribute('href') ?? 'none'))
        expect(hrefs).toEqual(['#adestia-i-lock'])
      })
    })
  })

  describe('E-11 instructions and its name sheet (Q-20)', () => {
    it('asks the name of a new skill in a sheet, not a native prompt; Escape closes it and creates nothing', async () => {
      await visit(browser, 'base', { route: '/settings/instructions' }, async (page) => {
        let native = 0
        page.on('dialog', (d) => {
          native += 1
          void d.dismiss()
        })
        const before = await page.evaluate(() => document.querySelectorAll('.adestia-filecard').length)
        await page.locator('.adestia-prefs__page button:text-matches("^\\\\+ Skill$")').first().click({ timeout: 10_000 })
        await page.waitForSelector('.adestia-sheet input', { state: 'visible', timeout: 5000 })
        expect(await page.evaluate(() => document.querySelectorAll('.adestia-sheet').length)).toBe(1)
        expect(await page.evaluate(() => (document.querySelector('.adestia-sheet input') as HTMLInputElement).value)).toBe('')
        await page.keyboard.press('Escape')
        await page.waitForSelector('.adestia-sheet', { state: 'detached', timeout: 5000 })
        expect(await page.evaluate(() => document.querySelectorAll('.adestia-filecard').length)).toBe(before)
        expect(native).toBe(0)
      })
    })

    it('closes the name sheet with Enter on an empty name and creates nothing', async () => {
      await visit(browser, 'base', { route: '/settings/instructions' }, async (page) => {
        const before = await page.evaluate(() => document.querySelectorAll('.adestia-filecard').length)
        await page.locator('.adestia-prefs__page button:text-matches("^\\\\+ Agent$")').first().click({ timeout: 10_000 })
        await page.waitForSelector('.adestia-sheet input', { state: 'visible', timeout: 5000 })
        await page.keyboard.press('Enter')
        await page.waitForSelector('.adestia-sheet', { state: 'detached', timeout: 5000 })
        expect(await page.evaluate(() => document.querySelectorAll('.adestia-filecard').length)).toBe(before)
      })
    })

    it('draws the name sheet as the shared 520 px centred panel on a desk', async () => {
      await visit(browser, 'base', { route: '/settings/instructions' }, async (page) => {
        await page.locator('.adestia-prefs__page button:text-matches("^\\\\+ Skill$")').first().click({ timeout: 10_000 })
        await page.waitForSelector('.adestia-sheet__panel', { state: 'visible' })
        const width = await page.evaluate(() => Math.round((document.querySelector('.adestia-sheet__panel') as HTMLElement).getBoundingClientRect().width))
        expect(width).toBe(520)
      })
    })

    it('marks a delivered file read-only with the lock icon', async () => {
      await visit(browser, 'base', { route: '/settings/instructions' }, async (page) => {
        const marks = await page.evaluate(() => [...document.querySelectorAll('.adestia-filecard__badge')].map((b) => `${(b.textContent ?? '').trim()}=${b.querySelector('use')?.getAttribute('href')}`))
        expect(marks.length).toBeGreaterThan(0)
        expect([...new Set(marks)]).toEqual(['delivered=#adestia-i-lock'])
      })
    })
  })

  describe('E-12 catalogue pop-in on the shared sheet', () => {
    const open12 = (page: Page) => page.locator('button:text-matches("^Catalogues?$")').first().click({ timeout: 10_000 })
    const focusIsOnOpener = (page: Page) => page.evaluate(() => /^Catalogues?$/.test(document.activeElement?.textContent?.trim() ?? ''))

    it('is one dialog over one scrim; Escape closes it and gives the focus back to the Catalogues button', async () => {
      await visit(browser, 'base', { route: '/settings/instructions' }, async (page) => {
        await open12(page)
        await page.waitForSelector('.adestia-sheet__panel', { state: 'visible' })
        const facts = await page.evaluate(() => {
          const panel = document.querySelector('.adestia-sheet__panel') as HTMLElement
          return { sheets: document.querySelectorAll('.adestia-sheet').length, role: panel.getAttribute('role') ?? panel.closest('[role=dialog]')?.getAttribute('role'), modal: (panel.getAttribute('aria-modal') ?? panel.closest('[aria-modal]')?.getAttribute('aria-modal')), labelled: Boolean(panel.getAttribute('aria-labelledby') ?? panel.closest('[aria-labelledby]')) }
        })
        expect(facts).toEqual({ sheets: 1, role: 'dialog', modal: 'true', labelled: true })
        await page.keyboard.press('Escape')
        await page.waitForSelector('.adestia-sheet', { state: 'detached', timeout: 5000 })
        expect(await focusIsOnOpener(page)).toBe(true)
      })
    })

    it('closes on a click on the scrim, outside the panel', async () => {
      await visit(browser, 'base', { route: '/settings/instructions' }, async (page) => {
        await open12(page)
        await page.waitForSelector('.adestia-sheet__panel', { state: 'visible' })
        await page.mouse.click(4, 4)
        await page.waitForSelector('.adestia-sheet', { state: 'detached', timeout: 5000 })
        expect(await focusIsOnOpener(page)).toBe(true)
      })
    })

    it('keeps the focus inside the panel however many times Tab is pressed', async () => {
      await visit(browser, 'base', { route: '/settings/instructions' }, async (page) => {
        await open12(page)
        await page.waitForSelector('.adestia-sheet__panel', { state: 'visible' })
        const outside: string[] = []
        for (let i = 0; i < 25; i++) {
          await page.keyboard.press('Tab')
          const inside = await page.evaluate(() => Boolean(document.activeElement?.closest('.adestia-sheet__panel')))
          if (!inside) outside.push(`after Tab ${i + 1}`)
        }
        expect(outside).toEqual([])
      })
    })

    it('is a centred 520 px panel on a desk', async () => {
      await visit(browser, 'base', { route: '/settings/instructions' }, async (page) => {
        await open12(page)
        await page.waitForSelector('.adestia-sheet__panel', { state: 'visible' })
        const box = await page.evaluate(() => {
          const r = (document.querySelector('.adestia-sheet__panel') as HTMLElement).getBoundingClientRect()
          return { width: Math.round(r.width), centre: Math.round(r.left + r.width / 2), bottomGap: Math.round(window.innerHeight - r.bottom) }
        })
        expect(box.width).toBe(520)
        expect(box.centre).toBe(720)
        expect(box.bottomGap).toBeGreaterThan(20)
      })
    })

    it('is a full-width bottom sheet on a phone', async () => {
      await visit(browser, 'base', { route: '/settings/instructions', size: 'phone' }, async (page) => {
        await open12(page)
        await page.waitForSelector('.adestia-sheet__panel', { state: 'visible' })
        const box = await page.evaluate(() => {
          const r = (document.querySelector('.adestia-sheet__panel') as HTMLElement).getBoundingClientRect()
          return { width: Math.round(r.width), left: Math.round(r.left), bottomGap: Math.round(window.innerHeight - r.bottom) }
        })
        expect(box.width).toBe(390)
        expect(box.left).toBe(0)
        expect(box.bottomGap).toBe(0)
      })
    })
  })

  describe('E-13 delegations', () => {
    it('gives each state chip an icon and says nothing delegated in the shared empty state when the list is empty', async () => {
      await visit(browser, 'base', { route: '/settings/delegations' }, async (page) => {
        const chips = await page.evaluate(() => [...document.querySelectorAll('.adestia-deleg__state')].map((c) => `${(c.textContent ?? '').trim()}=${c.querySelector('use')?.getAttribute('href') ?? 'none'}`))
        expect(chips).toEqual(['running=#adestia-i-loader-circle'])
      })
      await visit(browser, 'empty', { route: '/settings/delegations' }, async (page) => {
        const facts = await page.evaluate(() => {
          const el = document.querySelector('.adestia-deleg .adestia-empty')
          return { shared: el !== null, icon: el?.querySelector('use') !== null && el !== null }
        })
        expect(facts).toEqual({ shared: true, icon: true })
      })
    })
  })

  describe('E-14 configuration', () => {
    const slow = async (page: Page) => {
      await page.route('**/api/settings', async (route) => {
        await new Promise((r) => setTimeout(r, 2500))
        await route.continue()
      })
    }

    it('shows a spinner row before the form while the settings load (Q-23), then the form', async () => {
      await visit(browser, 'config-writable', { route: '/settings/config', before: slow }, async (page) => {
        // `visit` waits for .adestia-prefs and 600 ms: the request is still held
        const during = await page.evaluate(() => ({ spinner: document.querySelector('.adestia-prefs__page use[href="#adestia-i-loader-circle"]') !== null, controls: document.querySelectorAll('.adestia-prefs__page :is(input, select, textarea)').length }))
        expect(during).toEqual({ spinner: true, controls: 0 })
        await page.waitForSelector('.adestia-prefs__page :is(input, select, textarea)', { timeout: 15_000 })
        expect(await page.evaluate(() => document.querySelector('.adestia-prefs__page use[href="#adestia-i-loader-circle"]') !== null)).toBe(false)
      })
    })

    const tileColour = (page: Page) =>
      page.evaluate(() => {
        const el = document.querySelector('.adestia-prefs__page') as HTMLElement
        return getComputedStyle(el).getPropertyValue('--tile-color').trim()
      })

    it('carries the tile colour on its not-exposed render, as its siblings do', async () => {
      await visit(browser, 'base', { route: '/settings/config' }, async (page) => {
        expect(await page.evaluate(() => document.querySelector('.adestia-prefs__page')?.textContent ?? '')).toContain('does not expose its configuration')
        expect(await tileColour(page)).not.toBe('')
        expect(await tileColour(page)).not.toBe('initial')
      })
    })

    it('carries the tile colour on its read-error render', async () => {
      const broken = async (page: Page) => {
        await page.route('**/api/settings', async (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }))
      }
      await visit(browser, 'config-writable', { route: '/settings/config', before: broken }, async (page) => {
        expect(await page.evaluate(() => document.querySelector('.adestia-prefs__page :is(input, select, textarea)'))).toBeNull()
        expect(await tileColour(page)).not.toBe('')
        expect(await tileColour(page)).not.toBe('initial')
      })
    })

    const saveOne = async (page: Page) => {
      await page.waitForSelector('.adestia-prefs__page :is(input, select, textarea)', { timeout: 15_000 })
      await page.locator('.adestia-prefs__page .adestia-toggle').first().click({ timeout: 5000 })
      await page.locator('.adestia-prefs__page button:text-is("Save")').first().click({ timeout: 5000 })
      await page.waitForSelector('.adestia-prefs__page button:text-is("Restart now")', { timeout: 10_000 })
    }

    it('draws Save as accent, Discard as ghost, and after a save Restart now as danger', async () => {
      await visit(browser, 'config-writable', { route: '/settings/config' }, async (page) => {
        await saveOne(page)
        const variant = await page.evaluate(() => {
          const of = (label: string) => [...document.querySelectorAll('.adestia-prefs__page button')].filter((b) => (b.textContent ?? '').trim() === label).map((b) => b.className.split(' ').filter((c) => c.startsWith('adestia-btn')).join(' '))
          return { save: of('Save'), discard: of('Discard'), restart: of('Restart now') }
        })
        expect(variant).toEqual({ save: ['adestia-btn adestia-btn--accent'], discard: ['adestia-btn adestia-btn--ghost'], restart: ['adestia-btn adestia-btn--danger'] })
      })
    })

    it('marks the restart-pending line with the rotate-ccw icon (docs/ecrans.md: restart pending = rotate-ccw)', async () => {
      await visit(browser, 'config-writable', { route: '/settings/config' }, async (page) => {
        await saveOne(page)
        const icon = await page.evaluate(() => {
          const note = [...document.querySelectorAll('.adestia-prefs__page strong')].find((el) => /^Saved, and waiting for a restart/.test(el.textContent ?? ''))
          return note?.closest('p, div')?.querySelector('use')?.getAttribute('href') ?? null
        })
        expect(icon).toBe('#adestia-i-rotate-ccw')
      })
    })
  })

  describe('E-15 cog menu', () => {
    const cog = (page: Page) => page.locator('.adestia-cog > button').first().click({ timeout: 10_000 })
    const focusOnCog = (page: Page) => page.evaluate(() => document.activeElement?.closest('.adestia-cog') !== null && document.activeElement?.getAttribute('aria-haspopup') === 'menu')

    it('offers System, Light and Dark as a radiogroup of icon buttons, one checked, and Dark changes the colour scheme', async () => {
      await visit(browser, 'base', { route: '/settings' }, async (page) => {
        await cog(page)
        await page.waitForSelector('.adestia-cog__panel', { state: 'visible' })
        const radios = () => page.evaluate(() => [...document.querySelectorAll('.adestia-cog__panel [role=radiogroup] [role=radio]')].map((r) => `${r.getAttribute('aria-label')}:${r.getAttribute('aria-checked')}`))
        expect((await radios()).map((r) => r.split(':')[0])).toEqual(['System', 'Light', 'Dark'])
        expect((await radios()).filter((r) => r.endsWith(':true')).length).toBe(1)
        await page.locator('.adestia-cog__panel [role=radio][aria-label="Dark"]').first().click({ timeout: 5000 })
        expect(await radios()).toEqual(['System:false', 'Light:false', 'Dark:true'])
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark')
      })
    })

    it('hides Sign out when the instance has no sign-in, and shows it under OIDC', async () => {
      await visit(browser, 'base', { route: '/settings' }, async (page) => {
        await cog(page)
        await page.waitForSelector('.adestia-cog__panel', { state: 'visible' })
        expect(await page.evaluate(() => [...document.querySelectorAll('.adestia-cog__panel button, .adestia-cog__panel a')].filter((b) => /sign out/i.test(b.textContent ?? '')).length)).toBe(0)
      })
    })

    it('closes on Escape and returns the focus to the cog; a click outside closes it too', async () => {
      await visit(browser, 'base', { route: '/settings' }, async (page) => {
        await cog(page)
        await page.waitForSelector('.adestia-cog__panel', { state: 'visible' })
        await page.keyboard.press('Escape')
        await page.waitForSelector('.adestia-cog__panel', { state: 'detached', timeout: 5000 })
        expect(await focusOnCog(page)).toBe(true)
        await cog(page)
        await page.waitForSelector('.adestia-cog__panel', { state: 'visible' })
        await page.mouse.click(300, 700)
        await page.waitForSelector('.adestia-cog__panel', { state: 'detached', timeout: 5000 })
      })
    })
  })

  describe('E-19 problems band', () => {
    it('is absent when nothing is wrong, an icon per kind when something is', async () => {
      await visit(browser, 'empty', { route: '/' }, async (page) => {
        expect(await page.evaluate(() => document.querySelectorAll('.adestia-problems').length)).toBe(0)
      })
      await visit(browser, 'base', { route: '/' }, async (page) => {
        expect(await iconsOf(page, '.adestia-problems--refused h2')).toEqual(['#adestia-i-circle-alert'])
        expect(await iconsOf(page, '.adestia-problems--degraded h2')).toEqual(['#adestia-i-triangle-alert'])
      })
    })
  })

  describe('E-1 and E-21 gates', () => {
    it('draws the signed-out gate with a lock icon and an accent sign-in control', async () => {
      const lost = async (page: Page, base: string) => {
        await page.route('**/api/instance', async (route) => {
          const real = await fetch(`${base}/api/instance`)
          await route.fulfill({ status: real.status, contentType: 'application/json', body: await real.text() })
        })
      }
      const instance = await launch('oidc', '', 'en')
      const { context, page } = await open(browser, instance.url, { theme: 'light', size: 'desk', locale: 'en', signIn: true, before: lost, reload: true, shell: false })
      try {
        await page.waitForSelector('.adestia-gate .adestia-btn--accent', { timeout: 20_000 })
        expect(await iconsOf(page, '.adestia-gate__icon')).toEqual(['#adestia-i-lock'])
        expect(await page.evaluate(() => document.querySelectorAll('.adestia-gate .adestia-btn--accent').length)).toBe(1)
      } finally {
        await context.close()
        await instance.stop()
      }
    })
  })
})
