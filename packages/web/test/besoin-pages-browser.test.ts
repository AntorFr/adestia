/**
 * The pages tranche seen from its need (adestia-correctifs-pages: B-13, B-15, B-16; P-4 to P-6,
 * P-12 for CRLF; E-2 to E-8, E-23), through a driven browser on the bench instance
 * (`bench/launch.mjs --seed besoin-pages`, scripted engine). Expectations come from the fiche,
 * docs/parcours.md and docs/ecrans.md, never from the components.
 *
 * Playwright and Chromium come from the environment (`npm root -g`). Without them the whole file
 * is skipped — a skipped browser suite is not a seen screen. Needs `npm run build` first.
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
  en: { home: 'Home', edit: 'Edit', block: 'Block settings', missing: 'There is no page at this address.', above: 'Open the folder above' },
  fr: { home: 'Accueil', edit: 'Modifier', block: 'Réglages du bloc', missing: 'Il n’y a aucune page à cette adresse.', above: 'Ouvrir le dossier au-dessus' },
} as const

type BrowserOf = Awaited<ReturnType<typeof newBrowser>>

async function visit(browser: BrowserOf, base: string, locale: string, theme: Theme, size: Size, route: string) {
  return (await open(browser, base, {
    theme,
    size,
    locale,
    route,
    // armed before the first load: the answer of the pages index is the proof a trail is complete
    before: async (page: any) => {
      page.indexAnswered = page.waitForResponse((r: any) => /\/api\/pages\/index(\?.*)?$/.test(r.url()), { timeout: 20_000 }).catch(() => null)
    },
  })) as { context: any; page: any }
}
/** The pages index has answered and the shell has had two frames to draw from it. */
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
const body = (page: any) => lines(page, '.adestia-canvas__body')

/**
 * The waits of one test share one budget: its own timeout less a margin, so a wait that runs out
 * says what it waited for and what the page showed, before vitest cuts the test with a bare timeout.
 */
const MARGIN_MS = 8_000
interface Budget {
  left(cap?: number): number
}
function budget(total: number): Budget {
  const end = Date.now() + total - MARGIN_MS
  return { left: (cap = Infinity) => Math.max(1_000, Math.min(cap, end - Date.now())) }
}
const spec = (name: string, timeout: number, fn: (b: Budget) => Promise<void>) => it(name, () => fn(budget(timeout)), timeout)

/** What the page shows, for the message of a wait that ran out. */
async function shows(page: any): Promise<string> {
  return (await page.evaluate(() => (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)).catch(() => '(page unreadable)')) as string
}
/** Waits for `fn` to hold in the page (rAF-polled), within the budget; on expiry says what was awaited and what the page shows. */
async function until(page: any, b: Budget, what: string, fn: (arg: any) => unknown, arg?: unknown): Promise<void> {
  const timeout = b.left()
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 'raf' })
  } catch (error) {
    const cause = error instanceof Error ? error.message.split('\n')[0] : String(error)
    throw new Error(`${what}: not reached within ${timeout} ms (${cause}); the page shows: « ${await shows(page)} »`)
  }
}
const appears = (page: any, b: Budget, selector: string) => until(page, b, `'${selector}' never appeared`, (s: string) => !!document.querySelector(s), selector)

