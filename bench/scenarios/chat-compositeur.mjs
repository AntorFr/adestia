/**
 * E-16 composer, in every state worth a look: the fold open (phone), a turn
 * running (Stop), blocked by a permission question, an upload refused, a
 * 12-line message, and an attachment in the tray.
 *
 * Strings to inspect in BOTH en and fr (typed text and file names are content):
 * More; Attach files; Ask the agent…; Send; Stop; Remove <name>.
 *
 * Matrix: node bench/scenarios/chat-matrix.mjs bench/scenarios/chat-compositeur.mjs
 * Host:   BENCH_URL=… BENCH_OUT=… BENCH_LOCALE=fr node bench/scenarios/chat-compositeur.mjs
 * Uses the chat-rail seed, the scripted engine's 'permission' prompt for the question
 * and a local held-open turn stream; the shared bench is not extended.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { CONVERSATIONS } from '../seed/_base.mjs'

export const seed = 'chat-rail'
const words = {
  en: { more: 'More', attach: 'Attach files', ask: 'Ask the agent…', send: 'Send', stop: 'Stop', remove: 'Remove plan.txt', refused: 'Seeded refusal.' },
  fr: { more: 'Plus', attach: 'Joindre des fichiers', ask: 'Demandez à l’agent…', send: 'Envoyer', stop: 'Arrêter', remove: 'Retirer plan.txt', refused: 'Refus semé.' },
}
function playwright() {
  for (const root of ['/usr/lib/node_modules', execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()]) {
    for (const name of ['playwright', 'playwright-core']) {
      try { return createRequire(`${root}/`)(name) } catch { /* next root */ }
    }
  }
  throw new Error('Playwright must come from the environment')
}

