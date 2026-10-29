/**
 * P-2 steps the first chat suite (chat-besoin.test.mjs) leaves out, and the « no function over 250
 * lines » criterion run with the tool's real interface. Every expectation is written by hand from
 * docs/parcours.md › P-2 and the feature's exit criterion; the scripted engine answers by word
 * (bench/seed/_scripts.mjs).
 *
 *   npm run build && node --test bench/tests/chat-p2-besoin.test.mjs
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { loadPlaywright } from '../lib/playwright.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const { chromium } = loadPlaywright()

function startInstance(skin, locale) {
  return new Promise(async (resolveStart, reject) => {
    const data = await mkdtemp(join(tmpdir(), 'besoin-chat-p2-'))
    const child = spawn('node', ['bench/launch.mjs', '--engine', 'fake', '--seed', 'base', '--skin', skin, '--locale', locale, '--data', data], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
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

// Exit criterion · « Chat, useConversations et Composer n'ont plus de fonction de plus de 250 lignes »
describe('function length in the chat sources', () => {
  const tool = (...targets) => spawnSync('node', ['bench/long-functions.mjs', ...targets], { cwd: root, encoding: 'utf8' })

  // the tool must be able to say no: a 300-line function is listed and the exit code is 1
  test('the measuring tool refuses a 300-line function (control)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'long-fn-'))
    try {
      const body = Array.from({ length: 300 }, (_, i) => `  const v${i} = ${i}`).join('\n')
      await writeFile(join(dir, 'Long.tsx'), `export function Long() {\n${body}\n  return 1\n}\n`)
      const out = tool(dir)
      assert.equal(out.status, 1, out.stdout + out.stderr)
      assert.match(out.stdout, /Long/)
    } finally { await rm(dir, { recursive: true, force: true }) }
  })

  test('Chat, useConversations and Composer hold no function over 250 lines', () => {
    const out = tool('packages/web/src/chat/Chat.tsx', 'packages/web/src/chat/useConversations.ts', 'packages/web/src/chat/Composer.tsx')
    assert.equal(out.status, 0, out.stdout + out.stderr)
    assert.equal(out.stdout.trim(), '')
  })
})

describe('P-2 in a browser, alfred, en', () => {
  let instance, browser, page
  const input = () => page.locator('.adestia-composer__input')
  const newDraft = () => page.getByRole('button', { name: 'New conversation', exact: true }).click()
  const bubbles = () => page.locator('.adestia-bubble').evaluateAll((els) => els.map((el) => ({ cls: el.className, text: el.innerText.replace(/\s+/g, ' ').trim() })))

  before(async () => {
    instance = await startInstance('alfred', 'en')
    browser = await chromium.launch()
  })
  after(async () => { await browser?.close(); await instance?.stop() })
  const fresh = async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en' })
    page = await context.newPage()
    await page.goto(instance.url)
    await page.locator('.adestia-chat').waitFor()
    await newDraft()
    return context
  }

  // step 1 · nominal: without an open conversation, the first message creates one, then the turn is posted
  test('the first message of a draft creates the conversation, then posts the turn', async () => {
    const context = await fresh()
    try {
      const posts = []
      page.on('request', (r) => { if (r.method() === 'POST') posts.push(new URL(r.url()).pathname) })
      const done = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/turn' && r.request().method() === 'POST')
      await input().fill('fini')
      await page.locator('.adestia-composer__send').click()
      await done
      assert.deepEqual(posts.filter((p) => p === '/api/conversations' || p === '/api/turn'), ['/api/conversations', '/api/turn'])
      await page.getByText('Rien ne manque pour samedi.', { exact: false }).waitFor()
      await page.screenshot({ path: join(root, 'bench/shots-besoin/p2-first-message.png') }).catch(() => {})
    } finally { await context.close() }
  })

  // step 4 · nominal + bords: Stop replaces Send while a turn runs; a message sent meanwhile is held, then sent after Stop
  test('while a turn runs Stop replaces Send, a second message is held, and after Stop it is sent', async () => {
    const context = await fresh()
    try {
      await input().fill('en cours')
      await page.locator('.adestia-composer__send').click()
      await page.getByRole('button', { name: 'Stop', exact: true }).waitFor()
      assert.equal(await page.locator('.adestia-composer__send').count(), 0, 'Send must be gone while the turn runs')

      await input().fill('deuxieme message')
      await page.keyboard.press('Enter')
      await page.locator('.adestia-bubble--held').waitFor()
      const held = await bubbles()
      assert.equal(held.filter((b) => b.cls.includes('adestia-bubble--held')).length, 1)
      assert.equal(held.find((b) => b.cls.includes('adestia-bubble--held')).text, 'deuxieme message')

      const stopped = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/turn/stop')
      await page.getByRole('button', { name: 'Stop', exact: true }).click()
      await stopped
      // the held message leaves the held state and the engine answers it (the scripted engine echoes it)
      await page.waitForFunction(() => !document.querySelector('.adestia-bubble--held') && [...document.querySelectorAll('.adestia-bubble--agent')].some((b) => b.innerText.trim() === 'deuxieme message'), null, { timeout: 15_000 })
      const after = await bubbles()
      assert.ok(after.some((b) => b.text.includes('Turn interrupted.')), JSON.stringify(after))
      assert.equal(after.filter((b) => b.cls.includes('adestia-bubble--user') && b.text === 'deuxieme message').length, 1)
      await page.screenshot({ path: join(root, 'bench/shots-besoin/p2-held-then-stopped.png') }).catch(() => {})
    } finally { await context.close() }
  })

  // step 3 · nominal: the model picked is stored in this browser as adestia.model
  test('the model picked in the header is kept in this browser as adestia.model', async () => {
    const context = await fresh()
    try {
      await page.getByLabel('Model', { exact: true }).selectOption('bench-opus')
      await page.waitForFunction(() => localStorage.getItem('adestia.model') === 'bench-opus')
      await page.reload()
      await page.locator('.adestia-chat').waitFor()
      assert.equal(await page.getByLabel('Model', { exact: true }).inputValue(), 'bench-opus')
    } finally { await context.close() }
  })

  // step 3 · nominal: the context pill shows how much the conversation weighs once a turn has reported it
  test('the context pill shows 150k after a turn that weighs 150k tokens', async () => {
    const context = await fresh()
    try {
      await input().fill('long contexte')
      await page.locator('.adestia-composer__send').click()
      await page.locator('.adestia-pill', { hasText: '150k' }).waitFor()
      assert.equal(await page.locator('.adestia-pill').first().getAttribute('title'), 'Weight of the context your next message re-pays')
    } finally { await context.close() }
  })

  // step 10 · nominal: a reply that arrives while the user reads something else marks the conversation unread
  test('a reply that ends while another draft is open leaves an Unread dot on its tab', async () => {
    const context = await fresh()
    try {
      let conversationId
      page.on('request', (r) => { if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/turn') conversationId = r.postDataJSON().conversationId })
      await input().fill('en cours')
      await page.locator('.adestia-composer__send').click()
      await page.getByRole('button', { name: 'Stop', exact: true }).waitFor()
      await newDraft()
      await page.getByRole('img', { name: 'Working', exact: true }).waitFor()
      assert.ok(conversationId, 'the turn must name its conversation')
      const stop = await page.request.post(`${instance.url}/api/turn/stop`, { data: { conversation: conversationId } })
      assert.ok(stop.ok(), `stop refused: ${stop.status()}`)
      await page.getByRole('img', { name: 'Unread', exact: true }).first().waitFor({ timeout: 15_000 })
      await page.screenshot({ path: join(root, 'bench/shots-besoin/p2-unread.png') }).catch(() => {})
    } finally { await context.close() }
  })
})
