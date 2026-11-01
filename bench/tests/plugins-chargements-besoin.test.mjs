/**
 * B-18 for the plugins' screens E-25 (Atelier hub and workbook) and E-28 (route map: its own
 * screen, the `:::parcours` block in a page, the link view), against the need, through a real
 * browser on a real instance of the `plugins` seed (scripted engine, as the bench does).
 *
 *   npm run build && node --test bench/tests/plugins-chargements-besoin.test.mjs
 *
 * Playwright and Chromium come from the environment (`/usr/lib/node_modules` or `npm root -g`).
 * `BESOIN_SKINS=alfred,dobby` and `BESOIN_LOCALES=fr` narrow the matrix; pictures land in
 * `bench/shots-besoin-chargements/` (ignored by git). Every expected word is written by hand from
 * docs/ecrans.md § « E-25 and E-28: loading and Retry, in detail ».
 *
 * A read is slowed, broken or cut with `page.route` on the one request the screen waits for;
 * the test always waits for what the user sees (the loading row, the message, the data), never
 * for a delay.
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const shots = join(root, 'bench/shots-besoin-chargements')

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

const SKINS = (process.env.BESOIN_SKINS ?? 'alfred,dobby,nestor,skippy').split(',')
const LOCALES = (process.env.BESOIN_LOCALES ?? 'en,fr').split(',')

const WORDS = {
  en: { loading: 'Loading…', retry: 'Retry', hub: 'The Workshop is unavailable.', workbook: 'Unreadable workbook.', route: 'Unreadable route.' },
  fr: { loading: 'Chargement…', retry: 'Réessayer', hub: 'Atelier indisponible.', workbook: 'Workbook illisible.', route: 'Parcours illisible.' },
}

const HUB = 'atelier'
const WORKBOOK = 'atelier/projets/caisson'
const HUB_DATA = 'Meuble à tiroirs — bureau (caisson seul)'
const ROUTE_DATA = 'Le Val sans Retour — boucle depuis le gîte'
const RAW = 'bench-raw-server-sentence'
const SCREENS = [
  { name: 'own screen', hash: 'parcours/balades/assets/val-sans-retour.parcours.json' },
  { name: 'block in a page', hash: 'page/balades/val-sans-retour' },
  { name: 'link view', hash: 'page/balades/week-end' },
]

const READ = {
  hub: /\/api\/plugin\/atelier\/workbooks(\?|$)/,
  workbook: /\/api\/plugin\/atelier\/workbook\?/,
  state: /\/api\/plugin\/atelier\/state\?/,
  layout: /\/api\/plugin\/atelier\/layout\?/,
  route: /\/val-sans-retour\.parcours\.json(\?|$)/,
}

function startInstance(skin, locale) {
  return new Promise(async (resolveStart, reject) => {
    const data = await mkdtemp(join(tmpdir(), 'besoin-chg-'))
    const child = spawn('node', ['bench/launch.mjs', '--engine', 'fake', '--seed', 'plugins', '--skin', skin, '--locale', locale, '--data', data], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`instance did not start:\n${log}`)) }, 120_000)
    child.stdout.on('data', (chunk) => {
      log += chunk
      const match = /^listening on (http:\/\/\S+)$/m.exec(log)
      if (match) {
        clearTimeout(timer)
        resolveStart({ url: match[1], stop: () => new Promise((done) => { child.once('exit', done); child.kill('SIGTERM') }).then(() => rm(data, { recursive: true, force: true })) })
      }
    })
    child.stderr.on('data', (chunk) => { log += chunk })
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`instance exited ${code}:\n${log}`)) })
  })
}

/**
 * Takes over the GETs of one read. Modes: 'pass', 'hold' (until set('pass')), 'abort' (network
 * error), or a status number (the server answers with that status and a raw sentence).
 */
async function gate(page, re, mode = 'pass') {
  const waiting = []
  const state = { mode, hits: 0 }
  await page.route(re, async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    state.hits += 1
    if (state.mode === 'pass') return route.continue()
    if (state.mode === 'hold') { await new Promise((release) => waiting.push(release)); return route.continue() }
    if (state.mode === 'abort') return route.abort('failed')
    return route.fulfill({ status: state.mode, contentType: 'application/json', body: JSON.stringify({ error: RAW }) })
  })
  state.set = (next) => { state.mode = next; if (next === 'pass') waiting.splice(0).forEach((release) => release()) }
  return state
}

