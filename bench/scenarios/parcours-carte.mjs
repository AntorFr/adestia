/** E-28 walking map: actual box size on entry and resize, page size on exit.
 * npm run build
 * node bench/scenarios/chat-matrix.mjs bench/scenarios/parcours-carte.mjs --out bench/shots-carte
 * The matrix supplies the plugins seed, skin, locale and output directory.
 * The engine is fake; map tiles come from the real provider. No GPS is needed.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const seed = 'plugins'
const { chromium } = createRequire('/usr/lib/node_modules/')('playwright')

export default async function capture() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const report = []
  try {
    for (const theme of ['light', 'dark']) for (const phone of [true, false]) {
      const viewport = phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }
      const context = await browser.newContext({ viewport, colorScheme: theme, hasTouch: phone, isMobile: phone })
      try {
        const page = await context.newPage()
        await page.addInitScript((value) => localStorage.setItem('adestia.theme', value), theme)
        await page.goto(`${process.env.BENCH_URL}/#/parcours/balades/assets/val-sans-retour.parcours.json`)
        await page.waitForSelector('.parcours.pc-ready .pc-map', { state: 'attached' })
        if (phone && await page.locator('.adestia-shell').getAttribute('data-screen') !== 'canvas') {
          await page.locator('.adestia-chat__header').getByRole('button', { name: /^(Open apps|Ouvrir les apps)$/ }).click()
        }
        await page.waitForSelector('.pc-map', { state: 'visible' })
        await page.evaluate(() => document.fonts.ready)
        const measure = () => page.locator('.pc-map').evaluate((box) => ({
          width: box.clientWidth, height: box.clientHeight,
          svg: box.querySelector('svg').getAttribute('viewBox').split(' ').map(Number),
        }))
        const pageSize = (size) => {
          assert.equal(size.svg[2], size.width)
          assert.equal(size.svg[3], Math.max(200, Math.min(Math.round(size.width * 0.62), 420)))
        }
        const walkingSize = (size) => assert.deepEqual(size.svg, [0, 0, size.width, size.height])
        const shot = async (state) => {
          // Redrawing replaces the images: wait for these tiles, not networkidle
          // (the shell keeps a live event stream). Record provider failures too.
          await page.waitForFunction(() => [...document.querySelectorAll('.pc-tiles img')].every((img) => img.complete), null, { timeout: 20000 })
          const missingTiles = await page.locator('.pc-tiles img').evaluateAll((images) => images.filter((img) => !img.naturalWidth).length)
          await page.screenshot({ path: resolve(process.env.BENCH_OUT, `${theme}-${phone ? 'phone' : 'desk'}-${state}.png`) })
          return missingTiles
        }
        const normal = await measure()
        pageSize(normal)
        await page.locator('.pc-bar button').last().click()
        await page.waitForSelector('.pc-balade .pc-hud')
        const walking = await measure()
        walkingSize(walking)
        const missingWalkTiles = await shot('walk')
        await page.setViewportSize({ width: viewport.height, height: viewport.width })
        await page.waitForFunction(() => {
          const box = document.querySelector('.pc-map')
          return Number(box.querySelector('svg').getAttribute('height')) === box.clientHeight
        })
        const rotated = await measure()
        walkingSize(rotated)
        const missingRotatedTiles = await shot('rotated')
        await page.keyboard.press('Escape')
        await page.waitForSelector('.pc-hud', { state: 'detached' })
        const exited = await measure()
        pageSize(exited)
        report.push({ theme, phone, normal, walking, rotated, exited, missingWalkTiles, missingRotatedTiles })
      } finally { await context.close() }
    }
    await writeFile(resolve(process.env.BENCH_OUT, 'dimensions.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
  } finally { await browser.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await capture()
