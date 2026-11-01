/**
 * adestia-correctifs-chat, AD-19 seen from the screen: a message sent while the first one of a
 * conversation is still leaving (its POST not answered yet) is drawn held, never sent as a fresh turn.
 * The POST is delayed by the test so the gap is wide and the same on every run. Expectations are
 * literals written from docs/parcours.md › P-2 step 4 and ARCHITECTURE.md › AD-19.
 *
 *   npm run build && node --test bench/tests/chat-correctifs-course.test.mjs
 */
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { loadPlaywright } from '../lib/playwright.mjs'

import { join } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const { chromium } = loadPlaywright()

function startInstance() {
  return new Promise(async (resolveStart, reject) => {
    const data = await mkdtemp(join(tmpdir(), 'besoin-course-chat-'))
    const child = spawn('node', ['bench/launch.mjs', '--engine', 'fake', '--seed', 'base', '--skin', 'alfred', '--locale', 'en', '--data', data], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`instance did not start:\n${log}`)) }, 120_000)
    child.stdout.on('data', (chunk) => {
      log += chunk
      const match = /listening on (http:\/\/\S+)\n/.exec(log)
      if (match && !/Adestia listening on/.test(match[0])) {
        clearTimeout(timer)
        resolveStart({ url: match[1], stop: () => new Promise((done) => { child.once('exit', done); child.kill('SIGTERM') }).then(() => rm(data, { recursive: true, force: true })) })
      }
    })
    child.stderr.on('data', (chunk) => { log += chunk })
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`instance exited ${code}:\n${log}`)) })
  })
}

describe('AD-19: a second message sent before the first one has left is held', () => {
  let instance, browser
  before(async () => { instance = await startInstance(); browser = await chromium.launch() })
  after(async () => { await browser?.close(); await instance?.stop() })

  // panne attrapée : le garde de maintien relit « le tour est parti » au lieu de « le tour est lancé » :
  // le second message part comme un tour neuf et n'est jamais dessiné en attente
  test('with the first POST still pending, the second message shows held and is not posted as a turn', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en' })
    const page = await context.newPage()
    try {
      let release
      const gate = new Promise((done) => { release = done })
      await page.route('**/api/turn', async (route) => {
        if (route.request().method() !== 'POST') return route.continue()
        await gate
        return route.continue()
      })
      await page.goto(instance.url)
      await page.locator('.adestia-chat').waitFor()
      await page.getByRole('button', { name: 'New conversation', exact: true }).click()
      const input = page.locator('.adestia-composer__input')
      await input.fill('en cours')
      await page.locator('.adestia-composer__send').click()
      await page.getByRole('button', { name: 'Stop', exact: true }).waitFor()
      await input.fill('deuxieme message')
      await page.keyboard.press('Enter')
      await page.locator('.adestia-bubble--held', { hasText: 'deuxieme message' }).waitFor({ timeout: 5_000 })
      assert.equal(await page.locator('.adestia-bubble--held').count(), 1)
      release()
      const stopped = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/turn/stop')
      await page.getByRole('button', { name: 'Stop', exact: true }).click()
      await stopped
      await page.waitForFunction(() => !document.querySelector('.adestia-bubble--held') && [...document.querySelectorAll('.adestia-bubble--agent')].some((b) => b.innerText.trim() === 'deuxieme message'), null, { timeout: 15_000 })
      assert.equal(await page.locator('.adestia-bubble--user', { hasText: 'deuxieme message' }).count(), 1)
    } finally { await context.close() }
  })
})
