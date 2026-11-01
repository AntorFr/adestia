/**
 * E-16 in `adestia-ajouts-chat`: the list and the thread while loading and
 * failed (then Retry), and the context-lost line, on each skin × language ×
 * theme × desk/phone.
 *
 *   npm run build && node bench/scenarios/chat-ajouts.mjs
 *
 * Per skin × language it starts `node bench/launch.mjs --engine fake --seed
 * chat-ajouts` (no real engine, no token); the marked conversation is seeded
 * with `contextLost: true` on two agent messages. Checks, per variant:
 *
 *  - LIST slow / failed: `Loading` shows, no old rows beside it; 500 shows the
 *    message and Retry; Retry brings the rows; the composer stays on screen.
 *  - THREAD slow / failed: same for an adopted tab; the failure block does not
 *    swallow the composer (it sits above it, the input is disabled).
 *  - MARK: two `.adestia-thread__mark` notes with the locale's sentence, each
 *    above its message, neither overlapping nor cutting it, text not truncated,
 *    inside the viewport; the plain conversation has none.
 *
 * Pictures: `BENCH_OUT` (default `bench/shots-chat-ajouts`, ignored by git):
 * `<skin>/<locale>/<theme>-<viewport>/<state>.png`. `BENCH_SKINS`,
 * `BENCH_LOCALES` narrow the run. Exit 1 names each failed expectation.
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MARKED, PLAIN } from '../seed/chat-ajouts.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const out = resolve(process.env.BENCH_OUT ?? join(root, 'bench/shots-chat-ajouts'))

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
  en: { loading: /^Loading…$/, retry: /^Retry$/, mark: 'The engine no longer remembers the earlier messages.', list: 'Conversations' },
  fr: { loading: /^Chargement…$/, retry: /^Réessayer$/, mark: 'Le moteur ne se souvient plus des messages précédents.', list: 'Conversations' },
}

function launch(skin, locale) {
  const child = spawn(process.execPath, [join(root, 'bench/launch.mjs'), '--engine', 'fake', '--seed', 'chat-ajouts', '--skin', skin, '--locale', locale], {
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

/** Holds ('slow') or fails ('broken') GETs of `read` until `release()`. */
async function control(page, read, mode) {
  let open = false
  let release
  const released = new Promise((resolveRelease) => { release = () => { open = true; resolveRelease() } })
  await page.route(read, async (route) => {
    if (route.request().method() !== 'GET' || open) return route.continue()
    if (mode === 'slow') {
      await released
      return route.continue()
    }
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'bench: forced failure' }) })
  })
  return release
}

