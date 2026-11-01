/**
 * B-18 for the plugins' screens E-25 (Atelier hub and workbook) and E-28 (Parcours: page, `:::parcours`
 * card, link view): a loading row before the data, and on a failed fetch a message and Retry that fetches
 * again. Driven through a real browser on a real instance of the `plugins` seed; the server's answer is
 * held, refused or dropped by the browser's network layer (the instance itself stays real).
 *
 *   npm run build && node --test bench/tests/plugins-chargements-ensemble.test.mjs
 *
 * `ENSEMBLE_SKINS=alfred` and `ENSEMBLE_LOCALES=fr` narrow the matrix. Pictures land in
 * `bench/shots-ensemble-plugins-chargements/` (ignored by git). Every expected word is written by hand from
 * docs/ecrans.md § « E-25 and E-28: loading and Retry, in detail » and docs/parcours.md B-18.
 */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { loadPlaywright } from '../lib/playwright.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const shots = join(root, 'bench/shots-ensemble-plugins-chargements')
const { chromium } = loadPlaywright()

const SKINS = (process.env.ENSEMBLE_SKINS ?? 'alfred,dobby,nestor,skippy').split(',')
const LOCALES = (process.env.ENSEMBLE_LOCALES ?? 'en,fr').split(',')

/** docs/ecrans.md, « Texts ». */
const WORDS = {
  en: { loading: 'Loading…', retry: 'Retry', hub: 'The Workshop is unavailable.', workbook: 'Unreadable workbook.', route: 'Unreadable route.' },
  fr: { loading: 'Chargement…', retry: 'Réessayer', hub: 'Atelier indisponible.', workbook: 'Workbook illisible.', route: 'Parcours illisible.' },
}

// What the seed stores (user content, the same in both languages).
const HUB_DATA = 'Meuble à tiroirs — bureau (caisson seul)'
const WORKBOOK_DATA = 'A1-BAS'
const ROUTE_DATA = 'Le Val sans Retour — boucle depuis le gîte'

