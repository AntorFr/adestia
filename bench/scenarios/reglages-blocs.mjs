/** E-6: the settings of a `figures` block — Look, Content, Layout, Title and icon — desk and phone, light and dark, en and fr.
 * Host: seed `saisie`, `BENCH_URL` set (see bench/README.md).
 */
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const seed = 'saisie'
export default async function scenario() {
  const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
  const { chromium } = createRequire(`${root}/`)('playwright')
  const browser = await chromium.launch({ headless: true })
  const out = resolve(process.env.BENCH_OUT ?? 'bench/shots-reglages')
  await mkdir(out, { recursive: true })
  try {
    for (const [width, height] of [[1440, 900], [390, 844]]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme })
      await context.addInitScript((value) => localStorage.setItem('adestia.theme', value), theme)
      const page = await context.newPage()
      await page.goto(`${process.env.BENCH_URL}/#/page/saisie/figures`)
      await page.waitForSelector('.adestia-shell')
      if (width < 820 && await page.locator('.adestia-shell').getAttribute('data-screen') !== 'canvas') {
        await page.locator('.adestia-chat__header').getByRole('button', { name: /^(Open apps|Ouvrir les apps)$/ }).click()
      }
      await page.locator('.adestia-editor__actions .adestia-btn').first().click()
      await page.waitForSelector('.ProseMirror')
      const block = page.locator('.adestia-edblock[data-block="figures"]').first()
      await block.hover()
      await block.locator('.adestia-edblock__gear').click({ force: true })
      await page.waitForSelector('.adestia-blockset')
      const shot = (name) => page.screenshot({ path: join(out, `${width}-${theme}-${name}.png`) })
      await shot('1-open')
      await page.getByRole('radio', { name: /^(inline|en ligne)$/i }).click()
      await shot('2-inline')
      if (!(await block.locator('.adestia-figures--inline').count())) throw new Error('the inline variant did not draw')
      await page.keyboard.press('Control+z')
      await page.waitForTimeout(300)
      if (await block.locator('.adestia-figures--inline').count()) throw new Error('Ctrl+Z from the window did not undo the variant')
      await shot('2b-undone')
      await page.getByRole('radio', { name: '½' }).focus()
      await page.keyboard.press('ArrowRight')
      await shot('3-width')
      await context.close()
    }
  } finally {
    await browser.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await scenario()
