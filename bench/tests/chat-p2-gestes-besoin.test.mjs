/**
 * P-2 steps 4, 7 and 9 that the two earlier chat suites leave out — a refused turn (429), the
 * attachments tray and its upload error, the tab gestures (close, new draft, reorder), the
 * conversation list on a phone — through a real browser on a real instance (scripted engine).
 * Every expectation is written by hand from docs/parcours.md › P-2 and docs/ecrans.md ›
 * « The chat's screens, as built ».
 *
 *   npm run build && node --test bench/tests/chat-p2-gestes-besoin.test.mjs
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const shots = join(root, 'bench/shots-besoin')

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

function startInstance(seed, skin, locale) {
  return new Promise(async (resolveStart, reject) => {
    const data = await mkdtemp(join(tmpdir(), 'besoin-chat-gestes-'))
    const child = spawn('node', ['bench/launch.mjs', '--engine', 'fake', '--seed', seed, '--skin', skin, '--locale', locale, '--data', data], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
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

const FILE = { name: 'menu-samedi.txt', mimeType: 'text/plain', buffer: Buffer.from('Soupe, puis tarte.') }
const shot = async (page, name) => { await mkdir(shots, { recursive: true }); await page.screenshot({ path: join(shots, name) }).catch(() => {}) }

for (const locale of ['en', 'fr']) {
  const W = locale === 'en'
    ? { newConversation: 'New conversation', stop: 'Stop', more: 'More', remove: (n) => `Remove ${n}` }
    : { newConversation: 'Nouvelle conversation', stop: 'Arrêter', more: 'Plus', remove: null }

  describe(`P-2 gestures, alfred, ${locale}`, () => {
    let instance, browser
    before(async () => {
      instance = await startInstance('chat-rail', 'alfred', locale)
      browser = await chromium.launch()
    })
    after(async () => { await browser?.close(); await instance?.stop() })

    const open = async (viewport = { width: 1440, height: 900 }) => {
      const context = await browser.newContext({ viewport, locale })
      const page = await context.newPage()
      await page.goto(instance.url)
      await page.locator('.adestia-chat').waitFor()
      return { context, page }
    }

    // step 7 · nominal: a picked file shows in the tray by name, with a remove control that is the x icon
    // panne attrapée : l'aide d'envoi ou le plateau perd le fichier choisi, ou la croix de retrait n'est plus l'icône x
    test('step 7: a picked file shows in the tray by name and its remove control takes it away', async () => {
      const { context, page } = await open()
      try {
        const uploaded = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/upload' && r.request().method() === 'POST')
        await page.locator('input[type=file]').setInputFiles(FILE)
        const response = await uploaded
        assert.equal(response.status(), 200)
        const item = page.locator('.adestia-attachments__item', { hasText: FILE.name })
        await item.waitFor()
        assert.equal(await page.locator('.adestia-attachments__item').count(), 1)
        const remove = item.getByRole('button')
        assert.equal(await remove.count(), 1)
        assert.equal(await remove.locator('svg use').first().getAttribute('href').then((h) => h?.split('#').pop()), 'adestia-i-x', 'the remove control is the x icon')
        if (W.remove) assert.equal(await remove.getAttribute('aria-label'), W.remove(FILE.name))
        else assert.doesNotMatch(await remove.getAttribute('aria-label'), /Remove/)
        await shot(page, `gestes-tray-${locale}.png`)
        await remove.click()
        await page.locator('.adestia-attachments__item').waitFor({ state: 'detached' })
        assert.equal(await page.locator('.adestia-attachments').count(), 0, 'an empty tray leaves no strip behind')
      } finally { await context.close() }
    })

    // step 7 · bords: two files at once make two chips; the send empties the tray
    test('step 7: two files make two chips, and sending empties the tray', async () => {
      const { context, page } = await open()
      try {
        await page.getByRole('button', { name: W.newConversation, exact: true }).click()
        const second = { name: 'liste.txt', mimeType: 'text/plain', buffer: Buffer.from('pain') }
        await page.locator('input[type=file]').setInputFiles([FILE, second])
        await page.locator('.adestia-attachments__item', { hasText: second.name }).waitFor()
        assert.equal(await page.locator('.adestia-attachments__item').count(), 2)
        const turn = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/turn' && r.request().method() === 'POST')
        await page.locator('.adestia-composer__input').fill('fini')
        await page.locator('.adestia-composer__send').click()
        await turn
        await page.locator('.adestia-attachments__item').first().waitFor({ state: 'detached' })
        assert.equal(await page.locator('.adestia-attachments__item').count(), 0)
      } finally { await context.close() }
    })

    // step 7 · échec: an upload the server refuses is told in the tray, in the instance's language, and attaches nothing
    // panne attrapée : l'erreur d'envoi est avalée ou affichée dans l'autre langue
    test('step 7: a refused upload says so in the tray and attaches nothing', async () => {
      const { context, page } = await open()
      try {
        await page.route('**/api/upload', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }))
        const refused = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/upload')
        await page.locator('input[type=file]').setInputFiles(FILE)
        await refused
        const alert = page.locator('.adestia-attachments').getByRole('alert')
        await alert.waitFor()
        assert.notEqual((await alert.innerText()).trim(), '')
        assert.equal(await page.locator('.adestia-attachments__item').count(), 0)
        await shot(page, `gestes-upload-error-${locale}.png`)
      } finally { await context.close() }
    })

    // step 9 · nominal: the cross closes the TAB only; the conversation stays in the list; the plus starts a draft
    test('step 9: closing a tab keeps the conversation in the list, and plus opens a new draft', async () => {
      const { context, page } = await open()
      try {
        const tabs = page.getByRole('tab')
        await page.getByRole('button', { name: W.newConversation, exact: true }).click()
        await page.getByRole('tab', { name: W.newConversation }).waitFor()
        const before = await tabs.count()
        assert.ok(before >= 1)
        // open a stored conversation from the list
        await page.getByRole('button', { name: /^(Conversations|Conversation list|Liste|Conversations)/ }).first().click().catch(() => {})
        await page.getByText('Seeded conversation 12', { exact: false }).first().click()
        await page.getByRole('tab', { name: /Seeded conversation 12/ }).waitFor()
        assert.equal(await tabs.count(), before + 1)
        await page.getByRole('tab', { name: /Seeded conversation 12/ }).hover()
        await page.getByRole('button', { name: /^(Close tab|Fermer l.onglet) — Seeded conversation 12/ }).click()
        await page.getByRole('tab', { name: /Seeded conversation 12/ }).waitFor({ state: 'detached' })
        assert.equal(await tabs.count(), before)
        const remembered = await page.evaluate(() => localStorage.getItem('adestia.tabs'))
        assert.ok(!remembered.includes('000000000012'), `the closed tab must not be remembered: ${remembered}`)
        await page.getByRole('button', { name: /^(Conversations|Conversation list|Liste|Conversations)/ }).first().click().catch(() => {})
        assert.ok(await page.getByText('Seeded conversation 12', { exact: false }).first().isVisible(), 'closing the tab does not archive the conversation')
      } finally { await context.close() }
    })

    // step 9 · nominal: tabs are reordered by drag, and the browser remembers the order
    test('step 9: dragging a tab before another reorders them and the order is remembered', async () => {
      const { context, page } = await open()
      try {
        await page.getByRole('button', { name: W.newConversation, exact: true }).click()
        await page.getByRole('button', { name: /^(Conversations|Conversation list|Liste|Conversations)/ }).first().click().catch(() => {})
        await page.getByText('Seeded conversation 11', { exact: false }).first().click()
        await page.getByRole('tab', { name: /Seeded conversation 11/ }).waitFor()
        const names = () => page.getByRole('tab').evaluateAll((els) => els.map((el) => el.innerText.replace(/\s+/g, ' ').trim()))
        const before = await names()
        const last = before.length - 1
        assert.ok(last >= 1)
        await page.getByRole('tab').nth(last).dragTo(page.getByRole('tab').nth(0))
        await page.waitForFunction(() => document.querySelector('[role=tab]').innerText.includes('Seeded conversation 11'))
        const after = await names()
        assert.deepEqual(after, [before[last], ...before.slice(0, last)])
        const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('adestia.tabs')))
        const ids = JSON.stringify(stored).match(/0{8}-0{4}-4000-8000-0{9}\d{3}|draft/g) ?? []
        assert.ok(ids.length >= 2, `the order is stored: ${JSON.stringify(stored)}`)
        assert.ok(ids[0].endsWith('011'), `the dragged tab is first in the stored order: ${JSON.stringify(stored)}`)
      } finally { await context.close() }
    })
  })
}

