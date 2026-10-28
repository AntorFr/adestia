/** Host proof of AD-25. Replays the original E-6 scenario unchanged first.
 * node bench/scenarios/chat-matrix.mjs bench/scenarios/pages-proof.mjs --out bench/shots-pages-proof
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import settings from './pages-reglages.mjs'

export const seed = 'pages-proof'
export default async function scenario() {
  await settings()
  const { chromium } = createRequire(`${execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()}/`)('playwright')
  const browser = await chromium.launch()
  const url = process.env.BENCH_URL
  const locale = process.env.BENCH_LOCALE ?? 'en'
  const out = resolve(process.env.BENCH_OUT ?? 'bench/shots-pages-proof')
  await mkdir(out, { recursive: true })
  const report = []
  try {
    for (const width of [1440, 360]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme })
      try {
        await context.addInitScript((value) => localStorage.setItem('adestia.theme', value), theme)
        const page = await context.newPage()
        const open = async (route, selector) => {
          await page.goto(`${url}/#${route}`)
          await page.locator('.adestia-shell').waitFor()
          if (width === 360 && await page.locator('.adestia-shell').getAttribute('data-screen') !== 'canvas') {
            await page.locator('.adestia-chat__header').getByRole('button', { name: /^(Open apps|Ouvrir les apps)$/ }).click()
          }
          await page.locator(selector).first().waitFor()
        }
        const shot = async (screen, observation, sourceLine) => {
          const name = `${screen}-${theme}-${width}`
          await page.screenshot({ path: join(out, `${name}.png`), animations: 'disabled' })
          report.push({ name, source: `docs/ecrans.md:${sourceLine}`, observation })
        }
        await open('/page/notes', '.adestia-reader')
        const crumbs = await page.locator('.adestia-crumbs').innerText()
        assert.equal(crumbs.replace(/\s+/g, ' ').trim(), `${locale === 'fr' ? 'Accueil' : 'Home'} / Root proof`)
        assert.equal(await page.locator('.adestia-crumbs a[href*="section"]').count(), 0)
        await shot('E-4-root', `Root proof has no folder crumb: ${crumbs}`, 50)

        await open('/page/missing-root-proof', '.adestia-missing')
        const home = page.locator('.adestia-missing a[href="#/"]')
        assert.equal(await home.innerText(), locale === 'fr' ? 'Accueil' : 'Home')
        await shot('E-8-root', 'Missing root page offers Home.', 781)
        await home.click()
        await page.waitForFunction(() => location.hash === '#/')

        await open('/page/proof/readonly', '.adestia-editor__raw')
        const diagnostics = await page.locator('.adestia-diagnostics').innerText()
        assert.match(diagnostics, locale === 'fr' ? /Bloc inconnu « :::unknown-proof »/ : /Unknown block ":::unknown-proof"/)
        assert.equal(await page.locator('.adestia-editor__raw').innerText().then((s) => s.includes('Author content stays intact.')), true)
        if (locale === 'fr') assert.doesNotMatch(diagnostics, /Unknown block|The vocabulary is closed/)
        await shot('E-4-readonly', diagnostics, 753)

        const index = await (await page.request.get(`${url}/api/pages/index`)).json()
        const indexed = index.entries.find((entry) => entry.path === 'proof/crlf.md')
        assert(indexed, 'CRLF page is indexed')
        for (const [key, value] of Object.entries({ status: 'active', role: 'proof', cat: 'bench' })) assert.equal(indexed.fields[key], value)
        const document = await (await page.request.get(`${url}/api/pages/proof/crlf.md`)).json()
        assert.match(document.markdown, /\r\n---  \r\n/)
        assert.deepEqual(document.fields, indexed.fields)
        await open('/page/proof/crlf', '.adestia-reader')
        assert.match(await page.locator('main').innerText(), /CRLF proof/)
        await page.getByRole('button', { name: locale === 'fr' ? 'Modifier' : 'Edit', exact: true }).first().click()
        await page.locator('.ProseMirror').first().waitFor()
        await page.locator('.adestia-editor__meta-gear').click()
        await page.locator('.adestia-popover').waitFor()
        for (const value of ['active', 'proof', 'bench']) assert(await page.locator(`.adestia-popover input, .adestia-popover select, .adestia-popover textarea`).evaluateAll((nodes, v) => nodes.some((node) => node.value === v), value), `Editor field ${value}`)
        await shot('E-4-crlf', 'CRLF page and E-5 expose status=active, role=proof, cat=bench; API fields equal the index.', 773)
        await page.keyboard.press('Escape')

        await open('/section/proof', '.adestia-section')
        assert.match(await page.locator('main').innerText(), /CRLF proof/)
        assert.match(await page.locator('main').innerText(), /active/)
        await shot('E-3-crlf', 'CRLF title and active facet appear in the section.', 773)

        await open('/planif', '.planif__note')
        const notes = await (await page.request.get(`${url}/api/plugin/planif/notes`)).json()
        const note = notes.notes.find((entry) => entry.id === 'crlf-proof')
        await shot('E-23-crlf', `CRLF scheduled note: ${JSON.stringify(note)}`, 773)
        assert.equal(note?.title, 'CRLF scheduled proof')
        assert.equal(note.at, '07:30, 12:30')
        assert.equal(note.expired, '2026-10-01')
        assert.equal(note.enabled, false)
        assert.equal(note.problem, null)
        assert.equal(note.body, 'Read the CRLF proof page.')
      } finally { await context.close() }
    }
  } finally {
    await writeFile(join(out, 'pages-report.json'), JSON.stringify(report, null, 2) + '\n')
    await browser.close()
  }
  console.log(`pages-proof: ${report.length} captures and all page checks passed (${locale})`)
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await scenario()
