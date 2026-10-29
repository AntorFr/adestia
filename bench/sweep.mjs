#!/usr/bin/env node
/**
 * Capture every screen of docs/ecrans.md, in light and dark, at desk and phone
 * width, without docker.
 *
 *   node bench/sweep.mjs [--skin <id>] [--locale en|fr] [--out <dir>] [--only E-4,E-9]
 *
 * Needs a built server (`npm run build`) and Playwright with its Chromium in
 * the environment's global npm root (`npm root -g`) — never a dependency of
 * the repository (ARCHITECTURE.md, AD-3). For each seed the screens need, it
 * starts `bench/launch.mjs` on the scripted engine, then for each screen and
 * each of the four variants (light|dark × desk|phone) opens a fresh browser
 * context, goes where the table says, and takes the picture to
 *
 *   <out>/<skin>/<E-n>-<name>-<theme>-<viewport>.png     (`<skin>` is `default` without --skin)
 *
 * `--out` defaults to `bench/shots-sweep`, ignored by git. A capture whose
 * proof selector never appears, or that shows a loading or an error screen
 * (`.adestia-gate__card--loading`, `.adestia-gate__card--fatal`) the screen is not supposed to be,
 * is a failure: the sweep goes on, then exits 1 naming each screen that failed.
 *
 * The TABLE below is the one place that knows a screen: the seed it needs, the
 * route, the gesture that opens it, and the selector that proves it is THAT
 * screen and not another. A new screen of docs/ecrans.md is a new row.
 */
import { mkdir, stat } from 'node:fs/promises'
import { loadPlaywright } from './lib/playwright.mjs'
import { launch } from './lib/instance.mjs'
import { dirname, join, resolve } from 'node:path'
import { argv, exit } from 'node:process'
import { fileURLToPath } from 'node:url'

import { CONVERSATIONS } from './seed/_base.mjs'

const here = dirname(fileURLToPath(import.meta.url))

// ── the table ───────────────────────────────────────────────────────────────
/**
 * One row per screen of docs/ecrans.md.
 *
 *   id, name   `E-n` and the word that names the file
 *   seed       the instance it is captured on (bench/seed/<seed>.mjs)
 *   route      the hash route, without `#` (default: home)
 *   shell      `canvas` (default) or `chat`: which of the phone's two screens shows it
 *   chat       a conversation to have open (key of `CONVERSATIONS`)
 *   signedIn   sign in through the identity provider first (oidc seed)
 *   before     runs once signed in, before the route is opened (E-1: the session is lost)
 *   reload     reload after the route is set (a hash change alone does not run the shell again)
 *   open       the gesture that brings the screen up, after the route
 *   proof      selector that exists only on this screen — it must appear, visible
 *   fatalOk    the screen IS an error screen (E-21: the fatal gate)
 *   after      put things back (stop a turn the gesture started)
 */
