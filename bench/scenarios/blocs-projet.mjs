/** B-29, E-31, E-35: progress, milestones and risks — each state drawn, and each inserted from the gallery.
 * Host: seed `etat-projet-blocs`, `BENCH_URL` set (see bench/README.md).
 */
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const seed = 'etat-projet-blocs'
const PAGES = ['vide', 'une', 'plusieurs', 'illisible']

export default async function scenario() {
  const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
  const { chromium } = createRequire(`${root}/`)('playwright')
  const browser = await chromium.launch({ headless: true })
  const out = resolve(process.env.BENCH_OUT ?? 'bench/shots-blocs-projet')
  await mkdir(out, { recursive: true })
  try {
    for (const [width, height] of [[1440, 1000], [390, 844]]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme })
      await context.addInitScript((value) => localStorage.setItem('adestia.theme', value), theme)
      const page = await context.newPage()
      for (const name of PAGES) {
        await page.goto(`${process.env.BENCH_URL}/#/page/etat/${name}/INDEX.md`)
        await page.waitForSelector('.adestia-shell')
        if (width < 820 && await page.locator('.adestia-shell').getAttribute('data-screen') !== 'canvas') {
          await page.locator('.adestia-chat__header').getByRole('button', { name: /^(Open apps|Ouvrir les apps)$/ }).click()
        }
        await page.waitForSelector('.adestia-state, .pm-empty, .adestia-figure, .adestia-meter', { timeout: 15_000 })
        await page.waitForTimeout(500)
        const amber = await page.evaluate(() => [...document.querySelectorAll('.adestia-state, .adestia-figure, .adestia-meter, .pm-risks, .pm-mile')].filter((n) => /amber|warning/.test(n.className)).length)
        console.log(`${width} ${theme} ${name}: amber=${amber}`)
        await page.screenshot({ path: join(out, `${width}-${theme}-${name}.png`), fullPage: true })
      }
      await context.close()
    }
    // Insertion from the gallery: the Project group, the form of milestones and risks, the settings of progress.
    for (const [name, opens] of [['Progress', 'text=/^(Look|Aspect)$/'], ['Milestones', '.adestia-blockform'], ['Risks', '.adestia-blockform']]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
      const page = await context.newPage()
      await page.goto(`${process.env.BENCH_URL}/#/page/etat/vide/INDEX.md`)
      await page.waitForSelector('.adestia-reader', { timeout: 15_000 })
      await page.getByRole('button', { name: /^(Edit|Modifier)$/ }).first().click()
      await page.waitForSelector('.ProseMirror', { timeout: 20_000 })
      await page.waitForTimeout(800)
      await page.getByRole('button', { name: /^(Add block|Ajouter un bloc)/ }).first().click()
      await page.waitForSelector('.adestia-blockgallery')
      await page.locator('.adestia-blockgallery__search').fill(name)
      const groups = await page.locator('.adestia-blockgallery section h3, .adestia-blockgallery section h2').allTextContents()
      await page.locator('.adestia-blockcard', { has: page.locator('.adestia-blockcard__name', { hasText: new RegExp(`^${name}$`) }) }).first().click()
      await page.waitForSelector(opens, { timeout: 5_000 })
      console.log(`insert ${name}: opened, groups=${JSON.stringify(groups)}`)
      await page.screenshot({ path: join(out, `insert-${name}.png`) })
      if (name === 'Milestones') {
        // The form's file against a Raw entry of the same line: the same bytes.
        const sheet = page.locator('.adestia-blockform')
        await sheet.getByRole('textbox').first().fill('Recette')
        await sheet.locator('input[type="date"]').fill('2026-12-01')
        await sheet.getByRole('checkbox').check()
        await page.getByRole('button', { name: /^Apply$/ }).click()
        await page.getByRole('button', { name: /^Done$/ }).click()
        await page.waitForTimeout(1500)
        const { markdown: text } = await (await fetch(`${process.env.BENCH_URL}/api/pages/etat/vide/INDEX.md`)).json()
        const written = [...text.matchAll(/:::milestones[^\n]*\n([\s\S]*?)\n:::/g)].at(-1)?.[1]
        console.log(`form wrote: ${JSON.stringify(written)} — raw line expected: "- Recette: 2026-12-01 — done"`)
      }
      await context.close()
    }
  } finally {
    await browser.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await scenario()
