/**
 * E-30 on a phone: the scan reader closes, the composer's field has the focus.
 *
 * The scan button lives in the composer's `More` fold. Choosing it closes the
 * menu and removes the button, so when the reader closes there is no opener
 * left: the focus must land on the composer's field, not on the page body.
 *
 * Host:   BENCH_URL=http://127.0.0.1:<port> BENCH_OUT=<dir> node bench/scenarios/scan-focus.mjs
 * Seed:   plugins (the scan feature on); the camera is Chromium's fake device.
 */
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

import { CONVERSATIONS } from '../seed/_base.mjs'

export const seed = 'plugins'

function playwright() {
  for (const root of ['/usr/lib/node_modules', execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()]) {
    for (const name of ['playwright', 'playwright-core']) {
      try { return createRequire(`${root}/`)(name) } catch { /* next root */ }
    }
  }
  throw new Error('Playwright must come from the environment')
}

const base = process.env.BENCH_URL
const out = process.env.BENCH_OUT ?? 'bench/shots'
assert.ok(base, 'BENCH_URL is required')
await mkdir(out, { recursive: true })

const browser = await playwright().chromium.launch({
  args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
})
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  permissions: ['camera'],
})
const page = await context.newPage()
const id = CONVERSATIONS.idle
await page.addInitScript((tabs) => {
  localStorage.setItem('adestia.tabs', tabs)
}, JSON.stringify({ open: [id], active: id }))
await page.goto(base)

await page.waitForSelector('.adestia-fold', { timeout: 15_000 })
await page.locator('.adestia-fold > .adestia-composer__attach').click()
await page.locator('.adestia-fold__item', { hasText: /scan/i }).click()
await page.waitForSelector('.scan-overlay', { timeout: 10_000 })
assert.equal(await page.locator('.adestia-fold__item').count(), 0, 'the opener is gone while the reader is open')
await page.screenshot({ path: join(out, '1-reader.png') })

await page.locator('.scan-cancel').click()
await page.waitForSelector('.scan-overlay', { state: 'detached' })
const focused = await page.evaluate(() => document.activeElement?.className ?? '')
await page.screenshot({ path: join(out, '2-closed.png') })
assert.match(focused, /adestia-composer__input/, `the composer's field has the focus, got "${focused}"`)
console.log('ok: the composer field has the focus after the reader closes')
await browser.close()