const SCREENS = [
  { id: 'E-1', name: 'gates', seed: 'oidc', signedIn: true, before: sessionLost, reload: true, shell: 'none', proof: '.adestia-gate .adestia-btn--accent' },
  { id: 'E-2', name: 'home', seed: 'base', proof: '.adestia-home__greeting ~ .adestia-section .adestia-brief__item, .adestia-home .adestia-tiles .adestia-tile' },
  { id: 'E-3', name: 'section', seed: 'base', route: '/section/voyages', proof: '.adestia-home .adestia-cards .adestia-card' },
  { id: 'E-4', name: 'page', seed: 'base', route: '/page/pieces/dossier', proof: '.adestia-editor .adestia-reader .adestia-list' },
  { id: 'E-5', name: 'page-properties', seed: 'base', route: '/page/pieces/dossier', open: edit('.adestia-editor__meta-gear'), proof: '.adestia-popover.adestia-blockset--page' },
  { id: 'E-6', name: 'block-settings', seed: 'base', route: '/page/pieces/dossier', open: edit('.adestia-edblock__gear', { force: true }), proof: '.adestia-popover.adestia-blockset' },
  { id: 'E-7', name: 'collection', seed: 'base', route: '/page/projets/INDEX', proof: '.adestia-collection .adestia-cards .adestia-card' },
  { id: 'E-8', name: 'missing-page', seed: 'base', route: '/page/nope/absente', proof: '.adestia-missing .adestia-missing__path' },
  { id: 'E-9', name: 'settings', seed: 'base', route: '/settings', proof: '.adestia-prefs .adestia-tiles .adestia-tile' },
  { id: 'E-10', name: 'mcp', seed: 'base', route: '/settings/mcp', proof: '.adestia-prefs__page .adestia-tiles .adestia-tile' },
  { id: 'E-11', name: 'instructions', seed: 'base', route: '/settings/instructions', proof: '.adestia-prefs__page .adestia-filecard' },
  { id: 'E-12', name: 'catalogues', seed: 'base', route: '/settings/instructions', open: click('button:text-matches("^Catalogues?$")'), proof: '.adestia-sheet .adestia-catalogues__list .adestia-filecard' },
  { id: 'E-13', name: 'delegations', seed: 'base', route: '/settings/delegations', proof: '.adestia-deleg .adestia-deleg__group .adestia-conversations__item' },
  { id: 'E-14', name: 'configuration', seed: 'config-writable', route: '/settings/config', proof: '.adestia-prefs__page :is(input, select, textarea)' },
  { id: 'E-15', name: 'cog-menu', seed: 'oidc', signedIn: true, open: click('.adestia-cog > button'), proof: '.adestia-cog__panel .adestia-cog__signout' },
  { id: 'E-16', name: 'chat', seed: 'base', shell: 'chat', chat: 'rich', proof: '.adestia-chat__conversation .adestia-bubble--agent .adestia-trace' },
  { id: 'E-17', name: 'permission', seed: 'base', shell: 'chat', open: ask('permission'), proof: '.adestia-ask .adestia-ask__actions', after: stopTurn },
  { id: 'E-18', name: 'signature', seed: 'base', shell: 'chat', chat: 'rich', open: click('.adestia-sign__go'), proof: '.adestia-sheet__panel' },
  { id: 'E-19', name: 'problems', seed: 'base', proof: '.adestia-problems--refused' },
  { id: 'E-20', name: 'inactive-app', seed: 'plugins', route: '/bench-noview', proof: '.adestia-empty .adestia-switch' },
  { id: 'E-21', name: 'offline', seed: 'base', shell: 'none', offline: true, fatalOk: true, proof: '.adestia-gate__card--fatal .adestia-icon' },
  { id: 'E-22', name: 'todo', seed: 'plugins', route: '/todo', proof: '.todo .todo-task' },
  { id: 'E-23', name: 'planif', seed: 'plugins', route: '/planif', proof: '.planif .planif__note' },
  { id: 'E-24', name: 'journal', seed: 'plugins', route: '/journal', proof: '.journal .journal-card' },
  { id: 'E-25', name: 'atelier', seed: 'plugins', route: '/atelier', proof: '.atelier-page .card' },
  { id: 'E-26', name: 'voyages', seed: 'plugins', route: '/voyages', proof: '.voyages-page .vhub-card' },
  { id: 'E-27', name: 'listening-post', seed: 'plugins', route: '/listening-post', proof: '.lp .lp-card' },
  { id: 'E-28', name: 'parcours', seed: 'plugins', route: '/parcours/balades/assets/val-sans-retour.parcours.json', proof: '.parcours.pc-ready .pc-map' },
  { id: 'E-29', name: 'meals', seed: 'plugins', route: '/page/sante/septembre', proof: '.meals .meals-frise .meals-card' },
  { id: 'E-30', name: 'scan', seed: 'plugins', shell: 'chat', open: scan, proof: '.scan-overlay' },
  { id: 'E-31', name: 'project-management', seed: 'plugins', route: '/page/renovation/INDEX', proof: '.pm-timeline .pm-timeline__chart' },
]

// ── gestures ────────────────────────────────────────────────────────────────
function click(selector, options = {}) {
  return async (page) => {
    await page.locator(selector).first().click({ timeout: 10_000, ...options })
  }
}

/** Opens the page in the editor (✎), then does `gesture`. */
function edit(selector, options = {}) {
  return async (page) => {
    await page.locator('.adestia-editor__actions .adestia-btn').first().click({ timeout: 10_000 })
    await page.waitForSelector('.adestia-editor__surface .ProseMirror', { timeout: 10_000 })
    await click(selector, options)(page)
  }
}

