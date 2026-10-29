/**
 * Loading and failure of the shell's own screens, on each skin × language ×
 * theme × desk/phone — 4 × 2 × 2 × 2 variants.
 *
 *   npm run build && node bench/scenarios/chargements.mjs
 *
 * Starts its own instance per skin × language
 * (`node bench/launch.mjs --engine fake --seed base --skin <s> --locale <l>`),
 * and for each variant does, with `page.route` on the one read a screen waits for:
 *
 *  - SLOW: the read is held; the loading row must show, before the data (E-3,
 *    E-4 opened from the home, E-9, E-11, E-13). E-3 and E-9 must offer no
 *    button. The read is then released and the data must replace the row.
 *  - FAILED: the read answers 500; the message and Retry must show (E-4, E-11,
 *    E-13), Retry is clicked once the route lets the read through, and the
 *    data must come. E-8 has no loading of its own: a missing page (404) shows
 *    its message and no Retry; and a 500 on a page is E-4's failure above.
 *  - E-9, which has no failure of its own: a 500 on one of its reads leaves the
 *    tiles and no button.
 *
 * Pictures: `BENCH_OUT` (default `bench/shots-chargements`, ignored by git):
 *
 *   <skin>/<locale>/<theme>-<viewport>/<E-n>-<state>.png
 *
 * `BENCH_SKINS=alfred,dobby` and `BENCH_LOCALES=fr` narrow the run; `BENCH_URL`
 * (with `BENCH_SKIN`, `BENCH_LOCALE`) plays an instance already running. Exit 1
 * names each failed expectation. The pictures are for LOOKING at.
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const out = resolve(process.env.BENCH_OUT ?? join(root, 'bench/shots-chargements'))

function loadPlaywright() {
  const roots = ['/usr/lib/node_modules']
  try { roots.push(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()) } catch { /* fixed root only */ }
  for (const dir of roots) {
    for (const name of ['playwright-core', 'playwright']) {
      try { return createRequire(`${dir}/`)(name) } catch { /* not here */ }
    }
  }
  throw new Error('playwright not found in the environment')
}
const { chromium } = loadPlaywright()

const SKINS = (process.env.BENCH_SKINS ?? 'alfred,dobby,nestor,skippy').split(',')
const LOCALES = (process.env.BENCH_LOCALES ?? 'en,fr').split(',')
const THEMES = ['light', 'dark']
const SIZES = {
  desk: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
}
const WORDS = {
  en: { loading: /^Loading…$/, retry: /^Retry$/ },
  fr: { loading: /^Chargement…$/, retry: /^Réessayer$/ },
}

function launch(skin, locale) {
  const child = spawn(process.execPath, [join(root, 'bench/launch.mjs'), '--engine', 'fake', '--seed', 'base', '--skin', skin, '--locale', locale], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', (chunk) => (stderr += chunk))
  const url = new Promise((resolveUrl, reject) => {
    let seen = ''
    child.stdout.on('data', (chunk) => {
      seen += chunk
      const found = /listening on (\S+)/.exec(seen)
      if (found) resolveUrl(found[1])
    })
    child.once('exit', (code) => reject(new Error(`the launcher exited (${code}): ${stderr.trim().split('\n').slice(-3).join(' | ')}`)))
  })
  const stop = () => new Promise((done) => {
    if (child.exitCode !== null) return done()
    child.once('exit', done)
    child.kill('SIGTERM')
  })
  return { url, stop }
}

const failures = []
const fail = (where, why) => {
  console.error(`FAIL ${where}: ${why}`)
  failures.push(`${where}: ${why}`)
}

/**
 * One scenario of one read. `read` is a glob; `mode`:
 *   'slow'  held until `release()`;  'broken'  answers 500 until `release()`, then passes.
 */
function control(page, read, mode) {
  let open = false
  let release
  const released = new Promise((resolveRelease) => { release = () => { open = true; resolveRelease() } })
  return page.route(read, async (route) => {
    if (route.request().method() !== 'GET' || open) return route.continue()
    if (mode === 'slow') {
      await released
      return route.continue()
    }
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'bench: forced failure' }) })
  }).then(() => release)
}