for (const skin of SKINS) {
  for (const locale of LOCALES) {
    describe(`plugins loading and Retry on skin ${skin}, ${locale}`, () => {
      const w = WORDS[locale]
      let instance
      let browser
      let page
      const picture = async (name) => {
        await mkdir(join(shots, skin, locale), { recursive: true })
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({ path: join(shots, skin, locale, `${name}.png`) })
      }
      const loading = () => page.getByText(w.loading, { exact: true })
      const retry = () => page.getByRole('button', { name: w.retry, exact: true })
      const sentence = (text) => page.getByText(text, { exact: true })
      const go = async (hash) => {
        await page.goto('about:blank')
        await page.goto(`${instance.url}/#/${hash}`)
      }

      before(async () => {
        instance = await startInstance(skin, locale)
        browser = await chromium.launch()
      })
      after(async () => { await browser?.close(); await instance?.stop() })
      const fresh = async (viewport = { width: 1440, height: 900 }, scheme = 'light') => {
        await page?.context().close()
        const context = await browser.newContext({ viewport, locale, colorScheme: scheme, hasTouch: viewport.width < 600 })
        await context.addInitScript((theme) => { try { localStorage.setItem('adestia.theme', theme) } catch { /* refused */ } }, scheme)
        page = await context.newPage()
      }
      // each test starts on its own page, so no route leaks from one to the next
      const start = (viewport, scheme) => fresh(viewport, scheme)

      // ── E-25 hub ────────────────────────────────────────────────────────────────
      // nominal. Breaks if the hub keeps its bare « loading… » text instead of the shell's row.
      test('E-25 hub: a loading row shows before the workbooks, then the workbooks replace it', async () => {
        await start()
        const hub = await gate(page, READ.hub, 'hold')
        await go(HUB)
        await loading().waitFor({ state: 'visible' })
        assert.equal(await page.getByText(HUB_DATA).count(), 0, 'no data before the answer')
        assert.equal(await retry().count(), 0, 'no Retry while loading')
        assert.equal(await page.getByText(/loading…|chargement…/i).count(), 1, 'one loading text only, in the shell form')
        await picture('E-25-hub-loading')
        hub.set('pass')
        await page.getByText(HUB_DATA).first().waitFor({ state: 'visible' })
        assert.equal(await loading().count(), 0)
      })

      // bords: a refused answer (500, 404) and a cut network each count as a failure; the server's own
      // sentence is not shown by a plugin.
      for (const failing of [500, 404, 'abort']) {
        test(`E-25 hub: ${failing === 'abort' ? 'a cut network' : `a ${failing} answer`} gives the message and Retry, and Retry loads the workbooks`, async () => {
          await start()
          const hub = await gate(page, READ.hub, failing)
          await go(HUB)
          await sentence(w.hub).waitFor({ state: 'visible' })
          await retry().waitFor({ state: 'visible' })
          assert.equal(await page.getByText(RAW).count(), 0, 'the server sentence is not shown')
          assert.equal(await loading().count(), 0, 'failure block and loading row never both')
          assert.equal(await page.getByText(HUB_DATA).count(), 0)
          await picture(`E-25-hub-failed-${failing}`)
          // Retry gives way to the loading row, for exactly what it replaced, and cannot be pressed twice
          hub.set('hold')
          await retry().click()
          await loading().waitFor({ state: 'visible' })
          assert.equal(await retry().count(), 0, 'Retry is gone while it fetches')
          assert.equal(await sentence(w.hub).count(), 0, 'the message is gone while it fetches')
          hub.set('pass')
          await page.getByText(HUB_DATA).first().waitFor({ state: 'visible' })
          assert.equal(await sentence(w.hub).count(), 0)
          assert.equal(await retry().count(), 0)
          assert.equal(await loading().count(), 0)
        })
      }

      // échec: Retry when the server still fails brings the failure back, and Retry again then works.
      test('E-25 hub: Retry while the server still fails shows the failure again; a second Retry then loads', async () => {
        await start()
        const hub = await gate(page, READ.hub, 500)
        await go(HUB)
        await retry().waitFor({ state: 'visible' })
        const before = hub.hits
        const answered = page.waitForResponse((r) => READ.hub.test(r.url()))
        await retry().click()
        assert.equal((await answered).status(), 500)
        await retry().waitFor({ state: 'visible' })
        assert.equal(hub.hits, before + 1, 'Retry fetched again, once')
        assert.equal(await sentence(w.hub).count(), 1)
        hub.set('pass')
        await retry().click()
        await page.getByText(HUB_DATA).first().waitFor({ state: 'visible' })
      })

      // dark capture of the failure block, for the skin
      test('E-25 hub: the failure block is drawn in the dark too', async () => {
        await start({ width: 1440, height: 900 }, 'dark')
        await gate(page, READ.hub, 500)
        await go(HUB)
        await retry().waitFor({ state: 'visible' })
        await picture('E-25-hub-failed-dark')
        assert.equal(await sentence(w.hub).isVisible(), true)
      })

      // ── E-25 workbook ───────────────────────────────────────────────────────────
      test('E-25 workbook: a loading row shows before the workbook, then the workbook replaces it', async () => {
        await start()
        const wb = await gate(page, READ.workbook, 'hold')
        await go(WORKBOOK)
        await loading().waitFor({ state: 'visible' })
        assert.equal(await page.locator('.shopmode').count(), 0, 'no workbook before the answer')
        assert.equal(await retry().count(), 0)
        await picture('E-25-workbook-loading')
        wb.set('pass')
        await page.locator('.shopmode').first().waitFor({ state: 'visible' })
        assert.equal(await loading().count(), 0)
      })

      // bords: workbook fails, or workbook answers but state fails (the whole workbook counts as failed)
      for (const [read, failing] of [['workbook', 500], ['workbook', 'abort'], ['state', 500], ['state', 'abort']]) {
        test(`E-25 workbook: ${read} ${failing === 'abort' ? 'cut' : `answering ${failing}`} gives the message and Retry, without the raw error; Retry reloads`, async () => {
          await start()
          const broken = await gate(page, READ[read], failing)
          await go(WORKBOOK)
          await sentence(w.workbook).waitFor({ state: 'visible' })
          await retry().waitFor({ state: 'visible' })
          assert.equal(await page.getByText(RAW).count(), 0, 'the raw error text is not shown')
          assert.equal(await page.locator('.shopmode').count(), 0, 'a half workbook is not drawn')
          assert.equal(await loading().count(), 0)
          await picture(`E-25-workbook-failed-${read}`)
          broken.set('hold')
          await retry().click()
          await loading().waitFor({ state: 'visible' })
          assert.equal(await retry().count(), 0)
          assert.equal(await sentence(w.workbook).count(), 0)
          broken.set('pass')
          await page.locator('.shopmode').first().waitFor({ state: 'visible' })
          assert.equal(await sentence(w.workbook).count(), 0)
        })
      }

      // exclusion: /layout failing alone is tolerated, as before
      test('E-25 workbook: the layout failing alone does not fail the workbook', async () => {
        await start()
        await gate(page, READ.layout, 500)
        await go(WORKBOOK)
        await page.locator('.shopmode').first().waitFor({ state: 'visible' })
        assert.equal(await sentence(w.workbook).count(), 0)
        assert.equal(await retry().count(), 0)
      })

      // ── E-28 route map: the three places it is drawn ───────────────────────────
      for (const screen of SCREENS) {
        test(`E-28 ${screen.name}: a loading row shows before the route, then the route replaces it`, async () => {
          await start()
          const route = await gate(page, READ.route, 'hold')
          await go(screen.hash)
          await loading().waitFor({ state: 'visible' })
          assert.equal(await page.getByText(ROUTE_DATA).count(), 0, 'no route before the answer')
          assert.equal(await retry().count(), 0)
          await picture(`E-28-${screen.name.replace(/ /g, '-')}-loading`)
          route.set('pass')
          await page.getByText(ROUTE_DATA).first().waitFor({ state: 'visible' })
          assert.equal(await loading().count(), 0)
        })

        for (const failing of [500, 'abort']) {
          test(`E-28 ${screen.name}: ${failing === 'abort' ? 'a cut network' : `a ${failing} answer`} gives the message and Retry, and Retry fetches again into the same place`, async () => {
            await start()
            const route = await gate(page, READ.route, failing)
            await go(screen.hash)
            await sentence(w.route).waitFor({ state: 'visible' })
            await retry().waitFor({ state: 'visible' })
            assert.equal(await page.getByText(RAW).count(), 0, 'the server sentence is not shown')
            assert.equal(await loading().count(), 0)
            await picture(`E-28-${screen.name.replace(/ /g, '-')}-failed-${failing}`)
            route.set('hold')
            await retry().click()
            await loading().waitFor({ state: 'visible' })
            assert.equal(await retry().count(), 0, 'Retry is gone while it fetches')
            assert.equal(await sentence(w.route).count(), 0)
            route.set('pass')
            await page.getByText(ROUTE_DATA).first().waitFor({ state: 'visible' })
            assert.equal(await sentence(w.route).count(), 0)
            assert.equal(await loading().count(), 0)
          })
        }

        // exclusion: Retry cannot change a 404 or a refusal, so it is absent (not refused)
        for (const refusal of [404, 401, 403]) {
          test(`E-28 ${screen.name}: a ${refusal} says the message and offers no Retry`, async () => {
            await start()
            await gate(page, READ.route, refusal)
            await go(screen.hash)
            await sentence(w.route).waitFor({ state: 'visible' })
            assert.equal(await retry().count(), 0)
            assert.equal(await loading().count(), 0)
          })
        }
      }

      // bords: the link view says the same on its one line, Retry beside the sentence
      test('E-28 link view: the sentence and Retry share one line', async () => {
        await start()
        await gate(page, READ.route, 500)
        await go('page/balades/week-end')
        const message = sentence(w.route)
        await message.waitFor({ state: 'visible' })
        await retry().waitFor({ state: 'visible' })
        const m = await message.boundingBox()
        const r = await retry().boundingBox()
        assert.ok(Math.abs((m.y + m.height / 2) - (r.y + r.height / 2)) < Math.max(m.height, r.height), `same line: message ${JSON.stringify(m)}, Retry ${JSON.stringify(r)}`)
        assert.ok(r.x >= m.x + m.width - 1, 'Retry sits beside the sentence, after it')
      })

      // ── long content: phone, fr — the sentence wraps untruncated, Retry under it, full width ──
      if (locale === 'fr') {
        const cases = [
          ['E-25 hub', HUB, READ.hub, () => w.hub],
          ['E-25 workbook', WORKBOOK, READ.workbook, () => w.workbook],
          ['E-28 own screen', SCREENS[0].hash, READ.route, () => w.route],
          ['E-28 block in a page', SCREENS[1].hash, READ.route, () => w.route],
        ]
        for (const [name, hash, read, text] of cases) {
          test(`${name} on a phone: the failure sentence is whole and Retry sits under it, the width of the block`, async () => {
            await start({ width: 390, height: 844 })
            await gate(page, read, 500)
            await go(hash)
            await page.waitForSelector('.adestia-shell')
            if ((await page.locator('.adestia-shell').getAttribute('data-screen')) !== 'canvas') {
              await page.locator('.adestia-chat__header').getByRole('button', { name: /^(Open apps|Ouvrir les apps)$/ }).click()
              await page.waitForSelector('.adestia-shell[data-screen="canvas"]')
            }
            const message = sentence(text())
            await message.waitFor({ state: 'visible' })
            await retry().waitFor({ state: 'visible' })
            await picture(`${name.replace(/ /g, '-')}-failed-phone`)
            const clipped = await message.evaluate((el) => {
              const style = getComputedStyle(el)
              return el.scrollWidth > el.clientWidth + 1 || style.textOverflow === 'ellipsis' || style.webkitLineClamp !== 'none' && style.webkitLineClamp !== ''
            })
            assert.equal(clipped, false, 'the sentence is not truncated')
            const m = await message.boundingBox()
            const r = await retry().boundingBox()
            assert.ok(r.y >= m.y + m.height - 1, `Retry is under the sentence: message ${JSON.stringify(m)}, Retry ${JSON.stringify(r)}`)
            const block = await message.evaluate((el) => {
              const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Réessayer')
              let up = el.parentElement
              while (up && !up.contains(button)) up = up.parentElement
              return { width: up.getBoundingClientRect().width }
            })
            assert.ok(block.width > 200, `the failure block is the width of the screen body, was ${block.width}`)
            assert.ok(r.width >= block.width * 0.9, `Retry fills its block: ${r.width} of ${block.width}`)
            const viewport = page.viewportSize().width
            assert.ok(r.x >= 0 && r.x + r.width <= viewport, 'Retry stays inside the phone')
          })
        }
      }
    })
  }
}
