/**
 * B-19 / P-16 (4) / E-32, the edges the first browser file leaves: a proxy that answers 502, 503 or
 * 504 for a server that is gone, and a probe that hangs instead of refusing. Expectations are literals from docs/parcours.md and docs/ecrans.md
 * ("a call to /api/ that throws or answers 502/503/504 ... starts a probe GET
 * /api/health; the banner appears when a probe fails: within 5 s if it hangs"). Driven through Chromium against a living bench instance whose answers are bent.
 *
 * Needs `npm run build` first and Playwright from the environment (skipped without).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Browser, type Page, type Instance, launch, newBrowser, open, playwright } from './charte-browser.js'

const WORDS = 'The server is not responding'
type Route = { request(): { url(): string }; abort(c?: string): Promise<void>; fulfill(o: { status?: number; contentType?: string; body?: string }): Promise<void>; continue(): Promise<void> }
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

describe.skipIf(!playwright)('B-19 · bords du bandeau « le serveur ne répond pas »', () => {
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

  async function ready(route = '/') {
    const o = await open(browser, inst.url, { theme: 'light', size: 'desk', locale: 'en', route })
    await o.page.waitForSelector('.adestia-canvas__body', { timeout: 20_000 })
    return o
  }

  it.each([502, 503, 504])('un %i sur un appel /api/ alors que la sonde échoue : le bandeau apparaît ; la sonde repasse : il part seul', async (status) => {
    const { context, page } = await ready()
    try {
      await page.route('**/api/health', async (r) => asRoute(r).abort('failed'))
      let answered = false
      await page.route('**/api/instructions', async (r) => {
        answered = true
        await asRoute(r).fulfill({ status, contentType: 'text/plain', body: 'gateway' })
      })
      await page.evaluate(() => (location.hash = '/settings/instructions'))
      expect(await until(page, (n) => n === 1, 10_000)).toBe(1)
      expect(answered).toBe(true)
      await unroute(page, '**/api/health')
      await unroute(page, '**/api/instructions')
      expect(await until(page, (n) => n === 0, 8_000)).toBe(0)
    } finally {
      await context.close()
    }
  }, 90_000)

  it('une sonde qui ne répond jamais compte comme un échec : le bandeau apparaît sous 8 s', async () => {
    const { context, page } = await ready()
    try {
      // The link is down for every call but the probe, which hangs (any answered call would clear the banner).
      await page.route('**/api/**', async (r) => {
        if (asRoute(r).request().url().endsWith('/api/health')) return // never answered: the link hangs
        await asRoute(r).abort('failed')
      })
      await page.evaluate(() => (location.hash = '/settings/instructions'))
      expect(await until(page, (n) => n === 1, 8_000)).toBe(1)
    } finally {
      await context.close()
    }
  }, 60_000)
})
