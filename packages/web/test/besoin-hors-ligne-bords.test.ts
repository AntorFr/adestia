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
import { patience } from './patience.js'

const WORDS = 'The server is not responding'
type Route = { request(): { url(): string }; abort(c?: string): Promise<void>; fulfill(o: { status?: number; contentType?: string; body?: string }): Promise<void>; continue(): Promise<void> }
type Ev = { on(e: string, f: (r: unknown) => void): void }
/**
 * Calls the page has sent and not yet heard back from (answer headers or failure). Tracked from the
 * start so that, once a route is armed, the ones it could not catch can be waited out.
 */
function trackInFlight(page: Page) {
  const pending = new Set<unknown>()
  /** Every /api/ answer heard back, in order: the diagnostic when the banner does not come. */
  const answers: string[] = []
  const done = (r: unknown) => pending.delete(r)
  const ev = page as unknown as Ev
  ev.on('request', (r) => { if (/\/api\//.test((r as { url(): string }).url())) pending.add(r) })
  ev.on('response', (r) => {
    const res = r as { request(): { url(): string }; status(): number }
    if (/\/api\//.test(res.request().url())) answers.push(`${res.status()} ${res.request().url()}`)
    done(res.request())
  })
  ev.on('requestfailed', done)
  return {
    answers,
    /** What is still open, for the diagnostic. */
    open: () => [...pending].map((r) => (r as { url(): string }).url()),
    /**
     * Resolves when every call pending right now (the event feed included: its headers are an answer)
     * has been answered or has failed, then once more after the page has run what those answers
     * triggered: Node hears a response before the page's own handlers (the feed's `onLink(true)`,
     * which clears the banner and retires the probe loop) have run.
     */
    async drain(): Promise<void> {
      const seen = [...pending]
      while (seen.some((r) => pending.has(r))) await new Promise((r) => setTimeout(r, 50))
      for (let i = 0; i < 3; i += 1) {
        await page.evaluate(() => new Promise<void>((res) => setTimeout(res, 0)))
      }
    },
  }
}
const asRoute = (r: unknown) => r as Route
const unroute = (page: Page, glob: string) => (page as unknown as { unroute(g: string): Promise<void> }).unroute(glob)

const waitFor = (page: Page, fn: (w: string) => boolean, arg: string, timeout: number) =>
  (page as unknown as { waitForFunction(f: (w: string) => boolean, a: string, o: { timeout: number }): Promise<unknown> }).waitForFunction(fn, arg, { timeout })

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
  }, patience(90_000))
  afterAll(async () => {
    await browser?.close()
    await inst?.stop()
  })

  async function ready(route = '/') {
    const o = await open(browser, inst.url, { theme: 'light', size: 'desk', locale: 'en', route })
    await o.page.waitForSelector('.adestia-canvas__body', { timeout: patience(20_000) })
    return o
  }

  let flight: ReturnType<typeof trackInFlight>
  it.each([502, 503, 504])('un %i sur un appel /api/ alors que la sonde échoue : le bandeau apparaît ; la sonde repasse : il part seul', async (status) => {
    const { context, page } = await open(browser, inst.url, { theme: 'light', size: 'desk', locale: 'en', route: '/', before: async (p) => { flight = trackInFlight(p) } })
    await page.waitForSelector('.adestia-canvas__body', { timeout: patience(20_000) })
    try {
      // The link is down for the whole page but the one call under test: no other /api/ call may
      // answer in between (an answer clears the banner and retires the probe loop).
      let failedProbes = 0
      let sawProbeFail!: () => void
      const probeFailed = new Promise<void>((resolve) => { sawProbeFail = resolve })
      let sawGateway!: () => void
      const gatewayAnswered = new Promise<void>((resolve) => { sawGateway = resolve })
      await page.route('**/api/**', async (r) => {
        const url = asRoute(r).request().url()
        if (url.endsWith('/api/health')) {
          await asRoute(r).abort('failed')
          failedProbes += 1
          sawProbeFail()
        } else if (url.endsWith('/api/instructions')) {
          await asRoute(r).fulfill({ status, contentType: 'text/plain', body: 'gateway' })
          sawGateway()
        } else {
          await asRoute(r).abort('failed')
        }
      })
      // A call sent before the route existed is not caught by it: if it answers late it clears the
      // banner and retires the probe loop. Wait for those to be heard back, then provoke the 502.
      await flight.drain()
      const answeredBefore = flight.answers.length
      await page.evaluate(() => (location.hash = '/settings/instructions'))
      // Signals, not seconds: the simulated request went out, and the probe it started failed.
      await gatewayAnswered
      await probeFailed
      expect(failedProbes).toBeGreaterThan(0)
      try {
        await waitFor(
          page,
          (w: string) => [...document.querySelectorAll('[role="status"]')].filter((e) => (e.textContent ?? '').includes(w)).length === 1,
          WORDS,
          patience(60_000),
        )
      } catch (error) {
        throw new Error(`no banner after the ${status}: shown=${await shown(page)}, failedProbes=${failedProbes}, open=${JSON.stringify(flight.open())}, answered since the route=${JSON.stringify(flight.answers.slice(answeredBefore))}`, { cause: error })
      }
      expect(flight.answers.slice(answeredBefore).filter((a) => !a.endsWith('/api/instructions'))).toEqual([])
      expect(await shown(page)).toBe(1)
      await unroute(page, '**/api/**')
      await waitFor(
        page,
        (w: string) => [...document.querySelectorAll('[role="status"]')].filter((e) => (e.textContent ?? '').includes(w)).length === 0,
        WORDS,
        patience(60_000),
      )
      expect(await shown(page)).toBe(0)
    } finally {
      await context.close()
    }
  }, patience(90_000))

  it('une sonde qui ne répond jamais compte comme un échec : le bandeau apparaît sous 8 s', async () => {
    const { context, page } = await ready()
    try {
      // The link is down for every call but the probe, which hangs (any answered call would clear the banner).
      await page.route('**/api/**', async (r) => {
        if (asRoute(r).request().url().endsWith('/api/health')) return // never answered: the link hangs
        await asRoute(r).abort('failed')
      })
      await page.evaluate(() => (location.hash = '/settings/instructions'))
      expect(await until(page, (n) => n === 1, patience(8_000))).toBe(1)
    } finally {
      await context.close()
    }
  }, patience(60_000))
})
