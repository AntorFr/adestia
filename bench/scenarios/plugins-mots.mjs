/** Piece counts and complete plugin phrases on the real shell (fake engine).
 * node bench/scenarios/chat-matrix.mjs bench/scenarios/plugins-mots.mjs --out bench/shots-mots
 * The count variants replace only the workbook GET response, never stored data.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const seed = 'plugins'

export default async function scenario() {
  const { chromium } = createRequire('/usr/lib/node_modules/')('playwright')
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  const url = process.env.BENCH_URL
  if (!url) throw new Error('Run through chat-matrix.mjs or supply BENCH_URL and BENCH_LOCALE')
  const locale = process.env.BENCH_LOCALE ?? 'en'
  const out = resolve(process.env.BENCH_OUT ?? 'bench/shots-mots')
  await mkdir(out, { recursive: true })
  const report = []
  try {
    for (const theme of ['light', 'dark']) for (const phone of [false, true]) {
      const context = await browser.newContext({
        viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
        colorScheme: theme,
      })
      try {
        const page = await context.newPage()
        await page.addInitScript((value) => localStorage.setItem('adestia.theme', value), theme)
        const canvas = async () => {
          await page.locator('.adestia-shell').waitFor()
          if (phone && await page.locator('.adestia-shell').getAttribute('data-screen') !== 'canvas') {
            await page.locator('.adestia-chat__header .adestia-ib').last().click()
          }
          if (phone) await page.locator('.adestia-shell[data-screen=canvas]').waitFor()
        }
        const open = async (route, selector) => {
          await page.goto(`${url}/#${route}`)
          await canvas()
          await page.locator(selector).first().waitFor()
          await page.evaluate(() => document.fonts.ready)
        }
        const shot = async (name) => page.screenshot({
          path: join(out, `${theme}-${phone ? 'phone' : 'desk'}-${name}.png`), animations: 'disabled',
        })
        let count = 1
        await page.route('**/api/plugin/atelier/workbook?*', async (route) => {
          const response = await route.fetch()
          const data = await response.json()
          const plate = data.debit[0]
          const cuts = plate.etapes.filter((step) => step.type === 'tronconnage')
          const pieces = cuts.flatMap((step) => step.pieces ?? []).slice(0, count)
          plate.etapes = plate.etapes.filter((step) => step.type !== 'tronconnage')
          if (count) plate.etapes.push({ ...cuts[0], pieces })
          await route.fulfill({ response, json: data })
        })
        const counts = []
        for (count of [0, 1, 2]) {
          await open('/atelier/caisson', '.atelier-page .bp-h')
          // A reload gives the engine a new workbook even at the same route.
          await page.reload()
          await canvas()
          await page.locator('.atelier-page .bp-h').first().waitFor()
          const text = await page.locator('.atelier-page .bp-h').first().textContent()
          const expected = locale === 'fr' ? `${count} ${count > 1 ? 'pièces' : 'pièce'}` : `${count} ${count === 1 ? 'piece' : 'pieces'}`
          assert.ok(text.endsWith(` · ${expected}`), `${text} should end with ${expected}`)
          counts.push(expected)
          if (count === 1) await shot('atelier-one-piece')
        }
        await open('/planif', '.planif__note')
        const planif = await page.locator('.planif').textContent()
        const until = locale === 'fr' ? 'jusqu’au 2026-12-01' : 'until 2026-12-01'
        const clock = locale === 'fr' ? 'horloge coupée — rien ne tournera' : 'clock off — nothing will run'
        assert.ok(planif.includes(until), until)
        assert.ok(planif.includes(clock), clock)
        await shot('planif-complete-phrases')
        await open('/voyages', '.vhub-card')
        const confirmed = await page.locator('.vhub-card .tag').allTextContents()
        assert.ok(confirmed.some((text) => locale === 'fr' ? /^\d+ confirmées?$/.test(text) : /^\d+ confirmed$/.test(text)), confirmed.join(', '))
        await shot('voyages-counts')
        await open('/voyages/corse', '.vday')
        const dismissed = (await page.locator('[data-ectoggle]').textContent()).trim()
        assert.match(dismissed, locale === 'fr' ? /^\d+ écartées? [▾▸]$/ : /^\d+ dismissed [▾▸]$/)
        await shot('voyages-dismissed')
        await open('/parcours/balades/assets/val-sans-retour.parcours.json', '.parcours.pc-ready .pc-list')
        const offRoute = locale === 'fr' ? 'à 95 m de la trace' : '95 m from the route'
        const waypoint = page.locator('.pc-list li').filter({ hasText: offRoute })
        await waypoint.waitFor()
        await waypoint.scrollIntoViewIfNeeded()
        await shot('parcours-complete-phrase')
        report.push({ theme, phone, locale, counts, until, clock, confirmed, dismissed, offRoute })
      } finally { await context.close() }
    }
  } finally { await browser.close() }
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(`plugins-mots: ${locale}, four theme/width variants passed`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await scenario()
