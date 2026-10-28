/** Visual proof of AD-24 d on the host bench, with the fake engine.
 * node bench/scenarios/chat-matrix.mjs bench/scenarios/plugins-marques.mjs --out /tmp/shots-marques
 * Index responses expose an archived journal and attachments without changing stored data.
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
  if (!url) throw new Error('Run through chat-matrix.mjs')
  const locale = process.env.BENCH_LOCALE ?? 'en'
  const out = resolve(process.env.BENCH_OUT ?? '/tmp/shots-marques')
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
        await page.route('**/api/pages/index', async (route) => {
          const response = await route.fetch()
          const data = await response.json()
          for (const entry of data.entries) {
            if (entry.path === 'journal/voyage-vide/INDEX.md') entry.finished = true
            if (entry.path === 'taches/poncer-porte.md') entry.fields.files = ['devis.pdf', 'photo.png']
          }
          await route.fulfill({ response, json: data })
        })
        const open = async (route, proof) => {
          await page.goto(`${url}/#${route}`)
          await page.locator('.adestia-shell').waitFor()
          if (phone && await page.locator('.adestia-shell').getAttribute('data-screen') !== 'canvas') {
            await page.locator('.adestia-chat__header .adestia-ib').last().click()
          }
          await page.locator(proof).first().waitFor()
          await page.evaluate(() => document.fonts.ready)
        }
        const shot = async (name) => {
          await page.screenshot({ path: join(out, `${theme}-${phone ? 'phone' : 'desk'}-${name}.png`), animations: 'disabled' })
          report.push({ theme, phone, locale, name })
        }
        const sprite = (name) => `use[href="#adestia-i-${name}"]`
        await open('/todo', '.todo-task')
        assert.ok(await page.locator(`.todo-mark ${sprite('pen-line')}`).count())
        assert.ok(await page.locator(`.todo-mark ${sprite('paperclip')}`).count())
        await shot('todo')
        await open('/journal', '.journal-card')
        assert.equal(await page.locator(`summary ${sprite('archive')}`).count(), 1)
        assert.equal(await page.locator('.journal-archive summary').getAttribute('title'), locale === 'fr' ? 'Journaux archivés' : 'Archived journals')
        await shot('journal')
        await open('/voyages', '.vhub-card')
        await shot('trips')
        await open('/voyages/corse', '.vday')
        assert.ok(await page.locator(sprite('file-text')).count())
        assert.ok(!(await page.locator('.voyages').textContent()).includes('🖐'))
        await shot('trip')
        await page.locator('.vcard').first().click()
        await page.locator('.voyages-sheet[role=dialog]').waitFor()
        await shot('trip-sheet')
        await page.keyboard.press('Escape')
        await open('/listening-post', '.lp-card')
        await page.locator(`.lp-muted ${sprite('triangle-alert')}`).waitFor({ state: 'attached' })
        await shot('listening-post')
        await open('/parcours/balades/assets/val-sans-retour.parcours.json', '.pc-list')
        const warning = page.locator('.pc-meta').filter({ hasText: locale === 'fr' ? 'à 95 m de la trace' : '95 m from the route' })
        await warning.waitFor()
        assert.equal(await warning.locator(sprite('triangle-alert')).count(), 1)
        await warning.scrollIntoViewIfNeeded()
        await shot('route-warning')
        const walk = page.getByRole('button', { name: locale === 'fr' ? 'Mode balade' : 'Walking mode', exact: true })
        await walk.scrollIntoViewIfNeeded()
        await walk.click()
        await page.getByRole('button', { name: locale === 'fr' ? 'Suivi' : 'Follow', exact: true }).waitFor()
        await shot('walk')
      } finally { await context.close() }
    }
  } finally { await browser.close() }
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(`plugins-marques: ${locale}, four theme/width variants passed`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await scenario()
