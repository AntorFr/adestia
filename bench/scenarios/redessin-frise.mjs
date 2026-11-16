/** E-31: timeline bars and list, subproject on the charter card; light/dark, desk/phone.
 * Host: seed `etat-projet-redessin`, `BENCH_URL` set (see bench/README.md).
 */
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const seed = 'etat-projet-redessin'

export default async function scenario() {
  const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
  const { chromium } = createRequire(`${root}/`)('playwright')
  const browser = await chromium.launch({ headless: true })
  const out = resolve(process.env.BENCH_OUT ?? 'bench/shots-redessin')
  await mkdir(out, { recursive: true })
  try {
    for (const [width, height] of [[1440, 1000], [390, 844]]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme })
      await context.addInitScript((value) => localStorage.setItem('adestia.theme', value), theme)
      const page = await context.newPage()
      for (const name of ['barres', 'liste']) {
        await page.goto(`${process.env.BENCH_URL}/#/page/redessin/${name}/INDEX.md`)
        await page.waitForSelector('.adestia-shell')
        if (width < 820 && await page.locator('.adestia-shell').getAttribute('data-screen') !== 'canvas') {
          await page.locator('.adestia-chat__header').getByRole('button', { name: /^(Open apps|Ouvrir les apps)$/ }).click()
        }
        await page.waitForSelector(name === 'liste' || width < 640 ? '.pm-timeline__row' : '.pm-timeline__span', { timeout: 15_000 })
        await page.waitForTimeout(500)
        const amber = await page.evaluate(() => [...document.querySelectorAll('.pm-timeline *')].filter((n) => /warning/.test(n.className)).length)
        console.log(`${width} ${theme} ${name}: amber-in-timeline=${amber}`)
        await page.screenshot({ path: join(out, `${width}-${theme}-${name}.png`), fullPage: true })
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await scenario()
