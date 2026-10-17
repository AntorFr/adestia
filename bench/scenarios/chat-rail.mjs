/**
 * E-16 rail strings to inspect in BOTH en and fr (seeded titles, model names,
 * tool names/targets, messages and engine errors are content, never translated):
 * Conversations; New conversation; Open apps; Model; Auto;
 * Weight of the context your next message re-pays; Archive; Close tab;
 * Idle; Working; Waiting; Unread; No conversation yet.;
 * %n tool call; %n tool calls; Done; Failed; Turn interrupted.;
 * asks you to connect before it can act for you.; Connect; Not now.
 * The composer and signature/permission cards belong to subsequent scenarios.
 *
 * Host: BENCH_URL=… BENCH_OUT=… node bench/scenarios/chat-rail.mjs
 * Matrix: node bench/scenarios/chat-matrix.mjs bench/scenarios/chat-rail.mjs
 * Docker: bench/run.sh bench/scenarios/chat-rail.mjs (one skin; proxy engine).
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { CONVERSATIONS } from '../seed/_base.mjs'
import { railThreads, WAITING } from '../seed/chat-rail.mjs'

export const seed = 'chat-rail'
const words = {
  en: { conversations: 'Conversations', empty: 'No conversation yet.', new: 'New conversation', working: 'Working', model: 'Model', auto: 'Auto', close: 'Close tab', archive: 'Archive', interrupted: 'Turn interrupted.', singular: '1 tool call', plural: '2 tool calls', connect: 'Connect', hide: 'Not now', context: 'Weight of the context your next message re-pays' },
  fr: { conversations: 'Conversations', empty: 'Aucune conversation.', new: 'Nouvelle conversation', working: 'En cours', model: 'Modèle', auto: 'Auto', close: 'Fermer l’onglet', archive: 'Archiver', interrupted: 'Tour interrompu.', singular: '1 appel d’outil', plural: '2 appels d’outil', connect: 'Se connecter', hide: 'Pas maintenant', context: 'Poids du contexte repris par votre prochain message' },
}
function playwright() {
  for (const root of ['/usr/lib/node_modules', execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()]) {
    for (const name of ['playwright', 'playwright-core']) {
      try { return createRequire(`${root}/`)(name) } catch { /* try the next environment root */ }
    }
  }
  throw new Error('Playwright must come from the environment')
}

