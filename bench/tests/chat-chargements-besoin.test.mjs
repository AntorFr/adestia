/**
 * E-16 in `adestia-ajouts-chat` against the need (B-18 for the chat, B-22, P-16 steps 3 and 7), through a
 * real browser on a real instance (scripted engine, as the bench does). Every expectation is written by hand
 * from docs/parcours.md (B-18, B-22, P-16) and docs/ecrans.md § « E-16 in `adestia-ajouts-chat` ».
 *
 *   npm run build && node --test bench/tests/chat-chargements-besoin.test.mjs
 *
 * `BESOIN_SKINS` and `BESOIN_LOCALES` narrow the matrix; pictures land in the ignored `bench/shots-besoin-chat/`.
 */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { loadPlaywright } from '../lib/playwright.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const shots = join(root, 'bench/shots-besoin-chat')

const { chromium } = loadPlaywright()

const SKINS = (process.env.BESOIN_SKINS ?? 'alfred,dobby,nestor,skippy').split(',')
const LOCALES = (process.env.BESOIN_LOCALES ?? 'en,fr').split(',')

const WORDS = {
  en: {
    loading: 'Loading…', retry: 'Retry', empty: 'No conversation yet.',
    mark: 'The engine no longer remembers the earlier messages.',
    failed: (n) => new RegExp(`request failed \\(${n}\\)`, 'i'), list: 'Conversations',
  },
  fr: {
    loading: 'Chargement…', retry: 'Réessayer', empty: null, // the docs give the empty sentence in English only: a gap, no fr expectation
    mark: 'Le moteur ne se souvient plus des messages précédents.',
    failed: (n) => new RegExp(`la requête a échoué \\(${n}\\)`, 'i'), list: 'Conversations',
  },
}
const MARKED_TITLE = 'Marque — le moteur a perdu le contexte'
const FIRST_MARKED_REPLY = 'Je n’ai plus les messages précédents sous les yeux'
const SECOND_MARKED_REPLY = 'Je t’écoute — une seconde reprise à froid'
const UUID = '[0-9a-f-]{36}'
const LIST_URL = /\/api\/conversations(\?.*)?$/
const THREAD_URL = new RegExp(`/api/conversations/${UUID}(\\?.*)?$`)

