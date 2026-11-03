/**
 * B-19 / P-16 (4) / E-32, the two entries the other files leave: the drop of the event stream
 * (`GET /api/events`) as the trigger, and the browser's own "offline" signal that must light nothing
 * ("no `navigator.onLine`"). Expectations are literals from docs/parcours.md and docs/ecrans.md.
 * Driven through Chromium against a living bench instance whose answers are bent.
 *
 * Needs `npm run build` first and Playwright from the environment (skipped without).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Browser, type Instance, type Page, launch, newBrowser, open, playwright } from './charte-browser.js'

const WORDS = 'The server is not responding'
type Route = { abort(c?: string): Promise<void> }
const asRoute = (r: unknown) => r as Route
const unroute = (page: Page, glob: string) => (page as unknown as { unroute(g: string): Promise<void> }).unroute(glob)

async function shown(page: Page): Promise<number> {
  return page.evaluate((w: string) => [...document.querySelectorAll('[role="status"]')].filter((e) => (e.textContent ?? '').includes(w)).length, WORDS)
}
async function until(page: Page, ok: (n: number) => boolean, timeout: number): Promise<number> {
  const deadline = Date.now() + timeout
  for (;;) {
    const n = await shown(page)
    if (ok(n) || Date.now() > deadline) return n
    await new Promise((r) => setTimeout(r, 100))
  }
}

describe.skipIf(!playwright)('B-19 · le flux d\'événements et le signal « hors ligne » du navigateur', () => {
  let browser: Browser
  let inst: Instance
  beforeAll(async () => {
    browser = await newBrowser()
    inst = await launch('config-writable', 'skippy', 'en')
  }, 90_000)
  afterAll(async () => {
    await browser?.close()
    await inst?.stop()
  })

  async function openWith(setup: (page: Page) => Promise<void>) {
    const { context, page } = await open(browser, inst.url, { theme: 'light', size: 'desk', locale: 'en', route: '/', before: setup })
    await page.waitForSelector('.adestia-canvas__body', { timeout: 20_000 })
    return { context, page }
  }

  it('le flux d\'événements tombe et la sonde échoue : le bandeau apparaît ; la sonde répond : il part seul', async () => {
    const { context, page } = await openWith(async (p) => {
      await p.route('**/api/events**', async (r) => asRoute(r).abort('failed'))
      await p.route('**/api/health', async (r) => asRoute(r).abort('failed'))
    })
    try {
      expect(await until(page, (n) => n === 1, 12_000)).toBe(1)
      await unroute(page, '**/api/health')
      expect(await until(page, (n) => n === 0, 8_000)).toBe(0)
    } finally {
      await context.close()
    }
  }, 90_000)

  it('le navigateur se dit hors ligne alors que le serveur répond : aucun bandeau', async () => {
    const { context, page } = await openWith(async () => {})
    try {
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
        window.dispatchEvent(new Event('offline'))
      })
      await page.waitForTimeout(6_000)
      expect(await shown(page)).toBe(0)
    } finally {
      await context.close()
    }
  }, 90_000)
})