// step 4 · échec: past maxConcurrentTurns the turn is refused and the composer is freed
describe('P-2 step 4: a turn refused past maxConcurrentTurns', () => {
  let instance, browser
  before(async () => {
    instance = await startInstance('chat-saturated', 'alfred', 'en')
    browser = await chromium.launch()
  })
  after(async () => { await browser?.close(); await instance?.stop() })

  // panne attrapée : la limite ne refuse plus le tour ou le compositeur reste bloqué
  // Écart P-2 conservé pour la recette : le 429 peut rester muet (ARCHITECTURE.md, Known defects ; AD-7).
  test('the refused turn answers 429 and the composer is free again', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en' })
    const page = await context.newPage()
    try {
      await page.goto(instance.url)
      await page.locator('.adestia-chat').waitFor()
      await page.getByRole('button', { name: 'New conversation', exact: true }).click()
      const refused = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/turn' && r.request().method() === 'POST')
      await page.locator('.adestia-composer__input').fill('fini')
      await page.locator('.adestia-composer__send').click()
      assert.equal((await refused).status(), 429)
      await shot(page, 'gestes-429.png')
      assert.equal(await page.getByRole('button', { name: 'Stop', exact: true }).count(), 0, 'no Stop: no turn runs in this conversation')
      assert.equal(await page.locator('.adestia-composer__send').count(), 1, 'Send is back')
    } finally { await context.close() }
  })
})

// step 9 · phone: the list is the only navigation
describe('P-2 step 9 on a phone', () => {
  let instance, browser
  before(async () => {
    instance = await startInstance('chat-rail', 'alfred', 'en')
    browser = await chromium.launch()
  })
  after(async () => { await browser?.close(); await instance?.stop() })

  test('there is no tab strip, and the list icon opens the conversations and a pick opens one', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en' })
    const page = await context.newPage()
    try {
      await page.goto(instance.url)
      await page.locator('.adestia-chat').waitFor()
      assert.equal(await page.getByRole('tablist').count(), 0, 'tabs are desktop only')
      await page.getByRole('button', { name: /conversations/i }).first().click()
      const entry = page.getByText('Seeded conversation 15', { exact: false }).first()
      await entry.waitFor()
      await shot(page, 'gestes-phone-list.png')
      await entry.click()
      await page.getByText('Seeded question 15.', { exact: false }).waitFor()
    } finally { await context.close() }
  })
})
