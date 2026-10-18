/** Real Claude proof. Start: node bench/launch.mjs --engine claude --seed chat-permission --locale fr
 * BENCH_URL=… node bench/scenarios/chat-permission-live.mjs
 * No script intercepts turn or permission endpoints. The launch seed sets permissions.mode=ask.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const base = process.env.BENCH_URL
assert(base, 'BENCH_URL is required')
const out = process.env.BENCH_OUT ?? 'bench/shots-chat-permission/live'
await mkdir(out, { recursive: true })
const { chromium } = createRequire(`${execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()}/`)('playwright')
const browser = await chromium.launch({ args: ['--no-sandbox'] })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fr' })
  const page = await context.newPage()
  page.setDefaultTimeout(180000)
  const response = await page.request.post(`${base}/api/conversations`, { data: { title: 'Real Claude permission proof' } })
  assert(response.ok())
  const { id } = await response.json()
  await page.addInitScript((id) => localStorage.setItem('adestia.tabs', JSON.stringify({ open: [id], active: id })), id)
  await page.addInitScript(() => {
    const original = window.fetch
    window.fetch = async (...args) => {
      const response = await original(...args)
      if (String(args[0]) === '/api/turn' && args[1]?.method === 'POST') {
        // Read a clone with the browser's UTF-8 decoder. CDP's response.body()
        // treats charset-less SSE as Latin-1 on some Chromium versions.
        window.__benchTurnBody = response.clone().text()
      }
      return response
    }
  })
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  const field = page.locator('.adestia-chat textarea')
  await field.waitFor()
  const streamReady = page.waitForResponse((r) => r.url() === `${base}/api/turn` && r.request().method() === 'POST')
  await field.fill("crée un fichier hello.txt dans l'espace")
  await field.press('Enter')
  const stream = await streamReady
  assert(stream.ok())
  await page.waitForFunction(() => window.__benchTurnBody !== undefined)
  const streamBody = page.evaluate(() => window.__benchTurnBody)
  let questions = 0
  // A completed response body, rather than a guessed number of turns, ends the wait.
  let finished = false
  const completion = streamBody.then((body) => { finished = true; return body })
  const deadline = Date.now() + 180000
  while (!finished) {
    assert(Date.now() < deadline, 'Claude did not finish within three minutes')
    const ask = page.locator('.adestia-ask')
    if (await ask.count()) {
      questions++
      await page.screenshot({ path: join(out, `question-${questions}.png`) })
      await ask.getByRole('button', { name: 'Cette fois', exact: true }).click()
      await ask.waitFor({ state: 'hidden' })
    }
    await Promise.race([completion, page.waitForTimeout(100)])
  }
  const body = await completion
  const events = body.split('\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6)))
  assert(!events.some((event) => event.type === 'error'), 'The real turn emitted an error')
  assert(events.some((event) => event.type === 'result'), 'The real turn has no result')
  await page.locator('.adestia-composer__stop').waitFor({ state: 'hidden' })
  assert.equal(await page.locator('.adestia-ask').count(), 0)
  const stored = await (await page.request.get(`${base}/api/conversations/${id}`)).json()
  const assistant = stored.messages.filter((m) => m.role === 'agent')
  const text = assistant.map((m) => m.text).join('')
  assert(text.length > 0, 'The real turn produced no assistant text')
  const deltas = events.filter((e) => e.type === 'text-delta').map((e) => e.text).join('')
  assert.equal(deltas, text, 'Streamed assistant text equals the stored text character for character')
  const prose = page.locator('.adestia-bubble--agent .adestia-prose')
  await prose.first().waitFor()
  const beforeReload = await prose.evaluateAll((nodes) => nodes.map((n) => n.innerHTML))
  await page.screenshot({ path: join(out, 'finished.png') })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await prose.first().waitFor()
  assert.deepEqual(await prose.evaluateAll((nodes) => nodes.map((n) => n.innerHTML)), beforeReload, 'Live and stored assistant prose render identically')
  const report = { engine: 'real Claude', conversationId: id, permissions: { mode: 'ask' }, questions, prompt: "crée un fichier hello.txt dans l'espace", characters: text.length, streamEqualsStored: true, liveProseEqualsStoredProse: true }
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
} finally { await browser.close() }
