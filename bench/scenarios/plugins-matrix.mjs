/**
 * The plugins' screens (E-22 to E-31) and every state the `plugins` seed shows,
 * on each skin × language × theme × desk/phone — 4 × 2 × 2 × 2 variants.
 *
 *   npm run build && node bench/scenarios/plugins-matrix.mjs
 *
 * It starts its own instance per skin × language
 * (`node bench/launch.mjs --engine fake --seed plugins --skin <s> --locale <l>`),
 * plays every variant against it, stops it, and exits 1 naming each failure.
 * Pictures land in `BENCH_OUT` (default `bench/shots-plugins`, ignored by git):
 *
 *   <skin>/<locale>/<theme>-<viewport>/<screen>-<state>.png
 *
 * `BENCH_URL`, when set, plays one variant set against an instance already
 * running (its skin and language are then whatever it was started with, named
 * by `BENCH_SKIN` and `BENCH_LOCALE`).
 *
 * What it asserts, besides "the screen's proof selector is there":
 *  - every window (the shared sheet, the bench mode, the walking HUD, the scan
 *    overlay) closes on Escape, and the focus goes back to what opened it;
 *  - on `en`, no text of a plugin screen holds an accented letter or a French
 *    article / preposition, except the content the seed wrote;
 *  - on `fr`, none of the English words of the plugins' tables.
 * The pictures are for LOOKING at; a green exit says only that nothing crashed.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const out = resolve(process.env.BENCH_OUT ?? join(root, 'bench/shots-plugins'))

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

// ── what the seed wrote is content, not interface ───────────────────────────
const sources = [
  ...readdirSync(join(root, 'bench/seed')).map((name) => join(root, 'bench/seed', name)),
  ...readdirSync(join(root, 'plugins'), { withFileTypes: true }).flatMap((entry) => {
    const dir = join(root, 'plugins', entry.name, 'exemples')
    return entry.isDirectory() && existsSync(dir) ? readdirSync(dir).map((name) => join(dir, name)) : []
  }),
]
const seedLower = sources.filter((file) => statSync(file).isFile()).map((file) => readFileSync(file, 'utf8')).join('\n').toLowerCase()
/** The seed's own words (and the examples a plugin ships) are content: a screen shows them in either language. */
const segmentsOf = (text) => text
  .split(/\s[·—→–|]\s|[:()]/u)
  .map((part) => part.replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '').trim())
  .filter((part) => part.length > 1)

// ── English keys of the plugins' French tables ──────────────────────────────
async function englishKeys() {
  const keys = new Set()
  const apiFor = (id) => ({
    id, base: `/plugins/${id}/`, locale: 'fr', fetch: () => Promise.reject(new Error('inert')),
    ask() {}, compose() {}, trail() {}, PageEditor: () => null,
  })
  for (const entry of readdirSync(join(root, 'plugins'), { withFileTypes: true })) {
    const manifestFile = join(root, 'plugins', entry.name, 'adestia-plugin.json')
    if (!entry.isDirectory() || !existsSync(manifestFile)) continue
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
    for (const facet of ['view', 'blocks', 'chrome', 'layouts']) {
      if (!manifest[facet]) continue
      const module = await import(pathToFileURL(join(root, 'plugins', entry.name, String(manifest[facet]))).href)
      const produced = module.default(apiFor(entry.name))
      for (const [key, value] of Object.entries(produced?.words ?? {})) {
        if (key !== value && !key.includes('%') && /[a-z]{2}/i.test(key)) keys.add(key)
      }
    }
  }
  return [...keys]
}
const ENGLISH = await englishKeys()

const FRENCH_WORDS = /(?:^|[^\p{L}])(?:le|la|les|des|pour|avec|dans|une?|du|sur|sans|et)(?=$|[^\p{L}])/iu
const ACCENT = /[éèêëàâùûçôîïœ]/i

