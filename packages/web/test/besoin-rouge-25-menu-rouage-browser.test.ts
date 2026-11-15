/**
 * E-15 cog menu seen through a driven browser: the focus enters the panel once it is placed
 * and visible, Escape returns it to the cog, a click outside closes, and a reopening places
 * and focuses again. Expectation: docs/charte.md § 4 (Popover: "Escape closes and returns
 * focus; click outside closes; the same focus rule applies (`data-autofocus` first, else the
 * first focusable)"). Feature rouge-adestia-pages-25. Needs `npm run build` first.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Browser, type Page, launch, newBrowser, open, playwright } from './charte-browser.js'
import { patience } from './patience.js'

type Waiting = Page & { waitForFunction(fn: () => boolean, arg: null, options: { timeout: number }): Promise<unknown> }

async function visit(browser: Browser, run: (page: Page) => Promise<void>) {
  const instance = await launch('base', '', 'en')
  const { context, page } = await open(browser, instance.url, { theme: 'light', size: 'desk', locale: 'en', route: '/settings' })
  try {
    await page.waitForSelector('.adestia-prefs', { timeout: patience(20_000) })
    await run(page)
  } finally {
    await context.close()
    await instance.stop()
  }
}

const openCog = (page: Page) => page.locator('.adestia-cog > button').first().click({ timeout: patience(10_000) })
const focusInPanel = (page: Page) =>
  (page as Waiting).waitForFunction(() => document.activeElement?.closest('.adestia-cog__panel') != null, null, { timeout: patience(10_000) })
const focusOnCog = (page: Page) => page.evaluate(() => document.activeElement?.closest('.adestia-cog') != null && document.activeElement?.getAttribute('aria-haspopup') === 'menu')
const focusInsidePanelNow = (page: Page) => page.evaluate(() => document.activeElement?.closest('.adestia-cog__panel') != null)
const panelState = (page: Page) =>
  page.evaluate(() => {
    const panel = document.querySelector('.adestia-cog__panel') as HTMLElement | null
    const cog = document.querySelector('.adestia-cog > button') as HTMLElement | null
    if (!panel || !cog) return null
    const p = panel.getBoundingClientRect()
    const c = cog.getBoundingClientRect()
    return { visibility: getComputedStyle(panel).visibility, belowCog: p.top >= c.bottom - 1, inViewport: p.left >= 0 && p.right <= window.innerWidth && p.bottom <= window.innerHeight }
  })

describe.skipIf(!playwright)('E-15 cog menu — focus enters the placed panel (rouge-adestia-pages-25)', { timeout: patience(120_000) }, () => {
  let browser: Browser
  beforeAll(async () => {
    browser = await newBrowser()
  }, patience(60_000))
  afterAll(async () => {
    await browser?.close()
  })

  // Panne visée : le focus donné à un panneau encore `visibility: hidden` (jamais retenté).
  it('puts the focus inside a visible, placed panel as soon as the menu opens', async () => {
    await visit(browser, async (page) => {
      await openCog(page)
      await focusInPanel(page)
      expect(await panelState(page)).toEqual({ visibility: 'visible', belowCog: true, inViewport: true })
    })
  })

  // Panne visée : la réouverture ne refocalise pas, ou montre le panneau à son ancienne place.
  it('focuses the panel again on every reopening, Escape returning the focus to the cog each time', async () => {
    await visit(browser, async (page) => {
      for (let round = 0; round < 4; round++) {
        await openCog(page)
        await focusInPanel(page)
        expect(await panelState(page)).toEqual({ visibility: 'visible', belowCog: true, inViewport: true })
        await page.keyboard.press('Escape')
        await page.waitForSelector('.adestia-cog__panel', { state: 'detached', timeout: patience(5000) })
        expect(await focusOnCog(page)).toBe(true)
      }
    })
  })

  // Panne visée : un clic dehors n'est pas entendu, ou le panneau reste ouvert avec le focus dedans.
  it('closes on a click outside, after which the focus is no longer in the panel', async () => {
    await visit(browser, async (page) => {
      await openCog(page)
      await focusInPanel(page)
      await page.mouse.click(300, 700)
      await page.waitForSelector('.adestia-cog__panel', { state: 'detached', timeout: patience(5000) })
      expect(await focusInsidePanelNow(page)).toBe(false)
    })
  })

  // Exclusion : fermé, le menu n'a aucun panneau dans la page et ne retient pas le focus.
  it('leaves no panel and no focus inside it once closed by Escape', async () => {
    await visit(browser, async (page) => {
      await openCog(page)
      await focusInPanel(page)
      await page.keyboard.press('Escape')
      await page.waitForSelector('.adestia-cog__panel', { state: 'detached', timeout: patience(5000) })
      expect(await page.evaluate(() => document.querySelectorAll('.adestia-cog__panel').length)).toBe(0)
      expect(await focusInsidePanelNow(page)).toBe(false)
    })
  })
})
