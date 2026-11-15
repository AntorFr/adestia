/** B-30, E-3 (button), E-36: the sheet in each state, then the page it creates.
 * Host: seed `etat-projet-feuille`, `BENCH_URL` set (see bench/README.md).
 */
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const seed = 'etat-projet-feuille'

export default async function scenario() {
  const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
  const { chromium } = createRequire(`${root}/`)('playwright')
  const browser = await chromium.launch({ headless: true })
  const out = resolve(process.env.BENCH_OUT ?? 'bench/shots-nouveau-modele')
  await mkdir(out, { recursive: true })
  try {
    for (const [width, height, kind] of [[1440, 900, 'desk'], [390, 844, 'phone']]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme })
      await context.addInitScript((value) => localStorage.setItem('adestia.theme', value), theme)
      const page = await context.newPage()
      const shot = (name) => page.screenshot({ path: join(out, `${kind}-${theme}-${name}.png`) })
      const toCanvas = async () => {
        if (width < 820 && await page.locator('.adestia-shell').getAttribute('data-screen') !== 'canvas') {
          await page.locator('.adestia-chat__header').getByRole('button', { name: /^(Open apps|Ouvrir les apps)$/ }).click()
        }
      }
      // A writable folder: the button is there.
      await page.goto(`${process.env.BENCH_URL}/#/section/etat/plusieurs`)
      await page.waitForSelector('.adestia-shell')
      await toCanvas()
      await page.getByRole('button', { name: 'New from template' }).waitFor({ timeout: 15_000 })
      await shot('1-bouton')
      await page.getByRole('button', { name: 'New from template' }).click()
      const sheet = page.getByRole('dialog')
      await sheet.getByRole('radio').first().waitFor()
      console.log(`${kind} ${theme}: ${await sheet.getByRole('radio').count()} cards, first checked=${await sheet.getByRole('radio').first().getAttribute('aria-checked')}, title focused=${await page.evaluate(() => document.activeElement?.className)}`)
      await shot('2-pret')
      await sheet.getByRole('radio').nth(1).click()
      await shot('3-carte-choisie')
      await sheet.getByRole('textbox').fill('!!!')
      await shot('4-titre-sans-lettre')
      await sheet.getByRole('textbox').fill('Sous 1')
      await sheet.getByRole('button', { name: 'Create' }).click()
      await sheet.getByRole('alert').or(sheet.locator('.adestia-field__error')).first().waitFor()
      await shot('5-nom-pris')
      // Refused write: the server answers 500 once.
      await sheet.getByRole('textbox').fill(`Chantier ${kind} ${theme}`)
      await page.route(`**/api/pages/etat/plusieurs/chantier-${kind}-${theme}.md`, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' }), { times: 1 })
      await sheet.getByRole('button', { name: 'Create' }).click()
      await sheet.getByRole('alert').waitFor()
      await shot('6-ecriture-refusee')
      await sheet.getByRole('button', { name: 'Create' }).click()
      await page.waitForURL(new RegExp(`#/page/etat/plusieurs/chantier-${kind}-${theme}`), { timeout: 10_000 })
      await page.waitForTimeout(800)
      await shot('7-page-creee')
      // Stale index: the page exists on disk, the index does not know yet — the 409 says it.
      await context.close()
    }
  } finally {
    await browser.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await scenario()