async function toScreen(page, size, base, hash) {
  await page.goto(`${base}/#${hash}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.adestia-chat', { timeout: 20_000 })
  if (size === 'phone') {
    if ((await page.locator('.adestia-shell').getAttribute('data-screen')) !== 'canvas') {
      await page.locator('.adestia-chat__header').getByRole('button', { name: /^(Open apps|Ouvrir les apps)$/ }).click()
    }
    await page.waitForSelector('.adestia-shell[data-screen="canvas"]', { timeout: 10_000 })
  }
}

/** The states, each: where it opens, which read, what proves the data, what the screen must show. */
const STATES = [
  { id: 'E-3', name: 'section', route: '/section/voyages', read: '**/api/pages/index', data: '.adestia-home .adestia-cards .adestia-card', noButton: true, loading: true },
  { id: 'E-4', name: 'page', via: '/', route: '/page/pieces/dossier', read: '**/api/pages/pieces/dossier*', data: '.adestia-editor .adestia-reader .adestia-list', loading: true, failure: true },
  { id: 'E-9', name: 'settings', route: '/settings', read: '**/api/mcp/status', data: '.adestia-prefs .adestia-tiles .adestia-tile', noButton: true, loading: true },
  { id: 'E-11', name: 'instructions', route: '/settings/instructions', read: '**/api/instructions', data: '.adestia-prefs__page .adestia-filecard', loading: true, failure: true },
  { id: 'E-13', name: 'delegations', route: '/settings/delegations', read: '**/api/delegations', data: '.adestia-deleg .adestia-deleg__group .adestia-conversations__item', loading: true, failure: true },
]

async function visit(browser, base, skin, locale, theme, size) {
  const dir = join(out, skin, locale, `${theme}-${size}`)
  await mkdir(dir, { recursive: true })
  const words = WORDS[locale]
  const context = await browser.newContext({
    ...SIZES[size],
    colorScheme: theme,
    locale: locale === 'fr' ? 'fr-FR' : 'en-US',
    ignoreHTTPSErrors: true,
  })
  await context.addInitScript((themeName) => {
    try { localStorage.setItem('adestia.theme', themeName) } catch { /* storage refused */ }
  }, theme)
  const tag = (state, what) => `${skin} ${locale} ${theme} ${size} ${state.id} ${what}`
  const shoot = async (page, state, what) => {
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(dir, `${state.id}-${what}.png`) })
  }

  try {
    for (const state of STATES) {
      // ── slow: the loading row before the data ──────────────────────────
      {
        const page = await context.newPage()
        try {
          const release = await control(page, state.read, 'slow')
          if (state.via) await toScreen(page, size, base, state.via)
          // The home's own read of the index would be held too; E-4 is entered from it.
          if (state.id === 'E-4') await page.waitForSelector('.adestia-home', { timeout: 10_000 }).catch(() => undefined)
          await toScreen(page, size, base, state.route)
          await page.waitForSelector('.adestia-loading', { timeout: 10_000 })
          const row = (await page.locator('.adestia-loading').first().innerText()).trim()
          if (!words.loading.test(row)) fail(tag(state, 'slow'), `the loading row says « ${row} »`)
          if (state.noButton && (await page.getByRole('button', { name: words.retry }).count())) fail(tag(state, 'slow'), 'a Retry button shows while loading')
          if (state.id !== 'E-9' && (await page.locator(state.data).count())) fail(tag(state, 'slow'), 'the data is already there under the loading row')
          await shoot(page, state, 'loading')
          release()
          await page.waitForSelector(state.data, { timeout: 15_000 })
          if (await page.locator('.adestia-loading').count()) fail(tag(state, 'slow'), 'the loading row stays after the data came')
        } catch (error) {
          fail(tag(state, 'slow'), String(error.message).split('\n')[0])
        } finally {
          await page.close()
        }
      }
      // ── broken: the message and Retry, then the data ────────────────────
      if (state.failure) {
        const page = await context.newPage()
        try {
          const retryOk = await control(page, state.read, 'broken')
          await toScreen(page, size, base, state.route)
          const retry = page.getByRole('button', { name: words.retry })
          await retry.first().waitFor({ timeout: 10_000 })
          await shoot(page, state, 'failed')
          retryOk()
          await retry.first().click()
          await page.waitForSelector(state.data, { timeout: 15_000 })
          if (await page.getByRole('button', { name: words.retry }).count()) fail(tag(state, 'retry'), 'Retry still shows after the data came')
          await shoot(page, state, 'recovered')
        } catch (error) {
          fail(tag(state, 'failed'), String(error.message).split('\n')[0])
        } finally {
          await page.close()
        }
      }
    }

    // ── E-9: a failed read leaves the tiles, no button ────────────────────
    {
      const state = { id: 'E-9' }
      const page = await context.newPage()
      try {
        await control(page, '**/api/mcp/status', 'broken')
        await toScreen(page, size, base, '/settings')
        await page.waitForSelector('.adestia-prefs .adestia-tiles .adestia-tile', { timeout: 10_000 })
        await page.waitForSelector('.adestia-loading', { state: 'detached', timeout: 10_000 })
        if (await page.getByRole('button', { name: words.retry }).count()) fail(tag(state, 'failed'), 'a Retry button shows on E-9')
        await shoot(page, state, 'failed')
      } catch (error) {
        fail(tag(state, 'failed'), String(error.message).split('\n')[0])
      } finally {
        await page.close()
      }
    }

    // ── E-8: no loading of its own; 404 says it, with no Retry; a dead server has Retry ──
    {
      const state = { id: 'E-8' }
      const page = await context.newPage()
      try {
        await toScreen(page, size, base, '/page/nope/absente')
        await page.waitForSelector('.adestia-missing', { timeout: 10_000 })
        if (await page.getByRole('button', { name: words.retry }).count()) fail(tag(state, '404'), 'a Retry button shows on a 404')
        await shoot(page, state, 'not-found')
      } catch (error) {
        fail(tag(state, '404'), String(error.message).split('\n')[0])
      } finally {
        await page.close()
      }
      const down = await context.newPage()
      try {
        let dead = true
        await down.route('**/api/pages/pieces/dossier*', (route) => (dead ? route.abort('connectionrefused') : route.continue()))
        await toScreen(down, size, base, '/page/pieces/dossier')
        const retry = down.getByRole('button', { name: words.retry })
        await retry.first().waitFor({ timeout: 10_000 })
        await shoot(down, state, 'unreachable')
        dead = false
        await retry.first().click()
        await down.waitForSelector('.adestia-editor .adestia-reader .adestia-list', { timeout: 15_000 })
      } catch (error) {
        fail(tag(state, 'unreachable'), String(error.message).split('\n')[0])
      } finally {
        await down.close()
      }
    }
  } finally {
    await context.close()
  }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-certificate-errors'] })
try {
  if (process.env.BENCH_URL) {
    const skin = process.env.BENCH_SKIN ?? 'default'
    const locale = process.env.BENCH_LOCALE ?? 'en'
    for (const theme of THEMES) for (const size of Object.keys(SIZES)) {
      await visit(browser, process.env.BENCH_URL, skin, locale, theme, size)
      console.log(`done ${skin} ${locale} ${theme} ${size}`)
    }
  } else {
    for (const skin of SKINS) for (const locale of LOCALES) {
      const instance = launch(skin, locale)
      try {
        const base = await instance.url
        for (const theme of THEMES) for (const size of Object.keys(SIZES)) {
          await visit(browser, base, skin, locale, theme, size)
          console.log(`done ${skin} ${locale} ${theme} ${size}`)
        }
      } finally { await instance.stop() }
    }
  }
} finally { await browser.close() }

if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
console.log(`pictures in ${out}`)
