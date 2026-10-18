/**
 * The block bar, E-5 and E-6 at 360 x 740, light, the default livery, en and fr.
 *   node bench/scenarios/pages-editor-narrow.mjs
 * Prints each picture's name and the width of whatever overflows (0 = nothing
 * scrolls sideways). BENCH_OUT names the directory.
 */
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const { chromium } = createRequire('/usr/lib/node_modules/')('playwright')
const out = resolve(process.env.BENCH_OUT ?? 'bench/shots-pages-narrow')
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
function launch(locale) {
  const child = spawn(process.execPath, ['bench/launch.mjs', '--engine', 'fake', '--seed', 'pages', '--locale', locale], { stdio: ['ignore', 'pipe', 'pipe'] })
  const url = new Promise((resolveUrl, reject) => {
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
      const match = /listening on (\S+)/.exec(output)
      if (match) resolveUrl(match[1])
    })
    child.once('exit', (code) => reject(new Error(`launch exited ${code}`)))
  })
  return { url, stop: () => new Promise((done) => { if (child.exitCode !== null) return done(); child.once('exit', done); child.kill('SIGTERM') }) }
}
try {
  for (const locale of ['en', 'fr']) {
    const instance = launch(locale)
    try {
      const url = await instance.url
      const context = await browser.newContext({ viewport: { width: 360, height: 740 }, colorScheme: 'light' })
      const page = await context.newPage()
      await page.addInitScript(() => localStorage.setItem('adestia.theme', 'light'))
      const shot = async (name) => {
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        await page.screenshot({ animations: 'disabled', path: resolve(out, `${locale}-${name}.png`) })
        console.log(`${locale}-${name} overflow=${wide}`)
      }
      const word = locale === 'fr' ? 'Modifier' : 'Edit'
      const openEditor = async (path) => {
        await page.goto(`${url}#/page/${path}`, { waitUntil: 'domcontentloaded' })
        await page.waitForSelector('.adestia-shell')
        if (await page.locator('.adestia-shell').getAttribute('data-screen') !== 'canvas') {
          await page.locator('.adestia-chat__header .adestia-ib').last().click()
        }
        await page.waitForSelector('.adestia-reader', { timeout: 15_000 })
        await page.getByRole('button', { name: word, exact: true }).first().click()
        await page.waitForSelector('.adestia-editor__surface .ProseMirror', { timeout: 20_000 })
        await page.waitForTimeout(800)
      }
      await openEditor('editeur/blocs')
      const block = page.locator('.adestia-edblock').first()
      await block.scrollIntoViewIfNeeded()
      await block.hover()
      await shot('block-bar')
      await block.locator('.adestia-edblock__gear').first().click()
      await page.waitForSelector('.adestia-blockset')
      await page.waitForTimeout(300)
      await shot('block-settings')
      await page.keyboard.press('Escape')
      await openEditor('proprietes/toutes')
      await page.locator('.adestia-editor__meta-gear').first().click()
      await page.waitForSelector('.adestia-blockset--page')
      await page.waitForTimeout(300)
      await shot('page-settings')
      await context.close()
    } finally { await instance.stop() }
  }
} finally { await browser.close() }
