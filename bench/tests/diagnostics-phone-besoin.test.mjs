/**
 * A diagnostic's « line N » on a phone (E-4, read-only page with its diagnostics, docs/ecrans.md):
 * at 390 px, Skippy, light, the words « line » and the number stay on one row, side by side,
 * and the message sits beside them, not under.
 *
 *   npm run build && node --test bench/tests/diagnostics-phone-besoin.test.mjs
 *
 * Playwright and Chromium come from the environment. Pictures land in `bench/shots-besoin/` (ignored).
 */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { loadPlaywright } from '../lib/playwright.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const shots = join(root, 'bench/shots-besoin')

const { chromium } = loadPlaywright()

function startInstance(locale) {
  return new Promise(async (resolveStart, reject) => {
    const data = await mkdtemp(join(tmpdir(), 'besoin-diag-'))
    const child = spawn('node', ['bench/launch.mjs', '--engine', 'fake', '--seed', 'pages', '--skin', 'skippy', '--locale', locale, '--data', data], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`instance did not start:\n${log}`)) }, 120_000)
    child.stdout.on('data', (chunk) => {
      log += chunk
      const match = /^listening on (http:\/\/\S+)$/m.exec(log)
      if (match) {
        clearTimeout(timer)
        resolveStart({
          url: match[1],
          pages: join(data, 'workspace', 'pages'),
          stop: () => new Promise((done) => { child.once('exit', done); child.kill('SIGTERM') }).then(() => rm(data, { recursive: true, force: true })),
        })
      }
    })
    child.stderr.on('data', (chunk) => { log += chunk })
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`instance exited ${code}:\n${log}`)) })
  })
}

for (const locale of ['en', 'fr']) {
  describe(`diagnostics on a 390 px phone, skippy light, ${locale}`, () => {
    const word = locale === 'en' ? 'line' : 'ligne'
    let instance
    let browser
    let page
    before(async () => {
      instance = await startInstance(locale)
      browser = await chromium.launch()
      page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale, colorScheme: 'light' })
      await page.addInitScript(() => { try { localStorage.setItem('adestia.theme', 'light') } catch { /* storage refused */ } })
    })
    after(async () => { await browser?.close(); await instance?.stop() })

    /** every « line N » label of the page: how many rows it takes, and whether the message is beside it */
    const labels = () => page.evaluate((w) => {
      const re = new RegExp(`^${w} \\d+$`)
      return [...document.querySelectorAll('main li')].flatMap((li) => {
        const span = [...li.querySelectorAll('span')].find((s) => s.children.length === 0 && re.test(s.textContent.trim()))
        if (!span) return []
        const range = document.createRange(); range.selectNodeContents(span)
        const rows = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size
        const box = span.getBoundingClientRect()
        const text = [...li.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
        const mr = document.createRange(); if (text) mr.selectNodeContents(text)
        const m = text ? mr.getClientRects()[0] : null
        return [{ text: span.textContent.trim(), rows, height: box.height, messageLeft: m?.left ?? null, labelRight: box.right, messageTop: m?.top ?? null, labelTop: box.top }]
      })
    }, word)

    const openReadonly = async (route) => {
      await page.goto('about:blank')
      await page.goto(`${instance.url}/#${route}`)
      await page.locator('.adestia-chat').first().waitFor({ state: 'visible', timeout: 20_000 })
      if ((await page.locator('.adestia-shell').getAttribute('data-screen')) !== 'canvas') {
        await page.locator('.adestia-chat__header button').last().click()
      }
      await page.waitForSelector('.adestia-shell[data-screen="canvas"]', { timeout: 10_000 })
      await page.locator('.adestia-diagnostics__item').first().waitFor({ state: 'visible', timeout: 20_000 })
      await page.waitForTimeout(1200)
    }

    test('E-4 · a diagnostic reads « line N » on one row, with its message beside it', async () => {
      await openReadonly('/page/blocs/vocabulaire-casse')
      await mkdir(join(shots, 'diag-phone'), { recursive: true })
      await page.screenshot({ path: join(shots, 'diag-phone', `skippy-light-${locale}.png`) })
      const found = await labels()
      assert.ok(found.length >= 1, 'at least one diagnostic with a line number')
      for (const l of found) {
        assert.equal(l.rows, 1, `« ${l.text} » is on ${l.rows} rows`)
        assert.ok(l.messageLeft >= l.labelRight - 1, `the message of « ${l.text} » starts beside the label, not under it`)
        assert.ok(Math.abs(l.messageTop - l.labelTop) < 30, `the message of « ${l.text} » starts on the label's row`)
      }
    })

    test('E-4 · bord: a three-digit line number stays on one row too', async () => {
      const dir = join(instance.pages, 'besoin-diag')
      await mkdir(dir, { recursive: true })
      const body = `${'Un paragraphe.\n\n'.repeat(60)}:::table{w=beaucoup}\n| a | b |\n|---|---|\n| 1 | 2 |\n:::\n`
      await writeFile(join(dir, 'longue.md'), `---\ntitle: Longue\ntype: fiche\n---\n\n${body}`)
      await openReadonly('/page/besoin-diag/longue')
      const found = await labels()
      assert.ok(found.length >= 1, 'a diagnostic with a line number')
      assert.ok(found.some((l) => /\d{3}$/.test(l.text)), `a three-digit line among ${JSON.stringify(found.map((l) => l.text))}`)
      for (const l of found) assert.equal(l.rows, 1, `« ${l.text} » is on ${l.rows} rows`)
    })
  })
}