function wordsFault(locale, nodes) {
  const faults = []
  for (const text of nodes.flatMap(segmentsOf)) {
    if (seedLower.includes(text.toLowerCase())) continue
    // A piece's reference (A1-CÔTÉ-G) is the workbook's identifier, built by the plugin from the seed's roles.
    if (/^[\p{Lu}\d]+(?:-[\p{Lu}\d]+)+$/u.test(text)) continue
    if (locale === 'en') {
      if (ACCENT.test(text) || FRENCH_WORDS.test(text)) faults.push(`French in en: « ${text} »`)
    } else {
      const hit = ENGLISH.find((key) => (/\s/.test(key) ? key.length >= 8 && text.includes(key) : text === key))
      if (hit) faults.push(`English in fr: « ${text} » (${hit})`)
    }
  }
  return faults
}

// ── the screens and their states ────────────────────────────────────────────
/**
 * `host`: the root whose text is read (and, with any window it opened, the
 * windows' own). A `window` state opens something over the screen: `opener`
 * is the control, `dialog` what appears, and Escape must remove it and give
 * the focus back to the control.
 */
const SCREENS = [
  { id: 'E-22', name: 'todo', route: '/todo', host: '.todo', proof: '.todo .todo-task', states: [
    { name: 'list' },
    { name: 'sheet', open: (page) => page.locator('.todo-task__title').first().click(), proof: '.todo-sheet', back: true },
  ] },
  { id: 'E-23', name: 'planif', route: '/planif', host: '.planif', proof: '.planif .planif__note', states: [{ name: 'notes' }] },
  { id: 'E-24', name: 'journal', route: '/journal', host: '.journal', proof: '.journal .journal-card', states: [{ name: 'journals' }] },
  { id: 'E-25', name: 'atelier', route: '/atelier', host: '.atelier-page', proof: '.atelier-page .card', states: [{ name: 'hub' }] },
  { id: 'E-25', name: 'atelier-workbook', route: '/atelier/caisson', host: '.atelier-page', proof: '.atelier-page .pname', states: [
    { name: 'workbook' },
    { name: 'piece-sheet', window: { opener: '.atelier-page .pname', dialog: '.atelier-sheet [role=dialog]', key: 'Enter' } },
    { name: 'bench-mode', window: { opener: '#shopmode', dialog: '.atelier-full[role=dialog]' } },
  ] },
  { id: 'E-26', name: 'voyages', route: '/voyages', host: '.voyages-page', proof: '.voyages-page .vhub-card', states: [{ name: 'hub' }] },
  { id: 'E-26', name: 'voyage-corse', route: '/voyages/corse', host: '.voyages', proof: '.voyages .vday', states: [
    { name: 'timeline' },
    { name: 'sheet', window: { opener: '.voyages .vcard', dialog: '.voyages-sheet[role=dialog]' } },
  ] },
  { id: 'E-27', name: 'listening-post', route: '/listening-post', host: '.lp', proof: '.lp .lp-card', states: [{ name: 'hub' }] },
  { id: 'E-27', name: 'listening-item', route: '/listening-post/moteur-audio', host: '.lp', proof: '.lp-lines li', states: [{ name: 'transcript' }] },
  { id: 'E-28', name: 'parcours', route: '/parcours/balades/assets/val-sans-retour.parcours.json', host: '.parcours', proof: '.parcours.pc-ready .pc-map', gps: true, states: [
    { name: 'map' },
    { name: 'walk-hud', window: { opener: '.pc-bar button >> nth=-1', dialog: '.pc-balade .pc-hud', gone: '.pc-hud' } },
  ] },
  { id: 'E-29', name: 'meals', route: '/page/sante/septembre', host: '.meals', proof: '.meals .meals-frise .meals-card', states: [
    { name: 'frise' },
    { name: 'sheet', window: { opener: '.meals-card', dialog: '.meals-sheet[role=dialog]' } },
  ] },
  { id: 'E-30', name: 'scan', route: '/', shell: 'chat', host: '.scan-overlay', proof: '.scan-overlay', states: [
    { name: 'reader', window: { openWith: 'scan', dialog: '.scan-overlay[aria-modal=true]', focusWaived: { phone: 'the composer folds its buttons on a phone and drops the one that opened the reader (Known defects)' } }, noOpenProof: true },
  ] },
  { id: 'E-31', name: 'project-management', route: '/page/renovation/INDEX', host: '.pm-timeline', proof: '.pm-timeline .pm-timeline__chart', states: [{ name: 'timeline' }] },
]