function startInstance(skin, locale) {
  return new Promise(async (resolveStart, reject) => {
    const data = await mkdtemp(join(tmpdir(), 'ensemble-pc-'))
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

/** Decides what the browser gets for the requests matching `re`: ok | hold | fail(status) | drop. */
function control(page, re) {
  const c = { mode: 'ok', status: 500, hits: 0, gates: [] }
  c.release = () => { c.mode = 'ok'; c.gates.splice(0).forEach((open) => open()) }
  c.fail = (status = 500) => { c.mode = 'fail'; c.status = status }
  page.route(re, async (route) => {
    c.hits++
    if (c.mode === 'hold') { await new Promise((open) => c.gates.push(open)); return route.continue().catch(() => {}) }
    if (c.mode === 'fail') return route.fulfill({ status: c.status, contentType: 'application/json', body: '{"error":"boom-secret"}' })
    if (c.mode === 'drop') return route.abort('connectionreset')
    return route.continue()
  })
  return c
}

const HUB = /\/api\/plugin\/atelier\/workbooks(\?|$)/
const WB = /\/api\/plugin\/atelier\/workbook\?/
const STATE = /\/api\/plugin\/atelier\/state\?/
const LAYOUT = /\/api\/plugin\/atelier\/layout\?/
const ROUTE = /\/api\/files\/.*\.parcours\.json/

for (const skin of SKINS) {
  for (const locale of LOCALES) {
    describe(`plugins loading and Retry · ${skin} · ${locale}`, () => {
      const w = WORDS[locale]
      let instance
      let browser
      let context
      let page

      before(async () => {
        instance = await startInstance(skin, locale)
        browser = await chromium.launch()
      })
      after(async () => {
        await browser?.close()
        await instance?.stop()
      })

      const fresh = async (viewport = { width: 1440, height: 900 }) => {
        await context?.close()
        context = await browser.newContext({ viewport, locale, colorScheme: 'light' })
        page = await context.newPage()
      }
      const go = async (hash) => { await page.goto('about:blank'); await page.goto(`${instance.url}/#/${hash}`) }
      const shot = async (name) => { await mkdir(join(shots, skin, locale), { recursive: true }); await page.screenshot({ path: join(shots, skin, locale, `${name}.png`) }) }
      const seen = (loc) => loc.first().waitFor({ state: 'visible', timeout: 15_000 })
      const gone = (loc) => loc.first().waitFor({ state: 'hidden', timeout: 15_000 })
      const text = (t) => page.getByText(t, { exact: true })
      const loadingRow = () => page.locator('.adestia-loading', { hasText: new RegExp(`^\\s*${w.loading}\\s*$`) })
      const retry = () => page.getByRole('button', { name: w.retry, exact: true })
      /** The held request has reached the browser's network layer: the screen is now truly waiting for its data. */
      const waiting = async (c) => { for (let i = 0; i < 150 && c.gates.length === 0; i++) await page.waitForTimeout(100); assert.ok(c.gates.length > 0, 'the fetch was never issued') }
      const nothingFor = async (loc, ms = 1500) => {
        await page.waitForTimeout(ms)
        assert.equal(await loc.count(), 0)
      }

      /** Failure block: message visible, Retry is the plain shell button (no icon). */
      const failedWith = async (message) => {
        await seen(text(message))
        await seen(retry())
        assert.equal(await retry().count(), 1)
        assert.match((await retry().getAttribute('class')) ?? '', /\badestia-btn\b/)
        assert.equal(await retry().locator('svg').count(), 0, 'the plugins\' Retry carries no icon')
      }

      // ── E-25 hub ────────────────────────────────────────────────────────
      describe('E-25 hub', () => {
        test('shows the loading row before its data, then the workbooks', async () => {
          await fresh()
          const hub = control(page, HUB)
          hub.mode = 'hold'
          await go('atelier')
          await waiting(hub)
          await seen(loadingRow())
          assert.equal(await text(HUB_DATA).count(), 0, 'no data while the answer is awaited')
          assert.equal(await text(w.hub).count(), 0)
          await shot('hub-loading')
          hub.release()
          await seen(text(HUB_DATA))
          await gone(loadingRow())
          await shot('hub-data')
        })

        for (const status of [500, 404]) {
          test(`a ${status} answer gives message and Retry, and Retry reloads the workbooks`, async () => {
            await fresh()
            const hub = control(page, HUB)
            hub.fail(status)
            await go('atelier')
            await failedWith(w.hub)
            assert.equal(await text(HUB_DATA).count(), 0)
            assert.equal(await loadingRow().count(), 0)
            if (status === 500) await shot('hub-failed')
            hub.release()
            await retry().click()
            await seen(text(HUB_DATA))
            await gone(text(w.hub))
            assert.equal(await retry().count(), 0)
          })
        }

        test('a dropped connection gives the same message and Retry', async () => {
          await fresh()
          const hub = control(page, HUB)
          hub.mode = 'drop'
          await go('atelier')
          await failedWith(w.hub)
          hub.release()
          await retry().click()
          await seen(text(HUB_DATA))
        })

        test('while Retry fetches, the screen is back on the loading row and the button is gone', async () => {
          await fresh()
          const hub = control(page, HUB)
          hub.fail()
          await go('atelier')
          await failedWith(w.hub)
          hub.mode = 'hold'
          const before = hub.hits
          await retry().click()
          await waiting(hub)
          await seen(loadingRow())
          assert.equal(await retry().count(), 0)
          assert.equal(await text(w.hub).count(), 0)
          hub.release()
          await seen(text(HUB_DATA))
          assert.ok(hub.hits > before, 'Retry fetched again')
        })

        test('Retry failing again keeps message and Retry', async () => {
          await fresh()
          const hub = control(page, HUB)
          hub.fail()
          await go('atelier')
          await failedWith(w.hub)
          const before = hub.hits
          await retry().click()
          await page.waitForFunction(() => true)
          for (let i = 0; i < 50 && hub.hits === before; i++) await page.waitForTimeout(100)
          assert.ok(hub.hits > before)
          await failedWith(w.hub)
        })

        test('with a healthy server there is neither failure nor loading row left', async () => {
          await fresh()
          await go('atelier')
          await seen(text(HUB_DATA))
          await nothingFor(page.getByText(w.hub, { exact: true }))
          await nothingFor(retry(), 0)
          await nothingFor(loadingRow(), 0)
        })
      })

      // ── E-25 workbook ───────────────────────────────────────────────────
      describe('E-25 workbook', () => {
        const open = () => go('atelier/projets/caisson')

        test('shows the loading row before its data, then the workbook', async () => {
          await fresh()
          const wb = control(page, WB)
          wb.mode = 'hold'
          await open()
          await waiting(wb)
          await seen(loadingRow())
          assert.equal(await text(WORKBOOK_DATA).count(), 0)
          await shot('workbook-loading')
          wb.release()
          await seen(text(WORKBOOK_DATA))
          await gone(loadingRow())
          await shot('workbook-data')
        })

        test('a failing /workbook gives « Unreadable workbook. » without the raw error, and Retry draws the workbook', async () => {
          await fresh()
          const wb = control(page, WB)
          wb.fail(500)
          await open()
          await failedWith(w.workbook)
          const body = await page.locator('body').innerText()
          assert.ok(!/boom-secret|HTTP 500|Error/i.test(body), `raw error text shown: ${body}`)
          await shot('workbook-failed')
          wb.release()
          await retry().click()
          await seen(text(WORKBOOK_DATA))
          await gone(text(w.workbook))
        })

        test('a failing /state alone fails the whole workbook', async () => {
          await fresh()
          const st = control(page, STATE)
          st.fail(500)
          await open()
          await failedWith(w.workbook)
          assert.equal(await text(WORKBOOK_DATA).count(), 0)
          st.release()
          await retry().click()
          await seen(text(WORKBOOK_DATA))
        })

        test('a failing /layout alone is tolerated: the workbook shows, no failure', async () => {
          await fresh()
          const lay = control(page, LAYOUT)
          lay.fail(500)
          await open()
          await seen(text(WORKBOOK_DATA))
          assert.equal(await text(w.workbook).count(), 0)
          assert.equal(await retry().count(), 0)
        })

        test('a dropped connection on /workbook gives message and Retry', async () => {
          await fresh()
          const wb = control(page, WB)
          wb.mode = 'drop'
          await open()
          await failedWith(w.workbook)
          wb.release()
          await retry().click()
          await seen(text(WORKBOOK_DATA))
        })

        test('while Retry fetches, the loading row replaces the failure block', async () => {
          await fresh()
          const wb = control(page, WB)
          wb.fail()
          await open()
          await failedWith(w.workbook)
          wb.mode = 'hold'
          await retry().click()
          await waiting(wb)
          await seen(loadingRow())
          assert.equal(await retry().count(), 0)
          wb.release()
          await seen(text(WORKBOOK_DATA))
        })
      })

      // ── E-28 Parcours ───────────────────────────────────────────────────
      describe('E-28 Parcours', () => {
        const mapPage = () => go('parcours/balades/assets/val-sans-retour.parcours.json')

        test('the map page shows the loading row before the map', async () => {
          await fresh()
          const r = control(page, ROUTE)
          r.mode = 'hold'
          await mapPage()
          await waiting(r)
          await seen(loadingRow())
          assert.equal(await text(ROUTE_DATA).count(), 0)
          await shot('parcours-loading')
          r.release()
          await seen(text(ROUTE_DATA))
          await gone(loadingRow())
          await shot('parcours-data')
        })

        test('a 500 gives « Unreadable route. » and Retry, which fetches again and draws the map', async () => {
          await fresh()
          const r = control(page, ROUTE)
          r.fail(500)
          await mapPage()
          await failedWith(w.route)
          assert.equal(await text(ROUTE_DATA).count(), 0)
          await shot('parcours-failed')
          r.mode = 'hold'
          const before = r.hits
          await retry().click()
          await waiting(r)
          await seen(loadingRow())
          assert.equal(await retry().count(), 0, 'no second press possible while fetching')
          r.release()
          await seen(text(ROUTE_DATA))
          await gone(text(w.route))
          assert.ok(r.hits > before)
        })

        test('a dropped connection gives message and Retry', async () => {
          await fresh()
          const r = control(page, ROUTE)
          r.mode = 'drop'
          await mapPage()
          await failedWith(w.route)
          r.release()
          await retry().click()
          await seen(text(ROUTE_DATA))
        })

        for (const status of [404, 401, 403]) {
          test(`a ${status} shows the message without Retry`, async () => {
            await fresh()
            const r = control(page, ROUTE)
            r.fail(status)
            await mapPage()
            await seen(text(w.route))
            await page.waitForTimeout(1000)
            assert.equal(await retry().count(), 0)
            assert.equal(await loadingRow().count(), 0)
          })
        }

        test('the card of a :::parcours block on a page shows the loading row, then the route', async () => {
          await fresh()
          const r = control(page, ROUTE)
          r.mode = 'hold'
          await go('page/balades/val-sans-retour')
          await waiting(r)
          await seen(loadingRow())
          assert.equal(await text(ROUTE_DATA).count(), 0)
          r.release()
          await seen(text(ROUTE_DATA))
          await gone(loadingRow())
        })

        test('the card of a :::parcours block on a page fails with message and Retry, which draws the route', async () => {
          await fresh()
          const r = control(page, ROUTE)
          r.fail(500)
          await go('page/balades/val-sans-retour')
          await failedWith(w.route)
          await shot('block-failed')
          r.release()
          await retry().click()
          await seen(text(ROUTE_DATA))
          await gone(text(w.route))
        })

        test('the link view fails on one line: message and Retry side by side, and Retry draws the link', async () => {
          await fresh()
          const r = control(page, ROUTE)
          r.fail(500)
          await go('page/balades/week-end')
          await failedWith(w.route)
          const m = await text(w.route).boundingBox()
          const b = await retry().boundingBox()
          assert.ok(b.y < m.y + m.height && m.y < b.y + b.height, `Retry (${b.y}) is not on the message line (${m.y})`)
          await shot('link-failed')
          r.release()
          await retry().click()
          await seen(page.getByText(ROUTE_DATA))
          await gone(text(w.route))
        })

        test('the link view shows the loading row while it waits', async () => {
          await fresh()
          const r = control(page, ROUTE)
          r.mode = 'hold'
          await go('page/balades/week-end')
          await waiting(r)
          await seen(loadingRow())
          r.release()
          await seen(page.getByText(ROUTE_DATA))
        })

        test('on a phone the failure sentence is whole and Retry sits under it, full width', async () => {
          await fresh({ width: 390, height: 844 })
          const r = control(page, ROUTE)
          r.fail(500)
          await mapPage()
          await failedWith(w.route)
          const m = await text(w.route).boundingBox()
          const b = await retry().boundingBox()
          assert.ok(b.y >= m.y + m.height - 1, `Retry (${b.y}) must be under the sentence (ends ${m.y + m.height})`)
          assert.ok(b.width >= 0.75 * 390, `Retry is ${b.width}px wide on a 390px phone`)
          const clipped = await text(w.route).evaluate((el) => el.scrollWidth > el.clientWidth + 1 || getComputedStyle(el).textOverflow === 'ellipsis')
          assert.equal(clipped, false, 'the sentence is truncated')
          await shot('parcours-failed-phone')
        })
      })

      // ── E-25 hub on a phone ─────────────────────────────────────────────
      test('E-25 on a phone: the failure sentence is whole and Retry sits under it', async () => {
        await fresh({ width: 390, height: 844 })
        const hub = control(page, HUB)
        hub.fail()
        await go('atelier')
        await failedWith(w.hub)
        const m = await text(w.hub).boundingBox()
        const b = await retry().boundingBox()
        assert.ok(b.y >= m.y + m.height - 1)
        assert.ok(b.width >= 0.75 * 390, `Retry is ${b.width}px wide`)
        await shot('hub-failed-phone')
      })
    })
  }
}
