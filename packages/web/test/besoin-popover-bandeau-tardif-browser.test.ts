/**
 * P-6 step 4 / E-6, seen from the need through a driven browser on the bench instance
 * (`bench/launch.mjs --seed besoin-pages`): the block settings popover "stays below the canvas
 * header and the bands above the page, and inside the viewport" — also when a band shows up
 * AFTER the panel opened (the pages index, which feeds the stray-`app:` band, answers late).
 * Expectations come from docs/parcours.md and docs/ecrans.md, never from the component.
 *
 * Playwright and Chromium come from the environment; without them the file is skipped.
 * `PAGES_SHOTS=<dir>` writes one capture per state (keep it outside the tracked tree).
 */

import { mkdirSync } from 'node:fs'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Instance, type Size, launch, newBrowser, open, playwright } from './charte-browser.js'

const SHOTS = process.env.PAGES_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const LOCALES = ['en', 'fr'] as const
const SIZES: Size[] = ['desk', 'phone']
const WORDS = { en: { edit: 'Edit', block: 'Block settings' }, fr: { edit: 'Modifier', block: 'Réglages du bloc' } } as const

interface Box { top: number; bottom: number; left: number; right: number }
const overlaps = (a: Box, b: Box) => a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5 && a.left < b.right - 0.5 && a.right > b.left + 0.5

async function geometry(page: any) {
  return (await page.evaluate(() => {
    const rect = (e: Element) => {
      const r = e.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
    }
    const pop = document.querySelector('.adestia-popover')
    const header = document.querySelector('.adestia-canvas__header')
    return {
      pop: pop ? rect(pop) : null,
      header: header ? rect(header) : null,
      bands: [...document.querySelectorAll('.adestia-problems')].map(rect),
      vw: innerWidth,
      vh: innerHeight,
    }
  })) as { pop: Box | null; header: Box | null; bands: Box[]; vw: number; vh: number }
}

describe.skipIf(!playwright)('E-6 popover and a band that arrives after it opened, from the need', () => {
  for (const locale of LOCALES) {
    const w = WORDS[locale]
    describe(`skippy / ${locale}`, () => {
      let instance: Instance
      let browser: Awaited<ReturnType<typeof newBrowser>>
      beforeAll(async () => {
        instance = await launch('besoin-pages', 'skippy', locale)
        browser = await newBrowser()
      }, 60_000)
      afterAll(async () => {
        await browser?.close()
        await instance?.stop()
      })

      // Breaks if the panel keeps the list of frontiers it saw at opening and sits on a band mounted later.
      it('reglages_de_bloc_evitent_un_bandeau_arrive_apres_leur_ouverture', async () => {
        for (const size of SIZES) {
          let release!: () => void
          const gate = new Promise<void>((r) => (release = r))
          const { context, page } = await open(browser, instance.url, {
            theme: 'light',
            size,
            locale,
            route: '/page/haute',
            before: async (p) => {
              // the pages index answers only when the test lets it: the stray-`app:` band cannot exist before
              await p.route('**/api/pages/index*', async (route) => {
                await gate
                await route.continue()
              })
            },
          })
          await page.getByRole('button', { name: w.edit, exact: true }).click()
          await page.waitForSelector('[data-block="callout"]', { timeout: 15_000 })
          await page.locator('[data-block="callout"]').scrollIntoViewIfNeeded()
          try {
            await page.locator('[data-block="callout"]').hover({ timeout: 3_000 })
          } catch {
            // touch screens have no hover
          }
          await (page as any).getByRole('button', { name: w.block }).first().click()
          await page.waitForSelector('.adestia-popover', { timeout: 10_000 })
          // the starting state: panel open, the stray-`app:` band (fed by the pages index) not there yet
          const before = await page.locator('.adestia-problems').count()
          expect(await page.locator('.adestia-problems--degraded').count(), `${size}: the degraded band existed before the index answered`).toBe(0)
          if (SHOTS) await page.screenshot({ path: `${SHOTS}/popover-avant-bandeau-${locale}-${size}.png` })

          // the band arrives after the panel opened
          const answered = (page as any).waitForResponse((r: any) => /\/api\/pages\/index(\?.*)?$/.test(r.url()), { timeout: 20_000 })
          release()
          await answered
          await page.waitForSelector('.adestia-problems--degraded', { timeout: 15_000 })
          expect(await page.locator('.adestia-problems').count()).toBeGreaterThan(before)
          // the panel is still open and, once the layout has settled, clear of header and bands
          await (page as any).waitForFunction(
            () => {
              const pop = document.querySelector('.adestia-popover')
              if (!pop) return false
              const p = pop.getBoundingClientRect()
              return [...document.querySelectorAll('.adestia-problems')].every((b) => {
                const r = b.getBoundingClientRect()
                return !(p.top < r.bottom - 0.5 && p.bottom > r.top + 0.5 && p.left < r.right - 0.5 && p.right > r.left + 0.5)
              })
            },
            null,
            { timeout: 5_000 },
          )
          const g = await geometry(page)
          expect(g.pop, `${size}: the panel closed when the band arrived`).not.toBeNull()
          expect(g.bands.length).toBeGreaterThan(0)
          if (g.header) expect(overlaps(g.pop!, g.header), `${size}: covers the canvas header`).toBe(false)
          for (const band of g.bands) expect(overlaps(g.pop!, band), `${size}: covers a band ${JSON.stringify(band)}`).toBe(false)
          expect(g.pop!.top, `${size}: above the viewport`).toBeGreaterThanOrEqual(0)
          expect(g.pop!.left).toBeGreaterThanOrEqual(0)
          expect(g.pop!.right).toBeLessThanOrEqual(g.vw + 0.5)
          expect(g.pop!.bottom, `${size}: below the viewport`).toBeLessThanOrEqual(g.vh + 0.5)
          if (SHOTS) await page.screenshot({ path: `${SHOTS}/popover-apres-bandeau-${locale}-${size}.png` })

          // E-6 / P-6 step 4: Escape still closes it
          await page.keyboard.press('Escape')
          await (page as any).waitForFunction(() => !document.querySelector('.adestia-popover'), null, { timeout: 5_000 })
          await context.close()
        }
      }, 120_000)
    })
  }
})