const THEMES = ['light', 'dark']
const SIZES = {
  desk: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
}
const SKINS = (process.env.BENCH_SKINS ?? "alfred,dobby,nestor,skippy").split(",")
const LOCALES = ['fr', 'en']

function launch(skin, locale) {
  const args = [join(root, 'bench/launch.mjs'), '--engine', 'fake', '--seed', 'plugins', '--skin', skin, '--locale', locale]
  const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (chunk) => (stderr += chunk))
  const url = new Promise((done, reject) => {
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
      const found = /listening on (\S+)/.exec(output)
      if (found) done(found[1])
    })
    child.once('exit', (code) => reject(new Error(`launcher exited (${code}): ${stderr.trim().split('\n').slice(-3).join(' | ')}`)))
  })
  const stop = () => new Promise((done) => {
    if (child.exitCode !== null) return done()
    child.once('exit', done)
    child.kill('SIGTERM')
  })
  return { url, stop }
}

/** The text nodes under `selector` and under any shared window, minus the markup that is not read. */
const textOf = (page, selector) => page.evaluate((host) => {
  const roots = [...document.querySelectorAll(`${host}, .adestia-sheet:not([hidden])`)]
  const found = new Set()
  for (const node of roots) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement
      if (parent?.closest('script, style, svg')) continue
      const text = walker.currentNode.textContent.replace(/\s+/g, ' ').trim()
      if (text.length > 1) found.add(text)
    }
    for (const attr of node.querySelectorAll('[title], [aria-label]')) {
      for (const text of [attr.getAttribute('title'), attr.getAttribute('aria-label')]) if (text) found.add(text.trim())
    }
  }
  return [...found]
}, selector)

async function openScan(page) {
  const direct = page.locator('.adestia-composer__attach[aria-label*="can" i]')
  await page.waitForSelector('.adestia-composer__attach[aria-label*="can" i], .adestia-fold', { timeout: 10_000 })
  if (await direct.count()) { await direct.first().focus(); await direct.first().click(); return direct.first() }
  const fold = page.locator('.adestia-fold > .adestia-composer__attach')
  await fold.focus()
  await fold.click()
  await page.locator('.adestia-fold__item', { hasText: /scan/i }).click()
  return fold
}

