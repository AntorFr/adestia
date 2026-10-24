/**
 * Revérification of adestia-qualite-chat (constats rouverts after 011f7ea), seen from the need:
 * docs/ecrans.md « Phone » (the header keeps one row; the model picker yields first and truncates
 * with an ellipsis and a title; the context count stays readable) and the error-only bubble of
 * the E-16 thread. Expectations are written by hand from the need, not from the stylesheet.
 *
 * Playwright and Chromium come from the environment; without them the file is skipped.
 * Needs `npm run build` first. `CHAT_SHOTS=<dir>` writes one capture per state.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Theme, launch, newBrowser, playwright } from './charte-browser.js'

const SHOTS = process.env.CHAT_SHOTS
const SKINS = ['skippy', 'alfred', 'nestor', 'dobby']

type BrowserOf = Awaited<ReturnType<typeof newBrowser>>

async function open(browser: BrowserOf, url: string, o: { width: number; height?: number; theme?: Theme; locale?: string; tab?: string }) {
  const context: any = await browser.newContext({
    viewport: { width: o.width, height: o.height ?? 800 },
    hasTouch: o.width < 500,
    isMobile: o.width < 500,
    colorScheme: o.theme ?? 'light',
    locale: o.locale === 'fr' ? 'fr-FR' : 'en-US',
    ignoreHTTPSErrors: true,
  })
  const page: any = await context.newPage()
  await page.addInitScript(
    (a: { theme: string; tab: string | undefined }) => {
      localStorage.setItem('adestia.theme', a.theme)
      if (a.tab) localStorage.setItem('adestia.tabs', JSON.stringify({ open: [a.tab], active: a.tab }))
    },
    { theme: o.theme ?? 'light', tab: o.tab },
  )
  await page.goto(`${url}/#/`, { waitUntil: 'domcontentloaded' })
  await page.locator('.adestia-chat textarea').waitFor({ timeout: 20_000 })
  return { context, page }
}

describe.skipIf(!playwright)('chat revérification — narrow header and error-only bubble (E-16)', () => {
  let browser: BrowserOf
  beforeAll(async () => {
    browser = await newBrowser()
  }, 60_000)
  afterAll(async () => {
    await browser?.close()
  })

  for (const skin of SKINS) {
    describe(`skin ${skin}`, () => {
      let instance: Awaited<ReturnType<typeof launch>>
      beforeAll(async () => {
        instance = await launch('chat-rail', skin, 'en')
      }, 60_000)
      afterAll(async () => {
        await instance?.stop()
      })

      // Panne visée : the pill glued to the conversations button, or a picker squeezed to nothing.
      it('keeps one equal, visible gap between header items and a readable picker at 360 to 400 px', async () => {
        for (const width of [360, 375, 390, 400]) {
          const { context, page } = await open(browser, instance.url, { width })
          try {
            const field = page.locator('.adestia-chat textarea')
            await field.fill('long contexte')
            await field.press('Enter')
            await page.locator('.adestia-pill').waitFor({ timeout: 15_000 })
            await page.getByText('Le fil est long.').first().waitFor({ timeout: 15_000 })
            const m = await page.evaluate(() => {
              const box = (el: Element) => el.getBoundingClientRect()
              const header = document.querySelector('.adestia-chat__header') as HTMLElement
              const items = [...header.children].filter((c) => box(c).width > 0)
              const pill = document.querySelector('.adestia-pill') as HTMLElement
              const at = items.findIndex((c) => c.contains(pill))
              const picker = header.querySelector('.adestia-model-wrap') as HTMLElement
              const control = picker.querySelector('select, button, input') as HTMLElement | null
              return {
                gaps: items.slice(1).map((c, i) => Math.round(box(c).left - box(items[i]!).right)),
                tops: items.map((c) => Math.round(box(c).top)),
                lastRight: Math.max(...items.map((c) => box(c).right)),
                vw: window.innerWidth,
                pillAfter: Math.round(box(items[at + 1]!).left - box(pill).right),
                pillWhole: pill.scrollWidth <= pill.clientWidth,
                pillText: pill.textContent,
                pickerWidth: Math.round(box(picker).width),
                pickerTitle: (control?.getAttribute('title') ?? picker.getAttribute('title') ?? '') as string,
                scrollOk: document.documentElement.scrollWidth <= window.innerWidth + 1,
              }
            })
            const where = `${skin} ${width}px ${JSON.stringify(m.gaps)}`
            expect(new Set(m.gaps).size, where).toBe(1)
            expect(m.gaps[0], where).toBeGreaterThan(0)
            expect(m.pillAfter, where).toBeGreaterThan(0)
            expect(Math.max(...m.tops) - Math.min(...m.tops), `${where} one row`).toBeLessThanOrEqual(24)
            expect(m.lastRight, where).toBeLessThanOrEqual(m.vw)
            expect(m.pillWhole, where).toBe(true)
            expect(m.pillText, where).toContain('150')
            expect(m.pickerWidth, where).toBeGreaterThanOrEqual(72)
            expect(m.scrollOk, where).toBe(true)
            if (SHOTS) await page.screenshot({ path: `${SHOTS}/narrow-${skin}-${width}.png` })
          } finally {
            await context.close()
          }
        }
      }, 120_000)
    })
  }

  // Panne visée : the error line of an answer made only of an error sits 20 px under the top and 12 above the bottom.
  for (const [theme, width] of [['light', 1440], ['dark', 1440], ['light', 390], ['dark', 360]] as [Theme, number][]) {
    it(`pads the seeded error-only bubble evenly above and below (${theme}, ${width}px)`, async () => {
      const instance = await launch('chat-rail', 'skippy', 'en')
      try {
        const id = await (await fetch(`${instance.url}/api/conversations`)).json().then((l: any) => (l.conversations ?? l).find((c: any) => /Rail — finished/.test(c.title))?.id)
        expect(id).toBeTruthy()
        const { context, page } = await open(browser, instance.url, { width, theme, tab: id })
        try {
          await page.getByText('Seeded engine error.').first().waitFor({ timeout: 15_000 })
          const m = await page.evaluate(() => {
            const err = [...document.querySelectorAll('.adestia-bubble__error')].find((e) => /Seeded engine error/.test(e.textContent ?? '')) as HTMLElement
            const bubble = err.closest('.adestia-bubble') as HTMLElement
            const b = bubble.getBoundingClientRect()
            const e = err.getBoundingClientRect()
            const onlyChild = bubble.querySelectorAll('.adestia-bubble__text, .adestia-prose').length === 0
            return { top: Math.round(e.top - b.top), bottom: Math.round(b.bottom - e.bottom), onlyChild }
          })
          expect(m.onlyChild).toBe(true)
          expect(m.top).toBeGreaterThan(0)
          expect(m.top).toBe(m.bottom)
          if (SHOTS) await page.screenshot({ path: `${SHOTS}/error-only-${theme}-${width}.png` })
        } finally {
          await context.close()
        }
      } finally {
        await instance.stop()
      }
    }, 60_000)
  }
})