describe.skipIf(!playwright)('pages tranche, from the need', () => {
  for (const skin of SKINS) {
    for (const locale of LOCALES) {
      const w = WORDS[locale]
      describe(`${skin} / ${locale}`, () => {
        let instance: Instance
        let browser: BrowserOf
        beforeAll(async () => {
          try {
            instance = await launch('besoin-pages', skin, locale)
            browser = await newBrowser()
          } catch (error) {
            await browser?.close().catch(() => {})
            await instance?.stop().catch(() => {})
            throw new Error(`the instance or the browser did not open for ${skin} / ${locale}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
          }
        }, 120_000)
        afterAll(async () => {
          await browser?.close().catch(() => {})
          await instance?.stop().catch(() => {})
        })

        // B-16 / P-4 step 6: a root page's trail is Home and its title, never a folder it does not sit in.
        // Breaks if the trail again invents a folder crumb for a page at the root.
        it('racine_fil_ariane_sans_dossier_invente', async () => {
          for (const theme of THEMES)
            for (const size of SIZES) {
              const { context, page } = await visit(browser, instance.url, locale, theme, size, '/page/racine')
              await page.waitForSelector('nav.adestia-crumbs')
              await page.waitForFunction(() => /Page à la racine/.test(document.querySelector('nav.adestia-crumbs')?.textContent ?? ''), null, { timeout: 15_000 })
              await indexLoaded(page)
              expect(await crumbs(page), `${theme} ${size}`).toEqual([w.home, 'Page à la racine'])
              await shot(page, `racine-${skin}-${locale}-${theme}-${size}`)
              await context.close()
            }
        }, 180_000)

        // bords: a page in a folder keeps its folder crumb (the repair must not drop real folders).
        it('page_en_dossier_garde_son_dossier', async () => {
          const { context, page } = await visit(browser, instance.url, locale, 'light', 'desk', '/page/dossier/enfant')
          // the folder crumb exists once the pages index has answered: wait for it, it is the proof the screen is loaded
          await page.waitForFunction(() => document.querySelectorAll('nav.adestia-crumbs button').length >= 2, null, { timeout: 15_000 })
          const trail = await crumbs(page)
          expect(trail).toHaveLength(3)
          expect(trail[0]).toBe(w.home)
          expect(trail[1]?.toLowerCase()).toBe('dossier')
          expect(trail[2]).toBe('Page dans un dossier')
          await context.close()
        }, 60_000)

        // The Home crumb walks back to #/.
        it('racine_fil_ariane_accueil_ramene_a_la_racine', async () => {
          const { context, page } = await visit(browser, instance.url, locale, 'light', 'desk', '/page/racine')
          await page.waitForFunction(() => /Page à la racine/.test(document.querySelector('nav.adestia-crumbs')?.textContent ?? ''), null, { timeout: 15_000 })
          await page.getByRole('button', { name: w.home, exact: true }).first().click()
          await page.waitForFunction(() => location.hash === '#/' || location.hash === '', null, { timeout: 10_000 })
          await context.close()
        }, 60_000)

        // E-8: a missing page at the root links Home; a missing page in a folder links the folder above; both in the language.
        it('page_absente_a_la_racine_renvoie_a_accueil', async () => {
          for (const theme of THEMES)
            for (const size of SIZES) {
              const { context, page } = await visit(browser, instance.url, locale, theme, size, '/page/absente')
              await page.waitForSelector('.adestia-missing', { timeout: 15_000 })
              const text = (await lines(page, '.adestia-missing')).join(' ')
              expect(text, `${theme} ${size}`).toContain(w.missing)
              expect(text).toContain('absente')
              expect(text).toContain(w.home)
              expect(text).not.toContain(w.above)
              await shot(page, `absente-${skin}-${locale}-${theme}-${size}`)
              await page.locator('.adestia-missing').getByRole('link', { name: w.home, exact: true }).click()
              await page.waitForFunction(() => location.hash === '#/' || location.hash === '', null, { timeout: 10_000 })
              await context.close()
            }
        }, 180_000)

        it('page_absente_en_dossier_renvoie_au_dossier_au_dessus', async () => {
          const { context, page } = await visit(browser, instance.url, locale, 'light', 'desk', '/page/dossier/absente')
          await page.waitForSelector('.adestia-missing', { timeout: 15_000 })
          const text = (await lines(page, '.adestia-missing')).join(' ')
          expect(text).toContain(w.missing)
          expect(text).toContain(w.above)
          await page.locator('.adestia-missing').getByRole('link', { name: w.above }).click()
          await page.waitForFunction(() => location.hash === '#/section/dossier', null, { timeout: 10_000 })
          await context.close()
        }, 60_000)

        // P-5 step 9 / E-4: diagnostics of a refused page are in the instance's language.
        // Breaks if a diagnostic sentence is shown untranslated.
        it('diagnostic_de_page_dans_la_langue_de_linstance', async () => {
          for (const theme of THEMES)
            for (const size of SIZES) {
              const { context, page } = await visit(browser, instance.url, locale, theme, size, '/page/blocs-faux')
              await page.waitForSelector('.adestia-editor__raw', { timeout: 15_000 })
              const text = (await page.evaluate(() => {
                const clone = document.querySelector('.adestia-editor')!.cloneNode(true) as HTMLElement
                clone.querySelector('.adestia-editor__raw')?.remove()
                document.body.appendChild(clone) // innerText needs a laid-out node
                const out = clone.innerText
                clone.remove()
                return out
              })) as string
              const flat = text.replace(/\s+/g, ' ')
              if (locale === 'fr') {
                expect(flat, `${theme} ${size}`).toContain('« :::callout » n\'a pas d\'attribut « x » ; il sera ignoré.')
                expect(flat).not.toMatch(/has no attribute|will be ignored|Unknown block|vocabulary|\bline \d/i)
              } else {
                expect(flat, `${theme} ${size}`).toContain('":::callout" has no attribute "x"; it will be ignored.')
                expect(flat).not.toMatch(/n'a pas d'attribut|sera ignoré|Bloc inconnu|vocabulaire|ligne \d/i)
              }
              expect(flat).toContain(':::zorglub') // the block name stays as the author wrote it
              await shot(page, `diagnostic-${skin}-${locale}-${theme}-${size}`)
              await context.close()
            }
        }, 180_000)

        // P-6 step 4 / E-6: the settings popover never covers the canvas header nor the bands above the page,
        // and stays in the viewport — at 1440 px with the anchor low on the page (the panel then flips above),
        // and at phone width.
        spec('reglages_de_bloc_ne_recouvrent_ni_entete_ni_bandeaux', 240_000, async (b) => {
          for (const theme of THEMES)
            for (const size of SIZES) {
              const { context, page } = await visit(browser, instance.url, locale, theme, size, '/page/haute')
              await appears(page, b, '.adestia-problems')
              await page.getByRole('button', { name: w.edit, exact: true }).click()
              await appears(page, b, '[data-block="callout"]')
              await openBlockSettings(page, b, w.block)
              await expectPopoverClear(page, `${theme} ${size}`)
              await shot(page, `reglages-${skin}-${locale}-${theme}-${size}`)
              await context.close()
            }
        })

        // E-6 bords: the anchor scrolled up under the header — the panel stays at the header's edge and stays open.
        spec('reglages_de_bloc_suivent_leur_ancre_sous_lentete', 60_000, async (b) => {
          const { context, page } = await visit(browser, instance.url, locale, 'light', 'desk', '/page/haute')
          await appears(page, b, '.adestia-problems')
          await page.getByRole('button', { name: w.edit, exact: true }).click()
          await appears(page, b, '[data-block="callout"]')
          await openBlockSettings(page, b, w.block)
          await page.evaluate(() => {
            const bodyEl = document.querySelector('.adestia-canvas') as HTMLElement
            const gear = document.querySelector('.adestia-edblock__gear') as HTMLElement
            bodyEl.scrollTop += gear.getBoundingClientRect().top + 60 // gear 60 px above the viewport top: wholly under the header
          })
          await until(page, b, 'the gear never scrolled under the header', () => (document.querySelector('.adestia-edblock__gear') as HTMLElement).getBoundingClientRect().bottom < 0)
          await until(page, b, 'the popover never followed its anchor to the header edge', () => {
            const pop = document.querySelector('.adestia-popover')
            const head = document.querySelector('.adestia-canvas__header')
            // follows its anchor to the header's lower edge (a few px of gap): not left where it was, not under the header
            const gap = !pop || !head ? NaN : pop.getBoundingClientRect().top - head.getBoundingClientRect().bottom
            return gap >= -0.5 && gap <= 16
          })
          expect(await page.evaluate(() => !!document.querySelector('.adestia-popover'))).toBe(true)
          await shot(page, `reglages-sous-entete-${skin}-${locale}`)
          await context.close()
        })

        // P-4 step 5, P-12 step 5, E-3: frontmatter in \r\n is read as one in \n.
        // Breaks if the index reads \r\n lines as no frontmatter.
        spec('sections_crlf_lisent_les_memes_champs_que_lf', 120_000, async (b) => {
          const expected: Record<string, string[]> = {
            '': ['fermée', 'ouverte'], // status
            '-role': ['cuisine', 'jardin'],
            '-cat': ['bois', 'métal'],
          }
          for (const [suffix, pills] of Object.entries(expected))
            for (const dir of ['lf', 'crlf']) {
              const { context, page } = await visit(browser, instance.url, locale, 'light', 'desk', `/section/${dir}${suffix}`)
              await appears(page, b, 'button.adestia-card')
              await until(page, b, `${dir}${suffix}: the chips never settled`, (n: number) => document.querySelectorAll('button.adestia-chip').length === n && document.querySelectorAll('button.adestia-card').length === 4, pills.length + 1)
              const chips = (await page.evaluate(() => [...document.querySelectorAll('button.adestia-chip')].map((e) => (e.textContent ?? '').trim()))) as string[]
              expect(chips.slice(1), `${dir}${suffix}`).toEqual(pills) // the first chip is "All" / "Tout"
              // three fiches AND `INDEX.md`, a card like another (AD-40)
              expect(await page.locator('button.adestia-card').count()).toBe(4)
              await context.close()
            }
        })

        spec('section_crlf_filtre_par_facette', 60_000, async (b) => {
          const { context, page } = await visit(browser, instance.url, locale, 'light', 'desk', '/section/crlf')
          await appears(page, b, 'button.adestia-card')
          await until(page, b, 'the four cards never settled (three fiches and INDEX.md)', () => document.querySelectorAll('button.adestia-card').length === 4)
          await page.getByRole('button', { name: 'ouverte', exact: true }).click({ timeout: b.left(15_000) })
          await until(page, b, 'the facette never narrowed the list to two cards', () => document.querySelectorAll('button.adestia-card').length === 2)
          const cards = (await page.evaluate(() => [...document.querySelectorAll('button.adestia-card')].map((e) => e.textContent ?? ''))) as string[]
          expect(cards.some((c) => c.includes('Fiche A'))).toBe(true)
          expect(cards.some((c) => c.includes('Fiche C'))).toBe(true)
          expect(cards.some((c) => c.includes('Fiche B'))).toBe(false)
          await shot(page, `crlf-facette-${skin}-${locale}`)
          await context.close()
        })

        // E-7: the collection groups its CRLF members by `cat` as it groups the LF ones.
        spec('collection_crlf_groupe_comme_lf', 60_000, async (b) => {
          for (const dir of ['lf', 'crlf']) {
            const { context, page } = await visit(browser, instance.url, locale, 'light', 'desk', `/page/${dir}-coll/INDEX`)
            await until(page, b, `${dir}: the groups never appeared`, () => /Bois/.test(document.querySelector('.adestia-canvas__body')?.textContent ?? '') && /Métal/.test(document.querySelector('.adestia-canvas__body')?.textContent ?? '') && /(Ask for a new page|Demander une nouvelle fiche)/.test(document.querySelector('.adestia-canvas__body')?.textContent ?? ''))
            const text = (await body(page)).join('|')
            // two groups only, "Bois" (2 members) then "Métal" (1), then the ask button: no group of members the index could not read
            expect(text, dir).toMatch(/Bois\|2 \S+\|Métal\|1 \S+\|(Ask for a new page|Demander une nouvelle fiche)/)
            await context.close()
          }
        })

        // P-12 step 5 / E-23: the planif app lists a CRLF note as valid, with its cadence, and a CRLF note
        // the clock would refuse with its problem (the sentence itself is server data, kept English).
        spec('planif_lit_les_champs_dune_note_crlf', 180_000, async (b) => {
          for (const theme of THEMES)
            for (const size of SIZES) {
              const { context, page } = await visit(browser, instance.url, locale, theme, size, '/planif')
              await until(page, b, `${theme} ${size}: the planif list never appeared`, () => /Note CRLF valide/.test(document.querySelector('.adestia-canvas__body')?.textContent ?? ''))
              // the title paints before its cadence: wait for the settled list, not for the first title (a loaded run read the row half drawn)
              const next = (all: string[], title: string) => all[all.indexOf(title) + 1]
              await expect.poll(async () => { const l = await body(page); return [next(l, 'Note CRLF valide'), next(l, 'Note LF valide'), next(l, 'Note CRLF trop rapide')].join('|') }, { timeout: b.left(), message: `${theme} ${size}: the planif list never settled to the cadences` }).toBe('2h|2h|5m')
              const all = await body(page)
              const at = (title: string) => all.indexOf(title)
              const ok = at('Note CRLF valide')
              expect(all[ok + 1], `${theme} ${size}`).toBe('2h')
              expect(all[ok + 2]).not.toMatch(/floor|15/)
              const lf = at('Note LF valide')
              expect(all[lf + 1]).toBe('2h')
              const bad = at('Note CRLF trop rapide')
              expect(all[bad + 1]).toBe('5m')
              expect(all[bad + 2]).toMatch(/15/)
              await shot(page, `planif-${skin}-${locale}-${theme}-${size}`)
              await context.close()
            }
        })
      })
    }
  }
})

async function openBlockSettings(page: any, b: Budget, name: string) {
  await page.locator('[data-block="callout"]').scrollIntoViewIfNeeded()
  const bar = page.locator('[data-block="callout"]')
  try {
    await bar.hover({ timeout: 3_000 })
  } catch {
    // touch screens have no hover
  }
  await page.getByRole('button', { name }).first().click({ timeout: b.left(15_000) })
  await appears(page, b, '.adestia-popover')
  // the panel measures itself once mounted: its rectangle is the same on six consecutive frames before anything reads it
  await until(page, b, 'the popover never settled', () => {
    const w = window as any
    const r = document.querySelector('.adestia-popover')?.getBoundingClientRect()
    const key = r ? [r.top, r.bottom, r.left, r.right].map((n) => n.toFixed(1)).join(',') : ''
    w.__popSeen = key && key === w.__popKey ? (w.__popSeen ?? 0) + 1 : 0
    w.__popKey = key
    return w.__popSeen >= 6
  })
}

async function expectPopoverClear(page: any, label: string) {
  const g = (await page.evaluate(() => {
    const rect = (e: Element) => {
      const r = e.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
    }
    const pop = document.querySelector('.adestia-popover')!
    const header = document.querySelector('.adestia-canvas__header')
    const bands = [...document.querySelectorAll('.adestia-problems')].map(rect).filter((r) => r.bottom > 0 && r.top < innerHeight)
    return { pop: rect(pop), header: header ? rect(header) : null, bands, vw: innerWidth, vh: innerHeight }
  })) as { pop: Box; header: Box | null; bands: Box[]; vw: number; vh: number }
  const overlaps = (a: Box, b: Box) => a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5 && a.left < b.right - 0.5 && a.right > b.left + 0.5
  if (g.header) expect(overlaps(g.pop, g.header), `${label}: covers the canvas header`).toBe(false)
  for (const band of g.bands) expect(overlaps(g.pop, band), `${label}: covers a band ${JSON.stringify(band)}`).toBe(false)
  expect(g.pop.top, `${label}: above the viewport`).toBeGreaterThanOrEqual(0)
  expect(g.pop.left, label).toBeGreaterThanOrEqual(0)
  expect(g.pop.right, label).toBeLessThanOrEqual(g.vw + 0.5)
  expect(g.pop.bottom, `${label}: below the viewport`).toBeLessThanOrEqual(g.vh + 0.5)
}
interface Box {
  top: number
  bottom: number
  left: number
  right: number
}