export default async function scenario(bench) {
  let base = process.env.BENCH_URL
  const out = process.env.BENCH_OUT ?? (bench ? '/shots' : 'bench/shots-chat-rail')
  await mkdir(out, { recursive: true })
  if (bench && !base) {
    await railThreads(bench.dataDir)
    const probe = await bench.open()
    base = new URL(probe.url()).origin
    await probe.context().close()
  }
  assert(base, 'BENCH_URL is required outside bench/run.sh')
  const browser = await playwright().chromium.launch({ args: ['--no-sandbox'] })
  const report = []
  try {
    for (const theme of ['light', 'dark']) for (const [format, width, height] of [['desk', 1440, 900], ['phone', 390, 844], ['narrow', 360, 800]]) {
      const locale = process.env.BENCH_LOCALE?.slice(0, 2) ?? 'en'
      const w = words[locale]
      assert(w, `Unsupported locale ${locale}`)
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, locale, ...(width < 820 ? { hasTouch: true, isMobile: true } : {}) })
      const page = await context.newPage()
      const prefix = `${theme}-${format}`
      const shoot = async (name) => {
        await page.screenshot({ path: join(out, `${prefix}-${name}.png`) })
        console.log(`shot ${prefix}-${name}`)
      }
      try {
        await page.addInitScript(({ theme, rich, running, idle, unread, waiting }) => {
          localStorage.setItem('adestia.theme', theme)
          localStorage.setItem('adestia.tabs', JSON.stringify({ open: [rich, running, idle, unread, waiting], active: rich }))
          localStorage.setItem('adestia.read', JSON.stringify({ [idle]: '2099-01-01T00:00:00Z' }))
        }, { theme, ...CONVERSATIONS, waiting: WAITING })
        // The docker bench's proxy has no configured sign-in server. Replay the
        // same disconnected identity the host seed puts in its real MCP store.
        if (bench) await page.route('**/api/mcp/connections', (route) => route.fulfill({ json: { connections: [{ name: 'agenda', connected: false }] } }))
        await page.goto(base, { waitUntil: 'domcontentloaded' })
        const chat = page.locator('.adestia-chat')
        await chat.locator('.adestia-bubble__error').waitFor()
        await chat.locator('.adestia-connect').first().waitFor()
        assert.equal(await chat.getByLabel(w.model, { exact: true }).getAttribute('title'), w.model)
        const picker = chat.getByLabel(w.model, { exact: true })
        if (!bench) await picker.selectOption('bench-long')
        assert.equal(await chat.getByLabel(w.new, { exact: true }).getAttribute('title'), w.new)
        assert.equal(await chat.locator('.adestia-connect__hide').getAttribute('title'), w.hide)
        assert.equal(await chat.locator('.adestia-connect__go').innerText(), w.connect)
        if (width > 820) {
          assert.equal(await chat.locator('.adestia-tab__tool').first().getAttribute('title'), w.archive)
          assert.equal(await chat.locator('.adestia-tab__tool').nth(1).getAttribute('title'), w.close)
        }
        assert.equal(await chat.locator('.adestia-pill').getAttribute('title'), w.context)
        assert.equal(await chat.locator('.adestia-bubble__note').textContent(), w.interrupted)
        assert.equal(await chat.locator('.adestia-trace__toggle').first().innerText(), w.singular)
        assert.equal(await chat.locator('.adestia-trace__toggle').last().innerText(), w.plural)
        await chat.locator('.adestia-trace__toggle').first().click()
        await chat.locator('.adestia-trace__toggle').last().click()
        // Inspect top and bottom separately: a phone cannot show the entire
        // seeded transcript and its decision card in one viewport.
        await chat.locator('.adestia-chat__conversation').evaluate((node) => { node.scrollTop = 0 })
        await shoot('stored-top')
        await chat.locator('.adestia-chat__conversation').evaluate((node) => { node.scrollTop = node.scrollHeight })
        await shoot('stored-bottom')
        const controls = await chat.locator('.adestia-chat__header button, .adestia-model-wrap').evaluateAll((nodes) => nodes.map((node) => {
          const r = node.getBoundingClientRect()
          return { label: node.getAttribute('aria-label') ?? node.className, left: r.left, right: r.right, width: r.width }
        }))
        assert(controls.every((r) => r.left >= 0 && r.right <= width && r.width > 0), JSON.stringify(controls))
        // Actual keyboard navigation, with the focused control checked before
        // photographing the shared :focus-visible ring.
        await picker.focus()
        await page.keyboard.press('Tab') // pill
        await page.keyboard.press('Tab') // conversation list
        assert(await chat.getByLabel(w.conversations, { exact: true }).evaluate((node) => node.matches(':focus-visible')))
        await shoot('keyboard-focus')
        await chat.getByLabel(w.conversations, { exact: true }).click()
        await chat.locator('.adestia-conversations__item').nth(20).waitFor()
        await chat.locator('.adestia-conversations').evaluate((node) => { node.scrollTop = node.scrollHeight })
        await shoot('long-list')
        await chat.getByLabel(w.conversations, { exact: true }).click()
        // Empty list is the same API with no conversations; no product state
        // or extra loading behaviour is introduced for this capture.
        await page.route('**/api/conversations', (route) => route.request().method() === 'GET' ? route.fulfill({ json: { conversations: [] } }) : route.continue())
        await chat.getByLabel(w.conversations, { exact: true }).click()
        await chat.getByText(w.empty, { exact: true }).waitFor()
        await shoot('empty-list')
        await chat.getByLabel(w.conversations, { exact: true }).click()
        await page.unroute('**/api/conversations')

        await chat.getByLabel(w.new, { exact: true }).click()
        await chat.locator('textarea').fill('en cours')
        await chat.locator('textarea').press('Enter')
        if (bench) {
          await bench.attached()
          bench.emit({ type: 'text-delta', text: 'Seeded live reply.' })
          bench.emit({ type: 'tool-use', name: 'Read', target: 'pages/plan.md' })
          bench.emit({ type: 'usage-delta', outputTokens: 240 })
        }
        await chat.locator('.adestia-bubble--live .adestia-trace').waitFor()
        await chat.locator('.adestia-bubble--live .adestia-trace__toggle').click()
        await shoot('working')
        await chat.locator('input[type=file]').setInputFiles({ name: 'plan.txt', mimeType: 'text/plain', buffer: Buffer.from('Seeded attachment.') })
        await chat.locator('.adestia-attachments__item').waitFor()
        // Enter queues an attachments-only message even while the button says
        // Stop. This drives the existing held path through the real composer.
        if (bench) await page.route('**/api/turn', (route) => route.fulfill({ status: 202, json: { held: true } }))
        await chat.locator('textarea').press('Enter')
        await chat.locator('.adestia-bubble--held .adestia-icon use[href="#adestia-i-paperclip"]').waitFor()
        await shoot('held-attachment')
        const tab = await page.evaluate(() => JSON.parse(localStorage.getItem('adestia.tabs')).active)
        if (bench) { bench.emit({ type: 'result', sessionId: 'rail', stopped: true }); bench.endTurn() }
        else {
          const stopped = await fetch(`${base}/api/turn/stop`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conversation: tab }) })
          assert.equal(stopped.status, 200)
          await chat.locator('.adestia-bubble__working').waitFor({ state: 'hidden' })
        }
        report.push({ theme, format, locale, controls, screenshots: 7 })
      } finally { await context.close() }
    }
  } finally { await browser.close() }
  await writeFile(join(out, 'rail-report.json'), JSON.stringify(report, null, 2) + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await scenario()