/**
 * E-1, the sign-in gate. The server redirects a DOCUMENT without a session to the
 * provider (which signs `alice` straight back in), so a fresh visit never sees
 * the gate: it is what an already-open shell shows when its session ends. The
 * shell is therefore loaded signed in, and the one request it makes to learn
 * who it is, `/api/instance`, is answered with what the server itself answers
 * a request that carries no session — fetched for real, here, without cookies.
 */
async function sessionLost(page, { base }) {
  await page.route('**/api/instance', async (route) => {
    const real = await fetch(`${base}/api/instance`)
    await route.fulfill({ status: real.status, contentType: 'application/json', body: await real.text() })
  })
}

/** Types a word into the composer and sends it: the fake engine answers by script (bench/seed/_scripts.mjs). */
function ask(word) {
  return async (page) => {
    await page.locator('.adestia-composer__input').fill(word)
    await page.locator('.adestia-composer__send').click()
  }
}

/** A turn the gesture left open would hold a seat of `maxConcurrentTurns` for the screens after it. */
async function stopTurn(page) {
  const stop = page.locator('.adestia-composer__stop')
  if (await stop.count()) await stop.first().click()
  await page.waitForSelector('.adestia-composer__stop', { state: 'detached', timeout: 10_000 }).catch(() => undefined)
}

/** The scan overlay: the composer's button, in the `More` fold when it is folded. */
async function scan(page) {
  const direct = page.locator('.adestia-composer__attach[aria-label*="can" i]')
  // The plugin's button arrives after the composer: wait for it, or for the fold that holds it.
  await page.waitForSelector('.adestia-composer__attach[aria-label*="can" i], .adestia-fold', { timeout: 10_000 })
  if (await direct.count()) return direct.first().click()
  await page.locator('.adestia-fold > .adestia-composer__attach').click()
  await page.locator('.adestia-fold__item', { hasText: /scan/i }).click()
}

// ── arguments ───────────────────────────────────────────────────────────────
const fail = (message, code = 2) => {
  console.error(`sweep: ${message}`)
  exit(code)
}
const OPTIONS = ['skin', 'locale', 'out', 'only']
const options = { out: join(here, 'shots-sweep') }
for (let i = 2; i < argv.length; i++) {
  const name = argv[i].startsWith('--') ? argv[i].slice(2) : ''
  if (!OPTIONS.includes(name)) fail(`unknown argument ${argv[i]} — options: ${OPTIONS.map((o) => `--${o}`).join(' ')}`)
  const value = argv[++i]
  if (value === undefined || value.startsWith('--')) fail(`--${name} needs a value`)
  options[name] = value
}
if (options.locale && !['en', 'fr'].includes(options.locale)) fail(`--locale must be en or fr (got ${options.locale})`)
if (options.skin && !/^[a-z0-9-]+$/.test(options.skin)) fail(`--skin must be a skin id (got ${options.skin})`)
const only = options.only ? options.only.split(',').map((id) => id.trim()).filter(Boolean) : undefined
for (const id of only ?? []) if (!SCREENS.some((screen) => screen.id === id)) fail(`no screen named ${id} (E-1 to E-${SCREENS.length})`)
const screens = SCREENS.filter((screen) => !only || only.includes(screen.id))
const outDir = join(resolve(options.out), options.skin ?? 'default')

// ── Playwright, from the environment ────────────────────────────────────────
let chromium
try {
  chromium = loadPlaywright().chromium
} catch (error) {
  fail(`${error.message} — it comes with the environment, not with the repository`, 1)
}

// ── one capture ─────────────────────────────────────────────────────────────
const THEMES = ['light', 'dark']
const VIEWPORTS = {
  desk: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
}

