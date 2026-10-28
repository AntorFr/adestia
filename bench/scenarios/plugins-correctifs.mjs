/** AD-24 complete proof, host Chromium / fake engine (no Claude credential).
 * npm run build
 * node bench/scenarios/chat-matrix.mjs bench/scenarios/plugins-correctifs.mjs --out bench/shots-plugins-correctifs
 * Existing words/marks scenarios run unchanged in their own output folders.
 * This adds the two message sheets, full walking map, scanner focus, dates,
 * Amber versus inferred delay, E-29, and a plugin → agent → stored reply turn.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import words from './plugins-mots.mjs'
import marks from './plugins-marques.mjs'
import { CONVERSATIONS } from '../seed/_base.mjs'

export const seed = 'plugins-correctifs'

export default async function scenario() {
  const base = process.env.BENCH_URL
  assert(base, 'Run through chat-matrix.mjs or supply BENCH_URL')
  const locale = process.env.BENCH_LOCALE ?? 'en'
  const out = resolve(process.env.BENCH_OUT ?? 'bench/shots-plugins-correctifs')
  await mkdir(out, { recursive: true })
  for (const [name, run] of [['words', words], ['marks', marks]]) {
    const previous = process.env.BENCH_OUT
    try {
      process.env.BENCH_OUT = join(out, name)
      await run()
    } finally {
      if (previous === undefined) delete process.env.BENCH_OUT
      else process.env.BENCH_OUT = previous
    }
  }
  const { chromium } = createRequire('/usr/lib/node_modules/')('playwright')
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
  const report = { engine: 'fake', realClaude: false, reason: 'Scripted bench; no Claude credential required', locale, variants: [] }
  try {
    for (const theme of ['light', 'dark']) for (const phone of [false, true]) {
      const context = await browser.newContext({
        viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
        colorScheme: theme, locale: locale === 'fr' ? 'fr-FR' : 'en-US',
        hasTouch: phone, isMobile: phone, permissions: ['camera'],
      })
      const observations = { theme, phone, shots: [] }
      try {
        const page = await context.newPage()
        page.setDefaultTimeout(15_000)
        await page.addInitScript((value) => localStorage.setItem('adestia.theme', value), theme)
        const open = async (route, proof, canvas = true) => {
          await page.goto(`${base}/#${route}`, { waitUntil: 'domcontentloaded' })
          await page.locator('.adestia-shell').waitFor()
          if (phone && canvas && await page.locator('.adestia-shell').getAttribute('data-screen') !== 'canvas') {
            await page.locator('.adestia-chat__header').getByRole('button', { name: /^(Open apps|Ouvrir les apps)$/ }).click()
          }
          await page.locator(proof).first().waitFor()
          await page.evaluate(() => document.fonts.ready)
        }
        const shot = async (name) => {
          assert.equal(await page.locator('.adestia-gate__card--fatal, .adestia-gate__card--loading').count(), 0)
          const file = `${theme}-${phone ? 'phone' : 'desk'}-${name}.png`
          await page.screenshot({ path: join(out, file), animations: 'disabled' })
          observations.shots.push(file)
        }

        await open('/atelier/caisson', '#wbedit')
        await page.locator('#wbedit').click()
        const reset = page.locator('#wbreset')
        await reset.click()
        const atelier = page.locator('.atelier-sheet [role=dialog]')
        await atelier.waitFor()
        const cancel = atelier.getByRole('button', { name: locale === 'fr' ? 'Annuler' : 'Cancel', exact: true })
        assert(await cancel.evaluate((node) => node === document.activeElement))
        observations.resetQuestion = await atelier.innerText()
        assert(observations.resetQuestion.includes(locale === 'fr' ? 'Abandonner votre mise en plan' : 'Drop your layout'))
        await shot('E-25-reset-sheet')
        await page.keyboard.press('Escape')
        await atelier.waitFor({ state: 'hidden' })
        assert(await reset.evaluate((node) => node === document.activeElement))

        await open('/voyages/corse', '.vday')
        // Only the failure response is scripted: the actual gesture, sheet and repaint run.
        await page.route('**/api/plugin/voyages/state', async (route) => {
          if (route.request().method() !== 'POST') return route.continue()
          await route.fulfill({ status: 409, json: { error: 'Bench: gesture refused by the server' } })
        })
        const dismiss = page.locator('[data-dis]').first()
        await dismiss.focus()
        const cardId = await dismiss.getAttribute('data-dis')
        await dismiss.click()
        const voyage = page.locator('.voyages-sheet[role=dialog]')
        await voyage.waitFor()
        assert((await voyage.innerText()).includes(locale === 'fr' ? 'Geste refusé' : 'Gesture refused'))
        assert((await voyage.innerText()).includes('Bench: gesture refused by the server'))
        assert(await dismiss.evaluate((node) => node.isConnected), 'board not repainted before closing')
        await shot('E-26-refusal-sheet')
        await page.keyboard.press('Escape')
        await voyage.waitFor({ state: 'hidden' })
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-vi')), cardId)

        await open('/listening-post/moteur-audio', '.lp-lines li')
        await shot('E-27-transcript')
        await open('/parcours/balades/assets/val-sans-retour.parcours.json', '.parcours.pc-ready .pc-map')
        const measure = () => page.locator('.pc-map').evaluate((node) => ({
          width: node.clientWidth, height: node.clientHeight,
          viewBox: node.querySelector('svg').getAttribute('viewBox').split(' ').map(Number),
        }))
        observations.mapBefore = await measure()
        await shot('E-28-before-walk')
        await page.getByRole('button', { name: locale === 'fr' ? 'Mode balade' : 'Walking mode', exact: true }).click()
        await page.locator('.pc-balade .pc-hud').waitFor()
        await page.waitForFunction(() => {
          const box = document.querySelector('.pc-map')
          return Number(box.querySelector('svg').getAttribute('height')) === box.clientHeight
        })
        observations.mapWalking = await measure()
        assert.deepEqual(observations.mapWalking.viewBox, [0, 0, observations.mapWalking.width, observations.mapWalking.height])
        assert(observations.mapWalking.height > 420)
        await shot('E-28-walking-full')
        await page.keyboard.press('Escape')

        await open('/page/sante/septembre', '.meals-card')
        await shot('E-29-meals')
        await open('/page/renovation/INDEX', '.pm-timeline__chart')
        const amber = page.locator('.pm-timeline__span--amber').first()
        const late = page.locator('.pm-timeline__mile--late').first()
        await amber.waitFor()
        await late.waitFor()
        observations.amber = await amber.evaluate((node) => ({ background: getComputedStyle(node).backgroundColor, border: getComputedStyle(node).borderStyle }))
        observations.late = await late.evaluate((node) => ({ title: node.getAttribute('title'), border: getComputedStyle(node).borderLeftStyle, outline: getComputedStyle(node).outlineStyle }))
        assert.equal(observations.late.border, 'dashed')
        await shot('E-31-amber-and-delay')

        await open('/page/proof/plugin-date', '.adestia-head__by')
        observations.dates = await page.locator('.adestia-head__by').allTextContents()
        assert(observations.dates.includes(`Bench · ${locale === 'fr' ? '4 mars 2026' : 'March 4, 2026'}`))
        assert(observations.dates.includes('bientôt'))
        await shot('content-local-date')

        await page.evaluate((tabs) => localStorage.setItem('adestia.tabs', tabs), JSON.stringify({ open: [CONVERSATIONS.idle], active: CONVERSATIONS.idle }))
        await page.goto(`${base}/#/`, { waitUntil: 'domcontentloaded' })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.locator('.adestia-composer__input').waitFor()
        let opener
        if (phone) {
          await page.locator('.adestia-fold > .adestia-composer__attach').click()
          await page.locator('.adestia-fold__item', { hasText: /scan/i }).click()
          assert.equal(await page.locator('.adestia-fold__item').count(), 0)
        } else {
          opener = page.locator('.adestia-composer__attach[aria-label*="can" i]').first()
          await opener.focus()
          await opener.click()
        }
        await page.locator('.scan-overlay').waitFor()
        await shot('E-30-reader')
        await page.locator('.scan-cancel').click()
        await page.locator('.scan-overlay').waitFor({ state: 'detached' })
        observations.scannerFocus = await page.evaluate(() => document.activeElement?.className)
        if (phone) assert(await page.locator('.adestia-composer__input').evaluate((node) => node === document.activeElement))
        else assert(await opener.evaluate((node) => node === document.activeElement))
        await shot('E-30-focus-returned')

        await open('/planif', '.planif__ask')
        const sent = page.waitForRequest((request) => new URL(request.url()).pathname === '/api/turn' && request.method() === 'POST')
        await page.locator('.planif__note .planif__ask').first().click()
        const request = await sent
        observations.nominalPrompt = request.postDataJSON().prompt
        assert.match(observations.nominalPrompt, /^(Suspends|Réactive) la tâche planifiée/)
        const reply = page.locator('.adestia-bubble--agent', { hasText: observations.nominalPrompt })
        await reply.waitFor()
        await page.locator('.adestia-composer__send').waitFor()
        await page.reload({ waitUntil: 'domcontentloaded' })
        await reply.waitFor()
        await shot('E-23-nominal-stored-fake')
        observations.nominal = 'Planif ask → real HTTP turn → scripted echo → retained after reload; no real Claude call'
        report.variants.push(observations)
      } finally { await context.close() }
    }
  } finally {
    await browser.close()
    await writeFile(join(out, 'correctifs-report.json'), JSON.stringify(report, null, 2) + '\n')
  }
  console.log(`plugins-correctifs: ${locale}, four theme/width variants passed`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await scenario()