function startInstance(seed, skin, locale) {
  return new Promise(async (resolveStart, reject) => {
    const data = await mkdtemp(join(tmpdir(), 'besoin-chat-'))
    const child = spawn('node', ['bench/launch.mjs', '--engine', 'fake', '--seed', seed, '--skin', skin, '--locale', locale, '--data', data], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
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

/** Takes over the GETs of one read: 'pass', 'hold' (until set('pass')), a status number, optionally with a JSON body. */
async function gate(page, re, mode = 'pass', body) {
  const waiting = []
  const state = { mode, body, hits: 0 }
  await page.route(re, async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    state.hits += 1
    if (state.mode === 'hold') { waiting.push(route); return }
    if (typeof state.mode === 'number') {
      return route.fulfill({ status: state.mode, contentType: 'application/json', body: JSON.stringify(state.body ?? {}) })
    }
    return route.continue()
  })
  state.set = async (next, nextBody) => {
    state.mode = next
    state.body = nextBody
    if (next === 'hold') return
    const held = waiting.splice(0)
    for (const route of held) {
      if (typeof next === 'number') await route.fulfill({ status: next, contentType: 'application/json', body: JSON.stringify(nextBody ?? {}) })
      else await route.continue()
    }
  }
  return state
}

for (const locale of LOCALES) {
  for (const skin of SKINS) {
    describe(`chat loading, failure and context-lost line — skin ${skin}, ${locale}`, () => {
      const w = WORDS[locale]
      let browser, inst, empty
      before(async () => {
        await mkdir(shots, { recursive: true })
        browser = await chromium.launch()
        inst = await startInstance('chat-ajouts', skin, locale)
        empty = await startInstance('empty', skin, locale)
      })
      after(async () => { await browser?.close(); await inst?.stop(); await empty?.stop() })

      const open = async (url, width = 1280, height = 800) => {
        const context = await browser.newContext({ viewport: { width, height }, locale })
        const page = await context.newPage()
        return { page, chat: page.locator('.adestia-chat'), close: () => context.close(), url }
      }
      const openList = (s) => s.page.getByRole('button', { name: w.list }).click()
      const shot = (s, name) => s.page.screenshot({ path: join(shots, `${skin}-${locale}-${name}.png`) })
      const retryButton = (s) => s.chat.getByRole('button', { name: w.retry, exact: true })
      const rowCount = (s) => s.chat.getByText('Conversation semée', { exact: false }).count()

      // Panne visée : on retire le « Loading » de la liste (ou on le montre à côté de « No conversation yet. »).
      test('B-18 nominal: while the list has not answered it shows Loading, never the empty sentence, and the rows come after', async () => {
        const s = await open(inst.url)
        const list = await gate(s.page, LIST_URL, 'hold')
        await s.page.goto(inst.url)
        await openList(s)
        await s.chat.getByText(w.loading, { exact: true }).first().waitFor()
        if (w.empty) assert.equal(await s.chat.getByText(w.empty, { exact: true }).count(), 0)
        assert.equal(await rowCount(s), 0)
        assert.equal(await s.chat.getByText(MARKED_TITLE, { exact: true }).count(), 0)
        await shot(s, 'liste-chargement')
        await list.set('pass')
        await s.chat.getByText(MARKED_TITLE, { exact: true }).first().waitFor()
        assert.equal(await s.chat.getByText(w.loading, { exact: true }).count(), 0)
        if (w.empty) assert.equal(await s.chat.getByText(w.empty, { exact: true }).count(), 0)
        await s.close()
      })

      // Panne visée : un échec de liste qui reste muet ou sans bouton.
      test('B-18 failure: a 500 on the list says the server\'s error with Retry; Retry shows Loading alone, then the rows', async () => {
        const s = await open(inst.url)
        const list = await gate(s.page, LIST_URL, 500, { error: 'Disque plein' })
        await s.page.goto(inst.url)
        await openList(s)
        await s.chat.getByText('Disque plein', { exact: true }).waitFor()
        await retryButton(s).waitFor()
        assert.equal(await s.chat.getByText(w.loading, { exact: true }).count(), 0)
        assert.equal(await rowCount(s), 0)
        if (w.empty) assert.equal(await s.chat.getByText(w.empty, { exact: true }).count(), 0)
        await shot(s, 'liste-echec')
        await list.set('hold')
        await retryButton(s).click()
        await s.chat.getByText(w.loading, { exact: true }).first().waitFor()
        assert.equal(await s.chat.getByText('Disque plein', { exact: true }).count(), 0, 'the failure gives way to Loading')
        assert.equal(await retryButton(s).count(), 0, 'never both at once')
        await list.set('pass')
        await s.chat.getByText(MARKED_TITLE, { exact: true }).first().waitFor()
        assert.equal(await retryButton(s).count(), 0)
        await s.close()
      })

      test('B-18 failure bords: without a server message the locale sentence with the status; a Retry that fails again brings the failure back; one press, one fetch', async () => {
        const s = await open(inst.url)
        const list = await gate(s.page, LIST_URL, 503, {})
        await s.page.goto(inst.url)
        await openList(s)
        await s.chat.getByText(w.failed(503)).waitFor()
        const before = list.hits
        await list.set('hold')
        await retryButton(s).dblclick().catch(() => {})
        await s.chat.getByText(w.loading, { exact: true }).first().waitFor()
        assert.equal(list.hits, before + 1, 'a double press asks once')
        await list.set(502, {})
        await s.chat.getByText(w.failed(502)).waitFor()
        await retryButton(s).waitFor()
        await list.set('pass')
        await retryButton(s).click()
        await s.chat.getByText(MARKED_TITLE, { exact: true }).first().waitFor()
        await s.close()
      })

      // Exclusion : une liste vide répond « vide », pas « chargement » ni « échec ».
      test('B-18 bords: a list that answered empty shows the empty sentence and neither Loading nor Retry', async () => {
        const s = await open(empty.url)
        await s.page.goto(empty.url)
        await openList(s)
        if (w.empty) await s.chat.getByText(w.empty, { exact: true }).waitFor()
        else await s.page.waitForResponse((r) => LIST_URL.test(r.url()) && r.status() === 200).catch(() => {})
        await s.page.waitForTimeout(500)
        assert.equal(await s.chat.getByText(w.loading, { exact: true }).count(), 0)
        assert.equal(await retryButton(s).count(), 0)
        await shot(s, 'liste-vide')
        await s.close()
      })

      // Exclusion : 401/403 n'ajoutent aucun état au chat.
      test('B-18 exclusion: a 403 on the list draws no Failure and no Retry in the chat', async () => {
        const s = await open(inst.url)
        await gate(s.page, LIST_URL, 403, { error: 'denied' })
        await s.page.goto(inst.url)
        await openList(s)
        await s.page.waitForTimeout(1500)
        assert.equal(await retryButton(s).count(), 0)
        assert.equal(await s.chat.getByText(w.failed(403)).count(), 0)
        await s.close()
      })

      test('B-18 nominal thread: opening a stored conversation shows Loading in the thread, not the welcome nor bubbles, then the messages', async () => {
        const s = await open(inst.url)
        await s.page.goto(inst.url)
        await openList(s)
        const thread = await gate(s.page, THREAD_URL, 'hold')
        await s.chat.getByText(MARKED_TITLE, { exact: true }).first().click()
        await s.chat.getByText(w.loading, { exact: true }).first().waitFor()
        assert.equal(await s.chat.locator('.adestia-bubble').count(), 0)
        assert.equal(await s.chat.getByText('Reprends le devis de la salle de bain.').count(), 0)
        await shot(s, 'fil-chargement')
        await thread.set('pass')
        await s.chat.getByText('Reprends le devis de la salle de bain.').waitFor()
        assert.equal(await s.chat.getByText(w.loading, { exact: true }).count(), 0)
        await s.close()
      })

      test('B-18 thread failure: a 500 on the thread says it with Retry and leaves the composer unable to send; Retry reads again and frees it', async () => {
        const s = await open(inst.url)
        await s.page.goto(inst.url)
        await openList(s)
        const thread = await gate(s.page, THREAD_URL, 500, { error: 'Lecture impossible' })
        await s.chat.getByText(MARKED_TITLE, { exact: true }).first().click()
        await s.chat.getByText('Lecture impossible', { exact: true }).waitFor()
        await retryButton(s).waitFor()
        assert.equal(await s.chat.getByText(w.loading, { exact: true }).count(), 0)
        assert.equal(await s.chat.locator('.adestia-bubble').count(), 0)
        assert.equal(await s.chat.locator('.adestia-composer__send').isDisabled(), true, 'a message sent now would be filed on an unseen thread')
        await shot(s, 'fil-echec')
        await thread.set('hold')
        const before = thread.hits
        await retryButton(s).dblclick().catch(() => {})
        await s.chat.getByText(w.loading, { exact: true }).first().waitFor()
        assert.equal(await s.chat.getByText('Lecture impossible', { exact: true }).count(), 0)
        assert.equal(thread.hits, before + 1)
        await thread.set('pass')
        await s.chat.getByText('Reprends le devis de la salle de bain.').waitFor()
        assert.equal(await retryButton(s).count(), 0)
        await s.chat.locator('.adestia-composer__input').fill('bonjour')
        assert.equal(await s.chat.locator('.adestia-composer__send').isDisabled(), false)
        await s.close()
      })

      test('B-18 thread failure bords: the locale sentence without a server message; a 403 draws no Retry', async () => {
        const s = await open(inst.url)
        await s.page.goto(inst.url)
        await openList(s)
        const thread = await gate(s.page, THREAD_URL, 502, {})
        await s.chat.getByText(MARKED_TITLE, { exact: true }).first().click()
        await s.chat.getByText(w.failed(502)).waitFor()
        await thread.set(403, { error: 'denied' })
        await s.close()
        const t = await open(inst.url)
        await t.page.goto(inst.url)
        await openList(t)
        await gate(t.page, THREAD_URL, 403, { error: 'denied' })
        await t.chat.getByText(MARKED_TITLE, { exact: true }).first().click()
        await t.page.waitForTimeout(1500)
        assert.equal(await retryButton(t).count(), 0)
        await t.close()
      })

      // Panne visée : la ligne n'est pas rendue, ou l'est sur chaque message agent, ou au mauvais endroit.
      test('B-22 nominal: each message carrying the mark gets one note line directly above it, with the locale text, and nothing else does', async () => {
        const s = await open(inst.url)
        await s.page.goto(inst.url)
        await openList(s)
        await s.chat.getByText(MARKED_TITLE, { exact: true }).first().click()
        await s.chat.getByText(SECOND_MARKED_REPLY, { exact: false }).waitFor()
        const notes = s.chat.getByRole('note')
        assert.equal(await notes.count(), 2)
        for (let i = 0; i < 2; i++) assert.equal((await notes.nth(i).innerText()).trim(), w.mark)
        const nextTexts = await notes.evaluateAll((els) => els.map((e) => e.nextElementSibling?.textContent ?? ''))
        assert.ok(nextTexts[0].startsWith(FIRST_MARKED_REPLY), nextTexts[0])
        assert.ok(nextTexts[1].startsWith(SECOND_MARKED_REPLY), nextTexts[1])
        const previous = await notes.evaluateAll((els) => els.map((e) => e.previousElementSibling?.textContent ?? ''))
        assert.ok(previous[0].startsWith('Et pour la cuisine'), previous[0])
        assert.ok(previous[1].startsWith('Encore une chose'), previous[1])
        assert.equal(await notes.first().getByRole('button').count(), 0, 'not dismissable')
        await shot(s, 'marque')
        await s.close()
      })

      test('B-22 bords: a reload draws the same lines; a conversation with no mark draws none', async () => {
        const s = await open(inst.url)
        await s.page.goto(inst.url)
        await openList(s)
        await s.chat.getByText(MARKED_TITLE, { exact: true }).first().click()
        await s.chat.getByRole('note').first().waitFor()
        await s.page.reload()
        await openList(s)
        await s.chat.getByText(MARKED_TITLE, { exact: true }).first().click()
        await s.chat.getByText(SECOND_MARKED_REPLY, { exact: false }).waitFor()
        assert.equal(await s.chat.getByRole('note').count(), 2)
        await s.close()
        const t = await open(inst.url)
        await t.page.goto(inst.url)
        await openList(t)
        await t.chat.getByText('Sans marque', { exact: true }).first().click()
        await t.chat.getByText('Bonjour !', { exact: true }).waitFor()
        assert.equal(await t.chat.getByRole('note').count(), 0)
        await t.close()
      })

      test('B-22 exclusion: a plain turn in an unmarked conversation draws no line, live or after the thread is read again', async () => {
        const s = await open(inst.url)
        await s.page.goto(inst.url)
        await openList(s)
        await s.chat.getByText('Sans marque', { exact: true }).first().click()
        await s.chat.getByText('Bonjour !', { exact: true }).waitFor()
        await s.chat.locator('.adestia-composer__input').fill('ping')
        const answered = s.page.waitForResponse((r) => /\/api\/conversations\/[0-9a-f-]{36}/.test(r.url()) && r.request().method() === 'GET' && r.status() === 200)
        await s.chat.locator('.adestia-composer__send').click()
        await s.chat.getByText('pong', { exact: true }).waitFor()
        await answered
        assert.equal(await s.chat.getByRole('note').count(), 0)
        await s.close()
      })

      test('B-22 extreme content: on a phone the line wraps and its text is never cut, the page does not scroll sideways', async () => {
        const s = await open(inst.url, 360, 740)
        await s.page.goto(inst.url)
        await s.page.getByRole('button', { name: w.list }).click().catch(() => {})
        await s.chat.getByText(MARKED_TITLE, { exact: true }).first().click()
        await s.chat.getByRole('note').first().waitFor()
        const note = s.chat.getByRole('note').first()
        assert.equal((await note.innerText()).trim(), w.mark)
        const cut = await note.evaluate((el) => {
          const text = [...el.querySelectorAll('*')].find((c) => c.textContent.trim() === el.textContent.trim()) ?? el
          return { overflow: text.scrollWidth > text.clientWidth + 1, ellipsis: getComputedStyle(text).textOverflow === 'ellipsis', page: document.documentElement.scrollWidth > innerWidth }
        })
        assert.deepEqual(cut, { overflow: false, ellipsis: false, page: false })
        await shot(s, 'marque-telephone')
        await s.close()
      })
    })
  }
}