async function visit(browser, base, skin, locale, theme, size, failures) {
  const dir = join(out, skin, locale, `${theme}-${size}`)
  await mkdir(dir, { recursive: true })
  const context = await browser.newContext({
    ...SIZES[size], colorScheme: theme, locale: locale === 'fr' ? 'fr-FR' : 'en-US',
    permissions: ['camera'], ignoreHTTPSErrors: true,
  })
  const label = (screen, state) => `${skin} ${locale} ${theme} ${size} ${screen.id} ${screen.name}/${state}`
  try {
    for (const screen of SCREENS) {
      const page = await context.newPage()
      page.setDefaultTimeout(8_000)
      try {
        await page.addInitScript((themeName) => {
          localStorage.setItem('adestia.theme', themeName)
          Object.defineProperty(navigator, 'geolocation', { value: {
            watchPosition(success) {
              queueMicrotask(() => success({ coords: { latitude: 48.005, longitude: -2.25, accuracy: 12, heading: null } }))
              return 1
            },
            clearWatch() {},
            getCurrentPosition(success) { success({ coords: { latitude: 48.005, longitude: -2.25, accuracy: 12, heading: null } }) },
          } })
        }, theme)
        await page.goto(`${base}/#${screen.route}`, { waitUntil: 'domcontentloaded' })
        await page.waitForSelector('.adestia-chat', { timeout: 20_000 })
        if (size === 'phone') {
          const want = screen.shell ?? 'canvas'
          if (want === 'canvas' && (await page.locator('.adestia-shell').getAttribute('data-screen')) !== 'canvas') {
            await page.locator('.adestia-chat__header .adestia-ib', { hasText: '▥' }).click()
          }
          await page.waitForSelector(`.adestia-shell[data-screen="${want}"]`, { timeout: 10_000 })
        }
        for (const state of screen.states) {
          const name = label(screen, state.name)
          try {
            let opener
            if (state.window?.openWith === 'scan') {
              opener = await openScan(page)
              await page.waitForSelector(screen.proof, { state: 'visible', timeout: 15_000 })
            } else {
              await page.waitForSelector(screen.proof, { state: 'visible', timeout: 8_000 })
              await page.evaluate(() => document.fonts.ready)
              if (state.window) {
                opener = page.locator(state.window.opener).first()
                await opener.focus({ timeout: 8_000 })
                if (state.window.key) await page.keyboard.press(state.window.key)
                else await opener.click()
              } else if (state.open) {
                await state.open(page)
                await page.waitForSelector(state.proof, { state: 'visible', timeout: 10_000 })
              }
            }
            if (state.window) await page.waitForSelector(state.window.dialog, { state: 'visible', timeout: 10_000 })
            await page.waitForTimeout(400)
            if (await page.locator('.adestia-gate__card--fatal, .adestia-gate__card--loading').count()) throw new Error('an error or loading screen is shown')
            await page.screenshot({ path: join(dir, `${screen.id}-${screen.name}-${state.name}.png`) })
            const faults = wordsFault(locale, await textOf(page, state.window ? `${screen.host}, ${state.window.dialog}` : screen.host))
            if (faults.length) failures.push(`${name}: ${faults.slice(0, 6).join(' ; ')}`)
            if (state.window) {
              await page.keyboard.press('Escape')
              const gone = state.window.gone ?? state.window.dialog
              await page.waitForSelector(gone, { state: 'hidden', timeout: 5_000 }).catch(() => { throw new Error(`Escape leaves ${gone} open`) })
              const focused = await opener.evaluate((node) => node === document.activeElement || node.contains(document.activeElement))
              const waived = state.window.focusWaived?.[size]
              if (!focused && waived) console.log(`NOTE ${name}: focus not returned — ${waived}`)
              else if (!focused) throw new Error('the focus did not return to the control that opened the window')
            } else if (state.back) {
              await page.goBack().catch(() => undefined)
            }
          } catch (error) {
            failures.push(`${name}: ${error instanceof Error ? error.message.split('\n')[0] : error}`)
          }
          if (state.back || state.window) {
            // A state that left the page (the sheet's own route) or whose window failed: start the next one clean.
            const ok = await page.locator(screen.proof).first().isVisible().catch(() => false)
            if (!ok) {
              await page.goto(`${base}/#${screen.route}`, { waitUntil: 'domcontentloaded' })
              await page.reload({ waitUntil: 'domcontentloaded' })
              await page.waitForSelector(screen.proof, { timeout: 15_000 }).catch(() => undefined)
            }
          }
        }
      } catch (error) {
        failures.push(`${skin} ${locale} ${theme} ${size} ${screen.id} ${screen.name}: ${error instanceof Error ? error.message.split('\n')[0] : error}`)
      } finally {
        await page.close()
      }
    }
  } finally {
    await context.close()
  }
}

const browser = await chromium.launch({
  args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--ignore-certificate-errors'],
})
const failures = { push: (message) => { console.error(`FAIL ${message}`) ; all.push(message) } }
const all = []
try {
  if (process.env.BENCH_URL) {
    const skin = process.env.BENCH_SKIN ?? 'default'
    const locale = process.env.BENCH_LOCALE ?? 'en'
    for (const theme of THEMES) for (const size of Object.keys(SIZES)) {
      await visit(browser, process.env.BENCH_URL, skin, locale, theme, size, failures)
      console.log(`done ${skin} ${locale} ${theme} ${size}`)
    }
  } else {
    for (const skin of SKINS) for (const locale of LOCALES) {
      const instance = launch(skin, locale)
      try {
        const base = await instance.url
        for (const theme of THEMES) for (const size of Object.keys(SIZES)) {
          await visit(browser, base, skin, locale, theme, size, failures)
          console.log(`done ${skin} ${locale} ${theme} ${size}`)
        }
      } finally { await instance.stop() }
    }
  }
} finally { await browser.close() }

if (all.length) {
  console.error(`\n${all.length} failure(s):\n  ${all.join('\n  ')}`)
  process.exit(1)
}
console.log(`plugins-matrix: ${SKINS.length * LOCALES.length * THEMES.length * Object.keys(SIZES).length} variants, pictures in ${out}`)