/** A turn that stays open until stopped, so "a turn is running" can be photographed. */
async function heldEngine() {
  const streams = new Map()
  const server = createServer(async (request, response) => {
    let raw = ''
    for await (const chunk of request) raw += chunk
    const body = JSON.parse(raw || '{}')
    if (request.url === '/api/turn/stop') {
      streams.get(body.conversation)?.end()
      streams.delete(body.conversation)
      response.writeHead(200, { 'content-type': 'application/json' }).end('{"stopped":true}')
    } else {
      streams.set(body.conversationId, response)
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.write(`data: ${JSON.stringify({ type: 'text-delta', text: 'Seeded live reply.' })}\n\n`)
    }
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: async () => { for (const r of streams.values()) r.end(); server.closeAllConnections(); await new Promise((done) => server.close(done)) },
  }
}

export default async function scenario(bench) {
  const base = process.env.BENCH_URL
  assert(base, 'BENCH_URL is required (run through chat-matrix.mjs)')
  const out = process.env.BENCH_OUT ?? 'bench/shots-chat-compositeur'
  await mkdir(out, { recursive: true })
  const locale = process.env.BENCH_LOCALE?.slice(0, 2) ?? 'en'
  const w = words[locale]
  assert(w, `Unsupported locale ${locale}`)
  const browser = await playwright().chromium.launch({ args: ['--no-sandbox'] })
  const engine = await heldEngine()
  const report = []
  try {
    for (const theme of ['light', 'dark']) for (const [format, width, height] of [['desk', 1440, 900], ['phone', 390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, locale, ...(width < 820 ? { hasTouch: true, isMobile: true } : {}) })
      const page = await context.newPage()
      const prefix = `${theme}-${format}`
      const shoot = async (name) => { await page.screenshot({ path: join(out, `${prefix}-${name}.png`) }); console.log(`shot ${prefix}-${name}`) }
      try {
        const open = (active) => page.addInitScript(({ theme, tabs }) => {
          localStorage.setItem('adestia.theme', theme)
          localStorage.setItem('adestia.tabs', JSON.stringify(tabs))
        }, { theme, tabs: { open: [active], active } })
        await open(CONVERSATIONS.idle)
        await page.route('**/api/turn/attach?*', (route) => route.fulfill({ status: 204 }))
        await page.route('**/api/turn', (route) => route.continue({ url: `${engine.url}/api/turn` }))
        await page.route('**/api/turn/stop', (route) => route.continue({ url: `${engine.url}/api/turn/stop` }))
        await page.goto(base, { waitUntil: 'domcontentloaded' })
        const chat = page.locator('.adestia-chat')
        const field = chat.locator('textarea')
        await field.waitFor()

        // Rest, and the fold or the row.
        await shoot('rest')
        if (width < 820) {
          const more = chat.getByLabel(w.more, { exact: true })
          assert.equal(await more.getAttribute('title'), w.more)
          await more.click()
          await chat.getByRole('menuitem', { name: w.attach }).waitFor()
          await shoot('fold-open')
          await page.keyboard.press('Escape')
        } else {
          assert.equal(await chat.getByLabel(w.attach, { exact: true }).getAttribute('title'), w.attach)
        }

        // No glyph stands in for an icon: every composer button holds an svg or its plugin's own glyph.
        const glyphs = await chat.locator('.adestia-composer button:not(.adestia-fold__item)').evaluateAll((nodes) => nodes.map((n) => ({ label: n.getAttribute('aria-label'), svg: n.querySelector('svg') !== null, text: n.textContent.trim() })))
        assert(glyphs.every((g) => g.svg && g.text === '' || g.label === null), JSON.stringify(glyphs))

        // A tray with one file, and a refused one.
        await chat.locator('input[type=file]').setInputFiles({ name: 'plan.txt', mimeType: 'text/plain', buffer: Buffer.from('Seeded attachment.') })
        await chat.locator('.adestia-attachments__item').waitFor()
        assert.equal(await chat.getByLabel(w.remove, { exact: true }).getAttribute('title'), w.remove)
        await shoot('tray')
        await page.route('**/api/upload', (route) => route.fulfill({ status: 400, json: { error: w.refused } }))
        await chat.locator('input[type=file]').setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('x') })
        await chat.locator('.adestia-attachments__error').waitFor()
        await shoot('upload-error')
        await page.unroute('**/api/upload')
        await chat.getByLabel(w.remove, { exact: true }).click()

        // Twelve lines: the field stops at its ceiling and scrolls.
        await field.fill(Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n'))
        const box = await field.evaluate((n) => ({ height: n.getBoundingClientRect().height, max: parseFloat(getComputedStyle(n).maxHeight), scroll: n.scrollHeight, overflowY: getComputedStyle(n).overflowY }))
        assert(box.height <= box.max + 0.5, JSON.stringify(box))
        assert(box.scroll > box.height && box.overflowY === 'auto', JSON.stringify(box))
        await shoot('twelve-lines')

        // A turn is running: the button says Stop.
        await field.fill('en cours')
        await field.press('Enter')
        await chat.getByLabel(w.stop, { exact: true }).waitFor()
        await shoot('running')
        await page.request.post(`${engine.url}/api/turn/stop`, { data: { conversation: CONVERSATIONS.idle } })
        await chat.getByLabel(w.send, { exact: true }).waitFor()

        // Blocked by a permission question: the send stays inert.
        // The scripted engine's 'permission' prompt asks, then waits (bench/seed/_scripts.mjs).
        await page.unroute('**/api/turn')
        await page.unroute('**/api/turn/attach?*')
        await field.fill('permission')
        await field.press('Enter')
        await chat.locator('.adestia-ask').waitFor()
        await chat.locator('textarea').fill('hello')
        assert(await chat.getByLabel(w.send, { exact: true }).isDisabled())
        await shoot('blocked')
        report.push({ theme, format, locale, field: box, glyphs })
      } finally { await context.close() }
    }
  } finally { await browser.close(); await engine.close() }
  await writeFile(join(out, 'compositeur-report.json'), JSON.stringify(report, null, 2) + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await scenario()