async function visit(browser, base, skin, locale, theme, size) {
  const dir = join(out, skin, locale, `${theme}-${size}`)
  await mkdir(dir, { recursive: true })
  const words = WORDS[locale]
  const context = await browser.newContext({
    ...SIZES[size], colorScheme: theme, locale: locale === 'fr' ? 'fr-FR' : 'en-US', ignoreHTTPSErrors: true,
  })
  const tabs = (id) => JSON.stringify({ open: [id], active: id })
  const fresh = async (openId) => {
    const page = await context.newPage()
    await page.addInitScript(([themeName, tabState]) => {
      try {
        localStorage.setItem('adestia.theme', themeName)
        if (tabState) localStorage.setItem('adestia.tabs', tabState)
      } catch { /* storage refused */ }
    }, [theme, openId ? tabs(openId) : undefined])
    return page
  }
  const tag = (what) => `${skin} ${locale} ${theme} ${size} ${what}`
  const shoot = async (page, name) => {
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(dir, `${name}.png`) })
  }
  const toChat = async (page) => {
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.adestia-chat', { timeout: 20_000 })
    // On a phone the rail is the first screen; on desk it is beside the canvas.
  }
  const openList = (page) => page.locator('.adestia-chat__header').getByRole('button', { name: words.list }).click()
  const retryButton = (page) => page.getByRole('button', { name: words.retry })
  const rowsSelector = '.adestia-conversations__item'
  /** The block above the composer must not cover it, and the input is disabled. */
  const composerIntact = async (page, name, block) => {
    const composer = await page.locator('.adestia-composer__input').first().boundingBox()
    const viewport = SIZES[size].viewport
    if (!composer) return fail(tag(name), 'the composer is not on screen')
    if (composer.y + composer.height > viewport.height + 1) fail(tag(name), 'the composer is pushed below the screen')
    if (block) {
      const box = await page.locator(block).first().boundingBox()
      if (box && box.y + box.height > composer.y + 1) fail(tag(name), 'the failure block runs into the composer')
    }
  }

  try {
    // ── list: slow ──
    {
      const page = await fresh()
      try {
        const release = await control(page, '**/api/conversations', 'slow')
        await toChat(page)
        await openList(page)
        await page.waitForSelector('.adestia-conversations .adestia-loading', { timeout: 10_000 })
        const row = (await page.locator('.adestia-loading').first().innerText()).trim()
        if (!words.loading.test(row)) fail(tag('list slow'), `the loading row says « ${row} »`)
        if (await page.locator(rowsSelector).count()) fail(tag('list slow'), 'rows show under the loading row')
        if (await page.locator('.adestia-conversations__empty').count()) fail(tag('list slow'), 'the empty state shows while loading')
        await composerIntact(page, 'list slow')
        await shoot(page, 'liste-chargement')
        release()
        await page.waitForSelector(rowsSelector, { timeout: 15_000 })
      } catch (error) { fail(tag('list slow'), String(error.message).split('\n')[0]) } finally { await page.close() }
    }
    // ── list: failed, then Retry ──
    {
      const page = await fresh()
      try {
        const ok = await control(page, '**/api/conversations', 'broken')
        await toChat(page)
        await openList(page)
        await retryButton(page).first().waitFor({ timeout: 10_000 })
        if (await page.locator(rowsSelector).count()) fail(tag('list failed'), 'rows show beside the failure')
        await composerIntact(page, 'list failed', '.adestia-empty--state')
        await shoot(page, 'liste-echec')
        ok()
        await retryButton(page).first().click()
        await page.waitForSelector(rowsSelector, { timeout: 15_000 })
        if (await retryButton(page).count()) fail(tag('list retry'), 'Retry still shows after the rows came')
        await shoot(page, 'liste-reessai')
      } catch (error) { fail(tag('list failed'), String(error.message).split('\n')[0]) } finally { await page.close() }
    }
    // ── thread: slow ──
    {
      const page = await fresh(MARKED)
      try {
        const release = await control(page, `**/api/conversations/${MARKED}`, 'slow')
        await toChat(page)
        await page.waitForSelector('.adestia-chat__conversation .adestia-loading', { timeout: 10_000 })
        if (await page.locator('.adestia-bubble').count()) fail(tag('thread slow'), 'bubbles show under the loading row')
        await composerIntact(page, 'thread slow')
        await shoot(page, 'fil-chargement')
        release()
        await page.waitForSelector('.adestia-bubble--agent', { timeout: 15_000 })
      } catch (error) { fail(tag('thread slow'), String(error.message).split('\n')[0]) } finally { await page.close() }
    }
    // ── thread: failed, then Retry ──
    {
      const page = await fresh(MARKED)
      try {
        const ok = await control(page, `**/api/conversations/${MARKED}`, 'broken')
        await toChat(page)
        await retryButton(page).first().waitFor({ timeout: 10_000 })
        if (await page.locator('.adestia-bubble').count()) fail(tag('thread failed'), 'bubbles show beside the failure')
        await composerIntact(page, 'thread failed', '.adestia-chat__conversation .adestia-empty--state')
        if (!(await page.locator('.adestia-composer__input').first().isDisabled().catch(() => false))
          && !(await page.locator('.adestia-composer__send').first().isDisabled())) fail(tag('thread failed'), 'the composer is usable on an unread thread')
        await shoot(page, 'fil-echec')
        ok()
        await retryButton(page).first().click()
        await page.waitForSelector('.adestia-bubble--agent', { timeout: 15_000 })
        if (await retryButton(page).count()) fail(tag('thread retry'), 'Retry still shows after the thread came')
        await shoot(page, 'fil-reessai')
      } catch (error) { fail(tag('thread failed'), String(error.message).split('\n')[0]) } finally { await page.close() }
    }
    // ── the mark ──
    {
      const page = await fresh(MARKED)
      try {
        await toChat(page)
        await page.waitForSelector('.adestia-thread__mark', { timeout: 15_000 })
        const marks = page.locator('.adestia-thread__mark')
        if ((await marks.count()) !== 2) fail(tag('mark'), `${await marks.count()} marks, 2 expected`)
        const viewport = SIZES[size].viewport
        for (let i = 0; i < (await marks.count()); i++) {
          const mark = marks.nth(i)
          await mark.scrollIntoViewIfNeeded()
          if ((await mark.getAttribute('role')) !== 'note') fail(tag(`mark ${i}`), 'role is not note')
          const text = (await mark.innerText()).trim()
          if (text !== words.mark) fail(tag(`mark ${i}`), `says « ${text} »`)
          const geometry = await mark.evaluate((el) => {
            const next = el.nextElementSibling
            const span = el.querySelector('span')
            const a = el.getBoundingClientRect()
            const b = next?.getBoundingClientRect()
            return {
              markBottom: a.bottom, markLeft: a.left, markRight: a.right,
              nextTop: b?.top, nextIsBubble: !!next?.classList.contains('adestia-bubble'),
              truncated: span.scrollWidth > span.clientWidth + 1 || getComputedStyle(span).textOverflow === 'ellipsis',
              hidden: getComputedStyle(span).overflow === 'hidden' && span.scrollHeight > span.clientHeight + 1,
            }
          })
          if (!geometry.nextIsBubble) fail(tag(`mark ${i}`), 'the mark is not directly above a bubble')
          if (geometry.nextTop !== undefined && geometry.markBottom > geometry.nextTop + 1) fail(tag(`mark ${i}`), 'the mark overlaps the message below')
          if (geometry.truncated || geometry.hidden) fail(tag(`mark ${i}`), 'the mark text is truncated')
          if (geometry.markLeft < -1 || geometry.markRight > viewport.width + 1) fail(tag(`mark ${i}`), 'the mark leaves the screen')
        }
        await marks.first().scrollIntoViewIfNeeded()
        await shoot(page, 'marque')
        await marks.last().scrollIntoViewIfNeeded()
        await shoot(page, 'marque-2')
      } catch (error) { fail(tag('mark'), String(error.message).split('\n')[0]) } finally { await page.close() }
    }
    // ── no mark without the flag ──
    {
      const page = await fresh(PLAIN)
      try {
        await toChat(page)
        await page.waitForSelector('.adestia-bubble--agent', { timeout: 15_000 })
        if (await page.locator('.adestia-thread__mark').count()) fail(tag('plain'), 'a mark shows on a conversation without one')
      } catch (error) { fail(tag('plain'), String(error.message).split('\n')[0]) } finally { await page.close() }
    }
  } finally {
    await context.close()
  }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-certificate-errors'] })
try {
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
} finally { await browser.close() }

if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
console.log(`pictures in ${out}`)
