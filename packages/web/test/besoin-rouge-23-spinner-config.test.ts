/**
 * Q-23 seen from the need (docs/ecrans.md E-14 "A loading state (a spinner row inside
 * .adestia-prefs__page) before the form"; Q-23 "neither shows an empty state while waiting"),
 * independent of how the settings request is held: a barrier this file owns, never a timer.
 * Skipped without Playwright (see charte-browser.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Browser, launch, newBrowser, open, playwright } from './charte-browser.js'
import { patience } from './patience.js'

const SPINNER = '.adestia-prefs__page use[href="#adestia-i-loader-circle"]'
const CONTROLS = '.adestia-prefs__page :is(input, select, textarea)'

describe.skipIf(!playwright)('E-14 configuration loading state (Q-23), held on a barrier of this file', { timeout: 120_000 }, () => {
  let browser: Browser
  beforeAll(async () => {
    browser = await newBrowser()
  }, patience(60_000))
  afterAll(async () => {
    await browser?.close()
  })

  async function held(run: (page: import('./charte-browser.js').Page, lift: () => void) => Promise<void>) {
    let lift!: () => void
    const lifted = new Promise<void>((resolve) => { lift = resolve })
    const instance = await launch('config-writable', '', 'en')
    const { context, page } = await open(browser, instance.url, {
      theme: 'light', size: 'desk', locale: 'en', route: '/settings/config',
      before: async (p) => {
        await p.route('**/api/settings', async (route) => {
          await lifted
          await route.continue()
        })
      },
    })
    try {
      await page.waitForSelector(`.adestia-prefs ${SPINNER.replace('.adestia-prefs__page ', '')}`, { timeout: patience(30_000) })
      await run(page, lift)
    } finally {
      lift()
      await context.close()
      await instance.stop()
    }
  }

  it('shows the spinner and no form control or empty state while held, then the form and no spinner once released', async () => {
    await held(async (page, lift) => {
      const during = await page.evaluate(([s, c]) => ({
        spinner: document.querySelector(s as string) !== null,
        controls: document.querySelectorAll(c as string).length,
        notExposed: (document.querySelector('.adestia-prefs__page')?.textContent ?? '').includes('does not expose its configuration'),
      }), [SPINNER, CONTROLS])
      expect(during).toEqual({ spinner: true, controls: 0, notExposed: false })
      lift()
      await page.waitForSelector(CONTROLS, { timeout: patience(15_000) })
      expect(await page.evaluate((s) => document.querySelector(s as string) !== null, SPINNER)).toBe(false)
    })
  })

  it('keeps the spinner, with no form, however long the settings take (6 s, longer than any old timer)', async () => {
    await held(async (page, lift) => {
      await page.waitForTimeout(6000) // the server being slow is the scenario
      const during = await page.evaluate(([s, c]) => ({ spinner: document.querySelector(s as string) !== null, controls: document.querySelectorAll(c as string).length }), [SPINNER, CONTROLS])
      expect(during).toEqual({ spinner: true, controls: 0 })
      lift()
      await page.waitForSelector(CONTROLS, { timeout: patience(15_000) })
    })
  })
})
