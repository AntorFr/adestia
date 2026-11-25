/**
 * E-3 with the Attachments brick (B-38), the four captures — light/dark, desk/phone —
 * and the states the exit criterion names. Host: `node bench/launch.mjs --engine fake
 * --seed dossier-pieces`, then `BENCH_URL=<url> node bench/scenarios/dossier-pieces.mjs`.
 */
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const seed = 'dossier-pieces'
export default async function scenario() {
  const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
  const { chromium } = createRequire(`${root}/`)('playwright')
  const browser = await chromium.launch({ headless: true })
  const out = resolve(process.env.BENCH_OUT ?? 'bench/shots-dossier-pieces')
  await mkdir(out, { recursive: true })
  const rows = (page) => page.locator('.adestia-folder-files .adestia-page-files__file')
  const open = async (page, folder) => {
    await page.goto(`${process.env.BENCH_URL}/#/section/pj/${folder}`)
    await page.waitForSelector('.adestia-home')
    await page.waitForTimeout(800)
  }
  try {
    for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme })
      await context.addInitScript((value) => localStorage.setItem('adestia.theme', value), theme)
      const page = await context.newPage()
      await page.goto(`${process.env.BENCH_URL}/`)
      await page.waitForSelector('.adestia-shell')
      if (width === 390 && (await page.locator('.adestia-shell').getAttribute('data-screen')) !== 'canvas') {
        await page.locator('.adestia-chat__header').getByRole('button', { name: /^(Open apps|Ouvrir les apps)$/ }).click()
      }
      await open(page, 'complet')
      assert.equal(await rows(page).count(), 3, 'complet: three rows')
      const names = await rows(page).locator('.adestia-page-files__name').allTextContents()
      assert.ok(!names.includes('voyage.json') && !names.includes('.folder.md'), 'complet: no data file')
      assert.match(await page.locator('.adestia-folder-files h2').innerText(), /3/)
      await page.screenshot({ path: join(out, `E-3-${theme}-${width}.png`) })
      if (width === 1440 && theme === 'light') {
        const [popup] = await Promise.all([context.waitForEvent('page'), rows(page).first().click()])
        assert.match(popup.url(), /\/api\/files\//, 'a click opens the piece')
        await popup.close()
        // Folders holding a voyage.json belong to the voyages screen: the rule is the route's.
        const listed = async (folder) =>
          (await (await fetch(`${process.env.BENCH_URL}/api/files?folder=pj/${folder}`)).json()).files.map((f) => f.name)
        assert.deepEqual((await listed('mixte')).sort(), ['billet.pdf', 'photo-deux.png', 'photo-une.png'])
        assert.deepEqual(await listed('donnees'), [])
        await open(page, 'cache')
        assert.equal(await page.locator('.adestia-folder-files').count(), 0, 'cache: attachments false')
        await open(page, 'treize')
        assert.equal(await rows(page).count(), 12)
        await page.getByRole('button', { name: /Show all 13|Tout afficher \(13\)/ }).click()
        assert.equal(await rows(page).count(), 13)
        await page.route('**/api/files?folder=*', (route) => route.fulfill({ status: 500, body: '{}' }))
        await open(page, 'complet')
        assert.equal(await page.locator('.adestia-folder-files').count(), 0, 'failure: brick absent')
        assert.ok(await page.locator('.adestia-chead__title').isVisible(), 'failure: the rest of the view stays')
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }
  console.log(`dossier-pieces: captures in ${out}`)
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await scenario()