async function capture(browser, base, screen, theme, size) {
  const context = await browser.newContext({
    ...VIEWPORTS[size],
    colorScheme: theme,
    locale: options.locale ?? 'en-US',
    ignoreHTTPSErrors: true,
    permissions: ['camera'],
  })
  const page = await context.newPage()
  try {
    // Explicit theme, so a skin that declares its own scheme does not decide for us.
    const tabs = screen.chat ? JSON.stringify({ open: [CONVERSATIONS[screen.chat]], active: CONVERSATIONS[screen.chat] }) : undefined
    await page.addInitScript(
      ([themeName, tabState]) => {
        try {
          localStorage.setItem('adestia.theme', themeName)
          if (tabState) localStorage.setItem('adestia.tabs', tabState)
        } catch {
          // storage refused: the visit still renders
        }
      },
      [theme, tabs],
    )

    if (screen.signedIn) {
      await page.goto(`${base}/auth/login?returnTo=%2F`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.adestia-chat', { timeout: 20_000 })
    }
    await screen.before?.(page, { base })
    await page.goto(`${base}/#${screen.route ?? '/'}`, { waitUntil: 'domcontentloaded' })
    if (screen.reload) await page.reload({ waitUntil: 'domcontentloaded' })
    if (screen.shell !== 'none') await page.waitForSelector('.adestia-chat', { timeout: 20_000 })

    if (screen.offline) await goOffline(page, context)

    // The phone shows one of two screens; the picture must show the screen's own.
    if (size === 'phone' && screen.shell !== 'none') {
      const want = screen.shell ?? 'canvas'
      if ((await page.locator('.adestia-shell').getAttribute('data-screen')) !== want && want === 'canvas') {
        await page.locator('.adestia-chat__header').getByRole('button', { name: /^(Open apps|Ouvrir les apps)$/ }).click()
      }
      await page.waitForSelector(`.adestia-shell[data-screen="${want}"]`, { timeout: 10_000 })
    }

    await screen.open?.(page)

    await page.waitForSelector(screen.proof, { state: 'visible', timeout: 15_000 }).catch(() => {
      throw new Error(`the selector that proves the screen never appeared: ${screen.proof}`)
    })
    // Settle: transitions, web fonts, the second render of a view that loads.
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(700)

    if (await page.locator('.adestia-gate__card--loading').count()) throw new Error('a loading screen is shown (.adestia-gate__card--loading)')
    if (!screen.fatalOk && (await page.locator('.adestia-gate__card--fatal').count())) {
      const said = (await page.locator('.adestia-gate__card--fatal').first().innerText()).replace(/\s+/g, ' ').slice(0, 160)
      throw new Error(`an error screen is shown (.adestia-gate__card--fatal): ${said}`)
    }

    const file = join(outDir, `${screen.id}-${screen.name}-${theme}-${size}.png`)
    await page.screenshot({ path: file })
    if ((await stat(file)).size < 500) throw new Error(`the capture is empty (${file})`)
    await screen.after?.(page)
    return file
  } finally {
    await context.close()
  }
}

/** E-21: let the service worker cache the shell, cut the network, reload. */
async function goOffline(page, context) {
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForFunction(
    async () => {
      const names = await caches.keys()
      const entries = await Promise.all(names.map((name) => caches.open(name).then((cache) => cache.keys())))
      return entries.flat().length >= 5
    },
    undefined,
    { timeout: 20_000 },
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.adestia-chat', { timeout: 20_000 })
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined)
}

// ── the sweep ───────────────────────────────────────────────────────────────
await mkdir(outDir, { recursive: true })
const browser = await chromium.launch({
  args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--ignore-certificate-errors'],
})
const failures = []
let taken = 0
try {
  const seeds = [...new Set(screens.map((screen) => screen.seed))]
  for (const seed of seeds) {
    const instance = launch(seed, options)
    try {
      const base = await instance.url
      for (const screen of screens.filter((s) => s.seed === seed)) {
        for (const theme of THEMES) {
          for (const size of Object.keys(VIEWPORTS)) {
            const label = `${screen.id} ${screen.name} ${theme} ${size}`
            try {
              await capture(browser, base, screen, theme, size)
              taken += 1
              console.log(`shot ${label}`)
            } catch (error) {
              const reason = error instanceof Error ? error.message.split('\n')[0] : String(error)
              failures.push(`${label} (seed ${seed}): ${reason}`)
              console.error(`FAIL ${label}: ${reason}`)
            }
          }
        }
      }
    } catch (error) {
      for (const screen of screens.filter((s) => s.seed === seed)) {
        failures.push(`${screen.id} ${screen.name} (seed ${seed}): ${error instanceof Error ? error.message : error}`)
      }
    } finally {
      await instance.stop()
    }
  }
} finally {
  await browser.close()
}

const wanted = screens.length * THEMES.length * Object.keys(VIEWPORTS).length
console.log(`sweep: ${taken}/${wanted} captures in ${outDir}`)
if (failures.length) {
  console.error(`sweep: ${failures.length} failed:\n  ${failures.join('\n  ')}`)
  exit(1)
}
