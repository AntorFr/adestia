/**
 * The offline banner (E-32): the server is REALLY stopped, then started again.
 *
 *   npm run build && node bench/scenarios/hors-ligne.mjs
 *
 * Per skin × language, one instance of the bench's own process
 * (`node bench/launch.mjs --engine fake --seed config-writable --port <p> --data <d>`),
 * with a fixed port and data directory so it can be stopped (SIGTERM) and started
 * again on the same ones. Nothing simulates the absence: the process is gone, the
 * pages the browser holds open find out by themselves. The only scripted answer is
 * `POST /api/restart` → 202 (as `config-charte.mjs` does, the launcher wires no
 * `restart`), to get E-14 into "Coming back…" while the real server is away.
 *
 * Per theme × desk/phone, three pages are opened BEFORE the cut and never reloaded:
 *
 *  - E-2 (home) and E-4 (a page): the banner must show on each, and the screen under
 *    it stay usable (a tile still opens a page on E-2; the page's text is still there);
 *    on the phone, E-2 is seen on the canvas and then with the chat shown (the other
 *    place of the banner, above the rail);
 *  - E-14, edited and saved, with the restart band showing: Restart is pressed with
 *    the server away, "Coming back…" and the banner are on screen together;
 *  - the server is started again: every banner leaves by itself, without reloading
 *    (a marker on `window` survives), and E-14's wait ends.
 *
 * Pictures: `BENCH_OUT` (default `bench/shots-hors-ligne`, ignored by git):
 *
 *   <skin>/<locale>/<theme>-<viewport>/<name>.png
 *
 * `BENCH_SKINS=alfred,dobby` and `BENCH_LOCALES=fr` narrow the run. Exit 1 names each
 * failed expectation. The pictures are for LOOKING at.
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const out = resolve(process.env.BENCH_OUT ?? join(root, 'bench/shots-hors-ligne'))

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
  en: { banner: 'The server is not responding', coming: /^Coming back…$/, save: /^Save$/, restart: /^Restart now$/ },
  fr: { banner: 'Le serveur ne répond pas', coming: /^Retour en cours…$/, save: /^Enregistrer$/, restart: /^Redémarrer$/ },
}

const failures = []
const fail = (where, why) => {
  console.error(`FAIL ${where}: ${why}`)
  failures.push(`${where}: ${why}`)
}

const freePort = () =>
  new Promise((resolvePort, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolvePort(port))
    })
  })

/** The bench's process on a port and a data directory it is given, so that it can be started again on them. */
function instance(skin, locale, port, data) {
  let child
  let url
  const start = () =>
    url ? Promise.resolve(url) : new Promise((resolveUrl, reject) => {
      child = spawn(
        process.execPath,
        [join(root, 'bench/launch.mjs'), '--engine', 'fake', '--seed', 'config-writable', '--skin', skin, '--locale', locale, '--port', String(port), '--data', data],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
      let stderr = ''
      let seen = ''
      child.stderr.on('data', (chunk) => (stderr += chunk))
      child.stdout.on('data', (chunk) => {
        seen += chunk
        const found = /listening on (\S+)/.exec(seen)
        if (found) resolveUrl((url = found[1]))
      })
      child.once('exit', (code) => reject(new Error(`the launcher exited (${code}): ${stderr.trim().split('\n').slice(-3).join(' | ')}`)))
    })
  const stop = () =>
    new Promise((done) => {
      url = undefined
      if (!child || child.exitCode !== null) return done()
      child.removeAllListeners('exit')
      child.once('exit', done)
      child.kill('SIGTERM')
    })
  return { start, stop }
}

async function toCanvas(page, size) {
  if (size !== 'phone') return
  if ((await page.locator('.adestia-shell').getAttribute('data-screen')) !== 'canvas') {
    await page.locator('.adestia-chat__header').getByRole('button', { name: /^(Open apps|Ouvrir les apps)$/ }).click()
  }
  await page.waitForSelector('.adestia-shell[data-screen="canvas"]', { timeout: 10_000 })
}

async function open(context, base, size, hash) {
  const page = await context.newPage()
  await page.goto(`${base}/#${hash}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.adestia-chat', { timeout: 20_000 })
  await toCanvas(page, size)
  await page.evaluate(() => { window.__benchNoReload = true })
  return page
}

async function visit(browser, base, server, skin, locale, theme, size) {
  const dir = join(out, skin, locale, `${theme}-${size}`)
  await mkdir(dir, { recursive: true })
  const words = WORDS[locale]
  const tag = (what) => `${skin} ${locale} ${theme} ${size} ${what}`
  const context = await browser.newContext({
    ...SIZES[size],
    colorScheme: theme,
    locale: locale === 'fr' ? 'fr-FR' : 'en-US',
  })
  await context.addInitScript((themeName) => {
    try { localStorage.setItem('adestia.theme', themeName) } catch { /* storage refused */ }
  }, theme)
  const shoot = async (page, name) => {
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(dir, `${name}.png`) })
  }
  const banner = (page) => page.locator('.adestia-offline')
  const expectBanner = async (page, what, within = 15_000) => {
    try {
      await banner(page).first().waitFor({ timeout: within })
      const text = (await banner(page).first().innerText()).trim()
      if (text !== words.banner) fail(tag(what), `the banner says « ${text} »`)
      if ((await banner(page).count()) !== 1) fail(tag(what), 'the banner is drawn in more than one place')
    } catch (error) {
      fail(tag(what), `no banner: ${String(error.message).split('\n')[0]}`)
    }
  }

  const pages = []
  try {
    // ── Before the cut: three pages, none of which will be reloaded ───────
    const home = await open(context, base, size, '/')
    await home.waitForSelector('.adestia-home .adestia-card, .adestia-home .adestia-tile', { timeout: 15_000 })
    const doc = await open(context, base, size, '/page/pieces/dossier')
    await doc.waitForSelector('.adestia-editor .adestia-reader .adestia-list', { timeout: 15_000 })
    const config = await open(context, base, size, '/settings/config')
    pages.push(home, doc, config)
    for (const page of pages) {
      if (await banner(page).count()) fail(tag('before'), 'a banner shows while the server answers')
    }
    await config.route('**/api/restart', (route) => route.fulfill({ status: 202, contentType: 'application/json', body: '{}' }))
    const key = await config.evaluate(async () => {
      const body = await (await fetch('/api/settings')).json()
      const spec = body.groups.flatMap((g) => g.settings).find((s) => s.applies === 'restart' && s.kind === 'toggle')
      return spec?.path.join('.')
    })
    await config.waitForSelector('.adestia-config__field')
    if (!key) fail(tag('E-14'), 'no setting that waits for a restart')
    else {
      await config.locator(`#setting-${key.replaceAll('.', '\\.')}`).click()
      await config.getByRole('button', { name: words.save }).click()
      await config.waitForSelector('.adestia-config__restart-bar', { timeout: 10_000 })
    }

    // ── The cut ─────────────────────────────────────────────────────────────
    await server.stop()
    for (const [page, what] of [[home, 'E-2'], [doc, 'E-4'], [config, 'E-14']]) await expectBanner(page, what)

    // E-2: the banner sits above the screen, which is still there and still works.
    await shoot(home, 'E-2-offline')
    const box = await banner(home).first().boundingBox()
    const first = await home.locator('.adestia-home').first().boundingBox()
    if (box && first && box.y + box.height > first.y + first.height) fail(tag('E-2'), 'the banner is below the home')
    const tile = home.locator('.adestia-home .adestia-tile:not([disabled])').last()
    if (await tile.count()) {
      const before = home.url()
      await tile.click().catch(() => undefined)
      await home.waitForTimeout(500)
      if (home.url() === before) fail(tag('E-2'), 'a tile no longer opens while the banner shows')
      await home.evaluate(() => { location.hash = '/' })
      await home.waitForSelector('.adestia-home', { timeout: 5_000 }).catch(() => fail(tag('E-2'), 'the home does not come back'))
      await expectBanner(home, 'E-2 after navigating')
    } else fail(tag('E-2'), 'no tile on the home to prove it usable')

    // E-4: a different screen, the text of the page is still there.
    await shoot(doc, 'E-4-offline')
    if (!(await doc.locator('.adestia-editor .adestia-reader .adestia-list').first().isVisible())) fail(tag('E-4'), 'the page is no longer shown under the banner')

    // The phone: the same E-2 with the chat shown — the banner above the rail, not also in the canvas.
    if (size === 'phone') {
      await home.locator('.adestia-canvas').getByRole('button', { name: /^(Back to the chat|Revenir au chat)$/ }).first().click()
      await home.waitForSelector('.adestia-shell[data-screen="chat"]', { timeout: 5_000 })
      await expectBanner(home, 'chat shown')
      if ((await home.locator('.adestia-chat > .adestia-offline').count()) !== 1) fail(tag('chat shown'), 'the banner is not above the rail')
      await shoot(home, 'E-2-offline-chat')
      await toCanvas(home, size)
    }

    // E-14: press Restart with the server away — "Coming back…" and the banner together.
    await config.getByRole('button', { name: words.restart }).scrollIntoViewIfNeeded()
    await config.getByRole('button', { name: words.restart }).click()
    await config.getByRole('button', { name: words.coming }).waitFor({ timeout: 5_000 }).catch(() => fail(tag('E-14'), '« Coming back… » never shows'))
    await expectBanner(config, 'E-14 coming back')
    // Where the user is when the server goes: at the foot of the form, and the banner must still be on screen, under the header (not hidden by it, not floating below it).
    const seen = await banner(config).first().boundingBox()
    const bar = await config.locator('.adestia-canvas__header:visible').first().boundingBox()
    if (!seen || seen.y + seen.height <= 0 || seen.y >= SIZES[size].viewport.height || (bar && (seen.y < bar.y + bar.height - 1 || seen.y > bar.y + bar.height + 4))) {
      fail(tag('E-14'), `the banner is not on screen at the foot of the form (${JSON.stringify(seen)})`)
    }
    await shoot(config, 'E-14-coming-back')

    // ── The return ─────────────────────────────────────────────────────────
    await server.start()
    for (const [page, what] of [[home, 'E-2'], [doc, 'E-4'], [config, 'E-14']]) {
      await banner(page).first().waitFor({ state: 'detached', timeout: 20_000 }).catch(() => fail(tag(what), 'the banner stays after the server answers'))
      if (!(await page.evaluate(() => window.__benchNoReload === true))) fail(tag(what), 'the page was reloaded')
    }
    await config.getByRole('button', { name: words.coming }).waitFor({ state: 'detached', timeout: 20_000 }).catch(() => fail(tag('E-14'), '« Coming back… » stays after the server answers'))
    await shoot(home, 'E-2-back')
    await shoot(doc, 'E-4-back')
    await shoot(config, 'E-14-back')
  } catch (error) {
    fail(tag('run'), String(error.message).split('\n')[0])
  } finally {
    await context.close()
    // Whatever happened, the next variant starts from a running server.
    await server.start().catch(() => undefined)
  }
}

const browser = await chromium.launch({ args: ['--no-sandbox'] })
try {
  for (const skin of SKINS) for (const locale of LOCALES) {
    const data = await mkdtemp(join(tmpdir(), 'adestia-offline-'))
    const port = await freePort()
    const server = instance(skin, locale, port, data)
    try {
      const base = await server.start()
      for (const theme of THEMES) for (const size of Object.keys(SIZES)) {
        await visit(browser, base, server, skin, locale, theme, size)
        console.log(`done ${skin} ${locale} ${theme} ${size}`)
      }
    } finally {
      await server.stop()
      await rm(data, { recursive: true, force: true })
    }
  }
} finally { await browser.close() }

if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
console.log(`pictures in ${out}`)
