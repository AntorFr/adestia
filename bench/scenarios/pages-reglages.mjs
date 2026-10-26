/** E-5/E-6 geometry, before/after. Host: chat-matrix.mjs, seed base, fake engine.
 * BENCH_OBSERVE=1 records failures without stopping the four-skin baseline.
 * The chat model control is a native select, so only its DOM bounds can be measured.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const seed = 'base'
export default async function scenario() {
  const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
  const { chromium } = createRequire(`${root}/`)('playwright')
  const browser = await chromium.launch({ headless: true })
  const out = resolve(process.env.BENCH_OUT ?? 'bench/shots-reglages')
  await mkdir(out, { recursive: true })
  const report = []
  try {
    for (const width of [1440, 360]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme })
      await context.addInitScript((value) => localStorage.setItem('adestia.theme', value), theme)
      const page = await context.newPage()
      await page.goto(`${process.env.BENCH_URL}/#/page/pieces/dossier`)
      await page.waitForSelector('.adestia-shell')
      if (width === 360 && await page.locator('.adestia-shell').getAttribute('data-screen') !== 'canvas') {
        await page.locator('.adestia-chat__header').getByRole('button', { name: /^(Open apps|Ouvrir les apps)$/ }).click()
      }
      await page.locator('.adestia-editor__actions .adestia-btn').first().click()
      await page.waitForSelector('.ProseMirror')
      for (const [screen, anchor] of [['E-6', '.adestia-edblock__gear'], ['E-5', '.adestia-editor__meta-gear']]) {
        await page.locator('.adestia-canvas').evaluate((node) => { node.scrollTop = 0 })
        const gear = page.locator(anchor).first()
        if (screen === 'E-6') await page.locator('.adestia-edblock').first().hover()
        await gear.click({ force: true })
        await page.waitForSelector('.adestia-popover')
        for (const state of ['open', 'scroll', 'resize']) {
          if (state === 'scroll') {
            const y = await gear.evaluate((node) => node.getBoundingClientRect().top)
            await page.locator('.adestia-canvas').evaluate((node, delta) => { node.scrollTop += delta }, y - 20)
          }
          if (state === 'resize') await page.setViewportSize({ width, height: 560 })
          await page.waitForTimeout(100)
          const measure = await page.locator('.adestia-popover').evaluate((node) => {
            const rect = (element) => {
              const r = element.getBoundingClientRect()
              return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }
            }
            const panel = rect(node)
            const obstacles = [...document.querySelectorAll('.adestia-canvas__header, .adestia-console-host, .adestia-problems')]
              .map((element) => ({ name: element.className, ...rect(element) }))
              .filter((r) => r.height > 0 && r.bottom > 0 && r.top < innerHeight)
            const overlaps = obstacles.filter((r) => panel.left < r.right && panel.right > r.left && panel.top < r.bottom - 1 && panel.bottom > r.top + 1)
            return { panel, obstacles, overlaps, inside: panel.top >= 7 && panel.bottom <= innerHeight - 7 && panel.left >= 7 && panel.right <= innerWidth - 7 }
          })
          const name = `${screen}-${theme}-${width}-${state}`
          await page.screenshot({ path: join(out, `${name}.png`) })
          report.push({ name, ...measure, ok: measure.inside && measure.overlaps.length === 0 })
        }
        await page.keyboard.press('Escape')
        await page.setViewportSize({ width, height: 900 })
      }
      // The native menu belongs to Chromium, not the shared Popover.
      if (width === 360) await page.locator('.adestia-canvas__header button').first().click()
      const select = page.locator('select.adestia-model')
      await select.waitFor({ state: 'visible' })
      await select.click()
      await page.screenshot({ path: join(out, `model-${theme}-${width}.png`) })
      await page.keyboard.press('Escape')
      const box = await select.boundingBox()
      report.push({ name: `model-${theme}-${width}`, native: true, box, ok: box.x >= 0 && box.x + box.width <= width })
      await context.close()
    }
  } finally {
    await writeFile(join(out, 'geometry.json'), JSON.stringify(report, null, 2))
    await browser.close()
  }
  const failures = report.filter((row) => !row.ok)
  console.log(`pages-reglages: ${report.length - failures.length}/${report.length}; failures: ${failures.map((row) => row.name).join(', ')}`)
  if (process.env.BENCH_OBSERVE !== '1') assert.equal(failures.length, 0, 'See geometry.json and captures')
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await scenario()
