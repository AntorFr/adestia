/** B-30, P-20: New from template → "Project status" → a title → Create, then the page, filled by its forms.
 * Host: seed `etat-projet-gabarit`, `BENCH_URL` set (see bench/README.md).
 */
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const seed = 'etat-projet-gabarit'

export default async function scenario() {
  const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
  const { chromium } = createRequire(`${root}/`)('playwright')
  const browser = await chromium.launch({ headless: true })
  const out = resolve(process.env.BENCH_OUT ?? 'bench/shots-etat-projet-gabarit')
  await mkdir(out, { recursive: true })
  try {
    for (const [width, height, kind] of [[1440, 1000, 'desk'], [390, 844, 'phone']]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme })
      await context.addInitScript((value) => localStorage.setItem('adestia.theme', value), theme)
      const page = await context.newPage()
      const shot = (name) => page.screenshot({ path: join(out, `${kind}-${theme}-${name}.png`), fullPage: true })
      await page.goto(`${process.env.BENCH_URL}/#/section/projet`)
      await page.waitForSelector('.adestia-shell')
      if (width < 820 && await page.locator('.adestia-shell').getAttribute('data-screen') !== 'canvas') {
        await page.locator('.adestia-chat__header').getByRole('button', { name: /^(Open apps|Ouvrir les apps)$/ }).click()
      }
      await page.getByRole('button', { name: 'New from template' }).click()
      const sheet = page.getByRole('dialog')
      await sheet.getByRole('radio', { name: /Project status/ }).waitFor({ timeout: 15_000 })
      await shot('1-feuille')
      await sheet.getByRole('textbox').fill(`Etat ${kind} ${theme}`)
      await sheet.getByRole('button', { name: 'Create' }).click()
      await page.waitForURL(new RegExp(`#/page/projet/etat-${kind}-${theme}`), { timeout: 15_000 })
      await page.waitForTimeout(1000)
      await shot('2-page-creee')
      await context.close()
    }
  } finally {
    await browser.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await scenario()
