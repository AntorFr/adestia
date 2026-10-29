/**
 * The pages tranche, second pass from its need (adestia-correctifs-pages: B-13, B-16; P-4 to P-6, P-12 for
 * CRLF; E-3, E-4, E-6, E-23): the cases `besoin-pages-browser.test.ts` leaves out — the diagnostic of a
 * refused save, the sentence of a block that needs content, the trail of a page two folders down and of a
 * root page being edited, E-6 with its anchor high on the page, the editor's fields on a CRLF page, and the
 * planif notes' `at:`, `enabled:` and `until:` in CRLF. Browser on `bench/launch.mjs --seed besoin-pages-ensemble`
 * (scripted engine). Every expected word is written by hand from docs/parcours.md and docs/ecrans.md.
 *
 * Playwright and Chromium come from the environment. Without them the file is skipped. Needs `npm run build`.
 * `PAGES_SHOTS=<dir>` writes one capture per state.
 */

import { mkdirSync } from 'node:fs'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Size, type Theme, type Instance, launch, newBrowser, open, playwright } from './charte-browser.js'

const SHOTS = process.env.PAGES_SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const SKINS = ['skippy', 'alfred', 'nestor', 'dobby']
const LOCALES = ['en', 'fr'] as const
const THEMES: Theme[] = ['light', 'dark']
const SIZES: Size[] = ['desk', 'phone']

const WORDS = {
  en: { home: 'Home', edit: 'Edit', block: 'Block settings', done: 'Done' },
  fr: { home: 'Accueil', edit: 'Modifier', block: 'Réglages du bloc', done: 'Terminé' },
} as const
/** docs/ecrans.md, « E-5 and E-6 »: `Not saved: …` / `Non enregistré : …`, and the example sentences of `content`'s validation. */
const NEEDS_CONTENT = {
  en: { saved: 'Not saved: Block ":::callout" needs content.', sentence: 'Block ":::callout" needs content.' },
  fr: { saved: 'Non enregistré : Le bloc « :::callout » a besoin de contenu.', sentence: 'Le bloc « :::callout » a besoin de contenu.' },
} as const

type BrowserOf = Awaited<ReturnType<typeof newBrowser>>

const visit = async (browser: BrowserOf, base: string, locale: string, theme: Theme, size: Size, route: string) =>
  (await open(browser, base, {
    theme,
    size,
    locale,
    route,
    before: async (page: any) => {
      page.indexAnswered = page.waitForResponse((r: any) => /\/api\/pages\/index(\?.*)?$/.test(r.url()), { timeout: 20_000 }).catch(() => null)
    },
  })) as { context: any; page: any }
