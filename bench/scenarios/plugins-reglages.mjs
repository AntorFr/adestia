/**
 * The Plugins page (E-37), start to finish, against a REAL restart.
 *
 *   npm run build && node bench/scenarios/plugins-reglages.mjs
 *
 * One instance of `node bench/launch.mjs --engine fake --restart --seed plugins-reglages`
 * (the plain binary's boot loop, no token: `/api/restart` really restarts it, no
 * stand-in). No docker: the bench's host path, and the report says so.
 *
 *  1. the four pictures of the page with its three groups — light/dark × desk/phone —
 *     each checked for console errors;
 *  2. the owner turns the inactive app on and the active one off: both rows carry their
 *     "after restart" mark, the restart bar shows; he turns one back, its mark goes;
 *  3. the real restart (button, "Coming back…", the instance answers again);
 *  4. the tile and the route of the app turned on exist, those of the one turned off do
 *     not, and the page shows the rows in their new groups, no mark, no bar.
 *
 * Pictures: `BENCH_OUT` (default `bench/shots-plugins-reglages`, ignored by git),
 * `<theme>-<desk|phone>.png` for the four, `flip-*.png` and `after-restart.png`. Exit 1
 * names each failed expectation.
 */
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPlaywright } from '../lib/playwright.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const out = resolve(process.env.BENCH_OUT ?? join(root, 'bench/shots-plugins-reglages'))
const { chromium } = loadPlaywright()

const failures = []
const check = (ok, what) => {
  if (!ok) {
    console.error(`FAIL ${what}`)
    failures.push(what)
  }
}

async function launch(flags) {
  const port = await new Promise((done, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port: free } = probe.address()
      probe.close(() => done(free))
    })
  })
  const child = spawn(
    process.execPath,
    [join(root, 'bench/launch.mjs'), '--engine', 'fake', ...flags, '--seed', 'plugins-reglages', '--locale', 'en', '--port', String(port)],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  )
  const url = await new Promise((done, reject) => {
    let seen = ''
    child.stdout.on('data', (chunk) => {
      seen += chunk
      const found = /listening on (\S+)/.exec(seen)
      if (found) done(found[1])
    })
    child.once('exit', (code) => reject(new Error(`the launcher exited (${code})`)))
  })
  return { url, child }
}
// The pictures come from the scripted engine (no console error to hide); the restart is the plain binary's loop.
const shown = await launch([])
const looped = await launch(['--restart'])
let base = shown.url

