/**
 * `adestia-pages-deplacer`, E-34 « Normal »: "each card shows its name and one line" — the line of a core
 * card is READ in full, not cut. Seen through a driven browser on the bench instance (seed
 * `besoin-pages-deplacer`). Expected lines are written by hand from docs/ecrans.md.
 *
 * PLAN
 *  B-24 nominal   desk: the card « Content » shows « Pages of one kind, listed where you put it. » whole
 *  B-24 phone     bottom sheet: the same line is whole, inside its card and inside the sheet
 *  B-24 bords     every core card line is whole (nothing clipped, no ellipsis), desk and phone
 *
 * Needs Playwright and Chromium (skipped without) and `npm run build`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Instance, launch, newBrowser, open, playwright } from './charte-browser.js'

type BrowserOf = Awaited<ReturnType<typeof newBrowser>>

async function galleryOpen(browser: BrowserOf, base: string, size: 'desk' | 'phone') {
  const { context, page } = (await open(browser, base, {
    theme: 'light',
    size,
    locale: 'en',
    route: '/page/galerie-recherche',
    before: async (p: any) => {
      p.indexAnswered = p.waitForResponse((r: any) => /\/api\/pages\/index(\?.*)?$/.test(r.url()), { timeout: 20_000 }).catch(() => null)
    },
  })) as { context: any; page: any }
  expect(await page.indexAnswered, 'the pages index never answered').not.toBeNull()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Done', exact: true }).waitFor({ timeout: 20_000 })
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Add block', exact: true }).click()
  await page.getByRole('dialog', { name: 'Add block' }).waitFor({ timeout: 10_000 })
  await page.waitForTimeout(600) // the sheet slides in
  return { context, page }
}

/** For each card: its name, its line, and whether the line is clipped or leaves its card or the sheet. */
const lines = (page: any): Promise<{ name: string; line: string; clipped: boolean; outside: boolean }[]> =>
  page.evaluate(() => {
    const sheet = document.querySelector('[role="dialog"]')!.getBoundingClientRect()
    return [...document.querySelectorAll('.adestia-blockcard')].filter((c) => c.querySelector('.adestia-blockcard__line')).map((c) => {
      const l = c.querySelector('.adestia-blockcard__line') as HTMLElement
      const lr = l.getBoundingClientRect()
      const cr = c.getBoundingClientRect()
      const cs = getComputedStyle(l)
      return {
        name: c.querySelector('.adestia-blockcard__name')?.textContent ?? '',
        line: l.textContent ?? '',
        clipped: l.scrollWidth > l.clientWidth + 1 || l.scrollHeight > l.clientHeight + 1 || (cs.textOverflow === 'ellipsis' && l.scrollWidth > l.clientWidth),
        outside: lr.right > cr.right + 1 || lr.bottom > cr.bottom + 1 || lr.right > sheet.right + 1,
      }
    })
  })

const CORE = ['Content', 'Callout', 'Figures', 'List', 'Table', 'Columns', 'Image gallery']

describe.skipIf(!playwright)('adestia-pages-deplacer, card lines from the need', () => {
  let instance: Instance
  let browser: BrowserOf
  beforeAll(async () => {
    instance = await launch('besoin-pages-deplacer', 'skippy', 'en')
    browser = await newBrowser()
  }, 60_000)
  afterAll(async () => {
    await browser?.close()
    await instance?.stop()
  })

  for (const size of ['desk', 'phone'] as const) {
    // Breaks if a card clips its line (a one-line ellipsis, a fixed height, an overflow hidden).
    it(`${size}_la_ligne_de_la_carte_content_est_lisible_en_entier`, async () => {
      const { context, page } = await galleryOpen(browser, instance.url, size)
      const all = await lines(page)
      const content = all.find((c) => c.name === 'Content')
      expect(content?.line).toBe('Pages of one kind, listed where you put it.')
      expect(content?.clipped, 'line of Content clipped').toBe(false)
      expect(content?.outside, 'line of Content outside its card').toBe(false)
      await context.close()
    }, 90_000)

    it(`${size}_aucune_ligne_des_cartes_du_coeur_nest_tronquee`, async () => {
      const { context, page } = await galleryOpen(browser, instance.url, size)
      const all = await lines(page)
      for (const n of CORE) {
        const c = all.find((x) => x.name === n)
        expect(c, `card ${n}`).toBeDefined()
        expect(c!.line.trim().length, `line of ${n}`).toBeGreaterThan(0)
        expect(c!.clipped, `line of ${n} clipped`).toBe(false)
        expect(c!.outside, `line of ${n} outside`).toBe(false)
      }
      await context.close()
    }, 90_000)
  }
})