async function indexLoaded(page: any) {
  expect(await page.indexAnswered, 'the pages index never answered').not.toBeNull()
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))))
}
const shot = async (page: any, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` })
}
const lines = async (page: any, selector: string): Promise<string[]> =>
  ((await page.evaluate((s: string) => (document.querySelector(s) as HTMLElement | null)?.innerText ?? '', selector)) as string)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
const crumbs = async (page: any): Promise<string[]> => (await lines(page, 'nav.adestia-crumbs')).filter((l) => l !== '/')

interface Box {
  top: number
  bottom: number
  left: number
  right: number
}

describe.skipIf(!playwright)('pages tranche, second pass from the need', () => {
  for (const skin of SKINS) {
    for (const locale of LOCALES) {
      const w = WORDS[locale]
      describe(`${skin} / ${locale}`, () => {
        let instance: Instance
        let browser: BrowserOf
        beforeAll(async () => {
          instance = await launch('besoin-pages-ensemble', skin, locale)
          browser = await newBrowser()
        }, 60_000)
        afterAll(async () => {
          await browser?.close()
          await instance?.stop()
        })

        // P-4 step 6: a trail names each level; a page two folders down has exactly those two folders.
        // Breaks if the repair of the root trail drops or doubles a real folder.
        it('page_profonde_fil_ariane_nomme_ses_deux_dossiers', async () => {
          for (const theme of THEMES)
            for (const size of SIZES) {
              const { context, page } = await visit(browser, instance.url, locale, theme, size, '/page/dossier/sous/profonde')
              await page.waitForFunction(() => document.querySelectorAll('nav.adestia-crumbs button').length >= 3, null, { timeout: 15_000 })
              await indexLoaded(page)
              const trail = await crumbs(page)
              expect(trail.map((t) => t.toLowerCase()), `${theme} ${size}`).toEqual([w.home.toLowerCase(), 'dossier', 'sous', 'page profonde'])
              await shot(page, `profonde-${skin}-${locale}-${theme}-${size}`)
              await context.close()
            }
        }, 180_000)

        // P-4 step 6, exclusion: opening the editor on a root page does not make a folder appear in its trail.
        it('racine_en_edition_fil_ariane_sans_dossier_invente', async () => {
          const { context, page } = await visit(browser, instance.url, locale, 'light', 'desk', '/page/racine')
          await page.waitForFunction(() => /Page à la racine/.test(document.querySelector('nav.adestia-crumbs')?.textContent ?? ''), null, { timeout: 15_000 })
          await page.getByRole('button', { name: w.edit, exact: true }).click()
          await page.getByRole('button', { name: w.done, exact: true }).waitFor({ timeout: 15_000 })
          await indexLoaded(page)
          expect(await crumbs(page)).toEqual([w.home, 'Page à la racine'])
          await shot(page, `racine-edition-${skin}-${locale}`)
          await context.close()
        }, 60_000)

        // P-4 step 9: a read-only page shows each diagnostic in the instance's language, the block name as written.
        // Breaks if the sentence for a block that needs content is shown untranslated (or only in English).
        it('lecture_seule_dit_quun_bloc_a_besoin_de_contenu_dans_la_langue', async () => {
          for (const theme of THEMES)
            for (const size of SIZES) {
              const { context, page } = await visit(browser, instance.url, locale, theme, size, '/page/callout-vide')
              await page.waitForSelector('.adestia-editor__raw', { timeout: 15_000 })
              const flat = ((await page.evaluate(() => document.querySelector('.adestia-editor')!.textContent ?? '')) as string).replace(/\s+/g, ' ')
              expect(flat, `${theme} ${size}`).toContain(NEEDS_CONTENT[locale].sentence)
              const other = locale === 'fr' ? NEEDS_CONTENT.en.sentence : NEEDS_CONTENT.fr.sentence
              expect(flat).not.toContain(other)
              await shot(page, `callout-vide-${skin}-${locale}-${theme}-${size}`)
              await context.close()
            }
        }, 180_000)

        // P-5 step 6 / E-4: a save the vocabulary refuses shows its first diagnostic in the instance's language
        // in the save status, and the editor stays open with its text. Breaks if the status shows the English sentence
        // under `fr`, or closes the editor.
        it('sauvegarde_refusee_dit_le_diagnostic_dans_la_langue_et_garde_lediteur', async () => {
          for (const [i, theme] of THEMES.entries()) {
            const { context, page } = await visit(browser, instance.url, locale, theme, 'desk', `/page/refus-${i}`)
            await page.getByRole('button', { name: w.edit, exact: true }).click()
            await page.locator('.ProseMirror').last().getByText('Corps.').click()
            await page.keyboard.press('End')
            await page.keyboard.press('Enter')
            await page.keyboard.type('/')
            await page.locator('.milkdown-slash-menu').first().waitFor({ state: 'visible', timeout: 15_000 })
            await page.keyboard.type('callout')
            // the menu has filtered itself down to the block: the proof Enter will pick it
            await page.waitForFunction(() => {
              const menu = document.querySelector('.milkdown-slash-menu') as HTMLElement | null
              return !!menu && menu.dataset.show === 'true' && /callout/.test(menu.innerText) && !/Heading/.test(menu.innerText)
            }, null, { timeout: 10_000 })
            await page.keyboard.press('Enter') // an empty :::callout, which the vocabulary refuses at save
            // the proof the save was answered: the status carries the refusal
            const flat = () => page.evaluate(() => (document.querySelector('.adestia-canvas__body') as HTMLElement).innerText.replace(/[\u00a0\u202f\s]+/g, ' '))
            const want = NEEDS_CONTENT[locale].saved
            await page
              .waitForFunction((t: string) => (document.querySelector('.adestia-canvas__body') as HTMLElement).innerText.replace(/[\u00a0\u202f\s]+/g, ' ').includes(t), want, { timeout: 20_000 })
              .catch(async (error: unknown) => {
                await shot(page, `refus-ECHEC-${skin}-${locale}-${theme}`)
                throw new Error(`${String(error)}\nstatus read: ${(await flat()).slice(-400)}`)
              })
            const other = locale === 'fr' ? NEEDS_CONTENT.en.saved : NEEDS_CONTENT.fr.saved
            expect(await flat(), `${theme}`).not.toContain(other)
            expect(await page.getByRole('button', { name: w.done, exact: true }).count(), 'the editor stays open').toBe(1)
            expect(await flat(), 'the text stays').toContain('Corps.')
            await shot(page, `refus-${skin}-${locale}-${theme}`)
            await context.close()
          }
        }, 120_000)

        // P-6 step 4 / E-6: the popover stays below the header and the bands even when its block is the first
        // one of the page, right under the bands; at 1440 px and on a phone, in both themes.
        it('reglages_de_bloc_en_haut_de_page_ne_recouvrent_ni_entete_ni_bandeaux', async () => {
          for (const theme of THEMES)
            for (const size of SIZES) {
              const { context, page } = await visit(browser, instance.url, locale, theme, size, '/page/haut')
              await page.waitForSelector('.adestia-problems', { timeout: 15_000 })
              await page.getByRole('button', { name: w.edit, exact: true }).click()
              await page.waitForSelector('[data-block="callout"]', { timeout: 15_000 })
              await page.locator('[data-block="callout"]').hover({ timeout: 3_000 }).catch(() => undefined) // a touch screen has no hover
              await page.getByRole('button', { name: w.block }).first().click()
              await page.waitForSelector('.adestia-popover', { timeout: 10_000 })
              await page.waitForTimeout(300) // the panel measures itself once mounted: a visual settle before reading its geometry
              const g = (await page.evaluate(() => {
                const rect = (e: Element) => {
                  const r = e.getBoundingClientRect()
                  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
                }
                const header = document.querySelector('.adestia-canvas__header')
                return {
                  pop: rect(document.querySelector('.adestia-popover')!),
                  header: header ? rect(header) : null,
                  bands: [...document.querySelectorAll('.adestia-problems')].map(rect),
                  vw: innerWidth,
                  vh: innerHeight,
                }
              })) as { pop: Box; header: Box | null; bands: Box[]; vw: number; vh: number }
              const overlaps = (a: Box, b: Box) => a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5 && a.left < b.right - 0.5 && a.right > b.left + 0.5
              const label = `${theme} ${size}`
              expect(g.header, 'the canvas header exists').not.toBeNull()
              expect(overlaps(g.pop, g.header!), `${label}: covers the canvas header`).toBe(false)
              for (const band of g.bands.filter((b) => b.bottom > 0 && b.top < g.vh)) expect(overlaps(g.pop, band), `${label}: covers a band`).toBe(false)
              expect(g.pop.top, `${label}: above the viewport`).toBeGreaterThanOrEqual(0)
              expect(g.pop.right, `${label}: right of the viewport`).toBeLessThanOrEqual(g.vw + 0.5)
              expect(g.pop.bottom, `${label}: below the viewport`).toBeLessThanOrEqual(g.vh + 0.5)
              await shot(page, `reglages-haut-${skin}-${locale}-${theme}-${size}`)
              await context.close()
            }
        }, 240_000)

        // P-4 step 5 / E-5: the editor shows the fields of a CRLF page as it shows those of its LF twin.
        // Breaks if the properties of a page whose lines end in \r\n come up empty.
        it('editeur_montre_les_champs_dune_page_crlf_comme_ceux_de_sa_jumelle_lf', async () => {
          const read = async (route: string) => {
            const { context, page } = await visit(browser, instance.url, locale, 'light', 'desk', route)
            await page.getByRole('button', { name: w.edit, exact: true }).click()
            await page.locator('.adestia-editor__meta-gear').click()
            await page.waitForSelector('.adestia-popover', { timeout: 10_000 })
            const fields = (await page.evaluate(() => ({
              inputs: [...document.querySelectorAll('.adestia-popover input')].map((i) => (i as HTMLInputElement).value),
              selects: [...document.querySelectorAll('.adestia-popover select')].map((s) => (s as HTMLSelectElement).value),
            }))) as { inputs: string[]; selects: string[] }
            await shot(page, `proprietes-${route.slice(6)}-${skin}-${locale}`)
            await context.close()
            return fields
          }
          const crlf = await read('/page/editeur-crlf')
          const lf = await read('/page/editeur-lf')
          expect(crlf.inputs[0]).toBe('Fiche éditeur CRLF')
          expect(lf.inputs[0]).toBe('Fiche éditeur LF')
          for (const f of [crlf, lf]) {
            expect(f.selects).toContain('ouverte') // status
            expect(f.selects).toContain('bois') // cat
            expect(f.inputs).toContain('cuisine') // role
          }
          expect(crlf.selects).toEqual(lf.selects)
          expect(crlf.inputs.slice(1)).toEqual(lf.inputs.slice(1))
        }, 120_000)

        // P-12 step 5 / E-23: `at:`, `enabled:` and `until:` of a CRLF note read as those of its LF twin.
        // Breaks if one of the three keys is lost on `\r\n` lines (the note then reads as a plain `every:` note or as invalid).
        it('planif_lit_at_enabled_et_until_dune_note_crlf_comme_ceux_dune_note_lf', async () => {
          for (const theme of THEMES)
            for (const size of SIZES) {
              const { context, page } = await visit(browser, instance.url, locale, theme, size, '/planif')
              await page.waitForFunction(() => /Note mission CRLF/.test(document.querySelector('.adestia-canvas__body')?.textContent ?? ''), null, { timeout: 15_000 })
              const all = await lines(page, '.adestia-canvas__body')
              const titles = ['Note at CRLF', 'Note at LF', 'Note coupée CRLF', 'Note coupée LF', 'Note mission CRLF', 'Note mission LF', 'Note CRLF valide', 'Note LF valide', 'Note CRLF trop rapide']
              const row = (title: string): string[] => {
                const from = all.indexOf(title)
                expect(from, `${title} is listed`).toBeGreaterThanOrEqual(0)
                let to = all.length
                for (const t of titles) if (all.indexOf(t) > from && all.indexOf(t) < to) to = all.indexOf(t)
                const end = all.findIndex((l, i) => i > from && /^(＋|\+)/.test(l))
                return all.slice(from + 1, end >= 0 ? Math.min(to, end) : to)
              }
              const label = `${theme} ${size}`
              // at: the fixed time is what the row shows
              expect(row('Note at CRLF'), label).toContain('08:00')
              expect(row('Note at CRLF'), label).toEqual(row('Note at LF'))
              // until: the mission's deadline is shown
              expect(row('Note mission CRLF').join(' '), label).toContain('2099-12-31')
              expect(row('Note mission CRLF'), label).toEqual(row('Note mission LF'))
              // enabled: false: the CRLF note reads as suspended like its twin, and not as the plain every: note
              expect(row('Note coupée CRLF'), label).toEqual(row('Note coupée LF'))
              expect(row('Note coupée LF'), 'the suspended note differs from a running one').not.toEqual(row('Note LF valide'))
              expect(row('Note coupée CRLF'), label).not.toEqual(row('Note CRLF valide'))
              await shot(page, `planif-cles-${skin}-${locale}-${theme}-${size}`)
              await context.close()
            }
        }, 180_000)
      })
    }
  }
})