await mkdir(out, { recursive: true })
const browser = await chromium.launch({ args: ['--no-sandbox'] })
const SIZES = {
  desk: { viewport: { width: 1280, height: 1500 } },
  phone: { viewport: { width: 390, height: 2400 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
}

let consoleErrors = []
async function open(theme, size, hash = '/settings/plugins') {
  const context = await browser.newContext({ ...SIZES[size], colorScheme: theme, locale: 'en-US' })
  await context.addInitScript((name) => {
    try { localStorage.setItem('adestia.theme', name) } catch { /* storage refused */ }
  }, theme)
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`${theme} ${size}: ${message.text()} ${message.location().url}`)
  })
  await page.goto(`${base}/#${hash}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.adestia-chat', { timeout: 20_000 })
  if (size === 'phone') {
    await page.locator('.adestia-chat__header').getByRole('button', { name: /^Open apps$/ }).click()
    await page.waitForSelector('.adestia-shell[data-screen="canvas"]')
  }
  await page.waitForSelector('.adestia-plugin', { timeout: 10_000 })
  return page
}
const shoot = async (page, name) => {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true })
  console.log('shot', name)
}
const row = (page, id) => page.locator(`.adestia-plugin[data-plugin="${id}"]`)
const groupOf = (page, id) =>
  page.locator('section.adestia-config__group', { has: page.locator(`[data-plugin="${id}"]`) }).getAttribute('aria-label')

try {
  // 1. The four pictures.
  for (const theme of ['light', 'dark']) {
    for (const size of ['desk', 'phone']) {
      const page = await open(theme, size)
      check((await page.locator('section.adestia-config__group').count()) === 3, `${theme} ${size}: three groups`)
      check((await groupOf(page, 'bench-actif')) === 'Active', `${theme} ${size}: bench-actif is Active`)
      check((await groupOf(page, 'bench-inactif')) === 'Found, not active', `${theme} ${size}: bench-inactif is not active`)
      check((await groupOf(page, 'bench-refused')) === 'Refused', `${theme} ${size}: bench-refused is Refused`)
      check((await row(page, 'bench-refused').locator('[role=switch]').count()) === 0, `${theme} ${size}: a refused row has no switch`)
      await shoot(page, `${theme}-${size}`)
      await page.context().close()
    }
  }

  check(consoleErrors.length === 0, `console errors on the four pictures: ${consoleErrors.join(' | ')}`)
  consoleErrors = []
  base = looped.url

  // 2. Flip both, flip one back.
  const page = await open('light', 'desk')
  await row(page, 'bench-inactif').locator('[role=switch]').click()
  await page.waitForSelector('.adestia-plugin[data-plugin="bench-inactif"] .adestia-plugin__pending')
  await row(page, 'bench-actif').locator('[role=switch]').click()
  await page.waitForSelector('.adestia-plugin[data-plugin="bench-actif"] .adestia-plugin__pending')
  check(/Active after restart/.test(await row(page, 'bench-inactif').innerText()), 'the turned-on row says Active after restart')
  check(/Off after restart/.test(await row(page, 'bench-actif').innerText()), 'the turned-off row says Off after restart')
  check((await page.locator('.adestia-config__restart-bar').count()) === 1, 'the restart bar shows')
  await shoot(page, 'flip-both')
  await row(page, 'bench-actif').locator('[role=switch]').click()
  await page.waitForFunction(() => !document.querySelector('.adestia-plugin[data-plugin="bench-actif"] .adestia-plugin__pending'))
  check(true, 'turning it back removes its mark')
  await row(page, 'bench-actif').locator('[role=switch]').click()
  await page.waitForSelector('.adestia-plugin[data-plugin="bench-actif"] .adestia-plugin__pending')

  // 3. The real restart.
  // The seed keeps a turn running: the bar refuses with its count, then forces.
  await page.locator('.adestia-config__restart-bar .adestia-btn').click()
  await page.waitForSelector('.adestia-config__restart-bar [role=alert]')
  check(/1 turn/.test(await page.locator('.adestia-config__restart-bar').innerText()), 'the restart is refused with the running count')
  await shoot(page, 'restart-blocked')
  await page.locator('.adestia-config__restart-bar .adestia-btn').click()
  await page.waitForSelector('.adestia-plugin[data-plugin="bench-inactif"]')
  await page.waitForFunction(() => !document.querySelector('.adestia-config__restart-bar'), undefined, { timeout: 30_000 }).catch(async (error) => { await shoot(page, 'restart-stuck'); console.error(await page.locator('.adestia-config__restart-bar').innerText()); throw error })

  // 4. After it.
  check((await groupOf(page, 'bench-inactif')) === 'Active', 'after the restart bench-inactif is Active')
  check((await groupOf(page, 'bench-actif')) === 'Found, not active', 'after the restart bench-actif is not active')
  check((await page.locator('.adestia-plugin__pending').count()) === 0, 'no mark after the restart')
  await shoot(page, 'after-restart')
  const instance = await (await fetch(`${base}/api/instance`)).json()
  const ids = JSON.stringify(instance)
  check(ids.includes('bench-inactif') && !ids.includes('"bench-actif"'), 'the instance now loads the app turned on, not the one turned off')
  const home = await open('light', 'desk', '/')
  .catch(async () => {
    const fresh = await browser.newContext({ ...SIZES.desk, locale: 'en-US' })
    const opened = await fresh.newPage()
    await opened.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
    await opened.waitForSelector('.adestia-chat')
    return opened
  })
  await home.waitForTimeout(1000)
  await home.goto(`${base}/#/bench-inactif`)
  await home.waitForSelector('h1:has-text("Inactif")', { timeout: 10_000 }).catch(() => check(false, 'the route of the app turned on exists'))
  await home.goto(`${base}/#/`)
  const tiles = await home.locator('.adestia-tile, .adestia-tiles li').allInnerTexts()
  check(tiles.some((text) => /Inactif/.test(text)), 'the tile of the app turned on exists')
  check(!tiles.some((text) => /Actif/.test(text.replace(/Inactif/g, ''))), 'the tile of the app turned off is gone')
} finally {
  await browser.close()
  shown.child.kill('SIGTERM')
  looped.child.kill('SIGTERM')
}
if (failures.length > 0) {
  console.error(`${failures.length} failed expectation(s)`)
  process.exit(1)
}
console.log('ok')
