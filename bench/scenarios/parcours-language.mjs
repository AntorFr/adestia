/** E-28: the real map and walking HUD, with a deterministic GPS, in both locales.
 * Run after npm run build: node bench/scenarios/parcours-language.mjs
 * Captures live under bench/shots-parcours/; no external tile is needed for assertions.
 */
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const { chromium } = createRequire('/usr/lib/node_modules/')('playwright')
const out = resolve(process.env.BENCH_OUT ?? 'bench/shots-parcours')
await mkdir(out, { recursive: true })
const original = execFileSync('git', ['show', '65074f4^:plugins/parcours/web/carte.js'], { encoding: 'utf8' })
const browser = await chromium.launch({ headless: true })

function launch(locale) {
  const child = spawn(process.execPath, ['bench/launch.mjs', '--engine', 'fake', '--seed', 'plugins', '--locale', locale], { stdio: ['ignore', 'pipe', 'inherit'] })
  const url = new Promise((done, reject) => {
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
      const found = /listening on (\S+)/.exec(output)
      if (found) done(found[1])
    })
    child.once('exit', (code) => reject(new Error(`launcher exited: ${code}`)))
  })
  return { url, stop: () => new Promise((done) => { child.once('exit', done); child.kill('SIGTERM') }) }
}

async function visit(base, locale, theme, size, legacy = false) {
  const context = await browser.newContext({ viewport: size === 'desk' ? { width: 1440, height: 900 } : { width: 390, height: 844 }, colorScheme: theme })
  const page = await context.newPage()
  try {
    await page.addInitScript((theme) => {
      localStorage.setItem('adestia.theme', theme)
      Object.defineProperty(navigator, 'geolocation', { value: {
        watchPosition(success) {
          queueMicrotask(() => success({ coords: { latitude: 48.005, longitude: -2.25, accuracy: 12, heading: null } }))
          return 1
        },
        clearWatch() {},
      } })
    }, theme)
    if (legacy) await page.route('**/parcours/web/carte.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: original }))
    await page.goto(`${base}/#/parcours/balades/assets/val-sans-retour.parcours.json`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.adestia-chat')
    if (size === 'phone' && await page.locator('.adestia-shell').getAttribute('data-screen') !== 'canvas') {
      await page.locator('.adestia-chat__header .adestia-ib', { hasText: '▥' }).click()
    }
    await page.waitForSelector('.parcours.pc-ready .pc-map')
    const words = () => page.locator('.parcours').evaluate((host) => {
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
      const text = []
      while (walker.nextNode()) text.push(walker.currentNode.textContent)
      const attributes = [...host.querySelectorAll('[title], [aria-label]')].map((node) => [node.title, node.getAttribute('aria-label')])
      return { text, attributes }
    })
    const map = await words()
    const interfaceText = await page.locator('.parcours').evaluate((host) => {
      const clone = host.cloneNode(true)
      clone.querySelectorAll('.pc-title, .pc-nom, .pc-desc, .pc-note').forEach((node) => node.remove())
      return clone.textContent
    })
    await page.waitForTimeout(700)
    if (!legacy) await page.screenshot({ path: join(out, `${locale}-${theme}-${size}-map.png`) })
    const walk = page.locator('.pc-bar button').last()
    await walk.click()
    await page.waitForSelector('.pc-balade .pc-hud')
    const hud = await page.locator('.pc-hud').innerText()
    if (!legacy) {
      const name = locale === 'fr' ? 'Quitter le mode balade' : 'Leave walking mode'
      const exit = page.getByRole('button', { name, exact: true })
      assert.equal(await exit.count(), 1)
      assert.equal(await exit.locator('use').getAttribute('href'), '#adestia-i-x')
      await page.waitForTimeout(700)
      await page.screenshot({ path: join(out, `${locale}-${theme}-${size}-hud.png`) })
      await page.keyboard.press('Escape')
      assert.equal(await page.locator('.pc-hud').count(), 0)
      assert.equal(await walk.evaluate((node) => document.activeElement === node), true)
      await walk.click()
      await page.getByRole('button', { name, exact: true }).click()
      assert.equal(await page.locator('.pc-hud').count(), 0)
      assert.equal(await walk.evaluate((node) => document.activeElement === node), true)
    }
    return { map, hud, interfaceText }
  } finally { await context.close() }
}

try {
  for (const locale of ['fr', 'en']) {
    const instance = launch(locale)
    try {
      const base = await instance.url
      const baseline = locale === 'fr' ? await visit(base, locale, 'light', 'desk', true) : null
      for (const theme of ['light', 'dark']) for (const size of ['desk', 'phone']) {
        const current = await visit(base, locale, theme, size)
        if (baseline) {
          assert.deepEqual(current.map, baseline.map, 'the French map keeps every word and accessible label')
          assert.equal(current.hud, baseline.hud.replace('✕', 'Quitter le mode balade'))
        } else {
          // The seed owns its titles, waypoint names and notes. The
          // English checks exclude those content nodes, never interface words.
          assert.doesNotMatch(current.hud, /[éèêàùçôîœ]/)
          assert.doesNotMatch(current.interfaceText, /[éèêàùçôîœ]/)
          for (const forbidden of ['repère', 'de marche', 'Trace calculée', 'Départ', 'Arrivée', 'Télécharger', 'Géoplateforme']) {
            assert.ok(!current.interfaceText.includes(forbidden), forbidden)
          }
        }
        console.log(`PASS E-28 ${locale} ${theme} ${size}: map, HUD, both exits and focus`)
      }
    } finally { await instance.stop() }
  }
} finally { await browser.close() }
